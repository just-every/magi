/**
 * DeepSeek model provider for the MAGI system.
 *
 * We extend OpenAIChat as DeepSeek is a drop in replacement
 */

import {OpenAIChat} from './openai_chat.js';

/**
 * DeepSeek model provider implementation
 */
export class DeepSeekProvider extends OpenAIChat {
	constructor() {
		super('deepseek', process.env.DEEPSEEK_API_KEY, 'https://api.deepseek.com/v1');
	}
}

// Export an instance of the provider
export const deepSeekProvider = new DeepSeekProvider();
