/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import {
	StreamingEvent,
	ToolEvent,
	MessageEvent,
	ToolCall,
	ResponseInput,
	ToolCallHandler,
	RunnerConfig, ResponseInputItem, ResponseInputFunctionCall, ResponseInputFunctionCallOutput,
} from '../types.js';
import {Agent} from './agent.js';
import {getModelProvider} from '../model_providers/model_provider.js';
import {MODEL_CLASSES} from '../model_providers/model_data.js';
import {getModelFromClass} from '../model_providers/model_provider.js';
import {processToolCall} from './tool_call.js';
import {capitalize} from './llm_utils.js';
import {getCommunicationManager} from './communication.js';

/**
 * Agent runner class for executing agents with tools
 */
export class Runner {
	/**
	 * Run a summarization task using an agent
	 * @param agent The agent to use for summarization
	 * @param messages The messages to summarize
	 * @param maxTokens Optional maximum length of the summary
	 * @returns The summarized content
	 */
	static async summarizeContent(
		agent: Agent,
		messages: ResponseInput,
		maxTokens: number = 500
	): Promise<string> {
		// Convert the messages to a readable format
		const messagesText = messages.map(msg => {
			if('role' in msg && 'content' in msg) {
				const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
				return `Role: ${msg.role}\nContent: ${content}\n`;
			} else if('type' in msg && msg.type === 'function_call') {
				return `Tool Call: ${msg.name}\nArguments: ${msg.arguments}\n`;
			} else if('type' in msg && msg.type === 'function_call_output') {
				return `Tool Result: ${msg.name}\nOutput: ${msg.output}\n`;
			}
			return JSON.stringify(msg);
		}).join('\n---\n');

		// Prepare the summarization prompt
		const summarizationPrompt = `Summarize the following conversation history concisely, focusing on:
1. Key topics discussed
2. Important decisions or actions taken
3. Main user requests and assistant responses
4. Essential information only - omit repetitive or irrelevant details

Keep the summary clear and comprehensive while staying under ${maxTokens} tokens.

Conversation History:
${messagesText}

SUMMARY:`;

		// Define a handler to collect the output
		let summary = '';
		const handlers = {
			onResponse: (content: string) => {
				summary += content;
			}
		};

		// Run the agent with the summarization prompt
		try {
			await this.runStreamedWithTools(agent, summarizationPrompt, [], handlers);
			return summary.trim();
		} catch (error) {
			console.error('Error summarizing content:', error);
			return `Failed to generate summary: ${error}`;
		}
	}
	/**
	 * Run an agent with streaming responses
	 */
	static async* runStreamed(
		agent: Agent,
		input?: string,
		conversationHistory: ResponseInput = []
	): AsyncGenerator<StreamingEvent> {
		// Get our selected model for this run
		let selectedModel = agent.model || getModelFromClass(agent.modelClass || 'standard');

		// Prepare messages with conversation history and the current input
		let messages: ResponseInput = [
			// Add a system message with instructions
			{role: 'developer', content: agent.instructions},
			// Add conversation history
			...conversationHistory,
		];
		if(input) {
			// Add the user input message
			messages.push({role: 'user', content: input});
		}

		try {
			// Allow the agent to modify the messages before sending
			if(agent.onRequest) {
				let delay:number;
				[messages, selectedModel, delay] = await agent.onRequest(messages, selectedModel);
				if(delay) {
					await new Promise(resolve => setTimeout(resolve, delay * 1000));
				}
			}

			agent.model = selectedModel;
			yield {
				type: 'agent_start',
				agent: agent.export(),
				input,
			};

			// Get the model provider based on the selected model
			const provider = getModelProvider(selectedModel);

			// Ensure correct message sequence before sending to the provider
			const sequencedMessages = this.ensureToolResultSequence(messages);

			// Create a streaming generator
			const stream = provider.createResponseStream(
				selectedModel,
				sequencedMessages, // Use the sequenced messages
				agent
			);

			// Forward all events from the stream
			for await (const event of stream) {
				// Update the model in events to show the actually used model
				event.agent = event.agent ? event.agent : agent.export();
				if (!event.agent.model) event.agent.model = selectedModel;
				yield event;

				if(event.type === 'error') {
					// Make sure we try a different model instead
					throw event;
				}
			}
		} catch (error) {
			// If the model fails, try to find an alternative in the same class
			console.error(`[Runner] Error with model ${selectedModel}: ${error}`);

			// Try fallback strategies:
			// 1. If a model was explicitly specified but failed, try standard models
			// 2. If a model class was used, try other models in the class
			// 3. If all else fails, try the standard class

			console.log('[Runner] Attempting fallback to another model');

			// Get a list of models to try (combine explicitly requested model's class and standard)
			let modelsToTry: string[];

			// Always include standard models for fallback
			modelsToTry = [...MODEL_CLASSES['standard'].models];

			// If using a non-standard model class, add models from that class too
			if (agent.modelClass && agent.modelClass !== 'standard') {
				const classModels = MODEL_CLASSES[agent.modelClass as keyof typeof MODEL_CLASSES].models || [];
				if(classModels) {
					modelsToTry = [...classModels];
				}
			}

			// Make sure we don't try the same model that just failed
			modelsToTry = modelsToTry.filter(model => model !== selectedModel);

			// Try each potential fallback model
			for (const alternativeModel of modelsToTry) {
				try {
					console.log(`[Runner] Trying alternative model: ${alternativeModel}`);
					const alternativeProvider = getModelProvider(alternativeModel);

					// Update the agent's model
					agent.model = alternativeModel;
					yield {
						type: 'agent_updated',
						agent: agent.export()
					};

					// Ensure correct message sequence before sending to the alternative provider
					const sequencedFallbackMessages = this.ensureToolResultSequence(messages);

					// Try with the alternative model
					const alternativeStream = alternativeProvider.createResponseStream(
						alternativeModel,
						sequencedFallbackMessages, // Use the sequenced messages
						agent,
					);

					// Forward all events from the alternative stream
					for await (const event of alternativeStream) {
						// Update the model in events to show the actually used model
						event.agent = event.agent ? event.agent : agent.export();
						if (!event.agent.model) event.agent.model = alternativeModel;
						yield event;

						if(event.type === 'error') {
							// Make sure we try a different model instead
							throw event;
						}
					}

					// If we got here, the alternative model worked, so exit the loop
					console.log(`[Runner] Successfully switched to model: ${alternativeModel}`);
					return;
				} catch (alternativeError) {
					console.error(`[Runner] Alternative model ${alternativeModel} also failed: ${alternativeError}`);
					// Continue to the next model
				}
			}

			// If we got here, all fallback models failed
			console.error('[Runner] All fallback models failed');

			// Re-throw the original error if we couldn't recover
			yield {
				type: 'error',
				agent: agent.export(),
				error: `Error using model ${selectedModel} and all fallbacks failed: ${error}`
			};
		}
	}

