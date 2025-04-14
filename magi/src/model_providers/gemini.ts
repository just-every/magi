/**
 * Gemini model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for Google's Gemini models and handles streaming responses using the
 * latest API structure from the @google/genai package.
 *
 * Updated for @google/genai 0.7.0+ to use the new API patterns for:
 * - Streaming response handling
 * - Function calling with the new function declaration format
 * - Content structure with proper modalities
 */

import {
	GoogleGenAI,
	FunctionDeclaration,
	Type,
	Content,
	FunctionCallingConfigMode, GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import {
	ModelProvider,
	ToolFunction,
	ModelSettings,
	StreamingEvent,
	ToolCall, // Internal representation
	ResponseInput,
} from '../types.js'; // Adjust path as needed
import { costTracker } from '../utils/cost_tracker.js'; // Adjust path as needed
import { log_llm_request } from '../utils/file_utils.js'; // Adjust path as needed
import { Agent } from '../utils/agent.js'; // Adjust path as needed

// Convert our tool definition to Gemini's updated FunctionDeclaration format
function convertToGeminiFunctionDeclarations(tools: ToolFunction[]): FunctionDeclaration[] {
	return tools.map(tool => {
		const properties: Record<string, any> = {};
		const toolParams = tool.definition?.function?.parameters?.properties;

		if (toolParams) {
			for (const [name, param] of Object.entries(toolParams)) {
				let type: Type = Type.STRING;

				switch (param.type) {
					case 'string': type = Type.STRING; break;
					case 'number': type = Type.NUMBER; break;
					case 'boolean': type = Type.BOOLEAN; break;
					case 'object': type = Type.OBJECT; break;
					case 'array': type = Type.ARRAY; break;
					case 'null':
						type = Type.STRING;
						console.warn(`Mapping 'null' type to STRING for parameter ${name} in tool ${tool.definition.function.name}`);
						break;
					default:
						console.warn(`Unsupported parameter type '${param.type}' for ${name} in tool ${tool.definition.function.name}. Defaulting to STRING.`);
						type = Type.STRING;
				}

				properties[name] = { type, description: param.description };

				if (type === Type.ARRAY) {
					const itemType = Type.STRING; // Assuming string items
					properties[name].items = { type: itemType };
					if (param.items?.enum) {
						properties[name].items.enum = param.items.enum;
					} else if (param.enum) {
						properties[name].items.enum = param.enum;
					}
				} else if (param.enum) {
					properties[name].format = 'enum';
					properties[name].enum = param.enum;
				}
			}
		} else {
			console.warn(`Tool ${tool.definition?.function?.name || 'Unnamed Tool'} has missing or invalid parameters definition.`);
		}

		return {
			name: tool.definition.function.name,
			description: tool.definition.function.description,
			parameters: {
				type: Type.OBJECT,
				properties,
				required: Array.isArray(tool.definition?.function?.parameters?.required)
					? tool.definition.function.parameters.required
					: [],
			},
		};
	});
}

// Convert message history to Gemini's content format
function convertToGeminiContents(messages: ResponseInput): Content[] {
	const contents: Content[] = [];

	for (const msg of messages) {
		if (msg.type === 'function_call') {
			// Function call from assistant to be included as a model message
			let args: Record<string, unknown> = {};
			try {
				const parsedArgs = JSON.parse(msg.arguments || '{}');
				args = (typeof parsedArgs === 'object' && parsedArgs !== null) ? parsedArgs : { value: parsedArgs };
			} catch (e) {
				console.error(`Failed to parse function call arguments for ${msg.name}:`, msg.arguments, e);
				args = { error: 'Invalid JSON arguments provided', raw_args: msg.arguments };
			}

			contents.push({
				role: 'model',
				parts: [{
					functionCall: {
						name: msg.name,
						args
					}
				}]
			});
		} else if (msg.type === 'function_call_output') {
			// Function output should be included as user message with function response
			contents.push({
				role: 'user',
				parts: [{
					functionResponse: {
						name: msg.name,
						response: { content: msg.output || '' }
					}
				}]
			});
		} else {
			// Regular message
			const role = msg.role === 'assistant' ? 'model' : 'user';
			let content = '';

			if (typeof msg.content === 'string') {
				content = msg.content;
			} else if (msg.content && typeof msg.content === 'object' && 'text' in msg.content) {
				content = msg.content.text as string;
			}

			if (content && content.trim() !== '') {
				contents.push({
					role,
					parts: [{ text: content }]
				});
			}
		}
	}

	return contents;
}

/**
 * Gemini model provider implementation
 */
export class GeminiProvider implements ModelProvider {
	private client: GoogleGenAI;

	constructor(apiKey?: string) {
		const key = apiKey || process.env.GOOGLE_API_KEY;
		if (!key) {
			throw new Error('Failed to initialize Gemini client. GOOGLE_API_KEY is missing or not provided.');
		}
		this.client = new GoogleGenAI({ apiKey: key, vertexai: false });
	}

	/**
	 * Create a streaming completion using Gemini's API
	 */
	async* createResponseStream(
		model: string,
		messages: ResponseInput,
		agent?: Agent,
	): AsyncGenerator<StreamingEvent> {
		const tools: ToolFunction[] | undefined = agent?.tools;
		const settings: ModelSettings | undefined = agent?.modelSettings;

		let contentBuffer = '';
		const messageId = uuidv4();
		let eventOrder = 0;
		let hasYieldedToolStart = false;

		try {
			// --- Prepare Request ---
			const contents = convertToGeminiContents(messages);

			// Safety check for empty contents
			if (contents.length === 0) {
				throw new Error('No valid content found in messages after conversion.');
			}

			// Check if the last message is from the user
			const lastContent = contents[contents.length - 1];
			if (lastContent.role !== 'user') {
				console.warn("Last message in history is not from 'user'. Gemini might not respond as expected.");
			}

			// Prepare generation config
			const config: any = {};
			if(settings?.stop_sequence) {
				config.stopSequences = settings.stop_sequence;
			}
			if(settings?.temperature) {
				config.temperature = settings.temperature;
			}
			if(settings?.max_tokens) {
				config.maxOutputTokens = settings.max_tokens;
			}
			if(settings?.top_p) {
				config.topP = settings.top_p;
			}
			if(settings?.top_k) {
				config.topK = settings.top_k;
			}

			// Add function calling configuration if tools are provided
			if (tools && tools.length > 0) {
				const functionDeclarations = convertToGeminiFunctionDeclarations(tools);
				let allowedFunctionNames: string[] = [];

				if (functionDeclarations.length > 0) {
					config.tools = [{ functionDeclarations }];

					if(settings?.tool_choice) {
						let toolChoice: FunctionCallingConfigMode | undefined;

						if(typeof settings.tool_choice === 'object' && settings.tool_choice?.type === 'function' && settings.tool_choice?.function?.name) {
							toolChoice = FunctionCallingConfigMode.ANY;
							allowedFunctionNames = [settings.tool_choice.function.name];
						}
						else if(settings.tool_choice === 'required') {
							toolChoice = FunctionCallingConfigMode.ANY;
						}
						else if(settings.tool_choice === 'auto') {
							toolChoice = FunctionCallingConfigMode.AUTO;
						}
						else if(settings.tool_choice === 'none') {
							toolChoice = FunctionCallingConfigMode.NONE;
						}

						if(toolChoice) {
							config.toolConfig = {
								functionCallingConfig: {
									mode: toolChoice,
								}
							};
							if(allowedFunctionNames.length > 0) {
								config.toolConfig.functionCallingConfig.allowedFunctionNames = allowedFunctionNames;
							}
						}
					}

				} else {
					console.warn('Tools were provided but resulted in empty declarations after conversion.');
				}
			}

			const requestParams = {
				model,
				contents,
				config,
			};

			log_llm_request('google', model, requestParams);

			// --- Start streaming ---
			const response = await this.client.models.generateContentStream(requestParams);

			let usageMetadata: GenerateContentResponseUsageMetadata | undefined;

			// --- Process the stream chunks ---
			for await (const chunk of response) {
				// Handle function calls (if present)
				if (chunk.functionCalls && chunk.functionCalls.length > 0) {
					const toolCallsToEmit: ToolCall[] = [];

					for (const fc of chunk.functionCalls) {
						if (fc && fc.name) {
							const callId = `call_${uuidv4()}`;
							toolCallsToEmit.push({
								id: callId,
								type: 'function',
								function: {
									name: fc.name,
									arguments: JSON.stringify(fc.args || {})
								}
							});
						}
					}

					if (toolCallsToEmit.length > 0 && !hasYieldedToolStart) {
						yield { type: 'tool_start', tool_calls: toolCallsToEmit };
						hasYieldedToolStart = true;
						continue; // Skip other processing when emitting tool calls
					}
				}

				// Handle text content
				if (chunk.text) {
					yield {
						type: 'message_delta',
						content: chunk.text,
						message_id: messageId,
						order: eventOrder++
					};
					contentBuffer += chunk.text;
				}

				// Handle images or other modalities
				if (chunk.candidates?.[0]?.content?.parts) {
					for (const part of chunk.candidates[0].content.parts) {
						if (part.inlineData?.data) {
							yield {
								type: 'file_complete',
								data_format: 'base64',
								data: part.inlineData.data,
								mime_type: part.inlineData.mimeType || 'image/png',
								message_id: uuidv4(),
								order: eventOrder++
							};
						}
					}
				}

				if (chunk.usageMetadata) {
					// Always use the latest usage metadata?
					usageMetadata = chunk.usageMetadata;
				}
			}

			if(usageMetadata) {
				costTracker.addUsage({
					model,
					input_tokens: usageMetadata.promptTokenCount || 0,
					output_tokens: usageMetadata.candidatesTokenCount || 0,
					cached_tokens: usageMetadata.cachedContentTokenCount || 0,
					metadata: {
						total_tokens: usageMetadata.totalTokenCount || 0,
						reasoning_tokens: usageMetadata.thoughtsTokenCount || 0,
						tool_tokens: usageMetadata.toolUsePromptTokenCount || 0,
					},
				});
			}
			else {
				console.error('No usage metadata found in the response. This may affect token tracking.');
				costTracker.addUsage({
					model,
					input_tokens: 0,  // Not provided in streaming response
					output_tokens: 0, // Not provided in streaming response
					cached_tokens: 0,
					metadata: {
						total_tokens: 0,
						source: 'estimated'
					},
				});
			}

			// --- Stream Finished, Emit Final Events ---
			if (!hasYieldedToolStart && contentBuffer) {
				yield { type: 'message_complete', content: contentBuffer, message_id: messageId };
			}

		} catch (error) {
			console.error('Error during Gemini stream processing:', error);
			const errorMessage = error instanceof Error ? error.stack || error.message : String(error);
			yield { type: 'error', error: 'Gemini error: ' + errorMessage };

			// Emit any partial content if we haven't yielded a tool call
			if (!hasYieldedToolStart && contentBuffer) {
				yield { type: 'message_complete', content: contentBuffer, message_id: messageId };
			}
		}
	}
}

// Export an instance of the provider
export const geminiProvider = new GeminiProvider();
