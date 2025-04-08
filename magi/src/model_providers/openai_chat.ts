/**
 * OpenAI model provider implementation using chat.completions.create API.
 * Handles streaming responses, native tool calls, and simulated tool calls via text parsing.
 * Cleans simulated tool call markers from final yielded content events.
 * Updated to handle MULTIPLE simulated tool calls in an array format.
 */

import {
	ModelProvider,
	ToolFunction,
	ModelSettings,
	StreamingEvent,
	ToolCall,
	ResponseInput,
} from '../types.js'; // Adjust path as needed
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { costTracker } from '../utils/cost_tracker.js'; // Adjust path as needed
import { log_llm_request } from '../utils/file_utils.js'; // Adjust path as needed
import {Agent} from '../utils/agent.js'; // Adjust path as needed
import {ModelProviderID} from './model_data.js'; // Adjust path as needed

// --- Constants for Simulated Tool Call Handling ---
// Regex to find the MULTIPLE simulated tool call pattern (TOOL_CALLS: [ ... ]) at the end
// Also detects when pattern is inside code blocks with backticks
const SIMULATED_TOOL_CALL_REGEX = /\n?\s*(?:```(?:json)?\s*)?\s*TOOL_CALLS:\s*(\[.*\])(?:\s*```)?/gs; // Use greedy .*
const TOOL_CALL_CLEANUP_REGEX = /\n?\s*(?:```(?:json)?\s*)?\s*TOOL_CALLS:\s*\[.*\](?:\s*```)?/gms; // Use greedy .* here too for consistency
const CLEANUP_PLACEHOLDER = '[Simulated Tool Calls Removed]';

// --- Helper Functions ---