	/**
	 * Unified function to run an agent with streaming and handle all events including tool calls
	 */
	static async runStreamedWithTools(
		agent: Agent,
		input?: string,
		conversationHistory: ResponseInput = [],
		handlers: ToolCallHandler = {},
		toolCallCount = 0 // Track the number of tool call iterations across recursive calls
	): Promise<string> {
		let fullResponse = '';
		let collectedToolCalls: ToolCall[] = [];
		const collectedToolResults: { call_id: string, output: string }[] = [];

		try {
			const stream = this.runStreamed(agent, input, conversationHistory);

			for await (const event of stream) {
				// Call the event handler if provided
				if (handlers.onEvent) {
					handlers.onEvent(event);
				}

				// Handle different event types
				const eventType = event.type as string;
				switch (eventType) {
					case 'message_delta':
					case 'message_done': // Legacy support
					case 'message_complete': {
						// Accumulate the message content
						const message = event as MessageEvent;
						if (message.content && message.content.trim()) {
							if (handlers.onResponse) {
								handlers.onResponse(message.content);
							}

							// Handle both the new 'message_complete' and legacy 'message_done'
							if (eventType === 'message_complete' || eventType === 'message_done') {
								fullResponse = message.content;
							}
						}
						break;
					}

					case 'tool_start': {
						// Process tool calls
						const toolEvent = event as ToolEvent;

						if (!toolEvent.tool_calls || toolEvent.tool_calls.length === 0) {
							continue;
						}

						// Collect tool calls for later use
						collectedToolCalls = [...collectedToolCalls, ...toolEvent.tool_calls];

						// Log tool calls for debugging
						toolEvent.tool_calls.forEach(call => {
							let parsedArgs = {};
							try {
								if (call.function.arguments && call.function.arguments.trim()) {
									parsedArgs = JSON.parse(call.function.arguments);
								}
							} catch (parseError) {
								console.error('Error parsing tool arguments:', parseError);
								parsedArgs = {_raw: call.function.arguments};
							}

							console.log(`[Tool Call] ${call.function.name}:`, parsedArgs);
						});

						// Process all tool calls in parallel
						const toolResult = await processToolCall(toolEvent, agent, handlers);

						// Parse tool results for better logging
						let parsedResults;
						try {
							parsedResults = JSON.parse(toolResult);
						} catch (e) {
							parsedResults = toolResult;
						}

						// Store tool results for subsequent model call
						if (Array.isArray(parsedResults)) {
							for (let i = 0; i < parsedResults.length; i++) {
								const result = parsedResults[i];
								// Associate result with the tool call ID
								if (i < toolEvent.tool_calls.length) {
									collectedToolResults.push({
										call_id: toolEvent.tool_calls[i].id,
										output: typeof result === 'string' ? result : JSON.stringify(result)
									});
								}
							}
						} else {
							// If there's just one result for potentially multiple calls
							const resultStr = typeof parsedResults === 'string' ?
								parsedResults : JSON.stringify(parsedResults);

							// Associate with the first tool call
							if (toolEvent.tool_calls.length > 0) {
								collectedToolResults.push({
									call_id: toolEvent.tool_calls[0].id,
									output: resultStr
								});
							}
						}

						// Send detailed tool result via event handler
						if (handlers.onEvent) {
							// Create a resultsById object that maps tool call IDs to their results
							const resultsById: Record<string, unknown> = {};

							// If parsedResults is an array, iterate through it and map each result to the corresponding tool call ID
							if (Array.isArray(parsedResults)) {
								for (let i = 0; i < parsedResults.length; i++) {
									// Associate result with the tool call ID if it exists
									if (i < toolEvent.tool_calls.length) {
										resultsById[toolEvent.tool_calls[i].id] = parsedResults[i];
									}
								}
							} else {
								// If parsedResults is not an array, map it to the first tool call ID
								if (toolEvent.tool_calls.length > 0) {
									resultsById[toolEvent.tool_calls[0].id] = parsedResults;
								}
							}

							handlers.onEvent({
								agent: event.agent,
								type: 'tool_done',
								tool_calls: toolEvent.tool_calls,
								results: resultsById,
							});
						}
						break;
					}

					case 'error': {
						const errorEvent = event as any; // Type assertion for error event
						console.error(`[Error] ${errorEvent.error}`);
						break;
					}
				}
			}

			// Process tool call results if there were any tool calls
			if (collectedToolCalls.length > 0 && collectedToolResults.length > 0) {
				console.log(`[Runner] Collected ${collectedToolCalls.length} tool calls, running follow-up with results`);

				// Increment tool call count
				toolCallCount++;
				console.log(`[Runner] Tool call iteration ${toolCallCount} of ${agent.maxToolCalls} maximum`);

				// Check if we've reached the maximum number of tool calls
				if (toolCallCount >= agent.maxToolCalls) {
					console.log('**********************************************');
					console.log(`[Runner] REACHED MAXIMUM TOOL CALLS (${agent.maxToolCalls})`);
					console.log('[Runner] Forcing model to return a final answer and not use more tools');
					console.log('**********************************************');
					// On the last attempt, don't allow more tool calls
					if (!agent.modelSettings) {
						agent.modelSettings = {};
					}
					agent.modelSettings.tool_choice = 'none';
				} else if (toolCallCount === 1) {
					// After the first tool call, set tool_choice to 'auto' to prevent repetitive tool calling
					if (!agent.modelSettings) {
						agent.modelSettings = {};
					}
					agent.modelSettings.tool_choice = 'auto';
				}

				// Create tool call messages for the next model request
				let toolCallMessages: ResponseInput = [];

				// Add previous history and input
				toolCallMessages.push(...conversationHistory);
				if(input) {
					toolCallMessages.push({role: 'user', content: input});
				}

				// We need to create messages with the proper format for the responses API
				// We need to convert our regular messages to the correct format

				// Start with initial messages - convert standard message format to responses format
				const messageItems: ResponseInput = [...conversationHistory];

				if(input) {
					// Add the user input message
					messageItems.push({
						type: 'message',
						role: 'user',
						content: input
					});
				}

				// Add the function calls
				for (const toolCall of collectedToolCalls) {
					messageItems.push({
						type: 'function_call',
						call_id: toolCall.id,
						name: toolCall.function.name,
						arguments: toolCall.function.arguments
					});

					// Add the corresponding tool result
					const result = collectedToolResults.find(r => r.call_id === toolCall.id);
					if (result) {
						messageItems.push({
							type: 'function_call_output',
							call_id: toolCall.id,
							name: toolCall.function.name,
							output: result.output
						});
					}
				}

				// Use the input array as our messages
				toolCallMessages = messageItems; // Use the collected items directly

				// Run the agent again with the tool results
				console.log('[Runner] Running agent with tool call results');

				const followUpResponse = await this.runStreamedWithTools(
					agent,
					'', // No new user input is needed, history contains results
					toolCallMessages,
					handlers,
					toolCallCount // Pass the current toolCallCount to track across recursive calls
				);

				// Use the follow-up response as the final response
				if (followUpResponse) {
					fullResponse = followUpResponse;
				}
			}

			// If there's a response handler, call it with the final complete response
			if (handlers.onComplete) {
				handlers.onComplete();
			}

			// Allow the agent to process the final response before returning
			if(agent.onResponse) {
				fullResponse = await agent.onResponse(fullResponse);
			}
			agent.model = undefined; // Allow a new model to be selected for the next run

			return fullResponse;
		} catch (error) {
			console.error(`Error in runStreamedWithTools: ${error}`);
			throw error;
		}
	}

