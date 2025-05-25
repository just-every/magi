/**
 * OpenRouter model provider for the MAGI system.
 */

import { OpenAIChat } from './openai_chat.js';

/**
 * OpenRouter model provider implementation
 */
export class OpenRouterProvider extends OpenAIChat {
    constructor() {
        super(
            'openrouter',
            process.env.OPENROUTER_API_KEY,
            'https://openrouter.ai/api/v1',
            {
                'User-Agent': 'magi',
                'HTTP-Referer': 'https://withmagi.com/',
                'X-Title': 'magi',
            },
            {
                provider: {
                    require_parameters: true,
                    sort: 'throughput',
                    ignore: ['Novita'], // Fails frequently with Qwen tool calling
                },
            }
        );
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

/**
 * A singleton instance of OpenRouterProvider for use in import statements
 */
export const openRouterProvider = new OpenRouterProvider();
