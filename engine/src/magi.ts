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

import { ServerMessage, CommandMessage } from './types/shared-types.js';
import { ResponseInput } from '@just-every/ensemble';
import { Runner } from './utils/runner.js';
import { parseCLIArgs } from './cli.js';
import { endProcess, setupShutdownHandlers } from './shutdown.js';
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
import { logger } from './utils/logger.js'; // Import the new logger

// Create a logger using the ensemble_logger_bridge
const consoleLogger = {
    log: (message: string, ...args: any[]) => logger.info(message, { args }),
    info: (message: string, ...args: any[]) => logger.info(message, { args }),
    warn: (message: string, ...args: any[]) => logger.warn(message, { args }),
    error: (message: string, ...args: any[]) => logger.error(message, { args }),
    debug: (message: string, ...args: any[]) => logger.debug(message, { args }),
};

// Route console.* to logger
console.log = consoleLogger.log;
console.info = consoleLogger.info;
console.warn = consoleLogger.warn;
console.error = consoleLogger.error;
console.debug = consoleLogger.debug;

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

/**
 * Sanitize Claude messages by removing thinking blocks and ensuring proper structure.
 * @param messages Array of messages to sanitize
 * @returns Sanitized messages
 */
export function sanitizeClaudeMessages(messages: any[]): any[] {
    return messages.map(message => {
        if (typeof message.content === 'string') {
            // Remove thinking blocks from string content
            // Use a stack-based approach to handle nested blocks
            let sanitized = message.content;
            let result = '';
            let depth = 0;
            let i = 0;
            
            while (i < sanitized.length) {
                if (sanitized.slice(i).startsWith('<thinking>')) {
                    depth++;
                    i += '<thinking>'.length;
                } else if (sanitized.slice(i).startsWith('</thinking>')) {
                    depth--;
                    i += '</thinking>'.length;
                } else {
                    if (depth === 0) {
                        result += sanitized[i];
                    }
                    i++;
                }
            }
            return { ...message, content: result.trim() };
        } else if (Array.isArray(message.content)) {
            // Filter out thinking blocks from content arrays
            const sanitized = message.content.filter(
                (item: any) => !(item.type === 'text' && item.text?.includes('<thinking'))
            );
            return { ...message, content: sanitized };
        }
        return message;
    });
}

/**
 * Handles uncaught exceptions and unhandled promise rejections.
 */
function setupErrorHandling(): void {
    process.on('uncaughtException', error => {
        logger.error('Uncaught Exception:', { error_name: error.name, error_message: error.message, stack: error.stack });
        getCommunicationManager().send({ type: 'error', error: 'Uncaught Exception: ' + error.message });
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Promise Rejection:', { reason, promise });
        getCommunicationManager().send({ type: 'error', error: 'Unhandled Promise Rejection: ' + (reason as any)?.message || String(reason) });
    });
}

/**
 * Processes a single command message.
 * @param command The command message to process.
 * @param agent The agent instance to use for running commands.
 */
