/**
 * LLM utilities for the design package
 */

import { ensembleRequest, ResponseInput, Agent } from '@just-every/ensemble';

/**
 * Quick LLM call utility for design package
 * Mimics the API from the task package
 */
export async function quick_llm_call(
    input: ResponseInput,
    agent: Agent,
): Promise<string> {

    let fullResponse = '';
    for await (const event of ensembleRequest(input, agent)) {
        if (event.type === 'message_complete') {
            // It's a MessageEvent
            const msgEvent = event as { content?: string };
            if (msgEvent.content) {
                fullResponse += msgEvent.content;
            }
        } else if (event.type === 'error') {
            // It's an ErrorEvent
            const errorEvent = event as { error?: string };
            fullResponse += `Error: ${errorEvent.error}`;
        }
    }
    return fullResponse;
}