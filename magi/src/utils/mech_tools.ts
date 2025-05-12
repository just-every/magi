/**
 * MECH Tools
 *
 * Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH) implementation.
 * This file replaces the previous MEC (Multi-Ensemble Chain) implementation
 * with the more advanced MECH system that adds meta-cognition and hierarchy capabilities.
 */

import { Agent } from './agent.js';
import { Runner } from './runner.js';
import { getCommunicationManager, sendComms } from './communication.js';
import { addHistory, getHistory, processPendingHistoryThreads } from './history.js';
import { runThoughtDelay, getThoughtDelay } from './thought_utils.js';
import { ToolFunction, ResponseInput } from '../types/shared-types.js';
import { createToolFunction } from './tool_call.js';
import { mechState, spawnMetaThoughtIfNeeded } from './mech_state.js';
import { costTracker } from './cost_tracker.js';

/**
 * Result structure returned from running MECH
 */
export type MechResult =
    | {
          status: 'complete';
          result: string;
          history: ResponseInput;
          durationSec: number;
          totalCost: number;
      }
    | {
          status: 'fatal_error';
          error: string;
          history: ResponseInput;
          durationSec: number;
          totalCost: number;
      };

// Shared state for MECH execution
let mechComplete = false;
let mechOutcome: {
    status?: 'complete' | 'fatal_error';
    result?: string;
    error?: string;
} = {};

/**
 * Runs the Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH)
 *
 * @param agent - The agent to run
 * @param content - The user input to process
 * @param loop - Whether to loop continuously or exit after completion
 * @param model - Optional fixed model to use (if not provided, models will rotate based on hierarchy scores)
 * @returns Promise that resolves to a MechResult containing status, cost, and duration
 */
export async function runMECH(
    agent: Agent,
    content: string,
    loop: boolean = false,
    model?: string
): Promise<MechResult> {
    console.log(`Running MECH with command: ${content}`);

    // Reset state for this run
    mechComplete = false;
    mechOutcome = {};

    // Start timing
    const startTime = new Date();
    const costBaseline = costTracker.getTotalCost();

    // Reset the meta-cognition state
    mechState.llmRequestCount = 0;
    mechState.disabledModels.clear();
    mechState.modelScores = {};
    mechState.lastModelUsed = undefined;
    mechState.metaFrequency = '5';

    // Add initial prompt to history
    addHistory({
        type: 'message',
        role: 'user',
        content,
    });

    // Add MECH tools to the agent
    agent.tools = agent.tools || [];
    agent.tools.unshift(...getMECHTools());

    const comm = getCommunicationManager();

    do {
        // Process any pending history threads at the start of each mech loop
        await processPendingHistoryThreads();

        try {
            await spawnMetaThoughtIfNeeded(agent);

            // Rotate the model using the MECH hierarchy-aware rotation (influenced by model scores)
            agent.model = model || Runner.rotateModel(agent);
            delete agent.modelSettings;

            sendComms({
                type: 'agent_status',
                agent_id: agent.agent_id,
                status: 'mech_start',
                meta_data: {
                    model: model,
                },
            });

            // Run the command with unified tool handling
            const response = await Runner.runStreamedWithTools(
                agent,
                '',
                getHistory()
            );

            console.log('[MECH] ', response);

            sendComms({
                type: 'agent_status',
                agent_id: agent.agent_id,
                status: 'mech_done',
                meta_data: {
                    model: model,
                },
            });

            if (!mechComplete) {
                // Let magi know our progress
                comm.send({
                    type: 'process_updated',
                    history: getHistory(),
                });

                sendComms({
                    type: 'agent_status',
                    agent_id: agent.agent_id,
                    status: 'thought_delay',
                    meta_data: {
                        seconds: getThoughtDelay(),
                    },
                });

                // Wait the required delay before the next thought
                await runThoughtDelay();
            }
        } catch (error: any) {
            // Handle any error that occurred during agent execution
            console.error(
                `Error running agent command: ${error?.message || String(error)}`
            );
            comm.send({ type: 'error', error });
        }
    } while (!mechComplete && loop && !comm.isClosed());

    // Calculate performance metrics
    const durationSec = Math.round(
        (new Date().getTime() - startTime.getTime()) / 1000
    );
    const totalCost = costTracker.getTotalCost() - costBaseline;

    // Build and return the appropriate result object
    if (mechOutcome.status === 'complete') {
        return {
            status: 'complete',
            result:
                mechOutcome.result ||
                'Task completed successfully (no result provided)',
            history: getHistory(),
            durationSec,
            totalCost,
        };
    } else if (mechOutcome.status === 'fatal_error') {
        return {
            status: 'fatal_error',
            error:
                mechOutcome.error ||
                'Task failed with an error (no details provided)',
            history: getHistory(),
            durationSec,
            totalCost,
        };
    } else {
        // Default case if no explicit outcome was set but mechComplete is true
        console.warn(
            'MECH completed but no outcome status was set, assuming success'
        );
        return {
            status: 'complete',
            result: 'Task completed (no explicit result provided)',
            history: getHistory(),
            durationSec,
            totalCost,
        };
    }
}

