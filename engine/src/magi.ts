/**
 * Main entry point for the MAGI system (TypeScript version).
 *
 * This module handles command processing, agent initialization, and system setup.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
// First try local .env, then fall back to parent directory .env
dotenv.config();
if (!process.env.OPENAI_API_KEY) {
    dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

import { parseArgs } from 'node:util';
import { ServerMessage, CommandMessage } from './types/shared-types.js';
import { ResponseInput } from '@just-every/ensemble';
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
import { planAndCommitChanges } from './utils/commit_planner.js';
import {
    Agent,
    ProviderStreamEvent,
    setEventHandler,
} from '@just-every/ensemble';
import { runTask } from '@just-every/task';

// Temporary workaround for runThoughtDelay - mind now handles delays internally
async function runThoughtDelay(): Promise<void> {
    // Mind handles thought delays internally now, so this is a no-op
    // If you need explicit delays, you can use:
    // const delaySeconds = parseInt(getThoughtDelay());
    // await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
}
import { getProcessProjectIds } from './utils/project_utils.js';
import { initDatabase } from './utils/db.js';
import { ensureMemoryDirectories } from './utils/memory_utils.js';
import { initializeEnsembleLogging } from './utils/ensemble_logger_bridge.js';

const person = process.env.YOUR_NAME || 'User';
const talkToolName = `talk to ${person}`.toLowerCase().replaceAll(' ', '_');
let primaryAgentId: string | undefined;
let exitedCode: number | undefined;

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

function endProcess(exit: number, result?: string): void {
    if (typeof exitedCode === "number" && exitedCode >= exit) {
        return; // Already existed at this level
    }
    exitedCode = exit;
    if (exit > 0 && !result) {
        result = 'Exited with error';
    }
    console.log(`\n**endProcess** ${result}`);
    if (hasCommunicationManager()) {
        const comm = getCommunicationManager();
        if (exit > 0) {
            comm.send({
                type: 'error',
                error: `\n**Fatal Error** ${result}`,
            });
            comm.send({
                type: 'process_terminated',
                error: result,
            });
        } else {
            comm.send({
                type: 'process_done',
                output: result,
            });
        }
    } else {
        console.error('\n**endProcess() with no communication manager**');
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
    command: string,
    structuredContent?: any
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
    await addHumanMessage(command, thread, undefined, structuredContent);

    // Only modify the clone, leaving the original untouched
    delete agent.model;
    agent.modelClass = 'reasoning_mini';
    agent.historyThread = thread;
    agent.maxToolCallRoundsPerTurn = 1;

    // Set the talk to tool to force a response
    const person = process.env.YOUR_NAME || 'User';
    const talkToolName = `talk to ${person}`.toLowerCase().replaceAll(' ', '_');
    agent.modelSettings = agent.modelSettings || {};
    agent.modelSettings.tool_choice = {
        type: 'function',
        function: { name: talkToolName },
    };

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
    endProcess(0, `Received ${signal}, terminating.`)
);
process.on('SIGTERM', signal =>
    endProcess(0, `Received ${signal}, terminating.`)
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
    initializeEnsembleLogging();
    const comm = initCommunication(args.test);
    set_file_test_mode(args.test);

    // Set up global event handler for ensemble
    setEventHandler(async (event: ProviderStreamEvent) => {
        sendComms(event as any);
    });

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

    // Move to working directory
    const projects = getProcessProjectIds();
    if (projects.length > 0) {
        // Change to the project directory
        process.chdir(`/app/projects/${projects[0]}`);
    } else {
        // Use the default working directory
        move_to_working_dir();
    }

    // Initialize database connection
    if (!(await initDatabase())) {
        return endProcess(1, 'Database connection failed.');
    }

    // Register custom code providers with ensemble
    const { registerCodeProviders } = await import(
        './utils/register_code_providers.js'
    );
    registerCodeProviders();

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

                await spawnThought(
                    args,
                    commandMessage.command,
                    commandMessage.content
                );
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

        // Send agent_start event so the UI can properly initialize the agent
        sendComms({
            type: 'agent_start',
            agent: {
                agent_id: agent.agent_id,
                name: agent.name,
                model: agent.model,
                modelClass: agent.modelClass,
            },
        });

        sendComms({
            type: 'agent_status',
            agent_id: agent.agent_id,
            status: 'process_start',
        });

        if (args.tool && args.tool !== 'none') {
            // Use mind task for task runs
            const startTime = Date.now();
            let taskCompleted = false;
            let error: string | undefined;

            // History tracking for process updates
            const responseHistory: string[] = [];
            let loopCount = 0;
            let lastUpdateTime = Date.now();

            // Calculate update frequency - faster at start, slower over time
            const getUpdateInterval = (count: number): number => {
                if (count < 5) return 5000; // 5 seconds for first 5 loops
                if (count < 10) return 10000; // 10 seconds for next 5
                if (count < 20) return 20000; // 20 seconds for next 10
                return 30000; // 30 seconds after that
            };

            // If a custom model is provided, temporarily update the agent's model
            const originalModel = agent.model;
            if (args.model) {
                agent.model = args.model;
            }

            try {
                console.log('[DEBUG] Agent name:', agent.name);
                console.log(
                    '[DEBUG] Agent has workers:',
                    agent.workers?.length || 0
                );

                // Process the mind task stream
                const runTaskStream = runTask(agent, promptText);

                for await (const event of runTaskStream) {
                    // Collect response_output events for history
                    if (
                        event.type === 'response_output' &&
                        'content' in event
                    ) {
                        const content = (event as any).content;
                        if (typeof content === 'string' && content) {
                            responseHistory.push(content);
                            // Keep only the last 20 responses
                            if (responseHistory.length > 20) {
                                responseHistory.shift();
                            }
                        }
                    }

                    // Check if it's time to send an update
                    const now = Date.now();
                    const updateInterval = getUpdateInterval(loopCount);
                    if (now - lastUpdateTime >= updateInterval) {
                        // Send process_updated event with history
                        sendComms({
                            type: 'process_updated',
                            history: responseHistory
                                .slice(-10)
                                .map(content => ({
                                    role: 'assistant' as const,
                                    content: content,
                                    type: 'message' as const,
                                    status: 'completed' as const,
                                })),
                            output: responseHistory.slice(-5).join('\n\n'), // Last 5 responses as output
                        });
                        lastUpdateTime = now;
                        loopCount++;
                    }

                    // Check for task completion or error
                    if (event.type === 'tool_start' && 'tool_call' in event) {
                        const toolCall = (event as any).tool_call;
                        if (toolCall && toolCall.function) {
                            const toolName = toolCall.function.name;
                            if (
                                toolName === 'task_complete' ||
                                toolName === 'task_fatal_error'
                            ) {
                                taskCompleted = true;
                            }
                        }
                    } else if (event.type === 'error' && 'error' in event) {
                        const errorMessage = (event as any).error;
                        if (typeof errorMessage === 'string') {
                            error = errorMessage;
                        }
                    }
                }

                // Send final update when task completes
                sendComms({
                    type: 'process_updated',
                    history: responseHistory.slice(-10).map(content => ({
                        role: 'assistant' as const,
                        content: content,
                        type: 'message' as const,
                        status: 'completed' as const,
                    })),
                    output: responseHistory.slice(-5).join('\n\n'),
                });

                // Log task completion with timing
                const durationSec = (Date.now() - startTime) / 1000;
                const status = error
                    ? 'error'
                    : taskCompleted
                      ? 'complete'
                      : 'incomplete';
                console.log(`Task ${status}: ${error ? 'failure' : 'success'}`);
                console.log(`Duration: ${durationSec.toFixed(1)}s`);
                // Cost is tracked by ensemble's cost tracker
            } finally {
                // Restore original model if it was changed
                if (args.model && originalModel) {
                    agent.model = originalModel;
                }

                const project_ids = getProcessProjectIds();
                // Parallelize patch generation for all projects
                if (project_ids.length > 0) {
                    console.log(
                        `[magi] Generating patches for ${project_ids.length} projects...`
                    );
                    await Promise.all(
                        project_ids.map(project_id =>
                            planAndCommitChanges(agent, project_id).catch(
                                err => {
                                    console.error(
                                        `[magi] Failed to generate patch for ${project_id}:`,
                                        err
                                    );
                                }
                            )
                        )
                    );
                }
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

        return endProcess(0, 'Task run completed.');
    } catch (error) {
        return endProcess(1, `Failed to process command: ${error}`);
    }
}

main();
