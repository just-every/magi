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
	RunnerConfig, ResponseInputItem, ResponseInputFunctionCall, ResponseInputFunctionCallOutput, ResponseInputMessage,
	TaskCompleteSignal, // Import the signal
	TaskFatalErrorSignal, // Import the signal
} from '../types.js';
import {Agent} from './agent.js';
import {getModelProvider} from '../model_providers/model_provider.js';
import {findModel, MODEL_CLASSES, ModelEntry} from '../model_providers/model_data.js';
import {getModelFromClass} from '../model_providers/model_provider.js';
import {processToolCall} from './tool_call.js';
import {capitalize} from './llm_utils.js';
import {getCommunicationManager} from './communication.js';

const EVENT_TIMEOUT_MS = 300000; // 5 min timeout for events

// Define a specific error type for clarity
class TimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TimeoutError';
	}
}


/**
 * Wraps an async generator stream to add inactivity timeout detection.
 * If no event is received within timeoutMs, it throws a TimeoutError.
 *
 * @param originalStream The stream to wrap.
 * @param timeoutMs The inactivity timeout duration in milliseconds.
 * @param identifier A string identifier for logging purposes (e.g., agent/model name).
 * @returns An async generator that yields events from the originalStream or throws on timeout.
 */
async function* createTimeoutProxyStream<T>(
	originalStream: AsyncGenerator<T>,
	timeoutMs: number,
	identifier: string // For logging context
): AsyncGenerator<T> {
	const iterator = originalStream[Symbol.asyncIterator]();
	let timeoutId: NodeJS.Timeout | null = null;

	// Function to create a promise that rejects after the timeout duration
	const createTimeoutPromise = (): Promise<never> => {
		return new Promise((_, reject) => {
			// Clear any existing timer before setting a new one
			if (timeoutId) clearTimeout(timeoutId);

			timeoutId = setTimeout(() => {
				const timeoutError = new TimeoutError(`[${identifier}] Stream timeout: No event received for ${timeoutMs / 1000} seconds`);
				console.error(`[TimeoutProxy] ${timeoutError.message}`);
				timeoutId = null; // Clear the timer ID as it has fired
				reject(timeoutError); // Reject the promise, signaling the timeout
			}, timeoutMs);
		});
	};

	try {
		while (true) {
			const timeoutPromise = createTimeoutPromise(); // Arm timeout for the next event/completion
			let result: IteratorResult<T>;

			try {
				// Wait for either the next stream event or the timeout promise to reject
				result = await Promise.race([
					iterator.next(),
					timeoutPromise
				]);

				// If iterator.next() resolved, it means we received an event OR the stream ended.
				// We need to clear the timeout timer because the race was won by iterator.next().
				if (timeoutId) clearTimeout(timeoutId);
				timeoutId = null; // Ensure timer ID is cleared

			} catch (error) {
				// This catch block handles rejection from EITHER iterator.next() OR timeoutPromise.
				if (timeoutId) clearTimeout(timeoutId); // Clean up timer if it exists
				timeoutId = null;

				// Re-throw the error (could be a stream error or our TimeoutError)
				// This will be caught by the try/catch in the calling function (runStreamed)
				throw error;
			}

			// Check if the stream iteration is done
			if (result.done) {
				// Stream finished normally, exit the loop. Cleanup already happened.
				break;
			} else {
				// Yield the event we received from the stream
				yield result.value;
				// Loop continues, createTimeoutPromise() will be called again to re-arm the timeout.
			}
		}
	} finally {
		// Final cleanup when the loop exits (normally or via error)
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		// Ensure the original stream iterator is properly closed if it supports it.
		if (typeof iterator.return === 'function') {
			try {
				await iterator.return(undefined);
			} catch(cleanupError) {
				console.error(`[TimeoutProxy] Error during iterator cleanup: ${cleanupError}`);
			}
		}
	}
}

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

		// Run the agent with the summarization prompt
		try {
			const summary = await this.runStreamedWithTools(agent, summarizationPrompt);
			return summary.trim();
		} catch (error) {
			console.error('Error summarizing content:', error);
			return `Failed to generate summary: ${error}`;
		}
	}

	/**
	 * Helper function to get the next fallback model, avoiding already tried ones.
	 * Special handling for rate-limited models to try paid alternatives.
	 */
	private static getNextFallbackModel(agent: Agent, triedModels: Set<string>, errorMessage?: string, lastModelEntry?: ModelEntry): string | undefined {
		if (errorMessage && (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) && lastModelEntry && lastModelEntry.rate_limit_fallback) {
			// Check if we already tried the paid model
			if (!triedModels.has(lastModelEntry.rate_limit_fallback)) {
				return lastModelEntry.rate_limit_fallback;
			}
		}

		// Standard fallback logic for other cases
		// The model that just failed or was initially selected
		let modelsToConsider: string[] = [];

		// 1. Consider models from the specified class (if any)
		const agentModelClass = agent.modelClass as keyof typeof MODEL_CLASSES;
		if (agent.modelClass && MODEL_CLASSES[agentModelClass]) {
			modelsToConsider = [...(MODEL_CLASSES[agentModelClass].models || [])];
		}

		// 2. Always add standard models as ultimate fallbacks (ensure no duplicates)
		const standardModels = MODEL_CLASSES['standard']?.models || [];
		standardModels.forEach(sm => {
			if (!modelsToConsider.includes(sm)) {
				modelsToConsider.push(sm);
			}
		});

		// 3. Filter out any already tried models
		// Note: We don't filter out `currentModel` here because it's added to triedModels *before* calling this
		const availableFallbacks = modelsToConsider.filter(model => !triedModels.has(model));

		// 4. Return the first available fallback, or undefined if none left
		return availableFallbacks.length > 0 ? availableFallbacks[0] : undefined;
	}


	/**
	 * Run an agent with streaming responses, including timeout handling and model fallbacks.
	 */
	static async* runStreamed(
		agent: Agent,
		input?: string,
		conversationHistory: ResponseInput = []
	): AsyncGenerator<StreamingEvent> {
		// Get initial model selection
		let selectedModel: string | undefined = agent.model || await getModelFromClass(agent.modelClass || 'standard');
		let attempt = 1;
		const triedModels = new Set<string>(); // Keep track of models attempted in this run

		// Prepare initial messages
		let messages: ResponseInput = [
			{role: 'developer', content: agent.instructions},
			...conversationHistory,
		];
		if(input) {
			messages.push({role: 'user', content: input});
		}

		// Allow agent onRequest hook
		if(agent.onRequest) {
			messages = await agent.onRequest(messages);
		}

		// --- Main loop for trying initial model and fallbacks ---
		while(selectedModel) {
			if (triedModels.has(selectedModel!)) {
				console.warn(`[Runner] Logic error: Attempting to re-try model ${selectedModel}. Skipping.`);
				// This shouldn't happen with the current logic, but safeguards are good.
				selectedModel = this.getNextFallbackModel(agent, triedModels);
				continue;
			}

			console.log(`[Runner] Attempt ${attempt}: Trying model ${selectedModel}`);
			triedModels.add(selectedModel); // Mark this model as tried *before* the attempt
			agent.model = selectedModel; // Update agent's current model for this attempt

			// Yield agent_start (first attempt) or agent_updated (fallback attempts)
			yield {
				type: attempt === 1 ? 'agent_start' : 'agent_updated',
				agent: agent.export(),
				...(attempt === 1 && input ? { input } : {})
			};

			try {
				// Get the model provider
				const provider = getModelProvider(selectedModel);

				// Ensure correct message sequence before sending
				const sequencedMessages = this.ensureToolResultSequence(messages);

				// Create the original stream from the provider
				const originalStream = provider.createResponseStream(
					selectedModel,
					sequencedMessages,
					agent
				);

				// Wrap the stream with our timeout proxy
				const streamWithTimeout = createTimeoutProxyStream(
					originalStream,
					EVENT_TIMEOUT_MS, // Use the existing constant
					`${agent.name || 'Agent'}:${selectedModel}` // Identifier for logs
				);

				// Process events from the proxied stream
				for await (const event of streamWithTimeout) {
					// Ensure the event reflects the currently used model
					event.agent = event.agent ? event.agent : agent.export();
					if (!event.agent.model) event.agent.model = selectedModel;

					// Check for errors explicitly yielded *by the stream content*
					if(event.type === 'error') {
						console.error(`[Runner] Stream yielded error event for model ${selectedModel}: ${event.error}`);
						// Treat yielded errors like other failures: throw to trigger fallback.
						throw new Error(event.error || 'Stream yielded an unspecified error');
					}
					else {
						yield event;
					}
				}

				// If the for await loop completes without error, this model succeeded.
				console.log(`[Runner] Model ${selectedModel} completed successfully.`);
				return; // Success: exit the generator function normally.

			} catch (error) {
				// --- Catch block for the current model attempt ---
				// This catches:
				// 1. TimeoutError thrown by createTimeoutProxyStream
				// 2. Errors thrown explicitly from the stream (e.g., event.type === 'error')
				// 3. Errors during provider.createResponseStream() or stream iteration itself.
				attempt++;

				// Pass the error message to help with detecting rate limits and special cases
				const errorMessage = error instanceof Error ? error.message : String(error);
				const lastModelEntry = findModel(selectedModel);

				// Yield an error event specific to this failed attempt
				if((errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) && lastModelEntry && lastModelEntry.rate_limit_fallback) {
					console.warn(`[Runner] Rate limted attempt ${attempt} with model ${selectedModel} failed: ${error}\nFalling back to ${lastModelEntry.rate_limit_fallback}`);
				}
				else {
					console.error(`[Runner] Attempt ${attempt} with model ${selectedModel} failed: ${error}`);
					yield {
						type: 'error',
						agent: agent.export(), // Agent state with the model that failed
						error: error instanceof Error ? error.message : String(error)
					};
				}

				// --- Fallback Logic ---
				selectedModel = this.getNextFallbackModel(agent, triedModels, errorMessage, lastModelEntry); // Find the next model to try

				if (!selectedModel) {
					console.error('[Runner] All models tried or no fallbacks available. Run failed.');
					// No more models left. The generator will implicitly finish here.
					return;
				} else {
					console.log('[Runner] Attempting fallback to next model:', selectedModel);
					// The while loop will continue with the new selectedModel
				}
			}
		} // End of while(selectedModel) loop

		// This point should only be reached if the initial model selection failed (selectedModel was null/undefined initially)
		console.error('[Runner] No suitable model found to even start the run.');
		yield {
			type: 'error',
			agent: agent.export(), // Agent state before attempting models
			error: 'No suitable initial model found for the specified criteria.'
		};
	} // End of runStreamed

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
		let thinkingResponse = '';
		let thinkingSignature = '';
		let collectedToolCalls: ToolCall[] = [];
		const collectedToolResults: { call_id: string, output: string }[] = [];

		try {
			conversationHistory = [...conversationHistory]; // Clone so that additional messages don't affect the original

			const stream = this.runStreamed(agent, input, conversationHistory);

			const comm = getCommunicationManager();
			for await (const event of stream) {
				// Call the event handler if provided
				comm.send(event);
				if (handlers.onEvent) {
					handlers.onEvent(event);
				}

				// Handle different event types
				const eventType = event.type as string;
				switch (eventType) {
					case 'message_delta':
						break;

					case 'message_complete': {
						// Accumulate the message content
						const message = event as MessageEvent;
						if (message.content) {
							fullResponse = message.content;
						}
						if (message.thinking_content) {
							thinkingResponse = message.thinking_content;
						}
						if (message.thinking_signature) {
							thinkingSignature = message.thinking_signature;
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

						// Process all tool calls in parallel, catching signals
						let toolResult: string | null = null; // Initialize to null
						try {
							toolResult = await processToolCall(toolEvent, agent, handlers);
						} catch (error) {
							// Check if it's one of our signals and re-throw it
							if (error instanceof TaskCompleteSignal || error instanceof TaskFatalErrorSignal) {
								console.log(`[Runner] Caught signal during tool processing: ${error.name}`);
								throw error; // Re-throw to stop further processing in this function
							}
							// Handle other tool execution errors
							console.error(`[Runner] Error during processToolCall: ${error}`);
							// Create an error result to send back to the model if needed,
							// or decide how to handle tool execution failures.
							// For now, let's create a generic error string.
							// We might want to make this more sophisticated later.
							toolResult = JSON.stringify({ error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}` });
							// Optionally, re-throw if tool errors should halt the process: throw error;
						}


						// Parse tool results for better logging (only if toolResult is not null)
						let parsedResults = null;
						if (toolResult !== null) {
							try {
								parsedResults = JSON.parse(toolResult);
							} catch (e) {
								parsedResults = toolResult; // Keep as string if not JSON
							}
						}
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


						// Send detailed tool result via event handler (only if results were processed)
						if (parsedResults !== null && handlers.onEvent) {
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
							} else if (parsedResults !== null) { // Check again for non-array, non-null case
								// If parsedResults is not an array, map it to the first tool call ID
								if (toolEvent.tool_calls.length > 0) {
									resultsById[toolEvent.tool_calls[0].id] = parsedResults;
								}
							}


							comm.send({
								agent: event.agent,
								type: 'tool_done',
								tool_calls: toolEvent.tool_calls,
								results: resultsById,
							});
							handlers.onEvent({
								agent: event.agent,
								type: 'tool_done',
								tool_calls: toolEvent.tool_calls,
								results: resultsById,
							});
						}
						break; // End of 'tool_start' case
					} // End of 'tool_start' case

					case 'error': {
						const errorEvent = event as any; // Type assertion for error event
						console.error(`[Error] ${errorEvent.error}`);
						break;
					}
				}
			}

			// Process tool call results if there were any tool calls AND no signal was thrown
			// The try/catch around processToolCall above would have re-thrown signals,
			// preventing execution from reaching this point if a signal occurred.
			if (agent.modelSettings?.tool_choice !== 'none' && collectedToolCalls.length > 0 && collectedToolResults.length > 0) {
				console.log(`[Runner] Collected ${collectedToolCalls.length} tool calls, running follow-up with results.`);

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

				if(thinkingResponse) {
					// Add the assistant's thinking
					messageItems.push({
						type: 'thinking',
						role: 'assistant',
						content: thinkingResponse,
						signature: thinkingSignature,
						status: 'completed'
					});
				}

				if(fullResponse) {
					// Add the assistant's response
					messageItems.push({
						type: 'message',
						role: 'assistant',
						content: fullResponse,
						status: 'completed'
					});
				}

				// Add the function calls
				for (const toolCall of collectedToolCalls) {
					// Skip adding to messageItems if the agent has onToolCall handler
					// The agent's onToolCall will use addHistory instead
					messageItems.push({
						type: 'function_call',
						call_id: toolCall.id,
						name: toolCall.function.name,
						arguments: toolCall.function.arguments
					});

					// Add the corresponding tool result
					const result = collectedToolResults.find(r => r.call_id === toolCall.id);
					if (result) {
						// Skip adding to messageItems if the agent has onToolResult handler
						// The agent's onToolResult will use addHistory instead
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

			// Handle structured JSON output if json_schema is specified
			if (agent.modelSettings?.json_schema) {
				try {
					// Try to parse the response as JSON
					let jsonResponse;
					try {
						jsonResponse = JSON.parse(fullResponse.trim());
						console.log(`[Runner] Successfully parsed JSON response for agent ${agent.name}`);
					} catch (error) {
						const jsonError = error as Error;
						// If we couldn't parse it directly, try to extract JSON from text
						const jsonMatch = fullResponse.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
							fullResponse.match(/({[\s\S]*})/);
							
						if (jsonMatch && jsonMatch[1]) {
							try {
								jsonResponse = JSON.parse(jsonMatch[1].trim());
								console.log(`[Runner] Extracted and parsed JSON from response for agent ${agent.name}`);
							} catch (err) {
								const extractError = err as Error;
								throw new Error(`Failed to parse extracted JSON: ${extractError.message}`);
							}
						} else {
							throw new Error(`Response is not valid JSON and no JSON block could be extracted: ${jsonError.message}`);
						}
					}
					
					// If force_json is true and parsing failed, we might want to retry
					// But for now, just use the successfully parsed result
					if (jsonResponse) {
						// Replace the full response with pretty-printed JSON
						fullResponse = JSON.stringify(jsonResponse, null, 2);
					}
				} catch (error) {
					console.error(`[Runner] Error handling JSON response for agent ${agent.name}:`, error);
					
					// If force_json is true, we could retry here
					if (agent.modelSettings?.force_json) {
						console.warn('[Runner] force_json is true but couldn\'t get valid JSON. Consider implementing retry logic.');
					}
				}
			}
			
			// Allow the agent to process the final response before returning
			if(agent.onResponse) {
				fullResponse = await agent.onResponse(fullResponse);
			}
			agent.model = undefined; // Allow a new model to be selected for the next run

			return fullResponse;
		} catch (error) {
			// Catch signals here as well to ensure they propagate up if they occurred
			// outside the specific tool processing block (e.g., during stream iteration).
			if (error instanceof TaskCompleteSignal || error instanceof TaskFatalErrorSignal) {
				console.log(`[Runner] Propagating signal from runStreamedWithTools: ${error.name}`);
				throw error; // Re-throw the signal
			}
			// Handle other errors
			console.error(`[Runner] Error in runStreamedWithTools: ${error}`);
			// Consider wrapping non-signal errors if needed, or just re-throw
			throw error; // Re-throw other errors
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

				// Prepare input messages for the current stage
				const stageInputMessages = [...(agentSequence[currentStage].input?.(history, lastOutput) || history)];

				let stageOutput: string | null = null; // To store the result string
				let directExecutionResult: ResponseInput | null = null; // To store the raw ResponseInput if executed directly

				// Check if the agent has a direct execution hook
				if (agent.tryDirectExecution) {
					directExecutionResult = await agent.tryDirectExecution(stageInputMessages);
				}

				if (directExecutionResult) {
					// Direct execution succeeded!
					console.log(`[Runner] Stage ${currentStage} executed directly via tryDirectExecution.`);
					// Extract the content string from the ResponseInput for logging/next stage input
					// Check if the first item is a message-like object with content
					if (Array.isArray(directExecutionResult) && directExecutionResult.length > 0) {
						const firstItem = directExecutionResult[0];
						if (firstItem && typeof firstItem === 'object' && 'content' in firstItem && firstItem.content !== undefined && firstItem.content !== null) {
							stageOutput = typeof firstItem.content === 'string'
								? firstItem.content
								: JSON.stringify(firstItem.content);
						}
					}
					
					if (stageOutput === null) {
						stageOutput = "Direct execution completed but response format was unexpected or content was empty.";
						console.warn(`[Runner] Unexpected response format or empty content from tryDirectExecution for stage ${currentStage}:`, directExecutionResult);
					}
					
					// Add the output to history and lastOutput
					addOutput(currentStage, stageOutput);

				} else {
					// Direct execution skipped or returned null, proceed with standard LLM call
					console.log(`[Runner] Stage ${currentStage} using standard LLM execution (runStreamedWithTools).`);
					stageOutput = await this.runStreamedWithTools(
						agent,
						undefined, // Input string is handled by the stage's input function
						stageInputMessages
					);
					// Add the output to history and lastOutput
					addOutput(currentStage, stageOutput);
				}


				// Determine the next stage based on the output string (ensure it's not null)
				const nextStage = agentSequence[currentStage].next(stageOutput ?? ""); // Use nullish coalescing for safety
				if (!nextStage) {
					console.log('[Runner] No next stage found, ending sequence.');
					break; // Exit the while loop
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
				if (error instanceof TaskCompleteSignal || error instanceof TaskFatalErrorSignal) {
					error.history = history; // Attach history to the error
					throw error; // Re-throw to stop further processing in this function
				}

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
	 * For orphaned 'function_call_output' messages (without a preceding 'function_call'),
	 * they are converted to regular messages.
	 *
	 * The process repeats until the array is stable (no changes made in a full pass).
	 *
	 * @param messages The array of ResponseInputItem messages to reorder.
	 * @returns A new array with messages correctly ordered (ResponseInput).
	 */
	public static ensureToolResultSequence(messages: ResponseInput): ResponseInput {
		// Work on a mutable copy
		const currentMessages: ResponseInput = [...messages]; // Use the specific type
		let changedInPass = false;

		// First, collect all function_call IDs to identify orphaned outputs later
		const functionCallIds = new Set<string>();
		for (const msg of currentMessages) {
			if (msg.type === 'function_call') {
				functionCallIds.add((msg as ResponseInputFunctionCall).call_id);
			}
		}

		// Check for orphaned function_call_output messages and convert them to regular messages
		for (let i = 0; i < currentMessages.length; i++) {
			const msg = currentMessages[i];
			if (msg.type === 'function_call_output') {
				const funcOutput = msg as ResponseInputFunctionCallOutput;

				// Check if this is an orphaned output (no matching function_call)
				if (!functionCallIds.has(funcOutput.call_id)) {
					console.warn(`[Runner] Found orphaned function_call_output with call_id ${funcOutput.call_id}. Converting to regular message.`);

					// Create a regular message with the function name and output as content
					const regularMessage: ResponseInputMessage = {
						role: 'user',
						type: 'message',
						content: `Tool result (${funcOutput.name}): ${funcOutput.output}`,
						status: 'completed'
					};

					// Replace the orphaned output with the regular message
					currentMessages[i] = regularMessage;
					changedInPass = true;
				}
			}
		}

		// Now do the regular pairing of function calls and outputs
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
						//console.debug(`[Runner] Correct sequence found for call_id ${targetCallId} at index ${i}.`);
						i += 2; // Skip the call and its output
						continue; // Continue the while loop
					} else {
						// Incorrect sequence or function_call is the last message.
						// We need to find the output or insert an error.
						//console.debug(`[Runner] Mismatch or missing output for call_id ${targetCallId} at index ${i}. Searching...`);
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
							//console.debug(`[Runner] Found matching output for ${targetCallId} at index ${foundOutputIndex}. Moving it to index ${i + 1}.`);
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
								status: 'incomplete',
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

		//console.debug('[Runner] Final message sequence ensured.');
		return currentMessages;
	}

	public static rotateModel(agent: Agent): string|undefined {
		let model = agent.model;

		if(agent.modelClass === 'monologue') {
			let models: string[] = [...MODEL_CLASSES[agent.modelClass].models];
			if(model) {
				// Try to use a different model if we can
				models = models.filter(newModel => newModel !== model);
			}
			if(models.length > 0) {
				// Pick a random model from this level
				models = models.sort(() => Math.random() - 0.5);
				model = models[0];
			}
		}

		return model;
	}
}
