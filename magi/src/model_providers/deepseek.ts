/**
 * DeepSeek model provider for the MAGI system.
 *
 * We extend OpenAIChat as DeepSeek is a drop in replacement
 */

import {OpenAIChat} from './openai_chat.js';
import OpenAI from 'openai';

/**
 * DeepSeek model provider implementation
 */
export class DeepSeekProvider extends OpenAIChat {
	constructor() {
		super('deepseek', process.env.DEEPSEEK_API_KEY, 'https://api.deepseek.com/v1');
	}

	prepareParameters(requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
		if (requestParams.model === 'deepseek-reasoner') {
			// Maximise thinking capacity
			requestParams.max_tokens = 8000; // default is 4000

			// Can not use tools of structured output with reasoner
			delete requestParams.tools;
			delete requestParams.response_format;

			// Remove other incompatable features
			delete requestParams.logprobs;
			delete requestParams.top_logprobs;

			// Merge messages with the same role as DeepSeek Reasoner doesn't allow them sequentially
			requestParams.messages = requestParams.messages.reduce((acc: OpenAI.Chat.Completions.ChatCompletionMessageParam[], message, index, original) => {
				// First message or different role from previous - add as new message
				if (index === 0 || message.role !== original[index - 1].role) {
					acc.push({...message});
				} else {
					// Same role as previous message - merge content
					const lastMessage = acc[acc.length - 1];

					if ('content' in lastMessage && 'content' in message) {
						if (typeof lastMessage.content === 'string' && typeof message.content === 'string') {
							// Concatenate string content with a separator
							lastMessage.content = `${lastMessage.content}\n\n${message.content}`;
						} else if (Array.isArray(lastMessage.content) && Array.isArray(message.content)) {
							// Concatenate array content using spread operator with type assertion
							lastMessage.content = [...lastMessage.content, ...message.content] as typeof lastMessage.content;
						}
					}
				}
				return acc;
			}, []);
		}

		return requestParams;
	}
}

// Export an instance of the provider
export const deepSeekProvider = new DeepSeekProvider();