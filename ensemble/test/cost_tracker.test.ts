/**
 * Test suite for the cost tracker utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { costTracker } from '../utils/cost_tracker.js';
import { ModelUsage } from '../model_data.js';

describe('Cost Tracker', () => {
    beforeEach(() => {
        // Reset cost tracker state before each test
        costTracker.reset();
    });

    describe('Usage Tracking', () => {
        it('should add usage entries', () => {
            const usage: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 200,
                timestamp: new Date()
            };

            // CostTracker doesn't expose getEntries, so test via total cost
            const totalBefore = costTracker.getTotalCost();
            costTracker.addUsage(usage);
            const totalAfter = costTracker.getTotalCost();
            
            expect(totalAfter).toBeGreaterThan(totalBefore);
        });

        it('should calculate costs for known models', () => {
            const usage: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 1000,
                output_tokens: 500,
                timestamp: new Date()
            };

            const calculatedUsage = costTracker.calculateCost(usage);
            
            expect(typeof calculatedUsage.cost).toBe('number');
            expect(calculatedUsage.cost).toBeGreaterThan(0);
        });

        it('should handle free tier usage', () => {
            const usage: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50,
                isFreeTierUsage: true,
                timestamp: new Date()
            };

            const calculatedUsage = costTracker.calculateCost(usage);
            
            expect(calculatedUsage.cost).toBe(0);
        });

        it('should handle already calculated costs', () => {
            const usage: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50,
                cost: 0.05,
                timestamp: new Date()
            };

            const calculatedUsage = costTracker.calculateCost(usage);
            
            expect(calculatedUsage.cost).toBe(0.05);
        });

        it('should throw error for unknown models', () => {
            const usage: ModelUsage = {
                model: 'unknown-model',
                input_tokens: 100,
                output_tokens: 50,
                timestamp: new Date()
            };

            expect(() => costTracker.calculateCost(usage)).toThrow();
        });
    });

    describe('Cost Calculation', () => {
        it('should calculate costs with image tokens', () => {
            const usage: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50,
                image_count: 2,
                timestamp: new Date()
            };

            const calculatedUsage = costTracker.calculateCost(usage);
            
            expect(typeof calculatedUsage.cost).toBe('number');
            expect(calculatedUsage.cost).toBeGreaterThan(0);
        });

        it('should handle cached tokens if supported', () => {
            const usage: ModelUsage = {
                model: 'claude-3-7-sonnet-latest',
                input_tokens: 100,
                output_tokens: 50,
                cached_tokens: 50,
                timestamp: new Date()
            };

            const calculatedUsage = costTracker.calculateCost(usage);
            
            expect(typeof calculatedUsage.cost).toBe('number');
            expect(calculatedUsage.cost).toBeGreaterThan(0);
        });
    });

    describe('Aggregation', () => {
        it('should calculate total costs', () => {
            const usage1: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50,
                timestamp: new Date()
            };

            const usage2: ModelUsage = {
                model: 'gpt-4.1-mini',
                input_tokens: 200,
                output_tokens: 100,
                timestamp: new Date()
            };

            costTracker.addUsage(usage1);
            costTracker.addUsage(usage2);

            const totalCost = costTracker.getTotalCost();
            
            expect(typeof totalCost).toBe('number');
            expect(totalCost).toBeGreaterThan(0);
        });

        it('should group costs by model', () => {
            const usage1: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50,
                timestamp: new Date()
            };

            const usage2: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 200,
                output_tokens: 100,
                timestamp: new Date()
            };

            const usage3: ModelUsage = {
                model: 'gpt-4.1-mini',
                input_tokens: 150,
                output_tokens: 75,
                timestamp: new Date()
            };

            costTracker.addUsage(usage1);
            costTracker.addUsage(usage2);
            costTracker.addUsage(usage3);

            const costsByModel = costTracker.getCostsByModel();
            
            expect(costsByModel['gpt-4.1']).toBeDefined();
            expect(costsByModel['gpt-4.1-mini']).toBeDefined();
            expect(typeof costsByModel['gpt-4.1'].cost).toBe('number');
            expect(typeof costsByModel['gpt-4.1-mini'].cost).toBe('number');
            expect(costsByModel['gpt-4.1'].calls).toBe(2);
            expect(costsByModel['gpt-4.1-mini'].calls).toBe(1);
        });
    });

    describe('Callbacks', () => {
        it('should call onAddUsage callbacks', () => {
            const callback = vi.fn();
            costTracker.onAddUsage(callback);

            const usage: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50,
                timestamp: new Date()
            };

            costTracker.addUsage(usage);
            
            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50
            }));
        });

        it('should handle multiple callbacks', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            
            costTracker.onAddUsage(callback1);
            costTracker.onAddUsage(callback2);

            const usage: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50,
                timestamp: new Date()
            };

            costTracker.addUsage(usage);
            
            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
        });
    });

    describe('State Management', () => {
        it('should clear all entries', () => {
            const usage: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50,
                timestamp: new Date()
            };

            costTracker.addUsage(usage);
            const totalBefore = costTracker.getTotalCost();
            expect(totalBefore).toBeGreaterThan(0);

            costTracker.reset();
            const totalAfter = costTracker.getTotalCost();
            expect(totalAfter).toBe(0);
        });

        it('should maintain total cost state', () => {
            const usage1: ModelUsage = {
                model: 'gpt-4.1',
                input_tokens: 100,
                output_tokens: 50,
                timestamp: new Date()
            };

            costTracker.addUsage(usage1);
            const firstTotal = costTracker.getTotalCost();
            expect(firstTotal).toBeGreaterThan(0);

            const usage2: ModelUsage = {
                model: 'gpt-4.1-mini',
                input_tokens: 200,
                output_tokens: 100,
                timestamp: new Date()
            };

            costTracker.addUsage(usage2);
            const secondTotal = costTracker.getTotalCost();
            expect(secondTotal).toBeGreaterThan(firstTotal);
        });
    });
});