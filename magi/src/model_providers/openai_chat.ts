/**
 * Older OpenAI model provider used for compatability with other providers which require this format
 *
 * This module provides an implementation of the ModelProvider interface
 * for OpenAI's models (compatible with chat.completions API)
 * and handles streaming responses.
 */

import {
	ModelProvider,
	ToolFunction,
	ModelSettings,
	StreamingEvent,
	ToolCall,
	ResponseInput,
} from '../types.js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { costTracker } from '../utils/cost_tracker.js';
import { log_llm_request } from '../utils/file_utils.js';
import {Agent} from '../utils/agent.js';
import {ModelProviderID} from './model_data.js';

// Convert our tool definition to OpenAI's chat.completions format
// NOTE: Removed specific handling for 'web_search_preview' and 'computer_use_preview'
// as they are part of the newer 'responses' API.
// Also removed 'strict: true' as it's not standard in chat.completions tools.
function convertToOpenAITools(tools: ToolFunction[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
	return tools.map((tool: ToolFunction) => {
		// --- REMOVED SPECIAL HANDLING FOR web_search / computer_use ---
		// If you need similar functionality with chat.completions,
		// you'll need to define standard function tools and implement
		// the corresponding logic on your end.

		return {
			type: 'function',
			function: {
				name: tool.definition.function.name,
				description: tool.definition.function.description,
				parameters: {
					...tool.definition.function.parameters,
					// Note: Forcing all parameters to be required might not always be
					// suitable depending on the model or provider. Adjust if needed.
					// required: Object.keys(tool.definition.function.parameters.properties),
				},
			},
		};
	});
}

/**
 * OpenAI model provider implementation using chat.completions.create
 */
export class OpenAIChat implements ModelProvider {
	private client: OpenAI;
	private provider: ModelProviderID; // Store baseURL if needed for other providers
	private baseURL: string | undefined; // Store baseURL if needed for other providers

	constructor(provider?: ModelProviderID, apiKey?: string, baseURL?: string) {
		this.provider = provider || 'openai'; // Store baseURL
		this.baseURL = baseURL; // Store baseURL
		this.client = new OpenAI({
			apiKey: apiKey || process.env.OPENAI_API_KEY,
			baseURL: this.baseURL, // Use stored baseURL
		});

		if (!this.client.apiKey) {
			throw new Error('Failed to initialize OpenAI client. API key is missing. Make sure OPENAI_API_KEY is set or passed.');
		}
	}

	prepareParameters(requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
		return requestParams;
	}

	/**
	 * Create a streaming completion using OpenAI's chat.completions.create API
	 */
	async* createResponseStream(
		model: string,
		messages: ResponseInput,
		agent?: Agent,
	): AsyncGenerator<StreamingEvent> {
		const tools: ToolFunction[] | undefined = agent?.tools;
		const settings: ModelSettings | undefined = agent?.modelSettings;

		try {

			// Convert input messages to the format expected by chat.completions.create
			const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map(message => {
				if (message.type === 'function_call_output') {
					// Convert to 'tool' role for chat.completions
					return {
						role: 'tool',
						tool_call_id: message.call_id,
						content: message.output || '',
						// 'name' is not used for role: tool
					};
				}
				else if (message.type === 'function_call') {
					// Convert to 'tool' role for chat.completions
					return {
						role: 'assistant',
						tool_calls: [{
							id: message.call_id,
							type: 'function',
							function: {
								name: message.name || '',
								arguments: message.arguments || '',
							},
						}]
						// 'name' is not used for role: tool
					};
				}

				let content: string = '';
				if ('content' in message) {
					if (typeof message.content === 'string') {
						content = message.content;
					} else if ('text' in message.content && typeof message.content.text === 'string') {
						content = message.content.text;
					}
				}

				let role = message.role || 'user';
				if(role === 'developer') {
					role = 'system';
				}
				return {
					role,
					content,
				};
			});

			// Build request parameters for chat.completions.create
			let requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model,
				messages: chatMessages,
				stream: true,
			};

			// Add model-specific parameters (check compatibility with chat.completions)
			if (settings?.temperature !== undefined) {
				requestParams.temperature = settings.temperature;
			}
			if (settings?.top_p !== undefined) {
				requestParams.top_p = settings.top_p;
			}

			// Add other settings
			if (settings?.tool_choice) {
				// Ensure the format matches chat.completions (e.g., 'auto', 'required', { type: 'function', function: { name: 'my_func' } })
				requestParams.tool_choice = settings.tool_choice as OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
			}
			if (settings?.max_tokens) { // Add max_tokens if needed
				requestParams.max_tokens = settings.max_tokens;
			}

			// Add tools if provided
			if (tools && tools.length > 0) {
				requestParams.tools = convertToOpenAITools(tools);
			}

			// Allow providers to rewrite params before sending
			requestParams = this.prepareParameters(requestParams);

			// Log the request for debugging
			log_llm_request(this.provider, model, requestParams); // Log baseURL too

			const stream = await this.client.chat.completions.create(requestParams);

			// --- Stream Processing Logic for chat.completions.create ---

			let aggregatedContent = '';
			const messageId = uuidv4(); // Single ID for the assistant's response message
			let messageIndex = 0;
			// Use a map keyed by the tool call *index* from the delta
			const partialToolCallsByIndex = new Map<number, ToolCall>();
			let finishReason: string | null = null;
			let usage: OpenAI.CompletionUsage | undefined = undefined; // To store usage if available

			try {
				for await (const chunk of stream) {
					const choice = chunk.choices[0];
					if (!choice) continue; // Skip if no choice in chunk

					const delta = choice.delta;
					if (!delta) continue; // Skip if no delta in choice

					// --- Handle Content Delta ---
					if (delta.content) {
						aggregatedContent += delta.content;
						yield {
							type: 'message_delta',
							content: delta.content,
							message_id: messageId,
							order: messageIndex++,
						};
					}

					// --- Handle Tool Call Delta ---
					if (delta.tool_calls) {
						for (const toolCallDelta of delta.tool_calls) {
							const index = toolCallDelta.index; // Key for aggregation

							// Ensure index is valid
							if (typeof index !== 'number') {
								console.warn('Tool call delta missing index:', toolCallDelta);
								continue;
							}

							let partialCall = partialToolCallsByIndex.get(index);

							// Initialize if first time seeing this index
							if (!partialCall) {
								partialCall = {
									id: toolCallDelta.id || '', // ID might come in the first delta chunk
									type: 'function', // Assuming only function tools for now
									function: {
										name: toolCallDelta.function?.name || '',
										arguments: toolCallDelta.function?.arguments || '',
									},
								};
								partialToolCallsByIndex.set(index, partialCall);
							} else {
								// Aggregate arguments and potentially update ID/name if they arrive later
								if (toolCallDelta.id) {
									partialCall.id = toolCallDelta.id; // Update ID if provided
								}
								if (toolCallDelta.function?.name) {
									partialCall.function.name = toolCallDelta.function.name;
								}
								if (toolCallDelta.function?.arguments) {
									partialCall.function.arguments += toolCallDelta.function.arguments;
								}
							}
						}
					}

					// --- Store Finish Reason ---
					// It usually comes in the *last* chunk for the choice
					if (choice.finish_reason) {
						finishReason = choice.finish_reason;
					}

					// --- Store Usage ---
					// Usage often appears in the *last* chunk of the entire stream in some implementations
					// Or sometimes it's not available until the stream is fully consumed.
					if (chunk.usage) {
						usage = chunk.usage;
						// console.log("Usage received in chunk:", usage);
					}

				} // End for await

				// --- Post-Stream Processing ---

				// Note: Reliable cost/usage tracking directly from the stream generator is difficult
				// with chat.completions.create. The 'usage' object might appear in the last
				// chunk, but it's not guaranteed across all SDK versions or providers.
				// Consider getting usage information after the stream has been fully consumed
				// if precise tracking is critical.
				if (usage) {
					costTracker.addUsage({
						model: model,
						input_tokens: usage.prompt_tokens || 0, // Map prompt_tokens to input_tokens
						output_tokens: usage.completion_tokens || 0, // Map completion_tokens to output_tokens
						cached_tokens: usage.prompt_tokens_details?.cached_tokens || 0, // Map cached_tokens to cached_tokens
						metadata: {
							total_tokens: usage.total_tokens || 0,
							reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0,
						}
					});
				} else {
					console.warn('Usage information not found in the stream chunks for cost tracking.');
				}


				// Handle final state based on finish_reason
				if (finishReason === 'stop') {
					yield {
						type: 'message_complete',
						content: aggregatedContent,
						message_id: messageId,
					};
				} else if (finishReason === 'tool_calls') {
					// Convert aggregated partial calls (map values) to the final ToolCall array
					const completedToolCalls: ToolCall[] = Array.from(partialToolCallsByIndex.values())
						.filter(call => call.id && call.function.name); // Remove temporary index

					if (completedToolCalls.length > 0) {
						yield {
							type: 'tool_start',
							tool_calls: completedToolCalls,
						};
					} else {
						console.warn("Finish reason was 'tool_calls', but no complete tool calls were aggregated.");
						yield { type: 'error', error: `Error (${this.provider}): Model indicated tool calls, but none were parsed correctly.` };
					}
				} else if (finishReason === 'length') {
					// Yield partial content first if desired
					// yield { type: 'message_complete', content: aggregatedContent, message_id: messageId };
					yield { type: 'error', error: `Error (${this.provider}): Response truncated due to length limit (max_tokens). Partial content: ${aggregatedContent.substring(0, 100)}...` };
				} else if (finishReason) {
					// Handle other potential finish reasons (e.g., 'content_filter')
					yield { type: 'error', error: `Error (${this.provider}): Response stopped due to: ${finishReason}` };
				} else if (aggregatedContent) {
					// If stream finished without a reason but we got content, yield it as complete.
					console.warn('Stream finished without a finish_reason, but content was received.');
					yield {
						type: 'message_complete',
						content: aggregatedContent,
						message_id: messageId,
					};
				} else if (partialToolCallsByIndex.size > 0) {
					// Handle case where stream ends unexpectedly during tool call generation
					console.warn('Stream finished without a finish_reason, but partial tool calls exist.');
					// Optionally yield incomplete tool calls or an error
					yield { type: 'error', error: `Error (${this.provider}): Stream ended unexpectedly during tool call generation.` };
				} else {
					// Stream finished without content, tools, or a clear reason
					console.warn('Stream finished without a finish_reason and no content or tool calls.');
					// Optionally yield an empty message or an error
					yield { type: 'error', error: `Error (${this.provider}): Stream finished unexpectedly with no output.` };
				}

			} catch (streamError) {
				// Catch errors during stream iteration/processing
				console.error('Error processing chat completions stream:', streamError);
				yield {
					type: 'error',
					error: `Stream processing error (${this.provider}): ${String(streamError)}`
				};
			} finally {
				// Cleanup maps if needed (though they should be local to the call)
				partialToolCallsByIndex.clear();
				// console.log("Chat completions stream processing finished.");
			}

		} catch (error) {
			console.error(`Error running ${this.provider} chat completions stream:`, error);
			yield {
				type: 'error',
				// Check if it's an OpenAI API error for better formatting
				error: `API Error (${this.provider}): `+((error instanceof OpenAI.APIError)
					? `${error.status} ${error.name} ${error.message}`
					: (error instanceof Error ? error.stack : String(error)))
			};
		}
	}
}

// Export an instance of the provider (consider if this should be instantiated differently)
// export const openaiProvider = new OpenAIProvider();
// You might want to instantiate it where needed, potentially passing baseURL:
// e.g., new OpenAIProvider(process.env.MY_API_KEY, 'https://api.x.ai/v1')
