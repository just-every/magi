/**
 * Test suite for model data and registry
 */

import { describe, it, expect } from 'vitest';
import {
    MODEL_REGISTRY,
    MODEL_CLASSES,
    findModel,
    ModelProviderID,
    ModelEntry,
    TieredPrice,
    TimeBasedPrice
} from './model_data.js';

describe('Model Data', () => {
    describe('MODEL_REGISTRY', () => {
        it('should be defined and not empty', () => {
            expect(MODEL_REGISTRY).toBeDefined();
            expect(typeof MODEL_REGISTRY).toBe('object');
            expect(Object.keys(MODEL_REGISTRY).length).toBeGreaterThan(0);
        });

        it('should contain known models', () => {
            // Test for some common models
            expect(MODEL_REGISTRY['gpt-4']).toBeDefined();
            expect(MODEL_REGISTRY['gpt-3.5-turbo']).toBeDefined();
            expect(MODEL_REGISTRY['claude-3-5-sonnet-20241022']).toBeDefined();
        });

        it('should have valid model entries', () => {
            const modelKeys = Object.keys(MODEL_REGISTRY);
            expect(modelKeys.length).toBeGreaterThan(0);

            // Test first few models for proper structure
            for (const modelKey of modelKeys.slice(0, 5)) {
                const model = MODEL_REGISTRY[modelKey];
                
                expect(model).toBeDefined();
                expect(typeof model.provider).toBe('string');
                expect(typeof model.name).toBe('string');
                expect(model.scores).toBeDefined();
                expect(typeof model.scores).toBe('object');
                
                // Check cost structure if present
                if (model.cost) {
                    expect(typeof model.cost).toBe('object');
                    expect(typeof model.cost.input_per_million).toBeDefined();
                    expect(typeof model.cost.output_per_million).toBeDefined();
                }
            }
        });

        it('should have proper provider mappings', () => {
            const openAIModels = Object.values(MODEL_REGISTRY).filter(
                model => model.provider === 'openai'
            );
            const anthropicModels = Object.values(MODEL_REGISTRY).filter(
                model => model.provider === 'anthropic'
            );
            
            expect(openAIModels.length).toBeGreaterThan(0);
            expect(anthropicModels.length).toBeGreaterThan(0);
        });
    });

    describe('MODEL_CLASSES', () => {
        it('should be defined as an object', () => {
            expect(MODEL_CLASSES).toBeDefined();
            expect(typeof MODEL_CLASSES).toBe('object');
            expect(Object.keys(MODEL_CLASSES).length).toBeGreaterThan(0);
        });

        it('should contain expected model classes', () => {
            expect(MODEL_CLASSES).toHaveProperty('code');
            expect(MODEL_CLASSES).toHaveProperty('reasoning');
            expect(MODEL_CLASSES).toHaveProperty('monologue');
        });

        it('should have valid class structures', () => {
            Object.entries(MODEL_CLASSES).forEach(([className, classConfig]) => {
                expect(typeof className).toBe('string');
                expect(className.length).toBeGreaterThan(0);
                expect(classConfig).toHaveProperty('models');
                expect(Array.isArray(classConfig.models)).toBe(true);
                expect(classConfig.models.length).toBeGreaterThan(0);
            });
        });
    });

    describe('findModel', () => {
        it('should find existing models', () => {
            const gpt4 = findModel('gpt-4');
            expect(gpt4).toBeDefined();
            expect(gpt4?.id).toBe('gpt-4');
            expect(gpt4?.provider).toBe('openai');
        });

        it('should return undefined for non-existent models', () => {
            const nonExistent = findModel('non-existent-model-xyz');
            expect(nonExistent).toBeUndefined();
        });

        it('should handle empty string', () => {
            const empty = findModel('');
            expect(empty).toBeUndefined();
        });

        it('should be case sensitive', () => {
            const lowerCase = findModel('gpt-4');
            const upperCase = findModel('GPT-4');
            
            expect(lowerCase).toBeDefined();
            // Model names are typically lowercase
            expect(upperCase).toBeUndefined();
        });

        it('should return exact model entry structure', () => {
            const model = findModel('gpt-4');
            if (model) {
                expect(model).toHaveProperty('id');
                expect(model).toHaveProperty('provider');
                expect(model).toHaveProperty('scores');
                expect(typeof model.id).toBe('string');
                expect(typeof model.provider).toBe('string');
                expect(typeof model.scores).toBe('object');
            }
        });
    });

    describe('Model Entry Structure', () => {
        it('should have consistent scoring structure', () => {
            const models = Object.values(MODEL_REGISTRY);
            
            models.forEach(model => {
                expect(model.scores).toBeDefined();
                expect(typeof model.scores).toBe('object');
                
                // All models should have at least one score
                const scoreKeys = Object.keys(model.scores);
                expect(scoreKeys.length).toBeGreaterThan(0);
                
                // All scores should be numbers
                scoreKeys.forEach(key => {
                    const score = model.scores[key];
                    expect(typeof score).toBe('number');
                    expect(score).toBeGreaterThanOrEqual(0);
                    expect(score).toBeLessThanOrEqual(100);
                });
            });
        });

        it('should have valid cost structures when present', () => {
            const modelsWithCost = Object.values(MODEL_REGISTRY).filter(
                model => model.cost
            );
            
            expect(modelsWithCost.length).toBeGreaterThan(0);
            
            modelsWithCost.forEach(model => {
                const cost = model.cost!;
                
                // Should have input and output pricing
                expect(cost.input_per_million).toBeDefined();
                expect(cost.output_per_million).toBeDefined();
                
                // Pricing can be number, TieredPrice, or TimeBasedPrice
                [cost.input_per_million, cost.output_per_million].forEach(price => {
                    if (typeof price === 'number') {
                        expect(price).toBeGreaterThanOrEqual(0);
                    } else if (price && typeof price === 'object') {
                        // Could be TieredPrice or TimeBasedPrice
                        expect(typeof price).toBe('object');
                    }
                });
            });
        });

        it('should have valid provider IDs', () => {
            const validProviders: ModelProviderID[] = [
                'openai', 'anthropic', 'google', 'deepseek', 'xai', 'openrouter', 'test'
            ];
            
            Object.values(MODEL_REGISTRY).forEach(model => {
                expect(validProviders).toContain(model.provider as ModelProviderID);
            });
        });
    });

    describe('Pricing Structure Types', () => {
        it('should handle tiered pricing structure', () => {
            // Find a model with tiered pricing if any
            const modelsWithTieredPricing = Object.values(MODEL_REGISTRY).filter(
                model => model.cost && 
                typeof model.cost.input_per_million === 'object' &&
                model.cost.input_per_million !== null &&
                'threshold_tokens' in model.cost.input_per_million
            );
            
            modelsWithTieredPricing.forEach(model => {
                const tieredPrice = model.cost!.input_per_million as TieredPrice;
                expect(typeof tieredPrice.threshold_tokens).toBe('number');
                expect(typeof tieredPrice.price_below_threshold_per_million).toBe('number');
                expect(typeof tieredPrice.price_above_threshold_per_million).toBe('number');
                expect(tieredPrice.threshold_tokens).toBeGreaterThan(0);
                expect(tieredPrice.price_below_threshold_per_million).toBeGreaterThanOrEqual(0);
                expect(tieredPrice.price_above_threshold_per_million).toBeGreaterThanOrEqual(0);
            });
        });

        it('should handle time-based pricing structure', () => {
            // Find a model with time-based pricing if any
            const modelsWithTimeBasedPricing = Object.values(MODEL_REGISTRY).filter(
                model => model.cost && 
                typeof model.cost.input_per_million === 'object' &&
                model.cost.input_per_million !== null &&
                'peak_price_per_million' in model.cost.input_per_million
            );
            
            modelsWithTimeBasedPricing.forEach(model => {
                const timeBasedPrice = model.cost!.input_per_million as TimeBasedPrice;
                expect(typeof timeBasedPrice.peak_price_per_million).toBe('number');
                expect(typeof timeBasedPrice.off_peak_price_per_million).toBe('number');
                expect(timeBasedPrice.peak_price_per_million).toBeGreaterThanOrEqual(0);
                expect(timeBasedPrice.off_peak_price_per_million).toBeGreaterThanOrEqual(0);
                
                if (timeBasedPrice.peak_utc_start_hour !== undefined) {
                    expect(timeBasedPrice.peak_utc_start_hour).toBeGreaterThanOrEqual(0);
                    expect(timeBasedPrice.peak_utc_start_hour).toBeLessThan(24);
                }
                
                if (timeBasedPrice.peak_utc_end_hour !== undefined) {
                    expect(timeBasedPrice.peak_utc_end_hour).toBeGreaterThanOrEqual(0);
                    expect(timeBasedPrice.peak_utc_end_hour).toBeLessThan(24);
                }
            });
        });
    });

    describe('Model Coverage', () => {
        it('should have models for each class', () => {
            Object.entries(MODEL_CLASSES).forEach(([className, classConfig]) => {
                const modelsForClass = Object.values(MODEL_REGISTRY).filter(
                    model => model.scores && model.scores[className] !== undefined
                );
                
                expect(modelsForClass.length).toBeGreaterThan(0);
            });
        });

        it('should have multiple providers represented', () => {
            const providers = new Set(
                Object.values(MODEL_REGISTRY).map(model => model.provider)
            );
            
            expect(providers.size).toBeGreaterThan(1);
            expect(providers.has('openai')).toBe(true);
            expect(providers.has('anthropic')).toBe(true);
        });

        it('should have reasonable score distributions', () => {
            Object.entries(MODEL_CLASSES).forEach(([className, classConfig]) => {
                const scores = Object.values(MODEL_REGISTRY)
                    .map(model => model.scores && model.scores[className])
                    .filter(score => score !== undefined) as number[];
                
                if (scores.length > 0) {
                    const minScore = Math.min(...scores);
                    const maxScore = Math.max(...scores);
                    
                    expect(minScore).toBeGreaterThanOrEqual(0);
                    expect(maxScore).toBeLessThanOrEqual(100);
                    expect(maxScore).toBeGreaterThan(minScore);
                }
            });
        });
    });
});