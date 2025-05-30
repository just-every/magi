/**
 * Model rotation logic for MECH
 * 
 * This module handles the weighted model selection based on MECH scores.
 */

import { MODEL_CLASSES, ModelClassID, getModelFromClass } from '@magi-system/ensemble';
import { mechState, getModelScore } from './mech_state.js';
import type { MechAgent } from './types.js';

/**
 * Rotate models based on MECH hierarchy scores
 * 
 * @param agent - The agent to rotate models for
 * @param modelClass - Optional model class to use
 * @returns The selected model ID or undefined
 */
export async function rotateModel(
    agent: MechAgent,
    modelClass?: ModelClassID
): Promise<string | undefined> {
    // Store last model used to ensure rotation
    const lastModel = agent.model;
    mechState.lastModelUsed = lastModel;
    let model: string | undefined;

    modelClass = modelClass || (agent.modelClass as ModelClassID);
    if (modelClass) {
        // First try to get a model using getModelFromClass which respects overrides
        try {
            model = await getModelFromClass(modelClass);
            console.log(`[MECH] Model selected via getModelFromClass for class ${modelClass}: ${model}`);
            return model;
        } catch (error) {
            console.log(`[MECH] getModelFromClass failed for ${modelClass}, falling back to rotation logic`);
        }
        
        // Fallback to original rotation logic if getModelFromClass fails
        const modelClassStr = modelClass as string;

        if (modelClassStr in MODEL_CLASSES) {
            // Safe to use the key since we've verified it exists
            const modelClassConfig =
                MODEL_CLASSES[modelClassStr as keyof typeof MODEL_CLASSES];
            let models: string[] = [...modelClassConfig.models];

            // Filter out models
            models = models.filter(modelId => {
                // Skip last used model to ensure rotation
                if (modelId === lastModel) return false;

                // Skip disabled models
                if (mechState.disabledModels.has(modelId)) return false;

                return true;
            });

            if (models.length > 0) {
                // Use weighted selection based on model scores
                // Pass the model class to getModelScore to get class-specific scores
                const totalScore = models.reduce(
                    (sum, modelId) =>
                        sum + getModelScore(modelId, modelClassStr),
                    0
                );

                if (totalScore > 0) {
                    // Weighted random selection
                    let rand = Math.random() * totalScore;
                    for (const modelId of models) {
                        // Use class-specific score for weighting
                        rand -= getModelScore(modelId, modelClassStr);
                        if (rand <= 0) {
                            model = modelId;
                            break;
                        }
                    }

                    // Fallback in case rounding errors cause us to miss
                    if (!model) {
                        model = models[models.length - 1];
                    }
                } else {
                    // If all scores are 0 for some reason, pick a random model
                    models = models.sort(() => Math.random() - 0.5);
                    model = models[0];
                }
            }
        } else {
            // If modelClass isn't a valid key, fall back to 'standard'
            console.warn(
                `Invalid model class '${modelClassStr}', falling back to standard models`
            );
            if ('standard' in MODEL_CLASSES) {
                const standardModels =
                    MODEL_CLASSES['standard' as keyof typeof MODEL_CLASSES]
                        .models;
                if (standardModels.length > 0) {
                    model = standardModels[0];
                }
            }
        }
    }

    return model;
}