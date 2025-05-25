/**
 * Grok model provider for the MAGI system.
 *
 * We extend OpenAIChat as Grok is a drop in replacement
 */

import { OpenAIChat } from './openai_chat.js';
import OpenAI from 'openai';

/**
 * Grok model provider implementation
 */
export class GrokProvider extends OpenAIChat {
    constructor() {
        super('xai', process.env.XAI_API_KEY, 'https://api.x.ai/v1');
    }

    prepareParameters(
        requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
    ): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
        if (Array.isArray(requestParams.tools)) {
            const index = requestParams.tools.findIndex(
                t =>
                    t.type === 'function' &&
                    (t as any).function?.name === 'grok_web_search'
            );
            if (index !== -1) {
                requestParams.tools.splice(index, 1);
                (requestParams as any).search_parameters = {
                    mode: 'on',
                    return_citations: true,
                };
            }
        }
        return super.prepareParameters(requestParams);
    }

    /**
     * Create a streaming completion using callback-based API
     */
    createResponse(
        model: string,
        messages: any,
        agent: any,
        onEvent: (event: any) => void,
        onError?: (error: unknown) => void
    ): { cancel: () => void } {
        let cancelled = false;
        
        // Run the generator and call callbacks
        (async () => {
            try {
                const stream = this.createResponseStream(model, messages, agent);
                for await (const event of stream) {
                    if (cancelled) break;
                    onEvent(event);
                }
                // Emit stream_end after successful completion
                if (!cancelled) {
                    onEvent({ type: 'stream_end', timestamp: new Date().toISOString() });
                }
            } catch (error) {
                if (!cancelled && onError) {
                    onError(error);
                }
            }
        })();
        
        return {
            cancel: () => {
                cancelled = true;
            }
        };
    }
}

// Export an instance of the provider
export const grokProvider = new GrokProvider();