// Track task start time for duration calculation
const taskStartTime = new Date();

/**
 * Tool function to mark a task as successfully completed.
 * This also triggers automatic handling of git repositories for the task.
 */
export async function task_complete(result: string): Promise<string> {
    mechComplete = true;
    mechOutcome = {
        status: 'complete',
        result,
    };

    console.log(`[TaskRun] Task completed successfully: ${result}`);

    // Calculate metrics for immediate use in the response
    const durationSec = Math.round(
        (new Date().getTime() - taskStartTime.getTime()) / 1000
    );
    const totalCost = costTracker.getTotalCost();

    // Add metrics to the result message
    const resultWithMetrics = `${result}\n\n=== METRICS ===\nDuration  : ${durationSec}s\nTotal cost: $${totalCost.toFixed(6)}`;

    const comm = getCommunicationManager();
    // Use type assertion to avoid TypeScript errors
    comm.send({
        type: 'process_done',
        output: resultWithMetrics,
        history: getHistory(),
    } as any); // Cast to any to bypass type checking

    return `Task ended successfully\n\n${resultWithMetrics}`;
}

/**
 * Tool function to mark a task as failed with a fatal error.
 */
export function task_fatal_error(error: string): string {
    mechComplete = true;
    mechOutcome = {
        status: 'fatal_error',
        error,
    };

    console.error(`[TaskRun] Task failed: ${error}`);

    // Calculate metrics for immediate use in the response
    const durationSec = Math.round(
        (new Date().getTime() - taskStartTime.getTime()) / 1000
    );
    const totalCost = costTracker.getTotalCost();

    // Add metrics to the error message
    const errorWithMetrics = `Error: ${error}\n\n=== METRICS ===\nDuration  : ${durationSec}s\nTotal cost: $${totalCost.toFixed(6)}`;

    const comm = getCommunicationManager();
    // Use type assertion to avoid TypeScript errors
    comm.send({
        type: 'process_failed',
        error: errorWithMetrics,
        history: getHistory(),
    } as any); // Cast to any to bypass type checking

    return `Task failed\n\n${errorWithMetrics}`;
}

/**
 * Get all MECH tools as an array of tool definitions
 */
export function getMECHTools(): ToolFunction[] {
    return [
        createToolFunction(
            task_complete,
            'Report that the task has completed successfully',
            {
                result: 'A few paragraphs describing the result of the task. Include any assumptions you made, problems overcome and what the final outcome was.',
            }
        ),
        createToolFunction(
            task_fatal_error,
            'Report that you were not able to complete the task',
            { error: 'Describe the error that occurred in a few sentences' }
        ),
    ];
}
