/**
 * Tests for the test provider implementation
 */
import { test, expect } from '../../utils/test-utils';
import {
    TestProvider,
    testProviderConfig,
} from '../../../../magi/src/model_providers/test_provider.js';

test.describe('Test Provider', () => {
    test('should return a basic response', async ({
        configureTestProvider,
    }) => {
        // Configure the test provider
        configureTestProvider({
            fixedResponse: 'This is a test response',
            streamingDelay: 10, // Use a short delay for faster tests
        });

        // Create a new instance of the TestProvider
        const provider = new TestProvider();

        // Create a response stream
        const stream = provider.createResponseStream('test-standard', [
            { role: 'user', content: 'Hello' },
        ]);

        // Collect all events from the stream
        const events = [];
        for await (const event of stream) {
            events.push(event);
        }

        // Verify we got the expected events
        expect(events.some(e => e.type === 'message_start')).toBeTruthy();
        expect(events.some(e => e.type === 'message_delta')).toBeTruthy();
        expect(events.some(e => e.type === 'message_complete')).toBeTruthy();

        // Check the final message content
        const completeEvent = events.find(e => e.type === 'message_complete');
        expect(completeEvent).toBeDefined();
        expect(completeEvent.content).toBe('This is a test response');
    });

    test('should simulate an error', async ({ configureTestProvider }) => {
        // Configure the test provider to simulate an error
        configureTestProvider({
            shouldError: true,
            errorMessage: 'Test error message',
        });

        // Create a new instance of the TestProvider
        const provider = new TestProvider();

        // Create a response stream
        const stream = provider.createResponseStream('test-error', [
            { role: 'user', content: 'Trigger an error' },
        ]);

        // Collect all events from the stream
        const events = [];
        for await (const event of stream) {
            events.push(event);
        }

        // Verify we got an error event
        expect(events.length).toBe(1);
        expect(events[0].type).toBe('error');
        expect(events[0].error).toBe('Test error message');
    });

    test('should simulate a rate limit error', async ({
        configureTestProvider,
    }) => {
        // Configure the test provider to simulate a rate limit error
        configureTestProvider({
            simulateRateLimit: true,
        });

        // Create a new instance of the TestProvider
        const provider = new TestProvider();

        // Create a response stream
        const stream = provider.createResponseStream('test-rate-limit', [
            { role: 'user', content: 'Trigger a rate limit' },
        ]);

        // Collect all events from the stream
        const events = [];
        for await (const event of stream) {
            events.push(event);
        }

        // Verify we got a rate limit error
        expect(events.length).toBe(1);
        expect(events[0].type).toBe('error');
        expect(events[0].error).toContain('429 Too Many Requests');
    });

    test('should simulate a tool call', async ({ configureTestProvider }) => {
        // Configure the test provider to simulate a tool call
        configureTestProvider({
            simulateToolCall: true,
            toolName: 'web_search',
            toolArguments: { query: 'test query' },
            streamingDelay: 10,
        });

        // Create a test agent with tools
        const mockAgent = {
            export: () => ({ agent_id: 'test-agent', name: 'Test Agent' }),
            tools: [
                {
                    definition: {
                        type: 'function',
                        function: {
                            name: 'web_search',
                            description: 'Search the web',
                            parameters: {
                                type: 'object',
                                properties: {
                                    query: { type: 'string' },
                                },
                                required: ['query'],
                            },
                        },
                    },
                    function: () => Promise.resolve('search results'),
                },
            ],
        };

        // Create a new instance of the TestProvider
        const provider = new TestProvider();

        // Create a response stream with the mock agent
        const stream = provider.createResponseStream(
            'test-standard',
            [{ role: 'user', content: 'Search for something' }],
            mockAgent as any
        );

        // Collect all events from the stream
        const events = [];
        for await (const event of stream) {
            events.push(event);
        }

        // Verify we got a tool call
        const toolCallEvent = events.find(e => e.type === 'tool_start');
        expect(toolCallEvent).toBeDefined();
        expect(toolCallEvent.tool_calls).toHaveLength(1);
        expect(toolCallEvent.tool_calls[0].function.name).toBe('web_search');
        expect(
            JSON.parse(toolCallEvent.tool_calls[0].function.arguments)
        ).toEqual({ query: 'test query' });

        // Verify the final response mentions the tool call
        const completeEvent = events.find(e => e.type === 'message_complete');
        expect(completeEvent).toBeDefined();
        expect(completeEvent.content).toContain('web_search tool');
    });

    test('should generate thinking content', async ({
        configureTestProvider,
    }) => {
        // Configure the test provider
        configureTestProvider({
            fixedThinking: 'This is thinking content',
            fixedResponse: 'Final response after thinking',
            streamingDelay: 10,
        });

        // Create a new instance of the TestProvider
        const provider = new TestProvider();

        // Create a response stream
        const stream = provider.createResponseStream('test-reasoning', [
            { role: 'user', content: 'Complex question' },
        ]);

        // Collect all events from the stream
        const events = [];
        for await (const event of stream) {
            events.push(event);
        }

        // Verify we got thinking content
        const thinkingEvent = events.find(e => e.thinking_content);
        expect(thinkingEvent).toBeDefined();
        expect(thinkingEvent.thinking_content).toBe('This is thinking content');

        // Check the final response
        const completeEvent = events.find(e => e.type === 'message_complete');
        expect(completeEvent).toBeDefined();
        expect(completeEvent.content).toBe('Final response after thinking');
    });
});
