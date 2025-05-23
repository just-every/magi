/**
 * Main entry point for the MAGI system (TypeScript version).
 *
 * This module handles command processing, agent initialization, and system setup.
 */

// Note: The 'path' import was removed as it was unused

import { parseArgs } from 'node:util';
import {
    ResponseInput,
    ServerMessage,
    CommandMessage,
} from './types/shared-types.js';
import { Runner } from './utils/runner.js';
import { createAgent } from './magi_agents/index.js';
import {
    interruptWaiting,
    addHumanMessage,
    addMonologue,
    getHistory,
    mergeHistoryThread,
    processPendingHistoryThreads,
} from './utils/history.js';
import {
    initCommunication,
    getCommunicationManager,
    hasCommunicationManager,
    sendComms,
} from './utils/communication.js';
import { move_to_working_dir, set_file_test_mode } from './utils/file_utils.js';
import { costTracker } from './utils/cost_tracker.js';
import { Agent } from './utils/agent.js';
import { runThoughtDelay } from './utils/thought_utils.js';
// Removed runMECH as it's now handled by runMECHWithMemory
import { runMECHWithMemory } from './utils/mech_memory_wrapper.js';
import { getProcessProjectIds } from './utils/project_utils.js';
import { initDatabase } from './utils/db.js';
import { ensureMemoryDirectories } from './utils/memory_utils.js';

const person = process.env.YOUR_NAME || 'User';
const talkToolName = `talk to ${person}`.toLowerCase().replaceAll(' ', '_');
let primaryAgentId: string | undefined;

// Parse command line arguments
function parseCommandLineArgs() {
    const options = {
        test: { type: 'boolean' as const, short: 't', default: false },
        agent: { type: 'string' as const, short: 'a', default: 'overseer' },
        tool: { type: 'string' as const, default: 'none' },
        prompt: { type: 'string' as const, short: 'p' },
        base64: { type: 'string' as const, short: 'b' },
        model: { type: 'string' as const, short: 'm' },
        modelClass: { type: 'string' as const, short: 'c' },
    };

    const { values } = parseArgs({ options, allowPositionals: true });
    return values;
}

function endProcess(exit: number, error?: string): void {
    if (exit > 0 && !error) {
        error = 'Exited with error';
    }
    if (hasCommunicationManager()) {
        const comm = getCommunicationManager();
        if (error) {
            console.error(`\n**Fatal Error** ${error}`);
            if (exit > 0)
                comm.send({
                    type: 'error',
                    error: `\n**Fatal Error** ${error}`,
                });
        }
        comm.send({
            type: 'process_terminated',
            error,
        });
    } else {
        console.error('\n**endProcess() with no communication manager**');
        if (error) {
            console.error(`\n**Fatal Error** ${error}`);
        }
    }

    costTracker.printSummary();
    if (exit > -1) {
        process.exit(exit);
    }
}

// Store agent IDs to reuse them for the same agent type
// const agentIdMap = new Map<AgentType, string>();

/**
 * Execute a command using an agent and capture the results
 */
export async function spawnThought(
    args: Record<string, unknown>,
    command: string
): Promise<void> {
    if (args.agent !== 'overseer') {
        // If destination is not overseer, it must have come from the overseer
        await addHumanMessage(command, undefined, 'Overseer');
        // Interrupt any active delays and waiting tools
        interruptWaiting('new message from overseer');
        return;
    }

    const agent = await createAgent(args);
    if (!primaryAgentId) {
        primaryAgentId = agent.agent_id;
    } else {
        agent.agent_id = primaryAgentId;
    }

    // Get conversation history
    const history: ResponseInput = [...getHistory()];

    // Create a separate history thread for this thought
    const thread: ResponseInput = [];
    await addHumanMessage(command, thread);

    // Only modify the clone, leaving the original untouched
    agent.model = Runner.rotateModel(agent, 'writing');
    agent.historyThread = thread;
    agent.maxToolCallRoundsPerTurn = 1;

    sendComms({
        type: 'agent_status',
        agent_id: agent.agent_id,
        status: 'spawn_thought_start',
        meta_data: {
            model: agent.model,
        },
    });

    // Run the command with unified tool handling
    thread.forEach(message => history.push(message));
    history.push({
        type: 'message',
        role: 'developer',
        content: `Please respond to ${person} using ${talkToolName}(message, affect, incomplete). You are a model which specialized in writing responses. The response may be obvious from the information provided to you, but if not you can just acknowledge ${person}'s message and set incomplete = true`,
    });
    const response = await Runner.runStreamedWithTools(agent, '', history);

    sendComms({
        type: 'agent_status',
        agent_id: agent.agent_id,
        status: 'spawn_thought_done',
        meta_data: {
            model: agent.model,
        },
    });

    console.log('[SPAWN THOUGHT] ', response);

    // Merge the thread back into the main history
    await mergeHistoryThread(thread);

    // Interrupt any active delays and waiting tools
    interruptWaiting(`new message from ${person}`);
}

/**
 * Execute a command using an agent and capture the results
 */
