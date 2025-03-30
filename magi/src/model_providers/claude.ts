/**
 * Claude model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for Anthropic's Claude models and handles streaming responses.
 */

import Anthropic from '@anthropic-ai/sdk';
import {v4 as uuidv4} from 'uuid';
import {
	ModelProvider,
	ToolFunction,
	ModelSettings,
	StreamingEvent,
	ToolCall,
	ResponseInput, ResponseInputItem
} from '../types.js';
import { costTracker } from '../utils/cost_tracker.js';
import { log_llm_request } from '../utils/file_utils.js';
// Removed: import { convertHistoryFormat } from '../utils/llm_utils.js';
import {Agent} from '../utils/agent.js';
import {ModelClassID} from './model_data.js';

// Convert our tool definition to Claude's format
function convertToClaudeTools(tools: ToolFunction[]): any[] {
	return tools.map(tool => ({
		// Directly map the properties to the top level
		name: tool.definition.function.name,
		description: tool.definition.function.description,
		// Map 'parameters' from your definition to 'input_schema' for Claude
		input_schema: tool.definition.function.parameters
	}));
}

// Assuming ResponseInputItem is your internal message structure type
// Assuming ClaudeMessage is the structure Anthropic expects (or null)
type ClaudeMessage = { role: 'user' | 'assistant' | 'system'; content: any; } | null; // Simplified type

/**
 * Converts a custom ResponseInputItem into Anthropic Claude's message format.
 * Handles text messages, tool use requests (function calls), and tool results (function outputs).
 *
 * @param role The original role associated with the message ('user', 'assistant', 'system').
 * @param content The text content, primarily for non-tool messages.
 * @param msg The detailed message object (ResponseInputItem).
 * @returns A Claude message object or null if conversion is not applicable (e.g., system message, empty content).
 */
function convertToClaudeMessage(role: string, content: string, msg: ResponseInputItem): ClaudeMessage {

	// --- Handle Tool Use (Function Call) ---
	if (msg.type === 'function_call') {
		let inputArgs: Record<string, unknown> = {};
		try {
			// Claude expects 'input' as an object
			inputArgs = JSON.parse(msg.arguments || '{}');
		} catch (e) {
			console.error(`Error parsing function call arguments for ${msg.name}: ${msg.arguments}`, e);
			return null;
		}

		const toolUseBlock = {
			type: 'tool_use',
			id: msg.call_id, // Use the consistent ID field
			name: msg.name,
			input: inputArgs,
		};

		return { role: 'assistant', content: [toolUseBlock] };
	}
	else if (msg.type === 'function_call_output') {
		const toolResultBlock = {
			type: 'tool_result',
			tool_use_id: msg.call_id, // ID must match the corresponding tool_use block
			content: msg.output || '', // Default to empty string if output is missing
			...(msg.status === 'incomplete' ? { is_error: true } : {}),
		};

		// Anthropic expects role: 'user' for tool_result
		return { role: 'user', content: [toolResultBlock] };
	}
	else {
		// Skip messages with no actual text content
		if (!content) {
			return null; // Skip messages with no text content
		}

		const messageRole = role === 'assistant' ? 'assistant' : (role === 'developer' || role === 'system' ? 'system' : 'user');

		// System messages expect string content
		if (messageRole === 'system') {
			// System prompts are handled separately later
			return { role: 'system', content: content };
		} else {
			// User and Assistant messages must use the array format when tools are potentially involved.
			// Use array format consistently for safety.
			return {
				role: messageRole,
				content: [{ type: 'text', text: content }]
			};
		}
	}
	// Default case for unhandled or irrelevant message types for Claude history
	return null;
}

/**
 * Claude model provider implementation
 */
export class ClaudeProvider implements ModelProvider {
	private client: Anthropic;

	constructor(apiKey?: string) {
		this.client = new Anthropic({
			apiKey: apiKey || process.env.ANTHROPIC_API_KEY
		});

		if (!this.client) {
			throw new Error('Failed to initialize Claude client. Make sure ANTHROPIC_API_KEY is set.');
		}
	}