	/**
	 * Runs a sequence of agents where each agent can pass data to the next agent in the chain.
	 * The sequence continues until either all agents have run, a failure occurs, or the maximum
	 * retry count is reached for any stage.
	 *
	 * @param agentSequence An object mapping stage names to agent factory functions
	 * @param input The initial input to the first agent
	 * @param maxRetries Maximum number of retries per stage before giving up
	 * @param maxTotalRetries Maximum total retries across all stages before giving up
	 * @returns The final response from the last successful agent in the chain
	 */
	static async runSequential(
		agentSequence: RunnerConfig,
		input: string,
		maxRetries: number = 3,
		maxTotalRetries: number = 10,
	): Promise<string> {

		const history: ResponseInput = [{role: 'user', content: input}];
		const lastOutput: Record<string, string> = {};
		let agent_id: string = '';

		let currentStage = Object.keys(agentSequence)[0]; // Start with the first stage
		let totalRetries = 0;
		const stageRetries: Record<string, number> = {};

		const comm = getCommunicationManager();

		comm.send({
			type: 'process_running',
			history,
		});

		function addOutput(stage: string, output: string) {
			// Record in the history
			history.push({
				type: 'message',
				role: 'assistant',
				status: 'completed',
				content: `${capitalize(stage)} Output:\n${output}`,
			});

			// Record in the last for this stage
			lastOutput[stage] = output;

			// Send update to parent process
			comm.send({
				type: 'process_updated',
				output: `${capitalize(stage)} Output:\n${output}`,
				history,
			});
		}

		// Process the sequence of agents
		while (currentStage && totalRetries < maxTotalRetries) {
			console.log(`[Runner] Running sequential stage: ${currentStage}`);

			// Initialize retry counter for this stage if not already set
			stageRetries[currentStage] = stageRetries[currentStage] || 0;

			try {
				const agent = agentSequence[currentStage].agent();
				if(!agent_id) {
					// Save agent_id for future runs
					agent_id = agent.agent_id;
				}
				else {
					// If we have an agent_id, make sure we use the same one
					agent.agent_id = agent_id;
				}

				// Run the agent with the current input
				const response = await this.runStreamedWithTools(
					agent,
					undefined,
					[...(agentSequence[currentStage].input?.(history, lastOutput) || history)],
					{
						// Forward all events to the communication channel
						onEvent: (event: StreamingEvent) => {
							comm.send(event);
						},
					}
				);

				addOutput(currentStage, response);

				const nextStage = agentSequence[currentStage].next(response);
				if(!nextStage) {
					console.log('[Runner] No next stage found, ending sequence.');
					break;
				}

				// Check that if the next stage is going backwards
				const stages = Object.keys(agentSequence);
				const currentIndex = stages.indexOf(currentStage);
				const nextIndex = nextStage ? stages.indexOf(nextStage) : -1;
				if (nextStage && nextIndex < currentIndex) {

					// Only increment retries when we're looping back to an earlier stage
					stageRetries[currentStage]++;
					totalRetries++;

					// Retry this stage unless we've hit the limit
					if (stageRetries[currentStage] >= maxRetries) {
						console.error(`[Runner] Exceeded max retries for stage ${currentStage}`);
						break;
					}
				}

				// We have another stage, to loop again
				currentStage = nextStage;

			} catch (error) {
				console.error(`[Runner] Error in sequential stage ${currentStage}: ${error}`);

				// Record the error as a failure
				addOutput(currentStage, `Error: ${error}`);

				// Increment retry counters
				stageRetries[currentStage]++;
				totalRetries++;

				// Retry this stage unless we've hit the limit
				if (stageRetries[currentStage] >= maxRetries) {
					console.error(`[Runner] Exceeded max retries for stage ${currentStage}`);
					break;
				}
			}
		}

		let output = '';
		Object.keys(lastOutput).forEach((key) => {
			if (lastOutput[key]) {
				output += `${capitalize(key)} Output:\n${lastOutput[key]}\n\n`;
			}
		});

		comm.send({
			type: 'process_done',
			output,
			history,
		});

		return output;
	}


