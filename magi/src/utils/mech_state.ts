/**
 * MECH State management
 *
 * This module manages the state for the Meta-cognition Ensemble Chain-of-thought Hierarchy (MECH) system.
 * It provides a central state container and methods to modify the system's behavior at runtime.
 */

import { set_thought_delay } from './thought_utils.js';

export type MetaFrequency = 5 | 10 | 20 | 40;

/**
 * State container for the MECH system
 */
export interface MECHState {
    /** Counter for LLM requests to trigger meta-cognition */
    llmRequestCount: number;

    /** How often meta-cognition should run (every N LLM requests) */
    metaFrequency: MetaFrequency;

    /** Set of model IDs that have been temporarily disabled */
    disabledModels: Set<string>;

    /** Model effectiveness scores (0-100) - higher scores mean the model is selected more often */
    modelScores: Record<string, number>;

    /** Last model used, to ensure rotation */
    lastModelUsed?: string;
}

/**
 * Global MECH state
 */
export const mechState: MECHState = {
    llmRequestCount: 0,
    metaFrequency: 5,
    disabledModels: new Set<string>(),
    modelScores: {},
};

/**
 * Set how often meta-cognition should run (every N LLM requests)
 * @param frequency - The frequency to set (5, 10, 20, or 40)
 * @returns The new frequency
 */
export function setMetaFrequency(frequency: MetaFrequency): MetaFrequency {
    mechState.metaFrequency = frequency;
    console.log(
        `[MECH] Meta-cognition frequency set to every ${frequency} LLM requests`
    );
    return frequency;
}

/**
 * Set the delay between thoughts (proxies to thought_utils)
 * @param delaySeconds - Delay in seconds as a string (valid values: '0', '2', '4', '8', '16', '32', '64', '128')
 * @returns Message indicating success or failure
 */
export function setMechThoughtDelay(delaySeconds: string): string {
    console.log(`[MECH] Setting thought delay to ${delaySeconds} seconds`);
    return set_thought_delay(delaySeconds);
}

/**
 * Set the score for a specific model
 * @param modelId - The model ID to score
 * @param score - Score between 0-100, higher is better
 * @returns The new score
 */
export function setModelScore(modelId: string, score: number): number {
    // Ensure score is within valid range
    score = Math.max(0, Math.min(100, score));
    mechState.modelScores[modelId] = score;
    console.log(`[MECH] Model ${modelId} score set to ${score}`);
    return score;
}

/**
 * Disable a model so it won't be selected
 * @param modelId - The model ID to disable
 */
export function disableModel(modelId: string): void {
    mechState.disabledModels.add(modelId);
    console.log(`[MECH] Model ${modelId} disabled`);
}

/**
 * Enable a previously disabled model
 * @param modelId - The model ID to enable
 */
export function enableModel(modelId: string): void {
    mechState.disabledModels.delete(modelId);
    console.log(`[MECH] Model ${modelId} enabled`);
}

// Import findModel from model_data at the top of the file
import { findModel } from '../model_providers/model_data.js';

/**
 * Get the score for a model, optionally for a specific model class
 * @param modelId - The model ID to get the score for
 * @param modelClass - Optional model class to get a class-specific score
 * @returns The model's score (0-100)
 */
export function getModelScore(modelId: string, modelClass?: string): number {
    // First check if we have a score in mechState
    if (modelId in mechState.modelScores) {
        return mechState.modelScores[modelId];
    }

    // If not in mechState, look up the model entry
    const modelEntry = findModel(modelId);

    if (modelEntry) {
        // If a specific class is requested, check if there's a class-specific score
        if (modelClass && modelEntry.scores && modelEntry.scores[modelClass]) {
            return modelEntry.scores[modelClass];
        }

        // Fall back to general score if available
        if (modelEntry.score !== undefined) {
            return modelEntry.score;
        }
    }

    // Default score is 50
    return 50;
}

/**
 * Increment the LLM request counter
 * @returns The new count and whether meta-cognition should trigger
 */
export function incrementLLMRequestCount(): {
    count: number;
    shouldTriggerMeta: boolean;
} {
    mechState.llmRequestCount++;
    const shouldTriggerMeta =
        mechState.llmRequestCount % mechState.metaFrequency === 0;

    if (shouldTriggerMeta) {
        console.log(
            `[MECH] Meta-cognition trigger point reached at ${mechState.llmRequestCount} LLM requests`
        );
    }

    return {
        count: mechState.llmRequestCount,
        shouldTriggerMeta,
    };
}
