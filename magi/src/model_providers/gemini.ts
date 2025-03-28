/**
 * Gemini model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for Google's Gemini models and handles streaming responses.
 */

import {
	GoogleGenAI,
	GenerateContentConfig,
	ContentListUnion,
	ToolListUnion,
	FunctionDeclaration,
	Schema,
	Type,
	ContentUnion,
	Part,
	FunctionCall,
	GenerateContentResponse
} from '@google/genai';
import {v4 as uuidv4} from 'uuid';
import {
	ModelProvider,
	ToolFunction,
	ModelSettings,
	StreamingEvent,
	ToolCall,
	ResponseInput,
	ResponseInputItem,
} from '../types.js';
import { costTracker } from '../utils/cost_tracker.js';
import { convertHistoryFormat } from '../utils/llm_utils.js';
import {log_llm_request} from '../utils/file_utils.js';

// Convert our tool definition to Gemini's format
function convertToGeminiTools(tools: ToolFunction[]): ToolListUnion {
	const functionDeclarations: FunctionDeclaration[] = tools.map(tool => {
		const properties: Record<string, Schema> = {};

		for (const [name, param] of Object.entries(tool.definition.function.parameters.properties)) {
			let type = Type.STRING;
			switch(param.type) {
				case 'string':
					type = Type.STRING;
					break;
				case 'number':
					type = Type.NUMBER;
					break;
				case 'boolean':
					type = Type.BOOLEAN;
					break;
				case 'null':
				case 'object':
					type = Type.OBJECT;
					break;
				case 'array':
					type = Type.ARRAY;
					break;
			}

			properties[name] = {
				type,
				description: param.description,
			};
		}

		const parameters: Schema = {
			type: Type.OBJECT,
			properties,
			required: tool.definition.function.parameters.required
		};
		const functionDeclaration: FunctionDeclaration = {
			...tool.definition.function,
			parameters,
		};
		return functionDeclaration;
	});

	return [
		{ functionDeclarations }
	];
}

/**
 * Converts a custom ResponseInputItem into Google Gemini's Content format.
 *
 * Note: The original function signature included 'role' and 'content' parameters
 * which seem redundant given the 'msg' object contains this info.
 * This revised version primarily relies on the 'msg' object.
 *
 * @param msg The message or function call/output item to convert.
 * @returns A Gemini Content object or null if conversion is not possible (e.g., empty content).
 */
function convertToGeminiContent(role: string, content: string, msg: ResponseInputItem): ContentUnion | null {

	if (msg.type === 'function_call') {
		const args: Record<string, unknown> = JSON.parse(msg.arguments);
		const functionCallPart: Part = {
			functionCall: {
				id: msg.id || msg.call_id,
				name: msg.name,
				args,
			}
		};
		return { role: 'model', parts: [functionCallPart] };
	}
	else if (msg.type === 'function_call_output') {

		let responseContent: Record<string, unknown>;
		try {
			// Attempt to parse if it looks like JSON, otherwise treat as plain text
			if (msg.output.trim().startsWith('{') || msg.output.trim().startsWith('[')) {
				responseContent = JSON.parse(msg.output);
			} else {
				// If not JSON, wrap it simply. Adjust wrapping as needed.
				responseContent = { content: msg.output };
			}
		} catch (e) {
			responseContent = { content: msg.output };
		}

		const functionResponsePart: Part = {
			functionResponse: {
				id: msg.id || msg.call_id,
				name: msg.name,
				response: responseContent, // Gemini expects an object here
			}
		};
		return { role: 'user', parts: [functionResponsePart] };
	}
	else {
		return !content ? null : {
			role: role === 'assistant' ? 'model' : 'user',
			parts: [{ text: content }],
		};
	}
}

/**
 * Gemini model provider implementation
 */
export class GeminiProvider implements ModelProvider {
	private client: GoogleGenAI;