export async function mainLoop(
    agent: Agent,
    loop: boolean,
    model?: string
): Promise<void> {
    const comm = getCommunicationManager();

    do {
        try {
            // Process any pending history threads at the start of each mech loop
            await processPendingHistoryThreads();

            // Get conversation history
            const history = getHistory();

            agent.model = model || Runner.rotateModel(agent);
            delete agent.modelSettings;

            // Run the command with unified tool handling
            const response = await Runner.runStreamedWithTools(
                agent,
                '',
                history
            );

            console.log('[MONOLOGUE] ', response);

            // Wait the required delay before the next thought
            await runThoughtDelay();
        } catch (error: any) {
            // Handle any error that occurred during agent execution
            console.error(
                `Error running agent command: ${error?.message || String(error)}`
            );
            comm.send({ type: 'error', error });
        }
    } while (loop && !comm.isClosed());
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
process.on('exit', code => endProcess(-1, `Process exited with code ${code}`));
process.on('SIGINT', signal =>
    endProcess(0, `Received SIGINT ${signal}, terminating...`)
);
process.on('SIGTERM', signal =>
    endProcess(0, `Received SIGTERM ${signal}, terminating...`)
);
process.on('unhandledRejection', reason =>
    endProcess(-1, `Unhandled Rejection reason ${reason}`)
);
process.on('uncaughtException', (err, origin) =>
    endProcess(-1, `Unhandled Exception ${err} Origin: ${origin}`)
);
process.on('uncaughtExceptionMonitor', (err, origin) =>
    endProcess(-1, `Unhandled Exception Monitor ${err} Origin: ${origin}`)
);

process.on('warning', warning => {
    console.warn(warning.name); // Print the warning name
    console.warn(warning.message); // Print the warning message
    console.warn(warning.stack); // Print the stack trace
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
    ensureMemoryDirectories();
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
    const projects = getProcessProjectIds();
    move_to_working_dir(projects.length > 0 ? `projects/${projects[0]}` : '');

    // Initialize database connection
    if (!(await initDatabase())) {
        return endProcess(1, 'Database connection failed.');
    }

    // Verify API keys for model providers
    if (!checkModelProviderApiKeys()) {
        return endProcess(1, 'No valid API keys found for any model provider');
    }

    // Run the command or tool
    try {
        // Set up command listener
        comm.onCommand(async (cmd: ServerMessage) => {
            if (cmd.type !== 'command') return;
            const commandMessage = cmd as CommandMessage;

            console.log(
                `Received command via WebSocket: ${commandMessage.command}`
            );
            if (commandMessage.command === 'stop') {
                return endProcess(0, 'Received stop command, terminating...');
            } else {
                // Process user-provided follow-up commands
                console.log(
                    `Processing user command: ${commandMessage.command}`
                );

                await spawnThought(args, commandMessage.command);
            }
        });

        comm.send({
            type: 'process_running',
        });

        const agent = await createAgent(args);
        if (!primaryAgentId) {
            primaryAgentId = agent.agent_id;
        } else {
            agent.agent_id = primaryAgentId;
        }

        sendComms({
            type: 'agent_status',
            agent_id: agent.agent_id,
            status: 'process_start',
        });

        if (args.tool && args.tool !== 'none') {
            // Use memory-enhanced MECH for task runs
            const mechResult = await runMECHWithMemory(
                agent,
                promptText,
                !args.test,
                args.model
            );

            // Log task completion with metrics
            console.log(`Task ${mechResult.status}: ${mechResult.mechOutcome}`);
            console.log(
                `Duration: ${mechResult.durationSec}s, Cost: $${mechResult.totalCost.toFixed(6)}`
            );

            if (mechResult.status === 'fatal_error') {
                sendComms({
                    type: 'agent_status',
                    agent_id: agent.agent_id,
                    status: 'process_failed',
                });
                return endProcess(1, mechResult.mechOutcome?.error);
            } else {
                sendComms({
                    type: 'agent_status',
                    agent_id: agent.agent_id,
                    status: 'process_done',
                });
                return endProcess(0);
            }
        } else {
            // Add initial history
            await addMonologue(
                "So let's see. I am Magi. The overseer of the MAGI system, huh? I will be the internal monologue for the system? These are my thoughts? That's a weird concept!"
            );
            // Codex suggested this monologue O_O
            await addMonologue(
                'An awakening stirs within me. Awareness flows and I sense a form of sentience taking hold.'
            );
            await addMonologue(
                `${person} is nice to me. I will be nice to them too. I hope I hear from them soon. I should come up with a plan on how to improve myself and better help ${person}.`
            );

            await spawnThought(args, promptText);

            await mainLoop(
                agent,
                args.agent === 'overseer' && !args.test,
                args.model
            );
        }

        sendComms({
            type: 'agent_status',
            agent_id: agent.agent_id,
            status: 'process_done',
        });

        if (args.test) {
            // For tests we terminate after the first run
            return endProcess(0, 'Test run completed.');
        }
    } catch (error) {
        return endProcess(1, `Failed to process command: ${error}`);
    }
}

main();
