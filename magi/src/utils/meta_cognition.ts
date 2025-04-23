/**
 * Meta-cognition module for MECH
 *
 * This module implements "thinking about thinking" capabilities for the MECH system.
 * It spawns an LLM agent that analyzes recent thought history and can adjust system
 * parameters to improve performance.
 */

import { Agent } from './agent.js';
import { Runner } from './runner.js';
import {
    mechState,
    setMetaFrequency,
    setMechThoughtDelay,
    setModelScore,
    disableModel,
    enableModel,
} from './mech_state.js';
import { addHistory, getHistory } from './history.js';
import { createToolFunction } from './tool_call.js';
import { ToolFunction, ResponseInput } from '../types/shared-types.js';
import { getModelFromClass } from '../model_providers/model_provider.js';

/**
 * Create a thought that will be injected into the history
 * @param content - The thought content to inject
 * @returns Message indicating success
 */
function injectThought(content: string): string {
    addHistory({
        role: 'developer',
        content: `[Meta-cognition] ${content}`,
    });
    console.log(`[MECH] Meta-cognition injected thought: ${content}`);
    return `Successfully injected meta-cognition thought at ${new Date().toISOString()}`;
}

/**
 * Get all meta-cognition tools as an array of tool definitions
 * These are available only to the meta-cognition agent, not the main agent
 */
function getMetaCognitionTools(): ToolFunction[] {
    return [
        createToolFunction(
            setMetaFrequency,
            'Change how often meta-cognition should run (every N LLM requests)',
            { frequency: 'Frequency value (5, 10, 20, or 40 LLM requests)' }
        ),
        createToolFunction(
            setMechThoughtDelay,
            'Change the delay between thoughts',
            {
                delaySeconds:
                    'Delay in seconds (0, 2, 4, 8, 16, 32, 64, or 128)',
            }
        ),
        createToolFunction(
            injectThought,
            'Inject a thought into the history to guide future reasoning',
            { content: 'The thought to inject' }
        ),
        createToolFunction(
            setModelScore,
            'Set a score for a specific model (affects selection frequency)',
            {
                modelId: 'The model ID to score',
                score: 'Score between 0-100, higher means the model is selected more often',
            }
        ),
        createToolFunction(
            disableModel,
            'Temporarily disable a model from being selected',
            { modelId: 'The model ID to disable' }
        ),
        createToolFunction(
            enableModel,
            'Re-enable a previously disabled model',
            { modelId: 'The model ID to enable' }
        ),
    ];
}

/**
 * Creates a prompt for the meta-cognition agent based on recent history
 * @param history - The full history array
 * @returns A formatted prompt string
 */
function createMetaCognitionPrompt(history: ResponseInput): string {
    // Extract the last 20 messages or fewer if there aren't that many
    const recentHistory = history.slice(-20);

    let promptText = `You are the meta-cognition system for the MECH (Meta-cognition Ensemble Chain-of-thought Hierarchy).
Your job is to analyze the recent thought patterns, evaluate their effectiveness, and make improvements to the system.

You can:
1. Change meta-cognition frequency (how often you are triggered)
2. Adjust thought delay (how long to wait between thoughts)
3. Inject new thoughts to guide future reasoning
4. Adjust model scoring or disable/enable models based on their effectiveness

Current system state:
- You are triggered every ${mechState.metaFrequency} LLM requests
- Several models are being used in an ensemble approach, with their outputs combined

RECENT HISTORY:
`;

    // Add the recent history
    recentHistory.forEach(item => {
        if ('role' in item && 'content' in item) {
            if (typeof item.content === 'string') {
                promptText += `\n[${item.role}]: ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`;
            }
        } else if (
            'type' in item &&
            item.type === 'function_call' &&
            'name' in item
        ) {
            promptText += `\n[tool_call]: ${item.name}`;
        } else if (
            'type' in item &&
            item.type === 'function_call_output' &&
            'output' in item
        ) {
            promptText += `\n[tool_result]: ${String(item.output).substring(0, 100)}${String(item.output).length > 100 ? '...' : ''}`;
        }
    });

    promptText += `\n\nBased on the recent interaction history:
1. Evaluate if the current approach is effective or if there are patterns of failure
2. Consider if the models being used are performing well or if some should be prioritized/deprioritized
3. Determine if the current meta-cognition frequency is appropriate
4. Decide if you should inject a thought to guide future reasoning

Use your tools to implement any improvements you identify. Be concise in your analysis.`;

    return promptText;
}

/**
 * Spawns a meta-cognition process that analyzes recent history and can
 * modify system behavior.
 *
 * @param agent - The main agent instance
 * @returns Promise that resolves when meta-cognition is complete
 */
export async function spawnMetaThought(): Promise<void> {
    console.log('[MECH] Spawning meta-cognition process');

    try {
        // Create a meta-cognition agent
        const metaAgent = new Agent({
            name: 'Meta-cognition',
            description: 'Meta-cognition system for MECH',
            instructions: createMetaCognitionPrompt(getHistory()),
            tools: getMetaCognitionTools(),
            modelClass: 'reasoning',
            // Don't run more than one round of tools
            maxToolCallRoundsPerTurn: 1,
        });

        // Use a high-quality reasoning model
        metaAgent.model = await getModelFromClass('reasoning');

        // Run the meta-cognition agent with Runner
        const response = await Runner.runStreamedWithTools(metaAgent);

        // Add meta-cognition output to history as a 'developer' message
        // but marked as meta-cognition
        addHistory({
            role: 'developer',
            content: `[Meta-cognition Analysis]\n${response}`,
        });

        console.log('[MECH] Meta-cognition process completed');
    } catch (error) {
        console.error('[MECH] Error in meta-cognition process:', error);

        // Add error to history
        addHistory({
            role: 'developer',
            content: `[Meta-cognition Error] Failed to complete meta-cognition: ${error}`,
        });
    }
}
