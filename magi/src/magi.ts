/**
 * Main entry point for the MAGI system (TypeScript version).
 *
 * This module handles command processing, agent initialization, and system setup.
 */

// Note: The 'path' import was removed as it was unused

import {parseArgs} from 'node:util';
import {Runner} from './utils/runner.js';
import {ProcessToolType, StreamingEvent} from './types.js';
import {createAgent, AgentType} from './magi_agents/index.js';
import {addHumanMessage, addMonologue, getHistory} from './utils/history.js';
import {
	initCommunication,
	ServerMessage,
	getCommunicationManager,
	CommandMessage,
	sendStreamEvent
} from './utils/communication.js';
import {move_to_working_dir} from './utils/file_utils.js';
import {costTracker} from './utils/cost_tracker.js';
import {ModelClassID} from './model_providers/model_data.js';
import {runProcessTool} from './utils/process_tools.js';
import {Agent} from './utils/agent.js';

// Parse command line arguments
function parseCommandLineArgs() {
	const options = {
		test: {type: 'boolean' as const, short: 't', default: false},
		agent: {type: 'string' as const, short: 'a', default: 'overseer'},
		tool: {type: 'string' as const, default: 'none'},
		prompt: {type: 'string' as const, short: 'p'},
		base64: {type: 'string' as const, short: 'b'},
		model: {type: 'string' as const, short: 'm'},
		modelClass: {type: 'string' as const, short: 'c'},
		working: {type: 'string' as const, short: 'w'},
	};

	const {values} = parseArgs({options, allowPositionals: true});
	return values;
}


// Store agent IDs to reuse them for the same agent type
// const agentIdMap = new Map<AgentType, string>();


/**
 * Execute a command using an agent and capture the results
 */
export async function mainLoop(agent: Agent, loop: boolean): Promise<void> {

	const comm = getCommunicationManager();

	do {
		try {
			// Get conversation history
			const history = getHistory();

			// Set up event handlers
			const handlers = {
				// Forward all events to the communication channel
				onEvent: (event: StreamingEvent) => {
					comm.send(event);
				},
			};

			// Run the command with unified tool handling
			const response = await Runner.runStreamedWithTools(agent, '', history, handlers);

			console.log('[MONOLOGUE] ', response);

		} catch (error: any) {
			// Handle any error that occurred during agent execution
			console.error(`Error running agent command: ${error?.message || String(error)}`);

			// Send error through WebSocket
			try {
				comm.send({type: 'error', error});
			} catch (commError) {
				console.error('Failed to send error via WebSocket:', commError);
			}
		}
	}
	while (loop && !comm.isClosed());
}

/**
 * Check environment variables for model provider API keys
 */
function checkModelProviderApiKeys(): boolean {
	let hasValidKey = false;

	// Check OpenAI API key
	if (process.env.OPENAI_API_KEY) {
		hasValidKey = true;
	} else {
		console.warn('⚠ OPENAI_API_KEY environment variable not set');
	}

	// Check Anthropic (Claude) API key
	if (process.env.ANTHROPIC_API_KEY) {
		hasValidKey = true;
	}

	// Check Google API key for Gemini
	if (process.env.GOOGLE_API_KEY) {
		hasValidKey = true;
	}

	// Check X.AI API key for Grok
	if (process.env.XAI_API_KEY) {
		hasValidKey = true;
	}

	return hasValidKey;
}

// Function to send cost data to the controller
function sendCostData() {
	const totalCost = costTracker.getTotalCost();
	const modelCosts = costTracker.getCostsByModel();

	// Create cost update event
	const costEvent: StreamingEvent = {
		type: 'cost_update',
		totalCost,
		modelCosts,
		timestamp: new Date().toISOString(),
		thoughtLevel: process.env.THOUGHT_LEVEL ? parseInt(process.env.THOUGHT_LEVEL) : undefined,
		delay: process.env.DELAY_MS ? parseInt(process.env.DELAY_MS) : undefined
	};

	// Send the cost data
	sendStreamEvent(costEvent);
}

