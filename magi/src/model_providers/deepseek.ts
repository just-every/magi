/**
 * DeepSeek model provider for the MAGI system.
 *
 * We extend OpenAIChat as DeepSeek is a drop in replacement.
 * This version includes workarounds for deepseek-reasoner limitations:
 * - Removes unsupported parameters.
 * - Transforms tool calls/results into text messages for the history.
 * - Consolidates system messages at the start.
 * - Injects tool definitions and instructions for MULTIPLE simulated tool calls.
 * - Includes fix for merging consecutive user messages.
 * - Removed potentially problematic final message swap logic.
 */

import {OpenAIChat} from './openai_chat.js'; // Adjust path as needed
import OpenAI from 'openai';

// Define a type alias for message parameters for clarity
type MessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
// Define type for standard OpenAI tool format
type OpenAITool = OpenAI.Chat.Completions.ChatCompletionTool;

/**
 * Helper function to generate a textual description of tools for the system prompt.
 * @param tools Array of ToolFunction objects.
 * @returns A string describing the available tools and instructions for simulated calls.
 */
function formatToolsForPrompt(tools: OpenAITool[]): string {
	if (!tools || tools.length === 0) {
		return 'No tools are available for use.';
	}

	const toolDescriptions = tools.map(tool => {
		if (tool.type !== 'function' || !tool.function) {
			return `  - Unknown tool type: ${tool.type}`;
		}
		const func = tool.function;
		// Safely access parameters and properties
		const parameters = func.parameters && typeof func.parameters === 'object' ? func.parameters : {};
		const properties = 'properties' in parameters ? parameters.properties : {};
		const requiredParams = 'required' in parameters && Array.isArray(parameters.required) ? parameters.required : [];

		const paramsJson = JSON.stringify(properties, null, 2);


		return `  - Name: ${func.name}\n    Description: ${func.description || 'No description'}\n    Parameters (JSON Schema): ${paramsJson}\n    Required Parameters: ${requiredParams.join(', ') || 'None'}`;
	}).join('\n\n');

	// Instructions updated for MULTIPLE tool calls using TOOL_CALLS and a JSON array
	// Added a note about fixed/consistent tool call IDs
	return `You have the following tools available:\n${toolDescriptions}\n\nTo use one or more tools, output the following JSON structure containing an ARRAY of tool calls on a new line *at the very end* of your response, and *only* if you intend to call tool(s). Ensure the arguments value in each call is a JSON *string*: \n\`\`\`json\nTOOL_CALLS: [ {"id": "call_001", "type": "function", "function": {"name": "function_name_1", "arguments": "{\\"arg1\\": \\"value1\\"}"}}, {"id": "call_002", "type": "function", "function": {"name": "function_name_2", "arguments": "{\\"argA\\": true, \\"argB\\": 123}"}} ]\n\`\`\`\nReplace \`function_name\` and arguments accordingly for each tool call you want to make. Put all desired calls in the array. IMPORTANT: Always include an 'id' field with a unique string for each call. Do not add any text after the TOOL_CALLS line. If you are not calling any tools, respond normally without the TOOL_CALLS structure.`;
}


/**
 * DeepSeek model provider implementation
 */
export class DeepSeekProvider extends OpenAIChat {
	constructor() {
		// Call the parent constructor with provider name, API key, and base URL
		super('deepseek', process.env.DEEPSEEK_API_KEY, 'https://api.deepseek.com/v1');
	}

