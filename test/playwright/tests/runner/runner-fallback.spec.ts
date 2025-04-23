/**
 * Tests for the Runner's fallback mechanism
 */
import { test, expect } from '../../utils/test-utils';
import { Agent } from '../../../../magi/src/utils/agent.js';
import { Runner } from '../../../../magi/src/utils/runner.js';
import { testProviderConfig } from '../../../../magi/src/model_providers/test_provider.js';

test.describe('Runner Fallback Mechanism', () => {
    test('should fallback to next model on error', async ({
        configureTestProvider,
    }) => {
        // Configure the first test model to error
        configureTestProvider({
            shouldError: true,
            errorMessage: 'First model error',
        });

        // Create an agent with the test-error model
        const agent = new Agent({
            agent_id: 'test-fallback-agent',
            name: 'Test Fallback Agent',
            description: 'Agent for testing fallback behavior',
            instructions: 'You are a test agent for fallback behavior',
            model: 'test-error', // This model will fail
            modelClass: 'standard', // This will include test-standard in the fallback options
        });

        // Create a collector for events
        const events = [];

        // Intercept events from the runner
        const runnerPromise = (async () => {
            try {
                const stream = Runner.runStreamed(agent, 'Test input');

                // Collect all events
                for await (const event of stream) {
                    events.push(event);

                    // Update testProviderConfig when we detect the error event
                    // This simulates a different configuration for the fallback model
                    if (event.type === 'error') {
                        // After error, the next try should succeed
                        testProviderConfig.shouldError = false;
                        testProviderConfig.fixedResponse =
                            'Response from fallback model';
                    }
                }
            } catch (error) {
                console.error('Runner error:', error);
            }
        })();

        // Wait for the runner to finish
        await runnerPromise;

        // Verify that an error occurred and fallback was triggered
        expect(events.some(e => e.type === 'error')).toBeTruthy();

        // Check that we received agent_start and agent_updated events
        const startEvent = events.find(e => e.type === 'agent_start');
        expect(startEvent).toBeDefined();
        expect(startEvent.agent.model).toBe('test-error');

        const updateEvent = events.find(e => e.type === 'agent_updated');
        expect(updateEvent).toBeDefined();
        expect(updateEvent.agent.model).not.toBe('test-error'); // Should have switched to a different model

        // Verify that we eventually got a complete message
        const completeEvent = events.find(e => e.type === 'message_complete');
        expect(completeEvent).toBeDefined();
        expect(completeEvent.content).toBe('Response from fallback model');
    });

    test('should fallback from rate-limited model to paid model', async ({
        configureTestProvider,
    }) => {
        // Configure the experimental model to simulate a rate limit error
        configureTestProvider({
            simulateRateLimit: true,
        });

        // Create an agent with the experimental model
        const agent = new Agent({
            agent_id: 'test-gemini-agent',
            name: 'Test Gemini Agent',
            description: 'Agent for testing Gemini fallback behavior',
            instructions: 'You are a test agent for Gemini fallback behavior',
            model: 'gemini-2.5-pro-exp-03-25', // This should trigger the special fallback to paid model
        });

        // Create a collector for events
        const events = [];

        // Intercept events from the runner
        const runnerPromise = (async () => {
            try {
                const stream = Runner.runStreamed(agent, 'Test Gemini input');

                // Collect all events
                for await (const event of stream) {
                    events.push(event);

                    // Configure the fallback to succeed when we detect an error
                    if (event.type === 'error') {
                        testProviderConfig.simulateRateLimit = false;
                        testProviderConfig.fixedResponse =
                            'Response from paid Gemini model';
                    }
                }
            } catch (error) {
                console.error('Runner error:', error);
            }
        })();

        // Wait for the runner to finish
        await runnerPromise;

        // Verify that a rate limit error occurred
        const errorEvent = events.find(e => e.type === 'error');
        expect(errorEvent).toBeDefined();
        expect(errorEvent.error).toContain('429 Too Many Requests');

        // Check that fallback happened directly to the paid model
        const updateEvent = events.find(e => e.type === 'agent_updated');
        expect(updateEvent).toBeDefined();
        expect(updateEvent.agent.model).toBe('gemini-2.5-pro-preview-03-25'); // Should switch to the paid model

        // Verify that we eventually got a complete message
        const completeEvent = events.find(e => e.type === 'message_complete');
        expect(completeEvent).toBeDefined();
        expect(completeEvent.content).toBe('Response from paid Gemini model');
    });

    test('should try all available models before giving up', async ({
        configureTestProvider,
    }) => {
        // Configure all models to fail
        configureTestProvider({
            shouldError: true,
            errorMessage: 'Model error',
        });

        // Create an agent that will use a limited set of models for testing
        const agent = new Agent({
            agent_id: 'test-all-models-agent',
            name: 'Test All Models Agent',
            description: 'Agent for testing exhaustive fallback behavior',
            instructions: 'You are a test agent for fallback behavior',
            modelClass: 'mini', // Use mini class which has fewer models for quicker testing
        });

        // Create a collector for events
        const events = [];
        let modelsTried = new Set();

        // Intercept events from the runner
        const runnerPromise = (async () => {
            try {
                const stream = Runner.runStreamed(
                    agent,
                    'Test all models input'
                );

                // Collect all events
                for await (const event of stream) {
                    events.push(event);

                    // Track which models were tried
                    if (event.agent?.model) {
                        modelsTried.add(event.agent.model);
                    }
                }
            } catch (error) {
                console.error('Runner error:', error);
            }
        })();

        // Wait for the runner to finish
        await runnerPromise;

        // Verify that we tried multiple models
        expect(modelsTried.size).toBeGreaterThan(1);

        // Count the error events to confirm each model failed
        const errorEvents = events.filter(e => e.type === 'error');
        expect(errorEvents.length).toBeGreaterThanOrEqual(modelsTried.size);

        // Verify we didn't get a complete message since all models failed
        const completeEvent = events.find(e => e.type === 'message_complete');
        expect(completeEvent).toBeUndefined();
    });
});
