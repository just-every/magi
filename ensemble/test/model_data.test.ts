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
} from '../model_data.js';

describe('Model Data', () => {
    describe('MODEL_REGISTRY', () => {
        it('should be defined and not empty', () => {
            expect(MODEL_REGISTRY).toBeDefined();
            expect(typeof MODEL_REGISTRY).toBe('object');
            expect(Object.keys(MODEL_REGISTRY).length).toBeGreaterThan(0);
        });

        it('should contain known models', () => {
            // Test for some common models
            const gpt41 = MODEL_REGISTRY.find(m => m.id === 'gpt-4.1');
            const gpt41mini = MODEL_REGISTRY.find(m => m.id === 'gpt-4.1-mini');
            const claude = MODEL_REGISTRY.find(m => m.id === 'claude-3-7-sonnet-latest');
            
            expect(gpt41).toBeDefined();
            expect(gpt41mini).toBeDefined();
            expect(claude).toBeDefined();
        });

        it('should have valid model entries', () => {
            expect(MODEL_REGISTRY.length).toBeGreaterThan(0);

            // Test first few models for proper structure
            for (const model of MODEL_REGISTRY.slice(0, 5)) {
                
                expect(model).toBeDefined();
                expect(typeof model.provider).toBe('string');
                expect(typeof model.id).toBe('string');
                
                // Not all models have scores (e.g., embedding models)
                if (model.scores) {
                    expect(typeof model.scores).toBe('object');
                }
                
                // Check cost structure if present
                if (model.cost) {
                    expect(typeof model.cost).toBe('object');
                    expect(model.cost.input_per_million).toBeDefined();
                    // Output cost is optional (embedding models have 0)
                    if (model.cost.output_per_million !== undefined) {
                        expect(typeof model.cost.output_per_million).toBe('number');
                    }
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
            const gpt4 = findModel('gpt-4.1');
            expect(gpt4).toBeDefined();
            expect(gpt4?.id).toBe('gpt-4.1');
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
            const lowerCase = findModel('gpt-4.1');
            const upperCase = findModel('GPT-4.1');
            
            expect(lowerCase).toBeDefined();
            // Model names are typically lowercase
            expect(upperCase).toBeUndefined();
        });

        it('should return exact model entry structure', () => {
            const model = findModel('gpt-4.1');
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
            const modelsWithScores = MODEL_REGISTRY.filter(model => model.scores);
            
            // Should have at least some models with scores
            expect(modelsWithScores.length).toBeGreaterThan(0);
            
            modelsWithScores.forEach(model => {
                expect(model.scores).toBeDefined();
                expect(typeof model.scores).toBe('object');
                
                // All models with scores should have at least one score
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
            const modelsWithCost = MODEL_REGISTRY.filter(
                model => model.cost
            );
            
            expect(modelsWithCost.length).toBeGreaterThan(0);
            
            modelsWithCost.forEach(model => {
                const cost = model.cost!;
                
                // Should have appropriate pricing based on model type
                // Image generation models use per_image pricing
                if (cost.per_image !== undefined) {
                    expect(typeof cost.per_image).toBe('number');
                    expect(cost.per_image).toBeGreaterThanOrEqual(0);
                } else {
                    // Regular models should have input pricing
                    expect(cost.input_per_million).toBeDefined();
                    
                    // Input pricing validation
                    if (typeof cost.input_per_million === 'number') {
                        expect(cost.input_per_million).toBeGreaterThanOrEqual(0);
                    } else if (cost.input_per_million && typeof cost.input_per_million === 'object') {
                        // Could be TieredPrice or TimeBasedPrice
                        expect(typeof cost.input_per_million).toBe('object');
                    }
                    
                    // Output pricing validation (optional for embedding models)
                    if (cost.output_per_million !== undefined) {
                        if (typeof cost.output_per_million === 'number') {
                            expect(cost.output_per_million).toBeGreaterThanOrEqual(0);
                        } else if (cost.output_per_million && typeof cost.output_per_million === 'object') {
                            // Could be TieredPrice or TimeBasedPrice
                            expect(typeof cost.output_per_million).toBe('object');
                        }
                    }
                }
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
        it('should have models for main classes', () => {
            // Check only the main scoring classes, not all classes
            const mainClasses = ['monologue', 'code', 'reasoning'];
            
            mainClasses.forEach((className) => {
                const modelsForClass = MODEL_REGISTRY.filter(
                    model => model.scores && model.scores[className] !== undefined
                );
                
                expect(modelsForClass.length).toBeGreaterThan(0);
            });
        });

        it('should have multiple providers represented', () => {
            const providers = new Set(
                MODEL_REGISTRY.map(model => model.provider)
            );
            
            expect(providers.size).toBeGreaterThan(1);
            expect(providers.has('openai')).toBe(true);
            expect(providers.has('anthropic')).toBe(true);
        });

        it('should have reasonable score distributions', () => {
            Object.entries(MODEL_CLASSES).forEach(([className]) => {
                const scores = MODEL_REGISTRY
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