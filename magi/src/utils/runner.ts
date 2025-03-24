/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import {StreamingEvent, ToolEvent, MessageEvent, ToolCall, ResponseInput, RunStatus, RunResult} from '../types.js';
import {Agent} from './agent.js';
import {getModelProvider} from '../model_providers/model_provider.js';
import {MODEL_GROUPS} from '../magi_agents/constants.js';
import {getModelFromClass} from '../model_providers/model_provider.js';
import {processToolCall} from './tool_call.js';

/**
 * Agent runner class for executing agents with tools
 */
export class Runner {
	/**
	 * Run an agent with streaming responses
	 */
	static async* runStreamed(
		agent: Agent,
		input: string,
		conversationHistory: ResponseInput = []
	): AsyncGenerator<StreamingEvent> {
		// Get our selected model for this run
		const selectedModel = agent.model || getModelFromClass(agent.modelClass || 'standard');

		// Get the model provider based on the selected model
		const provider = getModelProvider(selectedModel);

		// Prepare messages with conversation history and the current input
		const messages: ResponseInput = [
			// Add a system message with instructions
			{role: 'system', content: agent.instructions},
			// Add conversation history
			...conversationHistory,
			// Add the current user input
			{role: 'user', content: input}
		];

		try {
			agent.model = selectedModel;
			yield {
				type: 'agent_start',
				agent: agent.export(),
				input,
			};

			// Create a streaming generator
			const stream = provider.createResponseStream(
				selectedModel,
				messages,
				agent.tools,
				agent.modelSettings
			);

			// Forward all events from the stream
			for await (const event of stream) {
				// Update the model in events to show the actually used model
				event.agent = event.agent ? event.agent : agent.export();
				if (!event.agent.model) event.agent.model = selectedModel;
				yield event;
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
			modelsToTry = [...MODEL_GROUPS['standard']];

			// If using a non-standard model class, add models from that class too
			if (agent.modelClass && agent.modelClass !== 'standard') {
				const classModels = MODEL_GROUPS[agent.modelClass as keyof typeof MODEL_GROUPS] || [];
				modelsToTry = [...classModels, ...modelsToTry];
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

					// Try with the alternative model
					const alternativeStream = alternativeProvider.createResponseStream(
						alternativeModel,
						messages,
						agent.tools,
						agent.modelSettings
					);

					// Forward all events from the alternative stream
					for await (const event of alternativeStream) {
						// Update the model in events to show the actually used model
						yield event;
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
		input: string,
		conversationHistory: ResponseInput = [],
		handlers: {
			onEvent?: (event: StreamingEvent) => void,
			onResponse?: (content: string) => void,
			onComplete?: () => void
		} = {}
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
						const toolResult = await processToolCall(toolEvent, agent);

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
							handlers.onEvent({
								agent: event.agent,
								type: 'tool_done',
								tool_calls: toolEvent.tool_calls,
								results: parsedResults,
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

				// Create tool call messages for the next model request
				let toolCallMessages: ResponseInput = [];

				// Add previous history and input
				toolCallMessages.push(...conversationHistory);
				toolCallMessages.push({role: 'user', content: input});

				// We need to create messages with the proper format for the responses API
				// We need to convert our regular messages to the correct format

				// Start with initial messages - convert standard message format to responses format
				const messageItems: ResponseInput = [...conversationHistory];

				// Add the user input message
				messageItems.push({
					type: 'message',
					role: 'user',
					content: input
				});

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
							output: result.output
						});
					}
				}

				// Use the input array as our messages
				toolCallMessages = messageItems;

				// Run the agent again with the tool results
				console.log('[Runner] Running agent with tool call results');

				const followUpResponse = await this.runStreamedWithTools(
					agent,
					'', // No new user input is needed
					toolCallMessages,
					handlers
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
	 * @param initialStage The name of the first stage to execute
	 * @param maxRetries Maximum number of retries per stage before giving up
	 * @param maxTotalRetries Maximum total retries across all stages before giving up
	 * @param handlers Event handlers for streaming events
	 * @returns The final response from the last successful agent in the chain
	 */
	static async runSequential(
		agentSequence: Record<string, (metadata?: any) => Agent>,
		input: string,
		initialStage: string,
		maxRetries: number = 3,
		maxTotalRetries: number = 10,
		handlers: {
			onEvent?: (event: StreamingEvent, stage: string) => void,
			onResponse?: (content: string, stage: string) => void,
			onStageComplete?: (stage: string, result: RunResult) => void,
			onComplete?: (allResults: Record<string, RunResult>) => void
		} = {}
	): Promise<Record<string, RunResult>> {
		// Validate inputs
		if (!agentSequence[initialStage]) {
			throw new Error(`Initial stage "${initialStage}" not found in agent sequence`);
		}

		const results: Record<string, RunResult> = {};
		let currentStage = initialStage;
		let currentInput = input;
		let currentMetadata: any = null;
		let totalRetries = 0;
		const stageRetries: Record<string, number> = {};

		// Create event handler wrappers that include the current stage
		const stageEventHandler = handlers.onEvent
			? (event: StreamingEvent) => handlers.onEvent!(event, currentStage)
			: undefined;

		const stageResponseHandler = handlers.onResponse
			? (content: string) => handlers.onResponse!(content, currentStage)
			: undefined;

		// Process the sequence of agents
		while (currentStage && totalRetries < maxTotalRetries) {
			console.log(`[Runner] Running sequential stage: ${currentStage}`);

			// Initialize retry counter for this stage if not already set
			stageRetries[currentStage] = stageRetries[currentStage] || 0;

			// Check if we've exceeded the max retries for this stage
			if (stageRetries[currentStage] >= maxRetries) {
				console.error(`[Runner] Exceeded max retries (${maxRetries}) for stage: ${currentStage}`);
				results[currentStage] = {
					status: RunStatus.FAILURE,
					response: `Exceeded maximum retries (${maxRetries}) for this stage.`
				};
				break;
			}

			try {
				// Create the agent for this stage using current metadata (if any)
				const agent = agentSequence[currentStage](currentMetadata);

				// Run the agent with the current input
				const response = await this.runStreamedWithTools(
					agent,
					currentInput,
					[], // No conversation history for sequential runs
					{
						onEvent: stageEventHandler,
						onResponse: stageResponseHandler
					}
				);

				// Parse the response to determine next steps
				// We'll look for specific markers in the response to decide what to do

				// Default successful result assuming standard progression
				const result: RunResult = {
					status: RunStatus.SUCCESS,
					response
				};

				// Check for specific markers in the response
				if (response.includes('STATUS: NEEDS_RETRY') || response.includes('STATUS:NEEDS_RETRY')) {
					result.status = RunStatus.NEEDS_RETRY;
					stageRetries[currentStage]++;
					totalRetries++;
					console.log(`[Runner] Stage ${currentStage} requires retry (${stageRetries[currentStage]}/${maxRetries})`);
				} else if (response.includes('STATUS: FAILURE') || response.includes('STATUS:FAILURE')) {
					result.status = RunStatus.FAILURE;
					console.error(`[Runner] Stage ${currentStage} failed`);
				} else {
					// Look for "NEXT: {stage_name}" pattern to determine the next stage
					const nextStageMatch = response.match(/NEXT:\s*(\w+)/i);
					if (nextStageMatch && nextStageMatch[1] && agentSequence[nextStageMatch[1]]) {
						result.next = nextStageMatch[1];
					} else {
						// If no explicit next stage, determine next stage based on sequence order
						const stages = Object.keys(agentSequence);
						const currentIndex = stages.indexOf(currentStage);
						if (currentIndex < stages.length - 1) {
							result.next = stages[currentIndex + 1];
						}
					}

					// Look for JSON metadata in the response using the pattern "METADATA: {...}"
					const metadataMatch = response.match(/METADATA:\s*({.*})/s);
					if (metadataMatch && metadataMatch[1]) {
						try {
							result.metadata = JSON.parse(metadataMatch[1]);
						} catch (err) {
							console.warn(`[Runner] Failed to parse metadata JSON: ${err}`);
						}
					}
				}

				// Store the result for this stage
				results[currentStage] = result;

				// Call the stage complete handler if provided
				if (handlers.onStageComplete) {
					handlers.onStageComplete(currentStage, result);
				}

				// If this stage failed or needs retry, handle accordingly
				if (result.status === RunStatus.FAILURE) {
					break; // Stop the sequence on failure
				} else if (result.status === RunStatus.NEEDS_RETRY) {
					// We'll retry this same stage
					continue;
				}

				// Move to the next stage if there is one
				if (result.next) {
					// Use the output of this stage as input to the next, plus any metadata
					currentStage = result.next;
					currentInput = response;
					currentMetadata = result.metadata;
				} else {
					// No next stage, we're done
					break;
				}
			} catch (error) {
				console.error(`[Runner] Error in sequential stage ${currentStage}: ${error}`);

				// Record the error as a failure
				results[currentStage] = {
					status: RunStatus.FAILURE,
					response: `Error: ${error}`
				};

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

		// Call the completion handler with all results
		if (handlers.onComplete) {
			handlers.onComplete(results);
		}

		return results;
	}
}
