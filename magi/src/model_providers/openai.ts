/**
 * OpenAI model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for OpenAI's models and handles streaming responses.
 */

import 'dotenv/config';
import {ModelProvider, ToolFunction, ModelSettings, StreamingEvent, ToolCall, ResponseInput} from '../types.js';
import OpenAI from 'openai';
import {v4 as uuidv4} from 'uuid';

// Convert our tool definition to OpenAI's format
function convertToOpenAITools(requestParams: any): any {
	requestParams.tools = requestParams.tools.map((tool: ToolFunction) => {
			if (tool.definition.function.name === 'web_search') {
				requestParams.model = 'gpt-4o'; // Force model for web_search
				return {
					type: 'web_search_preview',
					search_context_size: 'medium',
				};
			} else if (tool.definition.function.name === 'computer_use') {
				requestParams.model = 'computer-use-preview'; // Force model for computer_use
				return {
					type: 'computer_use_preview',
					display_width: 1024,
					display_height: 768,
					environment: 'browser'
				};
			}

			return {
				type: 'function',
				name: tool.definition.function.name,
				description: tool.definition.function.description,
				parameters: {
					...tool.definition.function.parameters,
					additionalProperties: false,
					required: Object.keys(tool.definition.function.parameters.properties), // openai requires all properties to be required
				},
				strict: true,
			};
		}
	);
	return requestParams;
}

/**
 * OpenAI model provider implementation
 */
export class OpenAIProvider implements ModelProvider {
	private client: OpenAI;

	constructor(apiKey?: string) {
		this.client = new OpenAI({
			apiKey: apiKey || process.env.OPENAI_API_KEY,
		});

		if (!this.client) {
			throw new Error('Failed to initialize OpenAI client. Make sure OPENAI_API_KEY is set.');
		}
	}