	/**
	 * Reorders messages iteratively to ensure that every 'function_call' message
	 * is immediately followed by its corresponding 'function_call_output' message.
	 *
	 * If a matching 'function_call_output' is found later in the array, it's moved.
	 * If no matching 'function_call_output' is found for a 'function_call',
	 * an artificial error 'function_call_output' is inserted.
	 *
	 * The process repeats until the array is stable (no changes made in a full pass).
	 *
	 * @param messages The array of ResponseInputItem messages to reorder.
	 * @returns A new array with messages correctly ordered (ResponseInput).
	 */
	public static ensureToolResultSequence(messages: ResponseInput): ResponseInput {
		// Work on a mutable copy
		const currentMessages: ResponseInput = [...messages]; // Use the specific type
		let changedInPass: boolean;

		console.debug('[Runner] Starting tool result sequence check...');

		do {
			changedInPass = false;
			// No need for numMessages if using while loop with dynamic length check
			let i = 0; // Use a while loop or manual index management due to potential splices

			while (i < currentMessages.length /* Recalculate length each time */ ) {
				const currentMsg: ResponseInputItem = currentMessages[i]; // Use the specific type

				if (currentMsg.type && currentMsg.type === 'function_call') {
					// Assert type now that we've checked it
					const functionCallMsg = currentMsg as ResponseInputFunctionCall;
					const targetCallId = functionCallMsg.call_id;
					const nextMsgIndex = i + 1;
					const nextMsg: ResponseInputItem | null = nextMsgIndex < currentMessages.length ? currentMessages[nextMsgIndex] : null;

					// Check if the next message is the corresponding output
					const isNextMsgCorrectOutput = nextMsg &&
						nextMsg.type && nextMsg.type === 'function_call_output' &&
						(nextMsg as ResponseInputFunctionCallOutput).call_id === targetCallId;

					if (isNextMsgCorrectOutput) {
						// Correct pair found, move past both
						console.debug(`[Runner] Correct sequence found for call_id ${targetCallId} at index ${i}.`);
						i += 2; // Skip the call and its output
						continue; // Continue the while loop
					} else {
						// Incorrect sequence or function_call is the last message.
						// We need to find the output or insert an error.
						console.debug(`[Runner] Mismatch or missing output for call_id ${targetCallId} at index ${i}. Searching...`);
						changedInPass = true; // Signal that a change is needed/made in this pass
						let foundOutputIndex = -1;

						// Search *after* the current function_call for the matching output
						for (let j = i + 1; j < currentMessages.length; j++) {
							const potentialOutput = currentMessages[j];
							// Check type and call_id
							if (
								potentialOutput.type &&
								potentialOutput.type === 'function_call_output' &&
								(potentialOutput as ResponseInputFunctionCallOutput).call_id === targetCallId
							) {
								foundOutputIndex = j;
								break;
							}
						}

						if (foundOutputIndex !== -1) {
							// Found the output later in the array. Move it.
							console.debug(`[Runner] Found matching output for ${targetCallId} at index ${foundOutputIndex}. Moving it to index ${i + 1}.`);
							// Remove the found output (which is ResponseInputFunctionCallOutput)
							const [outputMessage] = currentMessages.splice(foundOutputIndex, 1);
							// Insert it right after the function call
							currentMessages.splice(i + 1, 0, outputMessage);

						} else {
							// Output not found anywhere in the array. Create and insert an error output.
							console.warn(`[Runner] No matching output found for call_id ${targetCallId}. Inserting error message.`);
							// Create an object conforming to ResponseInputFunctionCallOutput
							const errorOutput: ResponseInputFunctionCallOutput = {
								type: 'function_call_output',
								call_id: targetCallId,
								// Use the name from the original function call
								name: functionCallMsg.name,
								// Output must be a string according to the interface
								output: JSON.stringify({ error: 'Error: Tool call did not complete or output was missing.' }),
								// Add optional fields if necessary, or leave them undefined
								// status: 'incomplete',
							};
							// Insert the error message right after the function call
							currentMessages.splice(i + 1, 0, errorOutput);
						}

						// Crucial: Restart check from the beginning in the next pass
						break; // Exit the inner `while` loop
					}
				} else {
					// Not a function call, just move to the next message
					i++;
				}
			} // End of inner while loop

		} while (changedInPass); // Repeat if any changes were made in the last pass

		console.debug('[Runner] Final message sequence ensured.');
		return currentMessages;
	}
}