	/**
	 * Create a streaming completion using Claude's API
	 */
	async* createResponseStream(
		model: string,
		messages: ResponseInput,
		agent?: Agent,
	): AsyncGenerator<StreamingEvent> {
		try {
			const tools: ToolFunction[] | undefined = agent?.tools;
			const settings: ModelSettings | undefined = agent?.modelSettings;
			const modelClass: ModelClassID | undefined = agent?.modelClass;

			let thinking = undefined;
			let max_tokens = settings?.max_tokens || 8192; // Default max tokens if not specified
			switch (modelClass) {
				case 'monologue':
				case 'reasoning':
				case 'code':
					if(model === 'claude-3-7-sonnet-latest') {
						// Extended thinking
						thinking = {
							type: 'enabled',
							budget_tokens: 120000
						};
						max_tokens = Math.min(max_tokens, 128000);
					}
					else {
						max_tokens = Math.min(max_tokens, 8192);
					}
					break;
				case 'standard':
					max_tokens = Math.min(max_tokens, 8192);
					break;
				default:
					max_tokens = Math.min(max_tokens, 4096); // Lower limit for other classes
			}

			// Convert messages using the Claude-specific history processor
			const processedClaudeMessages = convertHistoryForClaude(messages);

			// Extract the system prompt content (should be only one, handled by convertHistoryForClaude)
			const systemPromptMessages = processedClaudeMessages.filter(m => m.role === 'system');
			// Ensure content is a string. Handle cases where content might be structured differently or missing.
			const systemPrompt = systemPromptMessages.length > 0 && typeof systemPromptMessages[0].content === 'string'
				? systemPromptMessages[0].content
				: undefined;

			// Format the request according to Claude API specifications
			const requestParams: any = {
				model: model,
				// Use the processed messages, filtering out any remaining system messages here
				messages: processedClaudeMessages.filter(m => m.role === 'user' || m.role === 'assistant'),
				// Add system prompt string if it exists
				...(systemPrompt ? { system: systemPrompt } : {}),
				stream: true,
				max_tokens,
				thinking,
				// Add optional parameters (added undefined check for robustness)
				...(settings?.temperature !== undefined ? { temperature: settings.temperature } : {}),
			};

			// Add tools if provided, using the corrected conversion function
			if (tools && tools.length > 0) {
				requestParams.tools = convertToClaudeTools(tools); // Uses the corrected function
			}

			// Log the request before sending
			log_llm_request('anthropic', model, requestParams);

			// Make the API call
			const stream = await this.client.messages.create(requestParams);

			// Track current tool call info
			let currentToolCall: any = null;
			let accumulatedContent = ''; // To collect all content for final message_complete
			const messageId = uuidv4(); // Generate a unique ID for this message
			// Track delta positions for ordered message chunks
			let deltaPosition = 0;

			try {
				// @ts-expect-error - Claude's stream is AsyncIterable but TypeScript might not recognize it properly
				for await (const event of stream) {
					// Handle content block delta
					if (event.type === 'content_block_delta' && event.delta.text) {
						// Emit delta event for streaming UI updates with incrementing order
						yield {
							type: 'message_delta',
							content: event.delta.text,
							message_id: messageId,
							order: deltaPosition++
						};

						// Accumulate content for complete message
						accumulatedContent += event.delta.text;
					}
					// Handle content block start for text
					else if (event.type === 'content_block_start' &&
						event.content_block.type === 'text') {
						if (event.content_block.text) {
							// Emit delta event with incrementing order
							yield {
								type: 'message_delta',
								content: event.content_block.text,
								message_id: messageId,
								order: deltaPosition++
							};

							// Accumulate content for complete message
							accumulatedContent += event.content_block.text;
						}
					}
					// Handle content block stop for text
					else if (event.type === 'content_block_stop' &&
						event.content_block.type === 'text') {
						if (event.content_block.text) {
							// For non-streaming responses, add as delta too with incrementing order
							yield {
								type: 'message_delta',
								content: event.content_block.text,
								message_id: messageId,
								order: deltaPosition++
							};

							// Accumulate content for complete message
							accumulatedContent += event.content_block.text;
						}
					}
					// Handle tool use start
					else if (event.type === 'content_block_start' &&
						event.content_block.type === 'tool_use') {
						// Start building the tool call
						const toolUse = event.content_block.tool_use;
						currentToolCall = {
							id: toolUse.id || `call_${Date.now()}`,
							type: 'function',
							function: {
								name: toolUse.name,
								arguments: typeof toolUse.input === 'string'
									? toolUse.input
									: JSON.stringify(toolUse.input)
							}
						};
					}
					// Handle tool use delta (for streaming arguments)
					else if (event.type === 'content_block_delta' &&
						event.delta.type === 'tool_use' &&
						currentToolCall) {
						// Update the tool call with more argument data
						if (event.delta.tool_use && event.delta.tool_use.input) {
							if (typeof event.delta.tool_use.input === 'string') {
								currentToolCall.function.arguments += event.delta.tool_use.input;
							} else {
								// For object inputs, replace the entire arguments with the updated version
								currentToolCall.function.arguments = JSON.stringify(event.delta.tool_use.input);
							}
						}

						// Emit the tool_start event with current partial state for streaming UI
						yield {
							type: 'tool_start',
							tool_calls: [currentToolCall as ToolCall]
						};
					}
					// Handle tool use stop
					else if (event.type === 'content_block_stop' &&
						event.content_block.type === 'tool_use' &&
						currentToolCall) {
						// Finalize the tool call and emit it
						if (event.content_block.tool_use && event.content_block.tool_use.input) {
							// Use the complete input if available
							currentToolCall.function.arguments = typeof event.content_block.tool_use.input === 'string'
								? event.content_block.tool_use.input
								: JSON.stringify(event.content_block.tool_use.input);
						}

						yield {
							type: 'tool_start',
							tool_calls: [currentToolCall as ToolCall]
						};

						currentToolCall = null;
					}
					// Handle message stop
					else if (event.type === 'message_stop') {
						// Complete any pending tool call
						if (currentToolCall) {
							yield {
								type: 'tool_start',
								tool_calls: [currentToolCall as ToolCall]
							};
							currentToolCall = null;
						}

						// Always emit a message_complete at the end with the accumulated content
						if (accumulatedContent) {
							yield {
								type: 'message_complete',
								content: accumulatedContent,
								message_id: messageId
							};
						}

						// Track cost if available in the message_stop event
						if (event.usage && (event.usage.input_tokens || event.usage.output_tokens)) {
							costTracker.addUsage({
								model,
								input_tokens: event.usage.input_tokens || 0,
								output_tokens: event.usage.output_tokens || 0,
							});
						}
					}
					// Handle error event
					else if (event.type === 'error') {
						yield {
							type: 'error',
							error: 'Claude API error: '+(event.error ? event.error.message : 'Unknown error')
						};
					}
				}

				// Ensure a message_complete is emitted if somehow message_stop didn't fire
				if (accumulatedContent && !currentToolCall) {
					yield {
						type: 'message_complete',
						content: accumulatedContent,
						message_id: messageId
					};
				}

			} catch (streamError) {
				console.error('Error processing Claude stream:', streamError);
				yield {
					type: 'error',
					error: 'Claude processing stream error: '+String(streamError)
				};

				// If we have accumulated content but no message_complete was sent
				// due to an error, still try to send it
				if (accumulatedContent) {
					yield {
						type: 'message_complete',
						content: accumulatedContent,
						message_id: messageId
					};
				}
			}

		} catch (error) {
			console.error('Error in Claude streaming completion:', error);
			yield {
				type: 'error',
				error: 'Claude streaming error: '+String(error)
			};
		}
	}
}

// Export an instance of the provider
export const claudeProvider = new ClaudeProvider();
