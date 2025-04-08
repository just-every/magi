/**
 * OpenAI model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for OpenAI's models and handles streaming responses.
 */

import {ModelProvider, ToolFunction, ModelSettings, StreamingEvent, ToolCall, ResponseInput} from '../types.js';
import OpenAI from 'openai';
// import {v4 as uuidv4} from 'uuid';
import { costTracker } from '../utils/cost_tracker.js';
import { log_llm_request } from '../utils/file_utils.js';
import {Agent} from '../utils/agent.js';

// Convert our tool definition to OpenAI's format
function convertToOpenAITools(requestParams: any): any {
	requestParams.tools = requestParams.tools.map((tool: ToolFunction) => {
			if (tool.definition.function.name === 'web_search') {
				requestParams.model = 'gpt-4o'; // Force model for web_search
				return {
					type: 'web_search_preview',
					search_context_size: 'high',
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
	 * Create a streaming completion using OpenAI's API
	 */
	async* createResponseStream(
		model: string,
		messages: ResponseInput,
		agent?: Agent,
	): AsyncGenerator<StreamingEvent> {
		const tools: ToolFunction[] | undefined = agent?.tools;
		const settings: ModelSettings | undefined = agent?.modelSettings;

		try {

			// Ensure input is in the correct format for the responses API
			// Our structure almost extactly matches the OpenAI format, except for some small changes
			const input = messages.map(message => {
				if (message.type === 'thinking') {
					// Openai does not support thinking messages
					// Convert to normal message
					return {
						type: 'message',
						role: 'assistant',
						content: message.content,
						status: message.status || 'completed',
					};
				}
				if (message.type === 'function_call_output') {
					// Create a new object excluding the 'name' property using destructuring and rest syntax
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
					const { name, ...messageWithoutName } = message;
					return messageWithoutName; // Return the object without the 'name' field
				}
				return message;
			});

			// Format the request according to the Responses API specification
			let requestParams: any = {
				model,
				stream: true,
				input,
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

			// Log the request for debugging
			log_llm_request('openai', model, requestParams);

			const stream = await this.client.responses.create(requestParams);

			// Track delta positions for each message_id
			const messagePositions = new Map<string, number>();

			const toolCallStates = new Map<string, ToolCall>();

			try {
				// @ts-expect-error - OpenAI's stream might be AsyncIterable but TypeScript definitions might need adjustment
				for await (const event of stream) {

					// --- Response Lifecycle Events ---
					if (event.type === 'response.in_progress') {
						// Optional: Log or update UI to indicate the response is starting/in progress
						// console.log(`Response ${event.response.id} is in progress...`);
					}
					else if (event.type === 'response.completed' && event.response?.usage) {
						// Final usage information
						costTracker.addUsage({
							model, // Ensure 'model' variable is accessible here
							input_tokens: event.response.usage.input_tokens || 0,
							output_tokens: event.response.usage.output_tokens || 0,
							// cached_tokens: event.response.usage.input_tokens_details?.cached_tokens || 0, // Not in provided doc example, use cautiously
							metadata: { reasoning_tokens: event.response.usage.output_tokens_details?.reasoning_tokens || 0 },
						});
						// console.log(`Response ${event.response.id} completed.`);
					}
					else if (event.type === 'response.failed' && event.response?.error) {
						// Response failed entirely
						const errorInfo = event.response.error;
						console.error(`Response ${event.response.id} failed: [${errorInfo.code}] ${errorInfo.message}`);
						yield {
							type: 'error',
							error: `OpenAI response  failed: [${errorInfo.code}] ${errorInfo.message}`
						};
					}
					else if (event.type === 'response.incomplete' && event.response?.incomplete_details) {
						// Response finished but is incomplete (e.g., max_tokens hit)
						const reason = event.response.incomplete_details.reason;
						console.warn(`Response ${event.response.id} incomplete: ${reason}`);
						yield {
							type: 'error', // Or a more general 'response_incomplete'
							error: 'OpenAI response incomplete: '+reason,
						};
					}

					// --- Output Item Lifecycle Events ---
					else if (event.type === 'response.output_item.added' && event.item) {
						// A new item (message, function call, etc.) started
						// console.log(`Output item added: index ${event.output_index}, id ${event.item.id}, type ${event.item.type}`);
						if (event.item.type === 'function_call') {
							// Initialize state for a new function call
							if (!toolCallStates.has(event.item.id)) {
								toolCallStates.set(event.item.id, {
									id: event.item.id, // Use the ID from the event item
									type: 'function',
									function: {
										name: event.item.name || '', // Ensure 'name' exists on function_call item, provide fallback
										arguments: ''
									}
								});
							} else {
								console.warn(`Received output_item.added for already tracked function call ID: ${event.item.id}`);
							}
						}
					}
					else if (event.type === 'response.output_item.done' && event.item) {
						// An output item finished
						// console.log(`Output item done: index ${event.output_index}, id ${event.item.id}, type ${event.item.type}`);
						// If it's a function call, we rely on 'function_call_arguments.done' to yield.
						// This event could be used for cleanup if needed, but ensure no double-yielding.
						// We already clean up state in 'function_call_arguments.done'.
					}

					// --- Content Part Lifecycle Events ---
					else if (event.type === 'response.content_part.added' && event.part) {
						// A new part within a message content array started (e.g., text block, image)
						// console.log(`Content part added: item_id ${event.item_id}, index ${event.content_index}, type ${event.part.type}`);
						// Don't yield message_complete here, wait for deltas/done event.
					}
					else if (event.type === 'response.content_part.done' && event.part) {
						// A content part finished
						// console.log(`Content part done: item_id ${event.item_id}, index ${event.content_index}, type ${event.part.type}`);
						// If type is output_text, final text is usually in 'response.output_text.done'.
					}

					// --- Text Output Events ---
					else if (event.type === 'response.output_text.delta' && event.delta) {
						// Streamed text chunk
						const itemId = event.item_id; // Use item_id from the event
						if (!messagePositions.has(itemId)) {
							messagePositions.set(itemId, 0);
						}
						const position = messagePositions.get(itemId)!;
						yield {
							type: 'message_delta',
							content: event.delta,
							message_id: itemId, // Use item_id
							order: position
						};
						messagePositions.set(itemId, position + 1);
					}
					else if (event.type === 'response.output_text.annotation.added' && event.annotation) {
						// An annotation (e.g., file citation) was added to the text
						console.log('Annotation added:', event.annotation);
						// You might want to yield a specific annotation event or store them
						/*yield {
							type: 'annotation_added',
							item_id: event.item_id,
							content_index: event.content_index,
							annotation_index: event.annotation_index,
							annotation: event.annotation
						};*/
					}
					else if (event.type === 'response.output_text.done' && event.text !== undefined) { // Check text exists
						// Text block finalized
						const itemId = event.item_id; // Use item_id from the event
						yield {
							type: 'message_complete',
							content: event.text,
							message_id: itemId, // Use item_id
						};
						// Optional: Clean up position tracking for this message item
						messagePositions.delete(itemId);
						// console.log(`Text output done for item ${itemId}.`);
					}

					// --- Refusal Events ---
					else if (event.type === 'response.refusal.delta' && event.delta) {
						// Streamed refusal text chunk
						console.log(`Refusal delta for item ${event.item_id}: ${event.delta}`);
						// Decide how to handle/yield refusal text (e.g., separate event type)
						//yield { type: 'refusal_delta', message_id: event.item_id, content: event.delta };
					}
					else if (event.type === 'response.refusal.done' && event.refusal) {
						// Refusal text finalized
						console.log(`Refusal done for item ${event.item_id}: ${event.refusal}`);
						yield { type: 'error', error: 'OpenAI refusal error: '+event.refusal };
					}

					// --- Function Call Events (Based on Docs) ---
					else if (event.type === 'response.function_call_arguments.delta' && event.delta) {
						// Streamed arguments for a function call
						const currentCall = toolCallStates.get(event.item_id);
						if (currentCall) {
							currentCall.function.arguments += event.delta;
						} else {
							// This might happen if output_item.added wasn't received/processed first
							console.warn(`Received function_call_arguments.delta for unknown item_id: ${event.item_id}`);
							// Optional: Could attempt to create the state here if needed, but less ideal
						}
					}
					else if (event.type === 'response.function_call_arguments.done' && event.arguments !== undefined) { // Check arguments exist
						// Function call arguments finalized
						const currentCall = toolCallStates.get(event.item_id);
						if (currentCall) {
							currentCall.function.arguments = event.arguments; // Assign final arguments
							yield {
								type: 'tool_start',
								tool_calls: [currentCall as ToolCall] // Yield the completed call
							};
							toolCallStates.delete(event.item_id); // Clean up state for this completed call
							// console.log(`Function call arguments done for item ${event.item_id}. Yielded tool_start.`);
						} else {
							console.warn(`Received function_call_arguments.done for unknown or already yielded item_id: ${event.item_id}`);
						}
					}

					// --- File Search Events ---
					else if (event.type === 'response.file_search_call.in_progress') {
						console.log(`File search in progress for item ${event.item_id}...`);
						//yield { type: 'file_search_started', item_id: event.item_id };
					}
					else if (event.type === 'response.file_search_call.searching') {
						console.log(`File search searching for item ${event.item_id}...`);
						//yield { type: 'file_search_pending', item_id: event.item_id };
					}
					else if (event.type === 'response.file_search_call.completed') {
						console.log(`File search completed for item ${event.item_id}.`);
						//yield { type: 'file_search_completed', item_id: event.item_id };
						// Note: Results are typically delivered via annotations in the text output.
					}

					// --- Web Search Events ---
					else if (event.type === 'response.web_search_call.in_progress') {
						console.log(`Web search in progress for item ${event.item_id}...`);
						//yield { type: 'web_search_started', item_id: event.item_id };
					}
					else if (event.type === 'response.web_search_call.searching') {
						console.log(`Web search searching for item ${event.item_id}...`);
						//yield { type: 'web_search_pending', item_id: event.item_id };
					}
					else if (event.type === 'response.web_search_call.completed') {
						console.log(`Web search completed for item ${event.item_id}.`);
						//yield { type: 'web_search_completed', item_id: event.item_id };
						// Note: Results might be used internally by the model or delivered via annotations/text.
					}

					// --- API Stream Error Event ---
					else if (event.type === 'error' && event.message) {
						// An error reported by the API within the stream
						console.error(`API Stream Error: [${event.code || 'N/A'}] ${event.message}`);
						yield {
							type: 'error',
							error: `OpenAI API error: [${event.code || 'N/A'}] ${event.message}`
						};
					}

					// --- Catch unexpected event types (shouldn't happen if user confirmation is correct) ---
					// else {
					//    console.warn('Received unexpected event type:', event.type, event);
					// }
				}
			} catch (streamError) {
				// Catch errors during stream iteration/processing
				console.error('Error processing response stream:', streamError);
				yield {
					type: 'error',
					error: 'OpenAI stream processing error: '+String(streamError) // Or more detailed error info
				};
			} finally {
				// Clean up: Check if any tool calls were started but not completed
				if (toolCallStates.size > 0) {
					console.warn(`Stream ended with ${toolCallStates.size} incomplete tool call(s).`);
					for (const [, toolCall] of toolCallStates.entries()) {
						// Optionally yield incomplete tool calls if appropriate for your application
						if (toolCall.function.name) { // Check if it was minimally valid
							yield {
								type: 'tool_start', // Or maybe 'tool_incomplete'?
								tool_calls: [toolCall as ToolCall],
							};
						}
					}
					toolCallStates.clear(); // Clear the map
				}
				messagePositions.clear(); // Clear positions map
				// console.log("Stream processing finished.");
			}

		} catch (error) {
			console.error('Error in OpenAI streaming response:', error);
			yield {
				type: 'error',
				error: 'OpenAI streaming error: '+(error instanceof Error ? error.stack : String(error))
			};
		}
	}
}

// Export an instance of the provider
export const openaiProvider = new OpenAIProvider();