/** Converts internal ToolFunction definitions to OpenAI format. */
function convertToOpenAITools(tools: ToolFunction[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
	// ... (implementation unchanged)
	return tools.map((tool: ToolFunction) => ({
		type: 'function',
		function: {
			name: tool.definition.function.name,
			description: tool.definition.function.description,
			parameters: { ...tool.definition.function.parameters },
		},
	}));
}

/** Maps internal message history format to OpenAI's format. */
function mapMessagesToOpenAI(messages: ResponseInput): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
	// ... (implementation unchanged)
	return messages.map(message => {
		if (message.type === 'function_call_output') {
			return { role: 'tool', tool_call_id: message.call_id, content: message.output || '' } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
		}
		else if (message.type === 'function_call') {
			return { role: 'assistant', tool_calls: [{ id: message.call_id, type: 'function', function: { name: message.name || '', arguments: message.arguments || '' } }] } as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
		}
		else {
			let content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[] = '';
			if ('content' in message) {
				if (typeof message.content === 'string') { content = message.content; }
				else if (message.content && 'text' in message.content && typeof message.content.text === 'string') { content = message.content.text; }
			}
			let role = message.role || 'user';
			if (role === 'developer') role = 'system';
			if (role !== 'system' && role !== 'user' && role !== 'assistant') role = 'user';
			return { role: role as 'system' | 'user' | 'assistant', content: content };
		}
	}).filter(Boolean) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

/** Type definition for the result of parsing simulated tool calls. */
type SimulatedToolCallParseResult = {
	handled: boolean;
	eventsToYield?: StreamingEvent[];
	cleanedContent?: string; // Used if handled is false
};


/**
 * OpenAI model provider implementation.
 */
export class OpenAIChat implements ModelProvider {
	protected client: OpenAI;
	protected provider: ModelProviderID;
	protected baseURL: string | undefined;

	constructor(provider?: ModelProviderID, apiKey?: string, baseURL?: string) {
		// ... (constructor unchanged)
		this.provider = provider || 'openai';
		this.baseURL = baseURL;
		this.client = new OpenAI({
			apiKey: apiKey || process.env.OPENAI_API_KEY,
			baseURL: this.baseURL,
		});

		if (!this.client.apiKey) {
			throw new Error(`Failed to initialize OpenAI client for ${this.provider}. API key is missing.`);
		}
	}

	/** Base parameter preparation method. */
	prepareParameters(requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
		return requestParams;
	}

	/**
	 * Parses the aggregated content for the MULTIPLE simulated tool call marker (`TOOL_CALLS: [...]`) at the end.
	 * If found and valid, prepares the corresponding events.
	 * @param aggregatedContent The full text content from the model response.
	 * @param messageId The ID for the current message stream.
	 * @returns A result object indicating if calls were handled and events/cleaned content.
	 */
	// --- Your _parseAndPrepareSimulatedToolCalls function modified ---
	private _parseAndPrepareSimulatedToolCalls(aggregatedContent: string, messageId: string): SimulatedToolCallParseResult {
		// Use matchAll to find all occurrences of the pattern
		const matches = Array.from(aggregatedContent.matchAll(SIMULATED_TOOL_CALL_REGEX));
		let jsonArrayString: string | null = null;
		let matchIndex: number = -1; // Store the start index of the last match

		// If matches were found, get the JSON string from the *last* match
		if (matches.length > 0) {
			const lastMatch = matches[matches.length - 1];
			if (lastMatch && lastMatch[1]) { // lastMatch[1] captures the array string "[...]"
				jsonArrayString = lastMatch[1];
				matchIndex = lastMatch.index ?? -1; // Store the index where the last match started
				console.log(`(${this.provider}) Found ${matches.length} TOOL_CALLS patterns. Processing the last one.`);
			}
		} else {
			// Optional: Add your debugging for when no matches are found at all
			if (aggregatedContent.includes('TOOL_CALLS')) {
				console.log(`(${this.provider}) TOOL_CALLS found but regex didn't match globally. Content snippet:`,
					aggregatedContent.substring(Math.max(0, aggregatedContent.indexOf('TOOL_CALLS') - 20),
						Math.min(aggregatedContent.length, aggregatedContent.indexOf('TOOL_CALLS') + 300))); // Increased snippet length
			} else {
				console.log(`(${this.provider}) No TOOL_CALLS found in response.`);
			}
			console.debug(`(${this.provider}) Full response content:`, aggregatedContent);
		}


		// Proceed only if a JSON string was extracted from the last match
		if (jsonArrayString !== null && matchIndex !== -1) {
			try {
				console.log(`(${this.provider}) Processing last TOOL_CALLS JSON string:`, jsonArrayString);

				// Try to parse the potentially complete JSON string
				let parsedToolCallArray;
				try {
					// 1. Try original JSON string (from the last match with greedy capture)
					parsedToolCallArray = JSON.parse(jsonArrayString);
				} catch (initialParseError) {
					// NOTE: Keep your fallback logic here if the LLM might still produce invalid/truncated JSON
					// For this specific error (truncation due to regex), the greedy match should fix it,
					// but fallbacks are good for general robustness.
					console.error(`(${this.provider}) Failed initial parse. Error: ${initialParseError}. JSON String: ${jsonArrayString}`);
					// Optional: Attempt your cleaning/balancing logic here if needed as fallbacks
					// Example: throw initialParseError; // Re-throw if fallbacks are not implemented or fail
					// If you have fixTruncatedJson or cleaning, try them here:
					// try { /* ... try cleaned ... */ } catch { /* ... try balanced ... */ }
					// For now, we re-throw assuming the greedy regex fixed the primary issue
					throw initialParseError;
				}

				// Validate that it's an array
				if (!Array.isArray(parsedToolCallArray)) {
					if (typeof parsedToolCallArray === 'object' && parsedToolCallArray !== null) {
						console.log(`(${this.provider}) Parsed JSON is not an array but an object, wrapping in array`);
						parsedToolCallArray = [parsedToolCallArray];
					} else {
						throw new Error('Parsed JSON is not an array or object.');
					}
				}

				const validSimulatedCalls: ToolCall[] = [];
				// Iterate through the parsed array - THIS HANDLES MULTIPLE CALLS within the block
				for (const callData of parsedToolCallArray) {
					console.log(`(${this.provider}) Processing tool call object:`, callData);

					// Flexible validation to handle different formats
					if (callData && typeof callData === 'object') { // Basic check
						// Create valid tool call object with sensible defaults
						const toolCall: ToolCall = {
							id: `sim_${uuidv4()}`, // Generate unique ID for each call
							type: 'function',
							function: {
								name: '',
								arguments: '{}'
							}
						};

						// Extract type if available
						if (typeof callData.type === 'string') {
							toolCall.type = callData.type as 'function'; // Assuming only function type for now
						}

						// Extract function details
						const funcDetails = callData.function;
						if (typeof funcDetails === 'object' && funcDetails !== null) {
							if (typeof funcDetails.name === 'string') {
								toolCall.function.name = funcDetails.name;
							}
							// Handle arguments (ensure it's a stringified JSON)
							if (funcDetails.arguments !== undefined) {
								if (typeof funcDetails.arguments === 'string') {
									try {
										JSON.parse(funcDetails.arguments); // Validate JSON string
										toolCall.function.arguments = funcDetails.arguments;
									} catch (e) {
										console.warn(`(${this.provider}) Argument string is not valid JSON, wrapping in quotes:`, funcDetails.arguments);
										// If it's meant to be a plain string, JSON stringify it
										toolCall.function.arguments = JSON.stringify(funcDetails.arguments);
									}
								} else {
									toolCall.function.arguments = JSON.stringify(funcDetails.arguments);
								}
							}
						} else if (typeof callData.name === 'string') {
							// Handle simpler format { name: "...", arguments: "..." }
							toolCall.function.name = callData.name;
							if (callData.arguments !== undefined) {
								if (typeof callData.arguments === 'string') {
									try {
										JSON.parse(callData.arguments); // Validate JSON string
										toolCall.function.arguments = callData.arguments;
									} catch (e) {
										console.warn(`(${this.provider}) Argument string is not valid JSON, wrapping in quotes:`, callData.arguments);
										toolCall.function.arguments = JSON.stringify(callData.arguments);
									}
								} else {
									toolCall.function.arguments = JSON.stringify(callData.arguments);
								}
							}
						}

						// Only add the tool call if it has a valid name
						if (toolCall.function.name && toolCall.function.name.length > 0) {
							validSimulatedCalls.push(toolCall);
						} else {
							console.warn(`(${this.provider}) Invalid tool call object, missing name:`, callData);
						}
					} else {
						console.warn(`(${this.provider}) Skipping invalid item in tool call array:`, callData);
					}
				}


				console.log(`(${this.provider}) Valid simulated calls extracted:`, validSimulatedCalls);

				// Proceed only if at least one valid call was parsed from the last match
				if (validSimulatedCalls.length > 0) {
					// Extract and clean text *before* the *last* marker
					let textBeforeToolCall = aggregatedContent.substring(0, matchIndex).trim();
					// Clean up *all* markers potentially before the last one too
					textBeforeToolCall = textBeforeToolCall.replace(TOOL_CALL_CLEANUP_REGEX, CLEANUP_PLACEHOLDER);

					const eventsToYield: StreamingEvent[] = [];
					if (textBeforeToolCall) {
						eventsToYield.push({
							type: 'message_complete', // Or 'message_delta' depending on your streaming logic
							content: textBeforeToolCall,
							message_id: messageId,
						});
					}
					// Yield a single tool_start event containing the array of calls
					eventsToYield.push({
						type: 'tool_start',
						tool_calls: validSimulatedCalls,
					});

					return { handled: true, eventsToYield };
				} else {
					console.warn(`(${this.provider}) Last TOOL_CALLS array found but contained no valid tool call objects after processing.`);
				}

			} catch (parseError) {
				// Log the error with the JSON string that failed
				console.error(`(${this.provider}) Found last TOOL_CALLS pattern, but failed during processing: ${parseError}. JSON String: ${jsonArrayString}`);
			}
		}

		// If no match, or parsing/validation failed for the last match
		console.log(`(${this.provider}) No valid tool calls processed from TOOL_CALLS markers.`);
		const cleanedContent = aggregatedContent.replace(TOOL_CALL_CLEANUP_REGEX, CLEANUP_PLACEHOLDER);
		return { handled: false, cleanedContent: cleanedContent };
	}


		/** Creates a streaming response using OpenAI's chat.completions.create API. */
	async* createResponseStream(
		model: string,
		messages: ResponseInput,
		agent?: Agent,
	): AsyncGenerator<StreamingEvent> {
		const tools: ToolFunction[] | undefined = agent?.tools;
		const settings: ModelSettings | undefined = agent?.modelSettings;

		try {
			// --- Prepare Request ---
			const chatMessages = mapMessagesToOpenAI(messages);
			let requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = { model, messages: chatMessages, stream: true };
			// ... (parameter setup unchanged) ...
			if (settings?.temperature !== undefined) requestParams.temperature = settings.temperature;
			if (settings?.top_p !== undefined) requestParams.top_p = settings.top_p;
			if (settings?.max_tokens) requestParams.max_tokens = settings.max_tokens;
			if (settings?.tool_choice) requestParams.tool_choice = settings.tool_choice as OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
			if (tools && tools.length > 0) requestParams.tools = convertToOpenAITools(tools);

			requestParams = this.prepareParameters(requestParams);
			log_llm_request(this.provider, model, requestParams);

			// --- Process Stream ---
			const stream = await this.client.chat.completions.create(requestParams);
			let aggregatedContent = '';
			let aggregatedThinking = '';
			const messageId = uuidv4();
			let messageIndex = 0;
			const partialToolCallsByIndex = new Map<number, ToolCall>();
			let finishReason: string | null = null;
			let usage: OpenAI.CompletionUsage | undefined = undefined;

			try {
				for await (const chunk of stream) {
					// ... (stream aggregation logic unchanged) ...
					const choice = chunk.choices[0];
					if (!choice?.delta) continue;
					const delta = choice.delta;
					if (delta.content) {
						aggregatedContent += delta.content;
						yield { type: 'message_delta', content: delta.content, message_id: messageId, order: messageIndex++ };
					}
					if ('reasoning_content' in delta) {
						const thinking_content = delta.reasoning_content as string;
						if(thinking_content) {
							aggregatedThinking += thinking_content;
							yield { type: 'message_delta', content: '', message_id: messageId, thinking_content, order: messageIndex++ };
						}
					}
					if ('thinking_content' in delta) {
						const thinking_content = delta.thinking_content as string;
						if(thinking_content) {
							aggregatedThinking += thinking_content;
							yield { type: 'message_delta', content: '', message_id: messageId, thinking_content, order: messageIndex++ };
						}
					}
					if (delta.tool_calls) {
						for (const toolCallDelta of delta.tool_calls) {
							const index = toolCallDelta.index;
							if (typeof index !== 'number') continue;
							let partialCall = partialToolCallsByIndex.get(index);
							if (!partialCall) {
								partialCall = { id: toolCallDelta.id || '', type: 'function', function: { name: toolCallDelta.function?.name || '', arguments: toolCallDelta.function?.arguments || '' } };
								partialToolCallsByIndex.set(index, partialCall);
							} else {
								if (toolCallDelta.id) partialCall.id = toolCallDelta.id;
								if (toolCallDelta.function?.name) partialCall.function.name = toolCallDelta.function.name;
								if (toolCallDelta.function?.arguments) partialCall.function.arguments += toolCallDelta.function.arguments;
							}
						}
					}
					if (choice.finish_reason) finishReason = choice.finish_reason;
					if (chunk.usage) usage = chunk.usage;
				} // End stream loop

				// --- Post-Stream Processing ---
				if (usage) {
					costTracker.addUsage({ model: model, input_tokens: usage.prompt_tokens || 0, output_tokens: usage.completion_tokens || 0, cached_tokens: usage.prompt_tokens_details?.cached_tokens || 0, metadata: { total_tokens: usage.total_tokens || 0, reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0 } });
				} else {
					console.warn(`(${this.provider}) Usage info not found in stream for cost tracking.`);
				}

				// --- Handle Final State Based on Finish Reason ---
				if (finishReason === 'stop') {
					// Use the updated helper function for parsing TOOL_CALLS: [...]
					const parseResult = this._parseAndPrepareSimulatedToolCalls(aggregatedContent, messageId);
					if (parseResult.handled && parseResult.eventsToYield) {
						for (const event of parseResult.eventsToYield) { yield event; }
					} else {
						// No simulated call found/parsed, yield cleaned full content
						yield { type: 'message_complete', content: parseResult.cleanedContent ?? '', message_id: messageId, thinking_content: aggregatedThinking };
					}
				} else if (finishReason === 'tool_calls') {
					// Handle NATIVE tool calls (unchanged)
					const completedToolCalls: ToolCall[] = Array.from(partialToolCallsByIndex.values())
						.filter(call => call.id && call.function.name);
					if (completedToolCalls.length > 0) { yield { type: 'tool_start', tool_calls: completedToolCalls }; }
					else {
						console.warn(`(${this.provider}) Finish reason 'tool_calls', but no complete native tool calls parsed.`);
						yield { type: 'error', error: `Error (${this.provider}): Model indicated tool calls, but none were parsed correctly.` };
					}
				} else if (finishReason === 'length') {
					const cleanedPartialContent = aggregatedContent.replace(TOOL_CALL_CLEANUP_REGEX, CLEANUP_PLACEHOLDER);
					yield { type: 'error', error: `Error (${this.provider}): Response truncated (max_tokens). Partial: ${cleanedPartialContent.substring(0, 100)}...` };
				} else if (finishReason) {
					const cleanedReasonContent = aggregatedContent.replace(TOOL_CALL_CLEANUP_REGEX, CLEANUP_PLACEHOLDER);
					yield { type: 'error', error: `Error (${this.provider}): Response stopped due to: ${finishReason}. Content: ${cleanedReasonContent.substring(0,100)}...` };
				} else {
					// Handle stream ending without a finish reason
					if (aggregatedContent) {
						console.warn(`(${this.provider}) Stream finished without finish_reason, yielding cleaned content.`);
						// Attempt to parse simulated calls even without finish reason 'stop'
						const parseResult = this._parseAndPrepareSimulatedToolCalls(aggregatedContent, messageId);
						if (parseResult.handled && parseResult.eventsToYield) {
							for (const event of parseResult.eventsToYield) { yield event; }
						} else {
							yield { type: 'message_complete', content: parseResult.cleanedContent ?? '', message_id: messageId, thinking_content: aggregatedThinking };
						}
					} else if (partialToolCallsByIndex.size > 0) {
						// ... (unchanged native tool call error handling) ...
						console.warn(`(${this.provider}) Stream finished without finish_reason during native tool call generation.`);
						yield { type: 'error', error: `Error (${this.provider}): Stream ended unexpectedly during native tool call generation.` };
					} else {
						// ... (unchanged empty stream error handling) ...
						console.warn(`(${this.provider}) Stream finished empty without reason, content, or tool calls.`);
						yield { type: 'error', error: `Error (${this.provider}): Stream finished unexpectedly empty.` };
					}
				}

			} catch (streamError) {
				console.error(`(${this.provider}) Error processing chat completions stream:`, streamError);
				yield { type: 'error', error: `Stream processing error (${this.provider}): ${String(streamError)}` };
			} finally {
				partialToolCallsByIndex.clear();
			}

		} catch (error) {
			console.error(`Error running ${this.provider} chat completions stream:`, error);
			yield {
				type: 'error',
				error: `API Error (${this.provider}): `+((error instanceof OpenAI.APIError)
					? `${error.status} ${error.name} ${error.message}`
					: (error instanceof Error ? error.stack : String(error)))
			};
		}
	}
}