// Add exit handlers to print cost summary and send cost data
process.on('exit', () => {
	costTracker.printSummary();
	sendCostData();
});

process.on('SIGINT', () => {
	costTracker.printSummary();
	sendCostData();
	process.exit(0);
});

process.on('SIGTERM', () => {
	costTracker.printSummary();
	sendCostData();
	process.exit(0);
});

// Unhandled rejection handler
process.on('unhandledRejection', () => {
	console.log('\nUnhandled Rejection.');
	costTracker.printSummary();
	sendCostData();
});

/**
 * Main function - entry point for the application
 * Returns a promise that resolves when the command processing is complete
 */
async function main(): Promise<void> {
	// Parse command line arguments
	const args = parseCommandLineArgs();

	// Set up process ID from env var
	process.env.PROCESS_ID = process.env.PROCESS_ID || `magi-${Date.now()}`;
	console.log(`Initializing with process ID: ${process.env.PROCESS_ID}`);

	// Process prompt (either plain text or base64-encoded)
	let promptText: string;

	if (args.base64) {
		try {
			const buffer = Buffer.from(args.base64, 'base64');
			promptText = buffer.toString('utf-8');
		} catch (error) {
			console.error(`**Error** Failed to decode base64 prompt: ${error}`);
			process.exit(1);
		}
	} else if (args.prompt) {
		promptText = args.prompt;
	} else {
		console.error('**Error** Either --prompt or --base64 must be provided');
		process.exit(1);
	}

	// Move to working directory in /magi_output
	move_to_working_dir(args.working);

	// Make our own code accessible for Gödel Machine
	//mount_magi_code();

	// Set up WebSocket communication (pass test flag from args)
	const comm = initCommunication(args.test);

	// Set up command listener
	comm.onCommand(async(cmd: ServerMessage) => {
		if(cmd.type !== 'command') return;
		const commandMessage = cmd as CommandMessage;

		console.log(`Received command via WebSocket: ${commandMessage.command}`);
		if (commandMessage.command === 'stop') {
			console.log('Received stop command, terminating...');
			// Print cost summary and send cost data before exit
			costTracker.printSummary();
			sendCostData();
			process.exit(0);
		} else {
			// Process user-provided follow-up commands
			console.log(`Processing user command: ${commandMessage.command}`);

			await addHumanMessage(commandMessage.command);
		}
	});

	// Verify API keys for model providers
	if (!checkModelProviderApiKeys()) {
		console.error('**Error** No valid API keys found for any model provider');

		// Send error via WebSocket
		comm.send({type: 'error', error: 'No valid API keys found for any model provider'});
		process.exit(1);
	}

	// Run the command or research pipeline
	try {
		if(args.tool && args.tool !== 'none') {
			console.log(`Running tool: ${args.tool}`);
			await runProcessTool(args.tool as ProcessToolType, promptText);
		}
		else {
			// Add initial history
			const person = process.env.YOUR_NAME || 'Human';
			await addMonologue('So let\'s see. I am Magi. The overseer of the MAGI system, huh? I will be the internal monologue for the system? These are my thoughts? That\'s a weird concept!');
			await addMonologue(`${person} is nice to me. I will be nice to them too. I hope I hear from them soon. I should come up with a plan on how to improve myself and better help ${person}.`);
			await addHumanMessage(promptText);

			// Create the agent with model, modelClass, and optional agent_id parameters
			const agent = createAgent(args.agent as AgentType, args.model, args.modelClass as ModelClassID);
			await mainLoop(agent, (args.agent === 'overseer' && !args.test));
		}

		// When running in test mode, print cost summary and exit
		if (args.test) {
			costTracker.printSummary();
			sendCostData();
			process.exit(0);
		} else {
			// For normal execution, print cost summary when done but don't exit
			costTracker.printSummary();
			sendCostData();

			// Set up a periodic cost update (every 30 seconds)
			setInterval(() => {
				sendCostData();
			}, 30000);
		}
	} catch (error) {
		console.error(`**Error** Failed to process command: ${error}`);
		process.exit(1);
	}
}

main();