	/**
	 * Create a streaming completion using the new OpenAI Responses API
	 *
	 * Uses the latest client.responses.create method which provides improved
	 * features and better server-side state management.
	 */
	async* createResponseStream(
		model: string,
		messages: ResponseInput,
		tools?: ToolFunction[],
		settings?: ModelSettings
	): AsyncGenerator<StreamingEvent> {
		try {
			// Format the request according to the Responses API specification
			let requestParams: any = {
				model: model,
				stream: true,
				// OpenAI Responses API expects the messages array as input
				input: messages,
			};

			// Add model-specific parameters
			// o3 models don't support temperature and top_p
			if (!model.startsWith('o3-')) {
				if (settings?.temperature !== undefined) {
					requestParams.temperature = settings.temperature;
				}

				if (settings?.top_p !== undefined) {
					requestParams.top_p = settings.top_p;
				}
			}

			// Add other settings that work across models
			if (settings?.tool_choice) {
				requestParams.tool_choice = settings.tool_choice;
			}

			// Add tools if provided
			if (tools && tools.length > 0) {
				// Convert our tools to OpenAI format
				requestParams.tools = tools;
				requestParams = convertToOpenAITools(requestParams);
			}

			const stream = await this.client.responses.create(requestParams);

			// Collect tool call data as it streams in
			let currentToolCall: any = null;
			// Generate a message ID for this streaming response
			const messageId = uuidv4();
			// Track delta positions for each message_id
			const messagePositions = new Map<string, number>();

			// Process the response stream
			try {
				// @ts-expect-error - OpenAI's stream is AsyncIterable but TypeScript doesn't recognize it properly
				for await (const event of stream) {
					// For verbose debugging - uncomment this
					// console.log(`Stream event type: ${event.type}`);
					// console.log('Stream event structure:', JSON.stringify(event, null, 2));

					// Handle web_search events from web_search_preview
					if (event.type === 'web_search.results') {
						// Log that we received web search results, but we don't emit them directly
						console.log('Received web_search.results from OpenAI',
							event.results ? `Count: ${event.results.length}` : 'No results');

						// We don't need to yield an event here, as the model will use these results internally
						// and generate appropriate content that will come through as text deltas
					}

					// Handle response.output_text.delta - new format for text chunks
					else if (event.type === 'response.output_text.delta') {
						const textDelta = event.delta;
						if (textDelta) {
							// Position will be tracked in messagePositions map
							// For each message_id, track the position separately
							if (!messagePositions.has(messageId)) {
								messagePositions.set(messageId, 0);
							}
							const position = messagePositions.get(messageId)!;

							// Add order for delta position tracking
							yield {
								type: 'message_delta',
								content: textDelta,
								message_id: messageId,
								order: position
							};

							// Increment the position for the next chunk with the same message_id
							messagePositions.set(messageId, position + 1);
						}
					}

					// Handle text.delta - newer format
					else if (event.type === 'text.delta' && event.delta && event.delta.value) {
						// For each message_id, track the position separately
						if (!messagePositions.has(messageId)) {
							messagePositions.set(messageId, 0);
						}
						const position = messagePositions.get(messageId)!;

						// Include order for message delta
						yield {
							type: 'message_delta',
							content: event.delta.value,
							message_id: messageId,
							order: position
						};

						// Increment the position for the next chunk
						messagePositions.set(messageId, position + 1);
					}

					// Handle response.content.delta - older format
					else if (event.type === 'response.content.delta') {
						// For each message_id, track the position separately
						if (!messagePositions.has(messageId)) {
							messagePositions.set(messageId, 0);
						}
						const position = messagePositions.get(messageId)!;

						yield {
							type: 'message_delta',
							content: event.delta,
							message_id: messageId,
							order: position
						};

						// Increment the position for the next chunk
						messagePositions.set(messageId, position + 1);
					}

					// Handle response.content_part.added - might contain text
					else if (event.type === 'response.content_part.added' &&
						event.part &&
						event.part.type === 'output_text' &&
						event.part.text) {
						if (event.part.text && event.part.text.length > 0) {
							yield {
								type: 'message_complete',
								content: event.part.text,
								message_id: messageId
							};
						}
					}

					// Handle output_text.done - complete text message
					else if (event.type === 'response.output_text.done' && event.text) {
						yield {
							type: 'message_complete',
							content: event.text,
							message_id: messageId
						};
					}

					// Handle function_call.started - new format
					else if (event.type === 'function_call.started' && event.function_call) {
						currentToolCall = {
							id: event.function_call.id || `call_${Date.now()}`,
							type: 'function',
							function: {
								name: event.function_call.name,
								arguments: ''
							}
						};
					}

					// Handle function call argument deltas - new format
					else if (event.type === 'function_call.argument.delta' &&
						currentToolCall &&
						event.delta &&
						event.delta.value) {
						currentToolCall.function.arguments += event.delta.value;
					}

					// Handle function call completion - new format
					else if (event.type === 'function_call.completed' &&
						currentToolCall &&
						event.function_call) {
						// Use complete arguments if provided
						if (event.function_call.arguments) {
							currentToolCall.function.arguments = event.function_call.arguments;
						}

						// Only emit if we have valid arguments
						if (currentToolCall.function.arguments) {
							yield {
								type: 'tool_start',
								tool_calls: [currentToolCall as ToolCall]
							};
						}

						// Reset for next function call
						currentToolCall = null;
					}

					// Handle response.output_item.added - old format for function calls
					else if (event.type === 'response.output_item.added' &&
						event.item &&
						event.item.type === 'function_call') {
						currentToolCall = {
							id: event.item.id || event.item.call_id || `call_${Date.now()}`,
							type: 'function',
							function: {
								name: event.item.name,
								arguments: ''
							}
						};
					}

					// Handle response.function_call_arguments.delta - old format
					else if (event.type === 'response.function_call_arguments.delta' &&
						currentToolCall) {
						currentToolCall.function.arguments += event.delta;
					}

					// Handle response.function_call_arguments.done - old format
					else if (event.type === 'response.function_call_arguments.done' &&
						currentToolCall) {
						// Use complete arguments if provided
						if (event.arguments) {
							currentToolCall.function.arguments = event.arguments;
						}

						// Emit the tool call
						yield {
							type: 'tool_start',
							tool_calls: [currentToolCall as ToolCall]
						};

						// Reset for next tool call
						currentToolCall = null;
					}

					// Handle response.output_item.done for function calls - old format
					else if (event.type === 'response.output_item.done' &&
						event.item &&
						event.item.type === 'function_call' &&
						currentToolCall) {
						// Use complete arguments if provided
						if (event.item.arguments) {
							currentToolCall.function.arguments = event.item.arguments;
						}

						// Emit the tool call
						yield {
							type: 'tool_start',
							tool_calls: [currentToolCall as ToolCall]
						};

						// Reset for next tool call
						currentToolCall = null;
					}
				}
			} catch (streamError) {
				console.error('Error processing response stream:', streamError);
				yield {
					type: 'error',
					error: String(streamError)
				};
			}

			// If we have a partial tool call that wasn't completed, emit it now
			if (currentToolCall &&
				currentToolCall.function &&
				currentToolCall.function.name) {
				yield {
					type: 'tool_start',
					tool_calls: [currentToolCall as ToolCall]
				};
			}

		} catch (error) {
			console.error('Error in OpenAI streaming response:', error);
			yield {
				type: 'error',
				error: String(error)
			};
		}
	}
}

// Export an instance of the provider
export const openaiProvider = new OpenAIProvider();
