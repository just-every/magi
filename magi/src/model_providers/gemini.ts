/**
 * Gemini model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for Google's Gemini models and handles streaming responses.
 */

import 'dotenv/config';
import {GoogleGenerativeAI, HarmCategory, HarmBlockThreshold} from '@google/generative-ai';
import {v4 as uuidv4} from 'uuid';
import {
	ModelProvider,
	ToolFunction,
	ModelSettings,
	StreamingEvent,
	ToolCall,
	ResponseInput
} from '../types.js';

// Define a type that includes functionCall property since it's missing in the current TypeScript definitions
interface FunctionCall {
	name: string;
	args: any;
}

// Convert our tool definition to Gemini's format
function convertToGeminiTools(tools: ToolFunction[]): any[] {
	return tools.map(tool => {
		// Deep copy of parameters to avoid modifying the original
		const parameters = JSON.parse(JSON.stringify(tool.definition.function.parameters));

		// Convert type values to uppercase for Gemini
		if (parameters.type) {
			parameters.type = parameters.type.toUpperCase();
		}

		// Also convert property types to uppercase
		if (parameters.properties) {
			for (const property in parameters.properties) {
				if (parameters.properties[property].type) {
					parameters.properties[property].type = parameters.properties[property].type.toUpperCase();
				}
			}
		}

		return {
			functionDeclarations: [{
				name: tool.definition.function.name,
				description: tool.definition.function.description,
				parameters: parameters
			}]
		};
	});
}

/**
 * Gemini model provider implementation
 */
export class GeminiProvider implements ModelProvider {
	private client: GoogleGenerativeAI;

	constructor(apiKey?: string) {
		this.client = new GoogleGenerativeAI(
			apiKey || process.env.GOOGLE_API_KEY || ''
		);

		if (!process.env.GOOGLE_API_KEY) {
			throw new Error('Failed to initialize Gemini client. Make sure GOOGLE_API_KEY is set.');
		}
	}

	/**
	 * Create a streaming completion using Gemini's API
	 */
	async* createResponseStream(
		model: string,
		messages: ResponseInput,
		tools?: ToolFunction[],
		settings?: ModelSettings
	): AsyncGenerator<StreamingEvent> {
		try {
			// Create a generative model instance
			const genModel = this.client.getGenerativeModel({model: model});

			// Configure generation parameters
			const generationConfig = {
				temperature: settings?.temperature || 0.7,
				maxOutputTokens: settings?.max_tokens,
				topK: 40,
				topP: settings?.top_p || 0.95,
			};

			// Configure safety settings (set to allow most content)
			const safetySettings = [
				{
					category: HarmCategory.HARM_CATEGORY_HARASSMENT,
					threshold: HarmBlockThreshold.BLOCK_NONE,
				},
				{
					category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
					threshold: HarmBlockThreshold.BLOCK_NONE,
				},
				{
					category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
					threshold: HarmBlockThreshold.BLOCK_NONE,
				},
				{
					category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
					threshold: HarmBlockThreshold.BLOCK_NONE,
				},
			];

			// Convert message format to Gemini content format
			const geminiMessages = convertMessagesToGeminiFormat(messages);

			// Configure tool settings if tools are provided
			let geminiTools = undefined;
			if (tools && tools.length > 0) {
				geminiTools = convertToGeminiTools(tools);
			}

			// Create request configuration
			const requestOptions: any = {
				generationConfig,
				safetySettings,
			};

			// Add tools if provided
			if (geminiTools) {
				requestOptions.tools = geminiTools;
			}

			// Start a streaming chat session
			const chat = genModel.startChat();

			// Send the message and get stream
			const streamingResult = await chat.sendMessageStream(geminiMessages);

			// Track current tool call
			let currentToolCall: any = null;
			let contentBuffer = ''; // Buffer to collect text content
			let sentComplete = false; // To track if we've sent a message_complete
			// Generate a unique message ID for this response
			const messageId = uuidv4();
			// Track delta positions
			let deltaPosition = 0;

			try {
				for await (const chunk of streamingResult.stream) {
					// Check for tool calls (function calls in Gemini terminology)
					if (chunk.candidates?.[0]?.content?.parts) {
						for (const part of chunk.candidates[0].content.parts) {
							// Handle function calls - treat as any type since TS doesn't know about functionCall
							const partAny = part as any;
							if (partAny.functionCall) {
								const functionCall = partAny.functionCall as FunctionCall;

								// Create a tool call in our format
								currentToolCall = {
									id: `call_${Date.now()}`,
									type: 'function',
									function: {
										name: functionCall.name,
										arguments: typeof functionCall.args === 'string'
											? functionCall.args
											: JSON.stringify(functionCall.args)
									}
								};

								// Emit the tool call immediately
								yield {
									type: 'tool_start',
									tool_calls: [currentToolCall as ToolCall]
								};

								currentToolCall = null;
							}
							// Handle text content
							else if (part.text) {
								// Emit delta event for streaming UI updates
								// Include incrementing order parameter for organizing deltas
								yield {
									type: 'message_delta',
									content: part.text,
									message_id: messageId,
									order: deltaPosition++
								};

								// Accumulate content for final message
								contentBuffer += part.text;
							}
						}
					}
				}

				// Always emit a message_complete at the end with the accumulated content
				if (contentBuffer && !sentComplete) {
					yield {
						type: 'message_complete',
						content: contentBuffer,
						message_id: messageId
					};
					sentComplete = true;
				}

			} catch (streamError) {
				console.error('Error processing Gemini stream:', streamError);
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
			console.error('Error in Gemini streaming completion:', error);
			yield {
				type: 'error',
				error: String(error)
			};
		}
	}
}

/**
 * Convert OpenAI-style messages to Gemini format
 */
function convertMessagesToGeminiFormat(messages: ResponseInput): string {
	// Gemini doesn't have a direct equivalent to OpenAI's message structure
	// Instead, we'll combine the messages into a single text string
	let systemMessage = '';
	let conversation = '';

	for (const message of messages) {
		let role = 'system';
		if ('role' in message) {
			role = message.role;
		}
		let content = '';
		if ('content' in message) {
			if (typeof message.content === 'string') {
				content = message.content;
			} else if ('text' in message.content && typeof message.content.text === 'string') {
				content = message.content.text;
			}
		}

		if (role === 'system') {
			systemMessage = content;
		} else if (role === 'user') {
			conversation += `User: ${content}\n\n`;
		} else if (role === 'assistant') {
			conversation += `Assistant: ${content}\n\n`;
		}
	}

	// Prepend system message if available
	if (systemMessage) {
		return `${systemMessage}\n\n${conversation}`;
	}

	return conversation;
}

// Export an instance of the provider
export const geminiProvider = new GeminiProvider();
