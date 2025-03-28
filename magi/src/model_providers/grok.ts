/**
 * Grok model provider for the MAGI system.
 *
 * We extend OpenAIChat as Grok is a drop in replacement
 */

import {OpenAIChat} from './openai_chat.js';

/**
 * Grok model provider implementation
 */
export class GrokProvider extends OpenAIChat {
	constructor() {
		super('xai', process.env.XAI_API_KEY, 'https://api.x.ai/v1');
	}
}

// Export an instance of the provider
export const grokProvider = new GrokProvider();
