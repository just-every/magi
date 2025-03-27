/**
 * Main entry point for the MAGI system (TypeScript version).
 *
 * This module handles command processing, agent initialization, and system setup.
 */

// Note: The 'path' import was removed as it was unused

import 'dotenv/config';
import {parseArgs} from 'node:util';
import {Runner} from './utils/runner.js';
import {StreamingEvent} from './types.js';
import {createAgent, AgentType} from './magi_agents/index.js';
import {addHistory, getHistory} from './utils/history.js';
import {initCommunication, CommandMessage, getCommunicationManager} from './utils/communication.js';
import {move_to_working_dir} from './utils/file_utils.js';
import {costTracker} from './utils/cost_tracker.js';

// Parse command line arguments
function parseCommandLineArgs() {
	const options = {
		test: {type: 'boolean' as const, short: 't', default: false},
		debug: {type: 'boolean' as const, short: 'd', default: false},
		agent: {type: 'string' as const, short: 'a', default: 'overseer'},
		prompt: {type: 'string' as const, short: 'p'},
		base64: {type: 'string' as const, short: 'b'},
		model: {type: 'string' as const, short: 'm'},
		'model-class': {type: 'string' as const, short: 'c'},
		research: {type: 'boolean' as const, short: 'r', default: false},
	};

	const {values} = parseArgs({options, allowPositionals: true});
	return values;
}


// Store agent IDs to reuse them for the same agent type
const agentIdMap = new Map<AgentType, string>();


/**
 * Execute a command using an agent and capture the results
 */
export async function monologueLoop(
	input: string,
	agentType: AgentType = 'overseer',
	model?: string,
	modelClass?: string
): Promise<void> {

	addHistory({role: 'user', content: input});

	const comm = getCommunicationManager();

	do {
		try {
			// Create the agent with specified type, model, and modelClass
			if (model) {
				console.log(`Forcing model: ${model}`);
			}
			if (modelClass) {
				console.log(`Using model class: ${modelClass}`);
			}

			// Get existing agent_id for this agent type if available
			const existingAgentId = agentIdMap.get(agentType);
			if (existingAgentId) {
				console.log(`Reusing existing agent_id for ${agentType}: ${existingAgentId}`);
			}

			// Create the agent with model, modelClass, and optional agent_id parameters
			const agent = createAgent(agentType, model, modelClass, existingAgentId);

			// Store the agent_id for future use if we don't have one yet
			if (!existingAgentId) {
				agentIdMap.set(agentType, agent.agent_id);
				console.log(`Stored new agent_id for ${agentType}: ${agent.agent_id}`);
			}

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

			// Add the final response to history
			if (response && response.trim()) {
				addHistory({
					type: 'message',
					role: 'assistant',
					content: response,
					status: 'completed'
				});
			}

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
	while (agentType === 'overseer' && !comm.isClosed());
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

// Add exit handlers to print cost summary
process.on('exit', () => {
	costTracker.printSummary();
});

process.on('SIGINT', () => {
	costTracker.printSummary();
	process.exit(0);
});

process.on('SIGTERM', () => {
	costTracker.printSummary();
	process.exit(0);
});

// Unhandled rejection handler
process.on('unhandledRejection', () => {
	console.log('\nUnhandled Rejection.');
	costTracker.printSummary();
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

	// Move to working directory in /magi_output
	move_to_working_dir();

	// Make our own code accessible for Gödel Machine
	//mount_magi_code();

	// Set up WebSocket communication (pass test flag from args)
	const comm = initCommunication(args.test);

	// Set up command listener
	comm.onCommand((cmd: CommandMessage) => {
		console.log(`Received command via WebSocket: ${cmd.command}`);
		if (cmd.command === 'stop') {
			console.log('Received stop command, terminating...');
			// Print cost summary before exit
			costTracker.printSummary();
			process.exit(0);
		} else if (cmd.type === 'command' && cmd.command) {
			// Process user-provided follow-up commands
			console.log(`Processing user command: ${cmd.command}`);

			addHistory({role: 'user', content: cmd.command});
		}
	});

	// Verify API keys for model providers
	if (!checkModelProviderApiKeys()) {
		console.error('**Error** No valid API keys found for any model provider');

		// Send error via WebSocket
		comm.send({type: 'error', error: 'No valid API keys found for any model provider'});
		process.exit(1);
	}

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

	// Run the command or research pipeline
	try {
		await monologueLoop(
			promptText,
			args.agent as AgentType,
			args.model,
			args['model-class']
		);

		// When running in test mode, print cost summary and exit
		if (args.test) {
			costTracker.printSummary();
			process.exit(0);
		} else {
			// For normal execution, print cost summary when done but don't exit
			costTracker.printSummary();
		}
	} catch (error) {
		console.error(`**Error** Failed to process command: ${error}`);
		process.exit(1);
	}
}

main();
