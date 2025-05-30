/**
 * MECH Tools
 *
 * Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH) implementation.
 * This file replaces the previous MEC (Multi-Ensemble Chain) implementation
 * with the more advanced MECH system that adds meta-cognition and hierarchy capabilities.
 */

import type { MechAgent, MechContext, MechOutcome, MechResult } from './types.js';
import { mechState, incrementLLMRequestCount } from './mech_state.js';
import { runThoughtDelay, getThoughtDelay } from './thought_utils.js';
import { spawnMetaThought } from './meta_cognition.js';
import { rotateModel } from './model_rotation.js';
import { ToolFunction } from '@magi-system/ensemble';

// Shared state for MECH execution
let mechComplete = false;
let mechOutcome: MechOutcome = {};

// Track task start time for duration calculation
let taskStartTime = new Date();

/**
 * Runs the Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH)
 *
 * @param agent - The agent to run
 * @param content - The user input to process
 * @param context - The MECH context containing required utilities
 * @param loop - Whether to loop continuously or exit after completion
 * @param model - Optional fixed model to use (if not provided, models will rotate based on hierarchy scores)
 * @returns Promise that resolves to a MechResult containing status, cost, and duration
 */
export async function runMECH(
    agent: MechAgent,
    content: string,
    context: MechContext,
    loop: boolean = false,
    model?: string
): Promise<MechResult> {
    console.log(`Running MECH with command: ${content}`);

    // Reset state for this run
    mechComplete = false;
    mechOutcome = {};

    // Start timing
    const startTime = new Date();
    taskStartTime = startTime;
    const costBaseline = context.costTracker.getTotalCost();

    // Reset the meta-cognition state
    mechState.llmRequestCount = 0;
    mechState.disabledModels.clear();
    mechState.modelScores = {};
    mechState.lastModelUsed = undefined;
    mechState.metaFrequency = '5';

    // Add initial prompt to history
    context.addHistory({
        type: 'message',
        role: 'user',
        content,
    });

    // Add MECH tools to the agent
    agent.tools = agent.tools || [];
    agent.tools.unshift(...getMECHTools(context));

    const comm = context.getCommunicationManager();

    do {
        try {
            // Check if we need to trigger meta-cognition
            const { shouldTriggerMeta } = incrementLLMRequestCount();
            if (shouldTriggerMeta) {
                console.log(
                    `[MECH] Triggering meta-cognition after ${mechState.llmRequestCount} LLM requests`
                );
                try {
                    await spawnMetaThought(agent, context, startTime);
                } catch (error) {
                    console.error('[MECH] Error in meta-cognition:', error);
                }
            }

            // Process any pending history threads at the start of each mech loop
            await context.processPendingHistoryThreads();

            // Rotate the model using the MECH hierarchy-aware rotation (influenced by model scores)
            agent.model = model || await rotateModel(agent);
            // Note: modelSettings deletion is handled by the runner

            context.sendComms({
                type: 'agent_status',
                agent_id: agent.agent_id,
                status: 'mech_start',
                meta_data: {
                    model: model,
                },
            });

            // Run the command with unified tool handling
            // Note: The actual runner execution is provided by the context
            let response;
            if (context.runStreamedWithTools) {
                response = await context.runStreamedWithTools(
                    agent,
                    '',
                    context.getHistory()
                );
            } else {
                throw new Error('runStreamedWithTools not provided in context');
            }

            console.log('[MECH] ', response);

            context.sendComms({
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
                    history: context.getHistory(),
                });

                context.sendComms({
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
    const totalCost = context.costTracker.getTotalCost() - costBaseline;

    // Build and return the appropriate result object
    if (mechOutcome.status === 'complete') {
        return {
            status: 'complete',
            mechOutcome,
            history: context.getHistory(),
            durationSec,
            totalCost,
        };
    } else if (mechOutcome.status === 'fatal_error') {
        return {
            status: 'fatal_error',
            mechOutcome,
            history: context.getHistory(),
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
            history: context.getHistory(),
            durationSec,
            totalCost,
        };
    }
}

/**
 * Tool function to mark a task as successfully completed.
 * This also triggers automatic handling of git repositories for the task.
 */
export async function task_complete(result: string, context: MechContext): Promise<string> {
    console.log(`[TaskRun] Task completed successfully: ${result}`);

    // Calculate metrics for immediate use in the response
    const durationSec = Math.round(
        (new Date().getTime() - taskStartTime.getTime()) / 1000
    );
    const totalCost = context.costTracker.getTotalCost();

    // Add metrics to the result message
    const resultWithMetrics = `${result}\n\n=== METRICS ===\nDuration  : ${durationSec}s\nTotal cost: $${totalCost.toFixed(6)}`;

    mechComplete = true;
    mechOutcome = {
        status: 'complete',
        result,
        event: {
            type: 'process_done',
            output: resultWithMetrics,
            history: context.getHistory(),
        } as any,
    };

    return `Task ended successfully\n\n${resultWithMetrics}`;
}

/**
 * Tool function to mark a task as failed with a fatal error.
 */
export function task_fatal_error(error: string, context: MechContext): string {
    console.error(`[TaskRun] Task failed: ${error}`);

    // Calculate metrics for immediate use in the response
    const durationSec = Math.round(
        (new Date().getTime() - taskStartTime.getTime()) / 1000
    );
    const totalCost = context.costTracker.getTotalCost();

    // Add metrics to the error message
    const errorWithMetrics = `Error: ${error}\n\n=== METRICS ===\nDuration  : ${durationSec}s\nTotal cost: $${totalCost.toFixed(6)}`;

    mechComplete = true;
    mechOutcome = {
        status: 'fatal_error',
        error,
        event: {
            type: 'process_failed',
            error: errorWithMetrics,
            history: context.getHistory(),
        } as any,
    };

    return `Task failed\n\n${errorWithMetrics}`;
}

/**
 * Get all MECH tools as an array of tool definitions
 */
export function getMECHTools(context: MechContext): ToolFunction[] {
    if (!context.createToolFunction) {
        return [];
    }
    
    return [
        context.createToolFunction(
            (result: unknown) => task_complete(result as string, context),
            'Report that the task has completed successfully',
            {
                result: 'A few paragraphs describing the result of the task. Include any assumptions you made, problems overcome and what the final outcome was.',
            }
        ),
        context.createToolFunction(
            (error: unknown) => task_fatal_error(error as string, context),
            'Report that you were not able to complete the task',
            { error: 'Describe the error that occurred in a few sentences' }
        ),
    ];
}