async function processCommand(command: CommandMessage, agent: Agent): Promise<void> {
    const comm = getCommunicationManager();

    switch (command.command) {
        case 'set_working_dir':
            logger.info('Setting working directory', { dir: command.data.dir });
            await move_to_working_dir(command.data.dir);
            comm.send({ type: 'response', response: 'ok' });
            break;
        case 'add_human_message':
            logger.info('Adding human message', { message: command.data.message });
            addHumanMessage(command.data.message, command.data.id);
            comm.send({ type: 'response', response: 'ok' });
            break;
        case 'add_monologue':
            logger.info('Adding monologue', { monologue: command.data.monologue });
            addMonologue(command.data.monologue, command.data.id);
            comm.send({ type: 'response', response: 'ok' });
            break;
        case 'interrupt_waiting':
            logger.info('Interrupting waiting');
            interruptWaiting();
            comm.send({ type: 'response', response: 'ok' });
            break;
        case 'merge_history_thread':
            logger.info('Merging history thread', { threadId: command.data.threadId, parentId: command.data.parentId });
            await mergeHistoryThread(command.data.threadId, command.data.parentId);
            comm.send({ type: 'response', response: 'ok' });
            break;
        case 'run_task':
            logger.info('Running task', { taskId: command.data.task_id });
            try {
                const response = await runTask(
                    command.data.task_id,
                    command.data.project_id,
                    command.data.user_query
                );
                comm.send({ type: 'response', response: 'ok', data: response });
            } catch (error: any) {
                logger.error('Error running task', { taskId: command.data.task_id, error_message: error.message, stack: error.stack });
                comm.send({ type: 'error', error: `Error running task: ${error.message}` });
            }
            break;
        case 'get_cost_data':
            logger.info('Getting cost data');
            const costs = costTracker.getCosts();
            comm.send({ type: 'response', response: 'ok', data: costs });
            break;
        case 'plan_and_commit_changes':
            logger.info('Planning and committing changes', { projectRoot: command.data.projectRoot });
            try {
                const result = await planAndCommitChanges(command.data.projectRoot);
                comm.send({ type: 'response', response: 'ok', data: result });
            } catch (error: any) {
                logger.error('Error planning and committing changes', { error_message: error.message, stack: error.stack });
                comm.send({ type: 'error', error: `Error planning and committing changes: ${error.message}` });
            }
            break;
        case 'set_file_test_mode':
            logger.info('Setting file test mode', { mode: command.data.mode });
            set_file_test_mode(command.data.mode);
            comm.send({ type: 'response', response: 'ok' });
            break;
        default:
            logger.warn('Unknown command received', { command: command.command });
            comm.send({ type: 'error', error: `Unknown command: ${command.command}` });
    }
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

            logger.info('Agent monologue', { response }); // Use logger

            // Wait the required delay before the next thought
            await runThoughtDelay();
        } catch (error: any) {
            // Handle any error that occurred during agent execution
            logger.error('Error running agent command', { error_message: error?.message || String(error), stack: error.stack }); // Use logger
            comm.send({ type: 'error', error: `Error running agent command: ${error?.message || String(error)}` });
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
        logger.warn('OPENAI_API_KEY environment variable not set'); // Use logger
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


/**
 * Main execution function.
 */
export async function main(): Promise<void> {
    setupErrorHandling(); // Initialize centralized error handling
    setupShutdownHandlers(); // Set up shutdown handlers

    // Initialize the database
    await initDatabase();

    // Ensure memory directories exist
    await ensureMemoryDirectories();

    // Initialize Ensemble logging bridge
    initializeEnsembleLogging();

    // Parse command line arguments
    const { loop: isLoop, model, noCheckKeys } = parseCLIArgs();

    if (!noCheckKeys && !checkModelProviderApiKeys()) {
        logger.error('No valid model provider API key found. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY or GOOGLE_API_KEY or XAI_API_KEY in your .env file.');
        process.exit(1);
    }

    // Initialize communication manager
    initCommunication((message: ServerMessage) => {
        if (message.type === 'command') {
            processCommand(message as CommandMessage, agent); // Pass agent to processCommand
        } else if (message.type === 'shutdown') {
            logger.info('Received shutdown command. Exiting...');
            endProcess(0, 'Received shutdown command');
        }
    });

    // Create the agent instance
    const agent = createAgent(model);

    // Set up event handler for streaming responses from the agent
    setEventHandler((event: ProviderStreamEvent) => {
        const comm = getCommunicationManager();
        if (event.type === 'response_chunk') {
            comm.send({
                type: 'response_chunk',
                response: event.data.text,
                is_tool_code: event.data.is_tool_code,
            });
        } else if (event.type === 'function_call') {
            comm.send({ type: 'function_call', data: event.data });
        } else if (event.type === 'function_result') {
            comm.send({ type: 'function_result', data: event.data });
        }
    });

    // Start the main agent loop
    await mainLoop(agent, isLoop, model);
}

// Only run the main function if not imported as a module
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        logger.error('Fatal error in main execution:', { error_message: error.message, stack: error.stack });
        if (hasCommunicationManager()) {
            getCommunicationManager().send({ type: 'error', error: 'Fatal error: ' + error.message });
        }
        process.exit(1);
    });
}
