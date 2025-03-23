/**
 * Grok model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for X.AI's Grok models and handles streaming responses.
 *
 * NOTE: Grok doesn't currently have an official TypeScript SDK, so we're
 * using the fetch API to interact with their API directly.
 */

import 'dotenv/config';
import {v4 as uuidv4} from 'uuid';
import {
	ModelProvider,
	ToolFunction,
	ModelSettings,
	StreamingEvent,
	ToolCall,
	ResponseInput
} from '../types.js';

/**
 * Grok model provider implementation
 */
export class GrokProvider implements ModelProvider {
	private apiKey: string;

	constructor(apiKey?: string) {
		this.apiKey = apiKey || process.env.XAI_API_KEY || '';

		if (!this.apiKey) {
			throw new Error('Failed to initialize Grok client. Make sure XAI_API_KEY is set.');
		}
	}

	/**
	 * Create a streaming completion using Grok's API
	 */
	async* createResponseStream(
		model: string,
		messages: ResponseInput,
		tools?: ToolFunction[],
		settings?: ModelSettings
	): AsyncGenerator<StreamingEvent> {
		try {
			// Format the messages for Grok API (follows OpenAI format)
			const grokMessages = messages.map(msg => {
				// Check if this message has a role property
				let role = 'system';
				if ('role' in msg) {
					role = msg.role;
				}

				let content = '';
				if ('content' in msg) {
					if (typeof msg.content === 'string') {
						content = msg.content;
					} else if ('text' in msg.content && typeof msg.content.text === 'string') {
						content = msg.content.text;
					}
				}
				// Check if this message has a role property
				let name = {};
				if ('name' in msg) {
					name = {name: msg.name};
				}

				return {
					role,
					content,
					name,
				};
			});

			// Build the request body
			const requestBody: any = {
				model: model,
				messages: grokMessages,
				stream: true,
				...(settings?.temperature ? {temperature: settings.temperature} : {}),
				...(settings?.max_tokens ? {max_tokens: settings.max_tokens} : {}),
				...(settings?.top_p ? {top_p: settings.top_p} : {})
			};

			// Add tools if provided (Grok follows OpenAI format for tools)
			if (tools && tools.length > 0) {
				requestBody.tools = tools.map(tool => (tool.definition));
			}

			// Prepare the request options
			const requestOptions = {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.apiKey}`
				},
				body: JSON.stringify(requestBody)
			};

			// Make the API request
			const response = await fetch('https://api.x.ai/v1/chat/completions', requestOptions);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Grok API error (${response.status}): ${errorText}`);
			}

			if (!response.body) {
				throw new Error('No response body returned from Grok API');
			}

			// Set up stream reader
			const reader = response.body.getReader();
			const decoder = new TextDecoder('utf-8');

			// Variables to track incomplete chunks and tool calls
			let incompleteChunk = '';
			let currentToolCall: any = null;
			let contentBuffer = ''; // Buffer for accumulating content
			let sentComplete = false; // Track if we've sent a message_complete
			// Generate a unique message ID for this response
			const messageId = uuidv4();
			// Track position of delta chunks
			let deltaPosition = 0;

