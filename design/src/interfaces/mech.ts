/**
 * Bridge to @just-every/task and ensemble
 * Provides backward compatibility wrapper for the new streaming mind API
 */

import { mindTask as mechRunMECH } from '@just-every/task';
import { quick_llm_call } from '../utils/llm-utils.js';
import type { ProviderStreamEvent, ModelUsage, ResponseInput } from '@just-every/ensemble';
export { Agent } from '@just-every/ensemble';
export type { ProviderStreamEvent } from '@just-every/ensemble';
export { quick_llm_call };

// Define local result interface for backward compatibility
export interface MechResult {
    status: 'complete' | 'incomplete' | 'error';
    history: ResponseInput;
    response?: string;
    error?: string;
    usage?: ModelUsage;
}

/**
 * Backward compatibility wrapper for runMECH that processes the stream
 * and returns the expected result format
 */
/**
 * Export the streaming version of mindTask for direct use
 */
export { mindTask as runMECHStreaming } from '@just-every/task';

export async function runMECH(agent: any, content: string): Promise<MechResult> {
    try {
        // Process the new streaming API
        const stream = mechRunMECH(agent, content);

        let response = '';
        let error = '';
        let history: ResponseInput = [];
        let usage: ModelUsage | undefined;
        let status: 'complete' | 'incomplete' | 'error' = 'incomplete';

        // Process the stream of events
        for await (const event of stream) {
            // Accumulate data based on event type
            switch (event.type) {
                case 'message_complete':
                    if ('content' in event && event.content) {
                        response += event.content;
                    }
                    break;

                case 'stream_end':
                    status = 'complete';
                    break;

                case 'error':
                    status = 'error';
                    if ('error' in event && typeof event.error === 'string') {
                        error = event.error;
                    }
                    break;

                default:
                    // Handle other event types that may not be in the union
                    const anyEvent = event as any;

                    // The new API emits response_output events with ResponseInputItem objects
                    if (anyEvent.type === 'response_output' && anyEvent.output) {
                        history.push(anyEvent.output);
                    } else if (anyEvent.type === 'usage' && anyEvent.usage) {
                        usage = anyEvent.usage as ModelUsage;
                    }
                    break;
            }
        }

        // Extract the final response from history if we didn't get it from message_complete
        if (!response && history.length > 0) {
            const lastMessage = history[history.length - 1];
            if (lastMessage.type === 'message' && lastMessage.role === 'assistant' && 'content' in lastMessage) {
                const content = lastMessage.content;
                if (typeof content === 'string') {
                    response = content;
                } else if (Array.isArray(content)) {
                    // Handle array of content items
                    response = content
                        .map((item: any) => {
                            if ('text' in item) return item.text;
                            return '';
                        })
                        .join('');
                }
            }
        }

        return {
            status,
            history,
            response,
            error: error || undefined,
            usage,
        };
    } catch (err) {
        return {
            status: 'error',
            history: [],
            error: err instanceof Error ? err.message : String(err),
        };
    }
}