	/**
	 * Prepares the request parameters specifically for DeepSeek models.
	 * Adjusts parameters based on the model, especially for 'deepseek-reasoner'.
	 * @param requestParams The original request parameters.
	 * @returns The modified request parameters suitable for DeepSeek.
	 */
	prepareParameters(requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
		// Check if the specific 'deepseek-reasoner' model is being used
		if (requestParams.model === 'deepseek-reasoner') {
			const originalTools: OpenAITool[] = requestParams.tools ?? [];

			// --- Parameter Adjustments ---
			requestParams.max_tokens = 8000; // Set a reasonable default if needed
			delete requestParams.tools;
			delete requestParams.response_format;
			delete requestParams.logprobs;
			delete requestParams.top_logprobs;
			if ('tool_choice' in requestParams) {
				delete requestParams.tool_choice;
			}

			// --- Message Transformation ---
			const transformedMessages: MessageParam[] = requestParams.messages.map(originalMessage => {
				// Create a shallow copy to avoid modifying the original request params directly if needed elsewhere
				let message: MessageParam = {...originalMessage};

				// Transform 'assistant' message with tool calls
				if (message.role === 'assistant' && message.tool_calls) {
					const calls = message.tool_calls.map(toolCall => {
						if (toolCall.type === 'function') {
							// Ensure arguments are stringified if they aren't already
							const args = typeof toolCall.function.arguments === 'string'
								? toolCall.function.arguments
								: JSON.stringify(toolCall.function.arguments);
							return `Called function '${toolCall.function.name}' with arguments: ${args}`;
						}
						return `(Unsupported tool call type: ${toolCall.type})`;
					}).join('\n');
					// Replace the original assistant message with a text description of the calls
					message = { role: 'assistant', content: `[Previous Action] ${calls}` };
				}
				// Transform 'tool' message into a 'user' message
				else if (message.role === 'tool') {
					const contentString = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
					const toolCallIdInfo = message.tool_call_id ? ` for call ID ${message.tool_call_id}` : '';
					// Replace the original tool message with a user message containing the result
					message = { role: 'user', content: `[Tool Result${toolCallIdInfo}] ${contentString}` };
				}
				// Return the potentially transformed message
				return message;
			});

			// --- Message Merging (FIXED) ---
			// Reduces messages by merging consecutive messages of the same role with string content.
			// This specifically addresses the issue where a 'tool' message transformed into 'user'
			// might follow an existing 'user' message.
			const mergedMessages: MessageParam[] = transformedMessages.reduce((acc: MessageParam[], currentMessage) => {
				const lastMessage = acc.length > 0 ? acc[acc.length - 1] : null;

				// Check if the last message exists and has the same role as the current one.
				if (lastMessage && lastMessage.role === currentMessage.role) {
					// Roles match. Now, ensure we can merge content meaningfully.
					// We prioritize merging if the current message has string content,
					// as the 'tool'->'user' transformation ensures this.
					const currentContent = currentMessage.content;

					if (typeof currentContent === 'string') {
						// Current content is a string, proceed with merge.
						// Treat null/undefined previous content as an empty string for concatenation.
						const lastContent = lastMessage.content ?? '';

						// Warn if the previous content wasn't a string or null, as merging might simplify complex data.
						if (typeof lastMessage.content !== 'string' && lastMessage.content !== null) {
							console.warn(`(${this.provider}) Merging string content from role '${currentMessage.role}' onto previous message whose content was not string/null (Type: ${typeof lastMessage.content}). Potential data structure loss.`);
						}

						// Perform the merge by appending to the last message's content.
						lastMessage.content = `${lastContent}\n${currentContent}`;

					} else {
						// Current content isn't a string (unexpected for tool->user or typical user/assistant messages).
						// Log a warning and append the current message separately to avoid errors/data loss.
						console.warn(`(${this.provider}) Cannot merge message for role '${currentMessage.role}' because its own content is not a string (Type: ${typeof currentContent}). Appending separately.`);
						acc.push({...currentMessage}); // Add a copy of the current message
					}
				} else {
					// Roles don't match, or it's the first message in the accumulator.
					// Add a copy of the current message separately.
					acc.push({...currentMessage});
				}
				// Return the accumulator for the next iteration.
				return acc;
			}, []); // Start with an empty accumulator array


			// --- System Message Consolidation & Tool Injection ---
			const systemContents: string[] = [];
			const otherMessages: MessageParam[] = [];
			mergedMessages.forEach(msg => {
				if (msg.role === 'system') {
					// Collect content from system messages
					if (msg.content && typeof msg.content === 'string') {
						systemContents.push(msg.content);
					} else if (msg.content) {
						// Attempt to stringify non-string system content (though usually it's string)
						console.warn(`(${this.provider}) System message content was not a string, attempting to stringify.`);
						try {
							systemContents.push(JSON.stringify(msg.content));
						} catch (e) {
							console.error(`(${this.provider}) Failed to stringify system message content:`, e);
							systemContents.push('[Error processing system message content]');
						}
					}
				} else {
					// Collect all non-system messages
					otherMessages.push(msg);
				}
			});

			// Generate tool descriptions and instructions
			const toolInfoForPrompt = formatToolsForPrompt(originalTools);
			// Add tool instructions to the system message contents
			systemContents.push(toolInfoForPrompt);

			let finalMessages: MessageParam[] = [];
			// Combine system messages into one at the start if any exist
			if (systemContents.length > 0) {
				const combinedSystemContent = systemContents.join('\n\n').trim();
				const combinedSystemMessage: MessageParam = { role: 'system', content: combinedSystemContent };
				finalMessages = [combinedSystemMessage, ...otherMessages];
			} else {
				// No system messages, just use the others
				finalMessages = otherMessages;
			}

			// Assign the processed messages back to the request parameters
			requestParams.messages = finalMessages;

			// --- Final Message Role Check (Simplified) ---
			// Ensure the last message is 'user' as required by some models/APIs
			// Removed the logic that swapped user -> assistant messages as it was potentially problematic.
			if (requestParams.messages.length === 0 || requestParams.messages[requestParams.messages.length - 1].role !== 'user') {
				// Handle cases where the list is empty or ends with non-user
				const aiName = process.env.AI_NAME || 'Magi'; // Use environment variable or default
				const placeholderContent = `${aiName} thoughts: Let me think about this for a moment...`;

				if (requestParams.messages.length > 0 && requestParams.messages[requestParams.messages.length - 1].role === 'system') {
					// If the only message(s) were system messages, add a user prompt
					requestParams.messages.push({ role: 'user', content: `${aiName} thoughts: Proceeding with the given instructions.` });
				}
					// --- Swapping logic removed ---
				// else if (requestParams.messages.length > 1 && ...) { ... swap ... }
				else if (requestParams.messages.length > 0) {
					// If the last message is non-user (system handled above, so likely assistant), add a placeholder user message
					console.log(`(${this.provider}) Final message role was not 'user' (was: ${requestParams.messages[requestParams.messages.length - 1].role}). Appending placeholder user message.`);
					requestParams.messages.push({ role: 'user', content: placeholderContent });
				} else {
					// If the message list was empty after processing, add a placeholder user message
					console.log(`(${this.provider}) Message list was empty after processing. Appending placeholder user message.`);
					requestParams.messages.push({ role: 'user', content: placeholderContent });
				}
			}
		} else {
			// If not 'deepseek-reasoner', delegate to the parent class's preparation
			return super.prepareParameters(requestParams);
		}
		// Return the modified parameters
		return requestParams;
	}
}

// Export a singleton instance of the provider
export const deepSeekProvider = new DeepSeekProvider();
