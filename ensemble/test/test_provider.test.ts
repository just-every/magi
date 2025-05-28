/**
 * Test suite for the test provider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
    TestProvider, 
    testProviderConfig, 
    resetTestProviderConfig 
} from '../model_providers/test_provider.js';
import { EnsembleAgent, EnsembleStreamEvent, ToolFunction } from '../types.js';

// Mock agent implementation for testing
class MockAgent implements EnsembleAgent {
    agent_id: string;
    private tools: ToolFunction[];

    constructor(agentId: string = 'test-agent', tools: ToolFunction[] = []) {
        this.agent_id = agentId;
        this.tools = tools;
    }

    async getTools(): Promise<ToolFunction[]> {
        return this.tools;
    }
}

describe('Test Provider', () => {
    let provider: TestProvider;
    let mockAgent: MockAgent;

    beforeEach(() => {
        resetTestProviderConfig();
        provider = new TestProvider();
        mockAgent = new MockAgent();
    });

    describe('Configuration', () => {
        it('should use default configuration', () => {
            expect(testProviderConfig.streamingDelay).toBe(50);
            expect(testProviderConfig.shouldError).toBe(false);
            expect(testProviderConfig.simulateRateLimit).toBe(false);
            expect(testProviderConfig.chunkSize).toBe(5);
        });

        it('should reset configuration properly', () => {
            testProviderConfig.streamingDelay = 100;
            testProviderConfig.shouldError = true;
            
            resetTestProviderConfig();
            
            expect(testProviderConfig.streamingDelay).toBe(50);
            expect(testProviderConfig.shouldError).toBe(false);
        });

        it('should accept custom configuration', () => {
            const customConfig = {
                streamingDelay: 25,
                shouldError: true,
                errorMessage: 'Custom error',
                chunkSize: 10
            };
            
            const customProvider = new TestProvider(customConfig);
            expect(customProvider).toBeInstanceOf(TestProvider);
        });
    });

    describe('Stream Response Generation', () => {
        it('should generate streaming response events', async () => {
            const events: EnsembleStreamEvent[] = [];
            
            testProviderConfig.fixedResponse = 'Test response';
            testProviderConfig.streamingDelay = 10;
            
            const stream = provider.createResponseStream('test-model', [
                { type: 'message', role: 'user', content: 'Hello' }
            ], mockAgent);

            for await (const event of stream) {
                events.push(event);
            }

            expect(events.length).toBeGreaterThan(0);
            
            // Should have message_start event
            const startEvent = events.find(e => e.type === 'message_start');
            expect(startEvent).toBeDefined();
            expect((startEvent as any)?.message_id).toBeDefined();
            
            // Should have message_delta events
            const deltaEvents = events.filter(e => e.type === 'message_delta');
            expect(deltaEvents.length).toBeGreaterThan(0);
            
            // Should have message_complete event
            const completeEvent = events.find(e => e.type === 'message_complete');
            expect(completeEvent).toBeDefined();
            expect((completeEvent as any)?.content).toBe('Test response');
        });

        it('should handle error simulation', async () => {
            const events: EnsembleStreamEvent[] = [];
            
            testProviderConfig.shouldError = true;
            testProviderConfig.errorMessage = 'Simulated test error';
            
            const stream = provider.createResponseStream('test-model', [
                { type: 'message', role: 'user', content: 'Hello' }
            ], mockAgent);

            for await (const event of stream) {
                events.push(event);
            }

            expect(events.length).toBe(1);
            expect(events[0].type).toBe('error');
            expect((events[0] as any).error).toBe('Simulated test error');
        });

        it('should handle rate limit simulation', async () => {
            const events: EnsembleStreamEvent[] = [];
            
            testProviderConfig.simulateRateLimit = true;
            
            const stream = provider.createResponseStream('test-model', [
                { type: 'message', role: 'user', content: 'Hello' }
            ], mockAgent);

            for await (const event of stream) {
                events.push(event);
            }

            expect(events.length).toBe(1);
            expect(events[0].type).toBe('error');
            expect((events[0] as any).error).toContain('429 Too Many Requests');
        });
    });

    describe('Response Generation', () => {
        it('should generate contextual responses', () => {
            const provider = new TestProvider();
            
            // Test greeting response
            const helloResponse = (provider as any).generateResponse('Hello there!');
            expect(helloResponse).toContain('Hello!');
            
            // Test help response
            const helpResponse = (provider as any).generateResponse('I need help');
            expect(helpResponse).toContain('help');
            
            // Test error response
            const errorResponse = (provider as any).generateResponse('I have an error');
            expect(errorResponse).toContain('issue');
            
            // Test test response
            const testResponse = (provider as any).generateResponse('This is a test');
            expect(testResponse).toContain('test');
        });

        it('should handle question responses', () => {
            const provider = new TestProvider();
            const response = (provider as any).generateResponse('Can you explain?');
            expect(response).toContain('interesting question');
        });

        it('should provide generic response for other inputs', () => {
            const provider = new TestProvider();
            const response = (provider as any).generateResponse('Random message');
            expect(response).toContain('Random message');
            expect(response).toContain('simulated response');
        });
    });

    describe('Tool Call Simulation', () => {
        it('should simulate tool calls when configured', async () => {
            const mockTool: ToolFunction = {
                definition: {
                    type: 'function',
                    function: {
                        name: 'web_search',
                        description: 'Search the web',
                        parameters: {
                            type: 'object',
                            properties: {
                                query: { type: 'string' }
                            },
                            required: []
                        }
                    }
                },
                function: vi.fn()
            };
            
            const agentWithTools = new MockAgent('test-agent', [mockTool]);
            const events: EnsembleStreamEvent[] = [];
            
            testProviderConfig.simulateToolCall = true;
            testProviderConfig.toolName = 'web_search';
            testProviderConfig.toolArguments = { query: 'test search' };
            testProviderConfig.streamingDelay = 10;
            
            const stream = provider.createResponseStream('test-model', [
                { type: 'message', role: 'user', content: 'Search for something' }
            ], agentWithTools);

            for await (const event of stream) {
                events.push(event);
            }

            // Should have tool_start event
            const toolEvent = events.find(e => e.type === 'tool_start');
            expect(toolEvent).toBeDefined();
            expect((toolEvent as any)?.tool_calls).toBeDefined();
            expect((toolEvent as any)?.tool_calls[0]?.function?.name).toBe('web_search');
        });

        it('should skip tool calls when no tools available', async () => {
            const events: EnsembleStreamEvent[] = [];
            
            testProviderConfig.simulateToolCall = true;
            testProviderConfig.streamingDelay = 10;
            
            const stream = provider.createResponseStream('test-model', [
                { type: 'message', role: 'user', content: 'Hello' }
            ], mockAgent);

            for await (const event of stream) {
                events.push(event);
            }

            // Should not have tool_start event
            const toolEvent = events.find(e => e.type === 'tool_start');
            expect(toolEvent).toBeUndefined();
        });
    });

    describe('Thinking Content', () => {
        it('should include thinking content when configured', async () => {
            const events: EnsembleStreamEvent[] = [];
            
            testProviderConfig.fixedThinking = 'This is my thinking process';
            testProviderConfig.streamingDelay = 10;
            
            const stream = provider.createResponseStream('test-model', [
                { type: 'message', role: 'user', content: 'Hello' }
            ], mockAgent);

            for await (const event of stream) {
                events.push(event);
            }

            const thinkingEvent = events.find(e => 
                e.type === 'message_delta' && 
                (e as any).thinking_content
            );
            
            expect(thinkingEvent).toBeDefined();
            expect((thinkingEvent as any).thinking_content).toBe('This is my thinking process');
            expect((thinkingEvent as any).thinking_signature).toBe('(Simulated thinking)');
        });
    });

});