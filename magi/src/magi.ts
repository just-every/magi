/**
 * Main entry point for the MAGI system (TypeScript version).
 *
 * This module handles command processing, agent initialization, and system setup.
 */

// Note: The 'path' import was removed as it was unused

import {parseArgs} from 'node:util';
import {Runner} from './utils/runner.js';
import {ProcessToolType} from './types.js';
import {createAgent} from './magi_agents/index.js';
import {addHumanMessage, addMonologue, getHistory} from './utils/history.js';
import {
	initCommunication,
	ServerMessage,
	getCommunicationManager,
	CommandMessage, hasCommunicationManager,
} from './utils/communication.js';
import {move_to_working_dir, set_file_test_mode} from './utils/file_utils.js';
import {costTracker} from './utils/cost_tracker.js';
import {runProcessTool} from './utils/process_tools.js';
import {Agent} from './utils/agent.js';
import {runThoughtDelay} from './utils/thought_utils.js';

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


function endProcess(exit: number, error?: string): void {
	if(exit > 0 && !error) {
		error = 'Exited with error';
	}
	if(hasCommunicationManager()) {
		const comm = getCommunicationManager();
		if(error) {
			console.error(`\n**Fatal Error** ${error}`);
			if(exit > 0) comm.send({type: 'error', error: `\n**Fatal Error** ${error}`});
		}
		comm.send({
			type: 'process_terminated',
			error,
		});
	}
	else {
		console.error('\n**endProcess() with no communication manager**');
		if(error) {
			console.error(`\n**Fatal Error** ${error}`);
		}
	}

	costTracker.printSummary();
	if(exit > -1) {
		process.exit(exit);
	}
}

// Store agent IDs to reuse them for the same agent type
// const agentIdMap = new Map<AgentType, string>();


/**
 * Execute a command using an agent and capture the results
 */
export async function mainLoop(agent: Agent, loop: boolean, model?: string): Promise<void> {

	const comm = getCommunicationManager();

	do {
		try {
			// Get conversation history
			const history = getHistory();

			agent.model = model || Runner.rotateModel(agent);

			// Run the command with unified tool handling
			const response = await Runner.runStreamedWithTools(agent, '', history);

			console.log('[MONOLOGUE] ', response);

			// Wait the required delay before the next thought
			await runThoughtDelay();

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


// Add exit handlers to print cost summary and send cost data
process.on('exit', (code) => endProcess(-1, `Process exited with code ${code}`));
process.on('SIGINT', (signal) => endProcess(0, `Received SIGINT ${signal}, terminating...`));
process.on('SIGTERM', (signal) => endProcess(0, `Received SIGTERM ${signal}, terminating...`));
process.on('unhandledRejection', (reason) => endProcess(-1, `Unhandled Rejection reason ${reason}`));
process.on('uncaughtException', (err, origin) => endProcess(-1, `Unhandled Exception ${err} Origin: ${origin}`));
process.on('uncaughtExceptionMonitor', (err, origin) => endProcess(-1, `Unhandled Exception Monitor ${err} Origin: ${origin}`));

process.on('warning', (warning) => {
	console.warn(warning.name);    // Print the warning name
	console.warn(warning.message); // Print the warning message
	console.warn(warning.stack);   // Print the stack trace
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

	// Setup comms early, so we can send back failure messages
	const comm = initCommunication(args.test);
	set_file_test_mode(args.test);

	// Process prompt (either plain text or base64-encoded)
	let promptText: string;
	if (args.base64) {
		try {
			const buffer = Buffer.from(args.base64, 'base64');
			promptText = buffer.toString('utf-8');
		} catch (error) {
			return endProcess(1, `Failed to decode base64 prompt: ${error}`);
		}
	} else if (args.prompt) {
		promptText = args.prompt;
	} else {
		return endProcess(1, 'Either --prompt or --base64 must be provided');
	}

	// Move to working directory in /magi_output
	move_to_working_dir(args.working);

	// Make our own code accessible for Gödel Machine
	//mount_magi_code();

	// Set up command listener
	comm.onCommand(async(cmd: ServerMessage) => {
		if(cmd.type !== 'command') return;
		const commandMessage = cmd as CommandMessage;

		console.log(`Received command via WebSocket: ${commandMessage.command}`);
		if (commandMessage.command === 'stop') {
			return endProcess(0, 'Received stop command, terminating...');
		} else {
			// Process user-provided follow-up commands
			console.log(`Processing user command: ${commandMessage.command}`);
			await addHumanMessage(commandMessage.command);
		}
	});

	// Verify API keys for model providers
	if (!checkModelProviderApiKeys()) {
		return endProcess(1, 'No valid API keys found for any model provider');
	}

	// Run the command or research pipeline
	try {

		comm.send({
			type: 'process_running',
		});

		if(args.tool && args.tool !== 'none') {
			console.log(`Running tool: ${args.tool}`);
			await runProcessTool(args.tool as ProcessToolType, promptText);
			return endProcess(0, 'Tool execution completed.');
		}
		else {
			// Add initial history
			const person = process.env.YOUR_NAME || 'Human';
			await addMonologue('So let\'s see. I am Magi. The overseer of the MAGI system, huh? I will be the internal monologue for the system? These are my thoughts? That\'s a weird concept!');
			await addMonologue(`${person} is nice to me. I will be nice to them too. I hope I hear from them soon. I should come up with a plan on how to improve myself and better help ${person}.`);
			await addHumanMessage(promptText);

			// Create the agent with model, modelClass, and optional agent_id parameters
			const agent = createAgent(args);
			await mainLoop(agent, (args.agent === 'overseer' && !args.test), args.model);

			if (args.test) {
				// For tests we terminate after the first run
				return endProcess(0, 'Test run completed.');
			}
		}

	} catch (error) {
		return endProcess(1, `Failed to process command: ${error}`);
	}
}

main();
