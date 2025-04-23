/**
 * E2E Tests for cost tracking
 */
import { test, expect } from '../../utils/test-utils';
import { costTracker } from '../../../../magi/src/utils/cost_tracker.js';

test.describe('Cost Tracking E2E', () => {
    // Reset cost tracker before each test
    test.beforeEach(() => {
        costTracker.reset();
    });

    test('should track costs for model usage', async () => {
        // Add some usage
        costTracker.addUsage({
            model: 'gpt-4o',
            input_tokens: 1000,
            output_tokens: 500,
        });

        // Verify total cost is calculated correctly
        const totalCost = costTracker.getTotalCost();
        expect(totalCost).toBeGreaterThan(0);

        // Get costs by model
        const costsByModel = costTracker.getCostsByModel();
        expect(costsByModel['gpt-4o']).toBeDefined();
        expect(costsByModel['gpt-4o'].calls).toBe(1);
        expect(costsByModel['gpt-4o'].cost).toBeGreaterThan(0);
    });

    test('should track different types of models and their costs', async () => {
        // Track usage for a variety of models
        const models = [
            {
                model: 'gpt-4o',
                input_tokens: 1000,
                output_tokens: 500,
            },
            {
                model: 'claude-3-7-sonnet-latest',
                input_tokens: 1500,
                output_tokens: 700,
            },
            {
                model: 'gemini-2.5-pro-exp-03-25',
                input_tokens: 800,
                output_tokens: 300,
            },
            {
                model: 'test-standard',
                input_tokens: 500,
                output_tokens: 200,
            },
        ];

        // Add usage for each model
        for (const usage of models) {
            costTracker.addUsage(usage);
        }

        // Verify total cost
        const totalCost = costTracker.getTotalCost();
        expect(totalCost).toBeGreaterThan(0);

        // Get costs by model
        const costsByModel = costTracker.getCostsByModel();

        // Verify each model's cost was calculated
        for (const usage of models) {
            expect(costsByModel[usage.model]).toBeDefined();
            expect(costsByModel[usage.model].calls).toBe(1);

            // Free models should have zero cost
            if (
                usage.model === 'gemini-2.5-pro-exp-03-25' ||
                usage.model === 'test-standard'
            ) {
                expect(costsByModel[usage.model].cost).toBe(0);
            } else {
                expect(costsByModel[usage.model].cost).toBeGreaterThan(0);
            }
        }

        // Print summary (mainly for observing output in tests)
        costTracker.printSummary();
    });

    test('should handle token-based tiered pricing', async () => {
        // Use GPT-4.5-preview which has tiered pricing based on tokens
        const smallUsage = {
            model: 'gpt-4.5-preview',
            input_tokens: 10000, // Below tier threshold
            output_tokens: 5000,
        };

        const largeUsage = {
            model: 'gpt-4.5-preview',
            input_tokens: 1000000, // Well above tier threshold
            output_tokens: 50000,
        };

        // Add the small usage
        costTracker.addUsage(smallUsage);
        const smallCost = costTracker.getTotalCost();

        // Reset for clean test
        costTracker.reset();

        // Add the large usage
        costTracker.addUsage(largeUsage);
        const largeCost = costTracker.getTotalCost();

        // The cost per token should be higher for the larger usage due to tiered pricing
        // The ratio shouldn't be exactly proportional to tokens
        const smallTokens = smallUsage.input_tokens + smallUsage.output_tokens;
        const largeTokens = largeUsage.input_tokens + largeUsage.output_tokens;
        const tokenRatio = largeTokens / smallTokens;
        const costRatio = largeCost / smallCost;

        // Costs shouldn't scale exactly with tokens due to tiered pricing
        // This test might need adjustment based on the actual pricing tiers
        expect(costRatio).not.toBeCloseTo(tokenRatio, 1); // Not within 10% of token ratio
    });

    test('should integrate with quota tracking', async () => {
        // Track usage for a model that has quota tracking
        costTracker.addUsage({
            model: 'gemini-2.5-pro-exp-03-25',
            input_tokens: 10000,
            output_tokens: 5000,
        });

        // Get costs by model
        const costsByModel = costTracker.getCostsByModel();

        // Verify the model was tracked
        expect(costsByModel['gemini-2.5-pro-exp-03-25']).toBeDefined();
        expect(costsByModel['gemini-2.5-pro-exp-03-25'].cost).toBe(0); // Free model

        // Print summary to see quota information
        costTracker.printSummary();

        // The test would ideally check the quota information in the metadata,
        // but this requires accessing internal state or mocking the quota manager
    });
});
