import { describe, it, expect } from 'vitest';
import { convertStreamToMessages } from '../utils/stream_converter.js';
import type { EnsembleStreamEvent, ResponseInput } from '../types.js';

describe('Stream Converter', () => {
    it('should convert message events to ResponseInput', async () => {
        // Create a mock stream
        async function* mockStream(): AsyncGenerator<EnsembleStreamEvent> {
            yield {
                type: 'message_complete',
                content: 'Hello, world!',
                message_id: 'msg-123',
                timestamp: new Date().toISOString(),
            } as any;
        }

        const result = await convertStreamToMessages(mockStream());

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
            type: 'message',
            role: 'assistant',
            content: 'Hello, world!',
        });
        expect(result.fullResponse).toBe('Hello, world!');
    });

    it('should handle thinking messages', async () => {
        async function* mockStream(): AsyncGenerator<EnsembleStreamEvent> {
            yield {
                type: 'message_complete',
                thinking_content: 'Let me think...',
                thinking_signature: 'thinking-sig',
                content: 'The answer is 42',
                message_id: 'msg-123',
                timestamp: new Date().toISOString(),
            } as any;
        }

        const result = await convertStreamToMessages(mockStream());

        expect(result.messages).toHaveLength(2);
        expect(result.messages[0]).toMatchObject({
            type: 'thinking',
            role: 'assistant',
            content: 'Let me think...',
        });
        expect(result.messages[1]).toMatchObject({
            type: 'message',
            role: 'assistant',
            content: 'The answer is 42',
        });
    });

    it('should handle tool calls with processor', async () => {
        async function* mockStream(): AsyncGenerator<EnsembleStreamEvent> {
            yield {
                type: 'tool_start',
                tool_calls: [{
                    id: 'call-123',
                    type: 'function',
                    function: {
                        name: 'test_tool',
                        arguments: '{"key": "value"}',
                    },
                }],
                timestamp: new Date().toISOString(),
            } as any;
            
            yield {
                type: 'tool_done',
                timestamp: new Date().toISOString(),
            } as any;
        }

        const toolProcessor = async (calls: any[]) => {
            return { result: 'success' };
        };

        const result = await convertStreamToMessages(mockStream(), [], {
            processToolCall: toolProcessor,
        });

        // Tool calls are only collected but not returned if tool_done event is received
        expect(result.toolCalls).toHaveLength(0);
        expect(result.messages).toHaveLength(2);
        expect(result.messages[0]).toMatchObject({
            type: 'function_call',
            name: 'test_tool',
        });
        expect(result.messages[1]).toMatchObject({
            type: 'function_call_output',
            output: JSON.stringify({ result: 'success' }),
        });
    });

    it('should preserve initial messages', async () => {
        const initialMessages: ResponseInput = [
            { type: 'message', role: 'user', content: 'Hello' },
        ];

        async function* mockStream(): AsyncGenerator<EnsembleStreamEvent> {
            yield {
                type: 'message_complete',
                content: 'Hi there!',
                message_id: 'msg-123',
                timestamp: new Date().toISOString(),
            } as any;
        }

        const result = await convertStreamToMessages(mockStream(), initialMessages);

        expect(result.messages).toHaveLength(2);
        expect(result.messages[0]).toEqual(initialMessages[0]);
        expect(result.messages[1]).toMatchObject({
            type: 'message',
            content: 'Hi there!',
        });
    });
});