	constructor() {
		if (!process.env.GOOGLE_API_KEY) {
			throw new Error('Failed to initialize Gemini client. Make sure GOOGLE_API_KEY is set.');
		}

		this.client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
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

		let contentBuffer = ''; // Accumulates text
		const messageId = uuidv4();
		let eventOrder = 0;
		let streamError: Error | null = null;
		let lastChunk: GenerateContentResponse | null = null;

		try {
			// Configure generation parameters
			const config: GenerateContentConfig = {
				temperature: settings?.temperature,
				maxOutputTokens: settings?.max_tokens,
				topP: settings?.top_p,
			};
			if (tools && tools.length > 0) {
				config.tools = convertToGeminiTools(tools);
			}

			const contents: ContentListUnion = convertHistoryFormat(messages, convertToGeminiContent);

			const requestParams = {
				model,
				contents,
				config,
			};

			// Log the request for debugging
			log_llm_request('google', model, requestParams);

			const responseStream = await this.client.models.generateContentStream(requestParams);

			// --- Stream Processing Loop ---
			for await (const chunk of responseStream) {
				lastChunk = chunk; // Store the latest chunk
				let chunkProcessedAnyPart = false; // Track if any part of the chunk was handled

				// 1. Check for Function Calls using the getter
				// Note: .functionCalls getter filters parts from the first candidate.
				const functionCalls = chunk.functionCalls; // Use getter
				if (functionCalls) { // Check if undefined or empty array
					const toolCallsToEmit: ToolCall[] = functionCalls.map((fc: FunctionCall) => {
						const id = fc.id || `call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
						return {
							id,
							type: 'function',
							function: { name: (fc.name || id), arguments: JSON.stringify(fc.args) }
						};
					});
					if (toolCallsToEmit.length > 0) {
						yield { type: 'tool_start', tool_calls: toolCallsToEmit };
						chunkProcessedAnyPart = true;
					}
				}

				// 2. Check for Text Content using the getter
				// Note: .text getter concatenates text from first candidate, warns for non-text parts.
				const chunkText = chunk.text; // Use getter
				if (chunkText !== undefined && chunkText !== '') { // Check for non-empty string
					yield {
						type: 'message_delta',
						content: chunkText,
						message_id: messageId,
						order: eventOrder++
					};
					contentBuffer += chunkText;
					chunkProcessedAnyPart = true;
				}

				// 3. Check for Non-Text Parts (e.g., Images) by inspecting raw parts
				// This is necessary because the `.text` getter explicitly ignores/warns about non-text parts.
				// Only do this if the primary helpers didn't yield significant content,
				// or adjust logic if mixed content chunks are common/expected.
				// This example prioritizes text/function calls found by helpers first.
				// Let's refine: Check parts *regardless* of text, as a chunk might contain both.
				const parts = chunk.candidates?.[0]?.content?.parts;
				if (parts) {
					for (const part of parts) {
						// Check specifically for inlineData (images)
						if (part.inlineData?.data) {
							// Avoid double-processing if handled by text getter (unlikely for images)
							// Check if we already processed text/function call *from this specific part type*
							// This simple check assumes inlineData won't be processed by .text or .functionCalls
							const inlineData = part.inlineData;
							yield {
								type: 'file_complete',
								data_format: 'base64',
								data: inlineData.data || '',
								mime_type: inlineData.mimeType,
								message_id: uuidv4(),
								order: eventOrder++
							};
							chunkProcessedAnyPart = true;
						}
						// Add checks for other potential non-text part types here if needed
						// else if (part.executableCode) { ... }
						// else if (part.codeExecutionResult) { ... }
					}
				}

				// Debug log for chunks that didn't seem to trigger any known processing path
				if (!chunkProcessedAnyPart && !chunk.promptFeedback) { // Ignore chunks that are just initial feedback
					// Check if it's just an empty chunk before warning
					if (!chunk.text && !chunk.functionCalls && (!parts || parts.length === 0)){
						// Likely an empty chunk, can happen, probably ignore.
					} else {
						console.debug('Chunk processed no known parts:', JSON.stringify(chunk));
					}
				}
			} // End of for await loop

			// --- Stream Finished ---
			if (!lastChunk) {
				// Handle case where stream was empty
				console.warn('Stream finished without yielding any chunks.');
				yield { type: 'message_complete', content: contentBuffer, message_id: messageId };
				return;
			}

			// Check final state/blocking using the lastChunk
			// Note: promptFeedback might also appear ONLY in the first chunk if blocked early.
			// Checking lastChunk covers blocks determined at the *end* of generation.
			const finalPromptFeedback = lastChunk.promptFeedback;
			if (finalPromptFeedback?.blockReason) {
				const blockReason = finalPromptFeedback.blockReason;
				const blockMessage = finalPromptFeedback.blockReasonMessage || `Blocked due to: ${blockReason}`;
				streamError = new Error(blockMessage);
				// Yield accumulated text before error?
				yield { type: 'message_complete', content: contentBuffer, message_id: messageId };
				yield { type: 'error', error: blockMessage };
				return;
			}

			// --- Emit Final Events ---
			yield {
				type: 'message_complete',
				content: contentBuffer, // Accumulated text
				message_id: messageId
			};

			// Usage Metadata: Assumed to be populated on the lastChunk
			const usage = lastChunk.usageMetadata;
			if (usage) {
				costTracker.addUsage({
					model,
					input_tokens: usage.promptTokenCount || 0,
					output_tokens: usage.candidatesTokenCount || 0,
					cached_tokens: usage.cachedContentTokenCount || 0,
					metadata: {
						reasoning_tokens: usage.thoughtsTokenCount || 0,
						tool_tokens: usage.toolUsePromptTokenCount || 0,
						total_tokens: usage.totalTokenCount || 0,
					},
				});
			}

		} catch (error) {
			// Handle errors during API call or stream iteration
			streamError = error instanceof Error ? error : new Error(String(error));
			console.error('Error during Gemini stream processing:', streamError);
			yield { type: 'error', error: streamError.message };
			// Yield accumulated text even on error
			yield { type: 'message_complete', content: contentBuffer, message_id: messageId };
		}
	}
}



// Export an instance of the provider
export const geminiProvider = new GeminiProvider();
