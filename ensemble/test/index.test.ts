/**
 * Test suite for the new ensemble package architecture
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    // Core abstractions
    Conversation,
    createUserMessage,
    createAssistantMessage,
    createConversation,
    createToolFunction,
    createSimpleToolRegistry,
    
    // Main request pipeline
    request,
    simpleRequest,
    streamRequest,
    validateRequestParams,
    isModelSupported,
    
    // Tool orchestration
    executeTools,
    validateToolCall,
    
    // Stream processing
    EventFactory,
    isMessageDeltaEvent,
    isStreamEndEvent,
    
    // Provider system
    getModelProvider,
    registerProvider,
    clearProviders,
    
    // Types
    type EnsembleStreamEvent,
    type RequestParams,
    
    // Legacy compatibility
    getLegacyModelProvider,
    MODEL_REGISTRY,
    MODEL_CLASSES,
    costTracker,
    quotaTracker,
} from '../index.js';

import { testProvider } from '../provider/test_provider.js';

describe('New Ensemble Architecture', () => {
    beforeEach(() => {
        // Clear and re-register test provider
        clearProviders();
        registerProvider('test-', testProvider);
    });

    describe('Core Abstractions', () => {
        it('should create and manage conversations', () => {
            const conversation = createConversation();
            expect(conversation).toBeInstanceOf(Conversation);
            expect(conversation.length).toBe(0);
            
            const userMessage = conversation.addUserMessage('Hello!');
            expect(conversation.length).toBe(1);
            expect(userMessage.role).toBe('user');
            expect(userMessage.content).toBe('Hello!');
            
            const lastMessage = conversation.lastMessage();
            expect(lastMessage).toBe(userMessage);
        });

        it('should create messages with proper structure', () => {
            const userMsg = createUserMessage('Test message');
            expect(userMsg.type).toBe('message');
            expect(userMsg.role).toBe('user');
            expect(userMsg.content).toBe('Test message');
            expect(userMsg.id).toBeDefined();
            expect(userMsg.timestamp).toBeDefined();
            
            const assistantMsg = createAssistantMessage('Response');
            expect(assistantMsg.type).toBe('message');
            expect(assistantMsg.role).toBe('assistant');
            expect(assistantMsg.content).toBe('Response');
        });

        it('should create and manage tools', () => {
            const tool = createToolFunction(
                'test_tool',
                'A test tool',
                {
                    type: 'object',
                    properties: {
                        input: { type: 'string', description: 'Test input' }
                    },
                    required: ['input']
                },
                async (args) => `Processed: ${args.input}`
            );
            
            expect(tool.definition.function.name).toBe('test_tool');
            expect(typeof tool.execute).toBe('function');
            
            const registry = createSimpleToolRegistry([tool]);
            expect(registry).toBeInstanceOf(Map);
            expect(registry.has('test_tool')).toBe(true);
        });
    });

    describe('Provider System', () => {
        it('should register and retrieve providers', () => {
            expect(isModelSupported('test-model')).toBe(true);
            
            const provider = getModelProvider('test-model');
            expect(provider).toBe(testProvider);
        });

        it('should validate provider capabilities', () => {
            const provider = getModelProvider('test-model');
            expect(provider.supportsModel('test-model')).toBe(true);
            expect(provider.supportsModel('gpt-4')).toBe(false);
            
            const supportedModels = provider.getSupportedModels();
            expect(supportedModels).toContain('test-model');
        });
    });

    describe('Request Pipeline', () => {
        it('should handle basic request without tools', async () => {
            const conversation = createConversation();
            conversation.addUserMessage('Hello, how are you?');
            
            const events: EnsembleStreamEvent[] = [];
            
            const handle = await request('test-model', conversation, {
                agentId: 'test-agent',
                onEvent: (event) => events.push(event as EnsembleStreamEvent)
            });
            
            expect(handle).toBeDefined();
            expect(handle.conversation).toBeInstanceOf(Conversation);
            expect(handle.conversation.length).toBeGreaterThan(1); // Original + response
            expect(handle.lastAssistantText).toBeDefined();
            expect(handle.executionTimeMs).toBeGreaterThan(0);
            
            // Check that we got the expected events
            expect(events.length).toBeGreaterThan(0);
            expect(events.some(e => e.type === 'message_start')).toBe(true);
            expect(events.some(e => e.type === 'stream_end')).toBe(true);
        });

        it('should handle request with tools', async () => {
            const tool = createToolFunction(
                'get_weather',
                'Get weather information',
                {
                    type: 'object',
                    properties: {
                        location: { type: 'string', description: 'Location' }
                    },
                    required: ['location']
                },
                async (args) => ({ temperature: '22°C', location: args.location })
            );
            
            const toolRegistry = createSimpleToolRegistry([tool]);
            const conversation = createConversation();
            conversation.addUserMessage('Use a tool to get weather for Tokyo');
            
            const handle = await request('test-model', conversation, {
                agentId: 'test-agent',
                tools: toolRegistry,
                onEvent: () => {}
            });
            
            expect(handle.rawToolCallsThisTurn).toBeDefined();
            expect(handle.toolResultsThisTurn).toBeDefined();
        });

        it('should validate request parameters', () => {
            const conversation = createConversation();
            const params: RequestParams = {
                agentId: 'test',
                onEvent: () => {}
            };
            
            const validation = validateRequestParams('test-model', conversation, params);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
            
            const invalidValidation = validateRequestParams('', conversation, params);
            expect(invalidValidation.valid).toBe(false);
            expect(invalidValidation.errors.length).toBeGreaterThan(0);
        });

        it('should handle simple requests', async () => {
            const conversation = createConversation();
            conversation.addUserMessage('Simple test');
            
            const handle = await simpleRequest('test-model', conversation, {
                agentId: 'test-agent',
                onEvent: () => {}
            });
            
            expect(handle.lastAssistantText).toBeDefined();
            expect(handle.conversation.length).toBeGreaterThan(1);
        });
    });

    describe('Tool Execution', () => {
        it('should execute tools correctly', async () => {
            const tool = createToolFunction(
                'echo',
                'Echo the input',
                {
                    type: 'object',
                    properties: {
                        message: { type: 'string', description: 'Message to echo' }
                    },
                    required: ['message']
                },
                async (args) => `Echo: ${args.message}`
            );
            
            const toolRegistry = createSimpleToolRegistry([tool]);
            const toolCall = {
                id: 'test-call-1',
                type: 'function' as const,
                function: {
                    name: 'echo',
                    arguments: JSON.stringify({ message: 'Hello World' })
                }
            };
            
            const results = await executeTools([toolCall], toolRegistry);
            expect(results).toHaveLength(1);
            expect(results[0].output).toBe('Echo: Hello World');
            expect(results[0].error).toBeUndefined();
        });

        it('should handle tool validation', () => {
            const validCall = {
                id: 'test-1',
                type: 'function' as const,
                function: {
                    name: 'test',
                    arguments: '{"key": "value"}'
                }
            };
            
            const validation = validateToolCall(validCall);
            expect(validation.valid).toBe(true);
            
            const invalidCall = {
                id: '',
                type: 'function' as const,
                function: {
                    name: '',
                    arguments: 'invalid json'
                }
            };
            
            const invalidValidation = validateToolCall(invalidCall);
            expect(invalidValidation.valid).toBe(false);
            expect(invalidValidation.error).toBeDefined();
        });
    });

    describe('Stream Processing', () => {
        it('should create events with EventFactory', () => {
            const startEvent = EventFactory.messageStart('msg-1');
            expect(startEvent.type).toBe('message_start');
            expect(startEvent.messageId).toBe('msg-1');
            expect(startEvent.timestamp).toBeDefined();
            
            const deltaEvent = EventFactory.messageDelta('msg-1', 'Hello');
            expect(deltaEvent.type).toBe('message_delta');
            expect(deltaEvent.delta).toBe('Hello');
            
            const endEvent = EventFactory.streamEnd();
            expect(endEvent.type).toBe('stream_end');
        });

        it('should provide type guards for events', () => {
            const deltaEvent = EventFactory.messageDelta('msg-1', 'test');
            const endEvent = EventFactory.streamEnd();
            
            expect(isMessageDeltaEvent(deltaEvent)).toBe(true);
            expect(isMessageDeltaEvent(endEvent)).toBe(false);
            
            expect(isStreamEndEvent(endEvent)).toBe(true);
            expect(isStreamEndEvent(deltaEvent)).toBe(false);
        });
    });

    describe('Streaming API', () => {
        it('should support streaming requests', async () => {
            const conversation = createConversation();
            conversation.addUserMessage('Stream test');
            
            const events: EnsembleStreamEvent[] = [];
            
            for await (const event of streamRequest('test-model', conversation, {
                agentId: 'stream-test',
                onEvent: () => {}
            })) {
                events.push(event);
                if (event.type === 'stream_end') {
                    break;
                }
            }
            
            expect(events.length).toBeGreaterThan(0);
            expect(events.some(e => e.type === 'stream_end')).toBe(true);
        });
    });

    describe('Legacy Compatibility', () => {
        it('should maintain access to legacy exports', () => {
            expect(MODEL_REGISTRY).toBeDefined();
            expect(MODEL_CLASSES).toBeDefined();
            expect(costTracker).toBeDefined();
            expect(quotaTracker).toBeDefined();
            expect(typeof getLegacyModelProvider).toBe('function');
        });
    });

    describe('Integration Test', () => {
        it('should handle a complete conversation flow', async () => {
            // Create a weather tool
            const weatherTool = createToolFunction(
                'get_weather',
                'Get weather for a location',
                {
                    type: 'object',
                    properties: {
                        location: { type: 'string', description: 'City name' }
                    },
                    required: ['location']
                },
                async (args) => ({
                    location: args.location,
                    temperature: '25°C',
                    condition: 'Sunny'
                })
            );
            
            const tools = createSimpleToolRegistry([weatherTool]);
            let conversation = createConversation();
            
            // First turn: User asks for weather using a tool
            conversation.addUserMessage('Get the weather for Paris using a tool');
            
            const handle1 = await request('test-model', conversation, {
                agentId: 'integration-test',
                tools,
                onEvent: () => {}
            });
            
            conversation = handle1.conversation;
            expect(conversation.length).toBeGreaterThan(2); // User msg + assistant msg + possibly tool results
            
            // Second turn: Follow up question
            conversation.addUserMessage('Is that warm or cold?');
            
            const handle2 = await request('test-model', conversation, {
                agentId: 'integration-test',
                tools,
                onEvent: () => {}
            });
            
            expect(handle2.conversation.length).toBeGreaterThan(conversation.length);
            expect(handle2.lastAssistantText).toBeDefined();
        });
    });
});