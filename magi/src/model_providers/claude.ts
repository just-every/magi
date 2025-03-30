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
 * Converts internal message history (ResponseInput) into the format required by the Claude API,
 * applying Claude-specific rules like merging consecutive assistant messages (tool_use + text).
 *
 * @param history The input array of messages in the internal format (ResponseInput).
 * @returns An array of messages formatted for the Claude API.
 */
function convertHistoryForClaude(history: ResponseInput): any[] {
	const claudeMessages: any[] = [];
	let i = 0;
	while (i < history.length) {
		const msg = history[i];
		const role = ('role' in msg && msg.role !== 'developer') ? msg.role : 'system';

		// Extract primary text content, if applicable (mainly for 'message' type)
		let textContent: string = '';
		if (msg.type === 'message') {
			if (typeof msg.content === 'string') {
				textContent = msg.content;
			} else if (Array.isArray(msg.content) && msg.content.length > 0 && msg.content[0].type === 'input_text') {
				textContent = msg.content[0].text || '';
			}
		}

		// Convert the current message using the Claude-specific converter
		const currentClaudeMsg = convertToClaudeMessage(role, textContent, msg);

		if (!currentClaudeMsg) {
			i++; // Skip message if conversion resulted in null
			continue;
		}

		// --- Claude Specific Logic: Merge assistant tool_use + assistant text ---
		// Check if the current message is an assistant message containing ONLY tool_use
		// and if the next message is an assistant message containing ONLY text.
		let merged = false;
		if (
			currentClaudeMsg.role === 'assistant' &&
			Array.isArray(currentClaudeMsg.content) &&
			currentClaudeMsg.content.length === 1 &&
			currentClaudeMsg.content[0].type === 'tool_use' &&
			(i + 1) < history.length // Check if there is a next message
		) {
			const nextMsg = history[i + 1];
			const nextRole = ('role' in nextMsg && nextMsg.role !== 'developer') ? nextMsg.role : 'system';

			// Extract text content for the next message
			let nextTextContent: string = '';
			if (nextMsg.type === 'message') {
				if (typeof nextMsg.content === 'string') {
					nextTextContent = nextMsg.content;
				} else if (Array.isArray(nextMsg.content) && nextMsg.content.length > 0 && nextMsg.content[0].type === 'input_text') {
					nextTextContent = nextMsg.content[0].text || '';
				}
			}

			// Convert the next message using the Claude-specific converter
			const nextClaudeMsg = convertToClaudeMessage(nextRole, nextTextContent, nextMsg);

			// Check if the next message is suitable for merging (assistant role, single text block)
			if (
				nextClaudeMsg &&
				nextClaudeMsg.role === 'assistant' &&
				Array.isArray(nextClaudeMsg.content) &&
				nextClaudeMsg.content.length === 1 &&
				nextClaudeMsg.content[0].type === 'text'
			) {
				// Merge: Add the text block from the next message to the current tool_use message's content array
				console.debug("Merging Claude assistant tool_use and text blocks.");
				currentClaudeMsg.content.push(nextClaudeMsg.content[0]); // Add text block
				claudeMessages.push(currentClaudeMsg); // Add the merged message
				i += 2; // Increment index by 2 to skip both original messages
				merged = true;
			}
		}
		// --- End Claude Specific Logic ---

		// If no merging occurred, add the current structured message normally
		if (!merged) {
			claudeMessages.push(currentClaudeMsg);
			i++; // Increment index by 1
		}
	}

	// Final validation: Ensure tool_use is followed by tool_result
	for (let j = 0; j < claudeMessages.length - 1; j++) {
		const currentMsg = claudeMessages[j];
		const nextMsg = claudeMessages[j + 1];

		if (currentMsg.role === 'assistant' && Array.isArray(currentMsg.content)) {
			const toolUseBlock = currentMsg.content.find((block: any) => block.type === 'tool_use');
			if (toolUseBlock) {
				// Check if the next message is the corresponding tool_result
				if (!(nextMsg.role === 'user' && Array.isArray(nextMsg.content))) {
					console.warn(`Claude History Warning: Assistant message with tool_use (id: ${toolUseBlock.id}) at index ${j} is not immediately followed by a user message.`);
					// Depending on strictness, could throw an error here or attempt further correction
				} else {
					const toolResultBlock = nextMsg.content.find((block: any) => block.type === 'tool_result' && block.tool_use_id === toolUseBlock.id);
					if (!toolResultBlock) {
						console.warn(`Claude History Warning: Assistant message with tool_use (id: ${toolUseBlock.id}) at index ${j} is followed by a user message, but it doesn't contain the matching tool_result.`);
						// Depending on strictness, could throw an error here
					}
				}
			}
		}
	}


	return claudeMessages;
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
