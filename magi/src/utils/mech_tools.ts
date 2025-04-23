/**
 * MECH Tools
 *
 * Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH) implementation.
 * This file replaces the previous MEC (Multi-Ensemble Chain) implementation
 * with the more advanced MECH system that adds meta-cognition and hierarchy capabilities.
 */

import { Agent } from './agent.js';
import { Runner } from './runner.js';
import { getCommunicationManager } from './communication.js';
import { addHistory, getHistory } from './history.js';
import { runThoughtDelay } from './thought_utils.js';
import { ToolFunction } from '../types/shared-types.js';
import { createToolFunction } from './tool_call.js';
import { mechState, incrementLLMRequestCount } from './mech_state.js';
import { spawnMetaThought } from './meta_cognition.js';

let mechComplete = false;

/**
 * Runs the Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH)
 *
 * @param agent - The agent to run
 * @param content - The user input to process
 * @param loop - Whether to loop continuously or exit after completion
 * @param model - Optional fixed model to use (if not provided, models will rotate based on hierarchy scores)
 * @returns Promise that resolves when complete
 */
export async function runMECH(
    agent: Agent,
    content: string,
    loop: boolean = false,
    model?: string
): Promise<void> {
    console.log(`Running MECH with command: ${content}`);

    // Reset mechComplete flag
    mechComplete = false;

    // Reset the meta-cognition state
    mechState.llmRequestCount = 0;
    mechState.disabledModels.clear();
    mechState.modelScores = {};
    mechState.lastModelUsed = undefined;

    // Set initial meta-cognition frequency
    mechState.metaFrequency = 5;

    // Add initial prompt to history
    addHistory({
        role: 'user',
        content,
    });

    // Add MECH tools to the agent
    agent.tools = agent.tools || [];
    agent.tools.unshift(...getMECHTools());

    const comm = getCommunicationManager();

    do {
        try {
            // Check if we need to trigger meta-cognition
            const { shouldTriggerMeta } = incrementLLMRequestCount();
            if (shouldTriggerMeta) {
                console.log(
                    `[MECH] Triggering meta-cognition after ${mechState.llmRequestCount} LLM requests`
                );
                try {
                    await spawnMetaThought();
                } catch (error) {
                    console.error('[MECH] Error in meta-cognition:', error);
                }
            }

            // Rotate the model using the MECH hierarchy-aware rotation (influenced by model scores)
            agent.model = model || Runner.rotateModel(agent);
            delete agent.modelSettings;

            // Run the command with unified tool handling
            const response = await Runner.runStreamedWithTools(
                agent,
                '',
                getHistory()
            );

            console.log('[MECH] ', response);

            if (!mechComplete) {
                // Let magi know our progress
                comm.send({
                    type: 'process_updated',
                    history: getHistory(),
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
}

/**
 * Tool function to signal successful task completion.
 * This also triggers automatic handling of git repositories for the task.
 */
export async function task_complete(result: string): Promise<string> {
    mechComplete = true;
    console.log(`[TaskRun] Task completed successfully: ${result}`);

    const comm = getCommunicationManager();
    comm.send({
        type: 'process_done',
        output: result,
        history: getHistory(),
    });
    return `Task ended successfully\n\n${result}`;
}

/**
 * Tool function to signal a fatal task error.
 */
export function task_fatal_error(error: string): string {
    mechComplete = true;
    console.error(`[TaskRun] Task failed: ${error}`);
    const comm = getCommunicationManager();
    comm.send({
        type: 'process_failed',
        error: error,
        history: getHistory(),
    });
    return `Task failed\n\nError: ${error}`;
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