			try {
				while (true) {
					const {done, value} = await reader.read();
					if (done) break;

					// Decode the chunk and combine with any incomplete chunk from previous iteration
					const chunk = incompleteChunk + decoder.decode(value, {stream: true});
					incompleteChunk = '';

					// Split the chunk by newlines to get individual events
					const lines = chunk.split('\n');

					// If the last line is not complete, save it for the next iteration
					if (!chunk.endsWith('\n') && lines.length > 0) {
						incompleteChunk = lines.pop() || '';
					}

					// Process each line
					for (const line of lines) {
						// Skip empty lines
						if (!line.trim()) continue;

						// SSE format starts with "data: "
						if (!line.startsWith('data: ')) continue;

						// Extract the JSON payload after "data: "
						const jsonStr = line.slice(6);

						// Skip "[DONE]" marker
						if (jsonStr === '[DONE]') {
							// When we get [DONE], always send a message_complete if we have content
							if (contentBuffer && !sentComplete) {
								yield {
									type: 'message_complete',
									content: contentBuffer,
									message_id: messageId
								};
								sentComplete = true;
							}
							continue;
						}

						try {
							const eventData = JSON.parse(jsonStr);

							// Handle choices
							if (eventData.choices && eventData.choices.length > 0) {
								const choice = eventData.choices[0];

								// Handle delta content - streaming text
								if (choice.delta && choice.delta.content) {
									// Emit delta for streaming UI
									// Use a delta order counter that increments for each chunk
									yield {
										type: 'message_delta',
										content: choice.delta.content,
										message_id: messageId,
										order: deltaPosition++
									};

									// Accumulate content for message_done
									contentBuffer += choice.delta.content;
								}

								// Handle completed content (final message)
								if (choice.message && choice.message.content) {
									// In non-streaming mode, also emit message_delta
									if (!choice.delta) {
										// For non-streaming mode, this is the complete message
										// but still provide sequential order for consistency
										yield {
											type: 'message_delta',
											content: choice.message.content,
											message_id: messageId,
											order: 0
										};
									}

									// Always emit a message_done
									yield {
										type: 'message_complete',
										content: choice.message.content,
										message_id: messageId
									};
									sentComplete = true;
									contentBuffer = choice.message.content; // Store complete content
								}

								// Handle tool calls
								if ((choice.delta && choice.delta.tool_calls) ||
									(choice.message && choice.message.tool_calls)) {
									const toolCalls = choice.delta?.tool_calls || choice.message?.tool_calls;

									if (toolCalls && toolCalls.length > 0) {
										// For streaming updates to a tool call
										if (choice.delta?.tool_calls) {
											// Initiate a new tool call
											const toolCall = toolCalls[0];

											if (!currentToolCall && toolCall.index === 0) {
												currentToolCall = {
													id: toolCall.id || `call_${Date.now()}`,
													type: 'function',
													function: {
														name: toolCall.function?.name || '',
														arguments: toolCall.function?.arguments || ''
													}
												};
											}
											// Update existing tool call
											else if (currentToolCall) {
												if (toolCall.function?.name) {
													currentToolCall.function.name = toolCall.function.name;
												}
												if (toolCall.function?.arguments) {
													currentToolCall.function.arguments += toolCall.function.arguments;
												}
											}

											// Emit tool_start event for streaming UI updates
											if (currentToolCall) {
												yield {
													type: 'tool_start',
													tool_calls: [currentToolCall as ToolCall]
												};
											}
										}
										// For complete tool calls
										else if (choice.message?.tool_calls) {
											const toolCall = toolCalls[0];
											yield {
												type: 'tool_start',
												tool_calls: [{
													id: toolCall.id || `call_${Date.now()}`,
													type: 'function',
													function: {
														name: toolCall.function?.name || '',
														arguments: toolCall.function?.arguments || ''
													}
												} as ToolCall]
											};
											currentToolCall = null;
										}
									}
								}

								// If we've finished a choice and have a partial tool call, emit it
								if (choice.finish_reason === 'tool_calls' && currentToolCall) {
									yield {
										type: 'tool_start',
										tool_calls: [currentToolCall as ToolCall]
									};
									currentToolCall = null;
								}

								// If the choice is finished, emit a message_done if needed
								if (choice.finish_reason && contentBuffer && !sentComplete) {
									yield {
										type: 'message_complete',
										content: contentBuffer,
										message_id: messageId
									};
									sentComplete = true;
								}
							}
						} catch (parseError) {
							console.error('Error parsing Grok API response chunk:', parseError);
						}
					}
				}

				// If we have an incomplete tool call at the end, emit it
				if (currentToolCall) {
					yield {
						type: 'tool_start',
						tool_calls: [currentToolCall as ToolCall]
					};
				}

				// Ensure a message_complete is sent if we have accumulated content
				if (contentBuffer && !sentComplete) {
					yield {
						type: 'message_complete',
						content: contentBuffer,
						message_id: messageId
					};
				}

			} catch (streamError) {
				console.error('Error processing Grok stream:', streamError);
				yield {
					type: 'error',
					error: String(streamError)
				};

				// If we have accumulated content but no message_complete was sent due to an error,
				// still try to send it
				if (contentBuffer && !sentComplete) {
					yield {
						type: 'message_complete',
						content: contentBuffer,
						message_id: messageId
					};
				}
			}

		} catch (error) {
			console.error('Error in Grok streaming completion:', error);
			yield {
				type: 'error',
				error: String(error)
			};

			// If there's a fatal error without any content generated, send an empty message_complete
			// to ensure the UI doesn't get stuck waiting
			yield {
				type: 'message_complete',
				content: 'Error occurred while generating response. Please try again.',
				message_id: uuidv4() // Generate a new messageId since this is a fallback message
			};
		}
	}
}

// Export an instance of the provider
export const grokProvider = new GrokProvider();
