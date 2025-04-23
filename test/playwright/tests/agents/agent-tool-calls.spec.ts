/**
 * Tests for agent tool calls
 */
import { test, expect } from '../../utils/test-utils';
import { Agent } from '../../../../magi/src/utils/agent.js';
import { Runner } from '../../../../magi/src/utils/runner.js';
import { testProviderConfig } from '../../../../magi/src/model_providers/test_provider.js';

// Create a simple search tool for testing
const createSearchTool = () => {
    return {
        function: async (query: string) => {
            return `Search results for: ${query}`;
        },
        definition: {
            type: 'function',
            function: {
                name: 'web_search',
                description: 'Search the web for information',
                parameters: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'The search query',
                        },
                    },
                    required: ['query'],
                },
            },
        },
    };
};

test.describe('Agent Tool Calls', () => {
    test('should invoke tools and process results', async ({
        configureTestProvider,
    }) => {
        // Configure test provider to make a tool call
        configureTestProvider({
            simulateToolCall: true,
            toolName: 'web_search',
            toolArguments: { query: 'test query' },
            streamingDelay: 10,
            // For the second response after tool call
            fixedResponse: 'The search results indicate that the answer is 42.',
        });

        // Create a test agent with the search tool
        const agent = new Agent({
            agent_id: 'test-tool-agent',
            name: 'Test Tool Agent',
            description: 'Agent for testing tool calls',
            instructions:
                'You are a test agent that can search for information',
            model: 'test-standard',
            tools: [createSearchTool()],
        });

        // Create collectors for events and tool calls
        const events = [];
        const toolResults = [];

        // Set up the handlers to track tool usage
        const handlers = {
            onToolCall: async toolCall => {
                // Track that the tool was called
                expect(toolCall.function.name).toBe('web_search');
                expect(JSON.parse(toolCall.function.arguments).query).toBe(
                    'test query'
                );
            },
            onToolResult: async (toolCall, result) => {
                // Save the tool result
                toolResults.push({ toolCall, result });
            },
            onEvent: event => {
                events.push(event);

                // When we see a tool_start event, update the test provider config
                // to return a good response for the next model invocation
                if (event.type === 'tool_start') {
                    testProviderConfig.simulateToolCall = false;
                }
            },
        };

        // Run the agent with the test input
        const response = await Runner.runStreamedWithTools(
            agent,
            'Search for the answer to life, the universe and everything',
            [],
            handlers
        );

        // Verify we got tool results
        expect(toolResults.length).toBeGreaterThan(0);
        expect(toolResults[0].result).toContain(
            'Search results for: test query'
        );

        // Verify the final response incorporates the search results
        expect(response).toContain('answer is 42');
    });

    test('should handle multiple tool calls', async ({
        configureTestProvider,
    }) => {
        // First, configure provider to make the first tool call
        configureTestProvider({
            simulateToolCall: true,
            toolName: 'web_search',
            toolArguments: { query: 'first query' },
            streamingDelay: 10,
        });

        // Create a test agent with tools
        const agent = new Agent({
            agent_id: 'test-multi-tool-agent',
            name: 'Test Multi-Tool Agent',
            description: 'Agent for testing multiple tool calls',
            instructions: 'You are a test agent that can use multiple tools',
            model: 'test-standard',
            tools: [
                createSearchTool(),
                {
                    function: async (text: string) => {
                        return text.toUpperCase();
                    },
                    definition: {
                        type: 'function',
                        function: {
                            name: 'text_transform',
                            description: 'Transform text to uppercase',
                            parameters: {
                                type: 'object',
                                properties: {
                                    text: {
                                        type: 'string',
                                        description: 'The text to transform',
                                    },
                                },
                                required: ['text'],
                            },
                        },
                    },
                },
            ],
            maxToolCalls: 3, // Allow multiple tool calls
        });

        // Create collectors for events and tool calls
        const events = [];
        const toolCalls = [];

        // Run the agent
        const runnerPromise = (async () => {
            try {
                // Use runStreamedWithTools directly to get all events
                const response = await Runner.runStreamedWithTools(
                    agent,
                    'Use multiple tools to process data',
                    [],
                    {
                        onToolCall: async toolCall => {
                            toolCalls.push(toolCall);

                            // After the first tool call, change the provider config for the second call
                            if (toolCalls.length === 1) {
                                testProviderConfig.toolName = 'text_transform';
                                testProviderConfig.toolArguments = {
                                    text: 'transform this text',
                                };
                            }

                            // After the second tool call, disable tool calls for the final response
                            if (toolCalls.length === 2) {
                                testProviderConfig.simulateToolCall = false;
                                testProviderConfig.fixedResponse =
                                    'Final response after using multiple tools';
                            }
                        },
                        onEvent: event => {
                            events.push(event);
                        },
                    }
                );

                // Verify the final response
                expect(response).toBe(
                    'Final response after using multiple tools'
                );
            } catch (error) {
                console.error('Runner error:', error);
            }
        })();

        // Wait for the agent to finish
        await runnerPromise;

        // Verify we made tool calls
        expect(toolCalls.length).toBe(2);

        // Verify the first tool call was web_search
        expect(toolCalls[0].function.name).toBe('web_search');
        expect(JSON.parse(toolCalls[0].function.arguments).query).toBe(
            'first query'
        );

        // Verify the second tool call was text_transform
        expect(toolCalls[1].function.name).toBe('text_transform');
        expect(JSON.parse(toolCalls[1].function.arguments).text).toBe(
            'transform this text'
        );
    });

    test('should respect maxToolCalls limit', async ({
        configureTestProvider,
    }) => {
        // Configure provider to always try to make tool calls
        configureTestProvider({
            simulateToolCall: true,
            toolName: 'web_search',
            toolArguments: { query: 'test query' },
            streamingDelay: 10,
        });

        // Create a test agent with a low tool call limit
        const agent = new Agent({
            agent_id: 'test-tool-limit-agent',
            name: 'Test Tool Limit Agent',
            description: 'Agent for testing tool call limits',
            instructions: 'You are a test agent with limited tool calls',
            model: 'test-standard',
            tools: [createSearchTool()],
            maxToolCalls: 2, // Limit to 2 tool calls max
        });

        // Track tool calls
        let toolCallCount = 0;
        const eventTypes = [];

        // Run the agent
        const response = await Runner.runStreamedWithTools(
            agent,
            'Test the tool call limit',
            [],
            {
                onToolCall: async () => {
                    toolCallCount++;
                },
                onEvent: event => {
                    eventTypes.push(event.type);

                    // On the last tool call, we expect tool_choice to be forced to 'none'
                    // So we still need to make the model return a final response
                    if (toolCallCount >= agent.maxToolCalls) {
                        testProviderConfig.simulateToolCall = false;
                        testProviderConfig.fixedResponse =
                            'Final forced response without tools';
                    }
                },
            }
        );

        // Verify the tool call count matches our limit
        expect(toolCallCount).toBe(agent.maxToolCalls);

        // Verify the final response is what we expect after forcing tool_choice: 'none'
        expect(response).toBe('Final forced response without tools');

        // Check that we had the right sequence of events
        expect(eventTypes.filter(t => t === 'tool_start')).toHaveLength(
            agent.maxToolCalls
        );
        expect(eventTypes.filter(t => t === 'message_complete')).toHaveLength(
            toolCallCount + 1
        );
    });
});
