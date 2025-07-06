/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import type {
    ResponseInput,
    ResponseInputItem,
    ResponseInputFunctionCall,
    ResponseInputFunctionCallOutput,
    ResponseInputMessage,
    StreamEventType,
    MessageEvent,
} from '@just-every/ensemble';
import {
    Agent,
    ensembleRequest,
    MODEL_CLASSES,
    ModelClassID,
    ModelEntry,
    getModelFromClass,
} from '@just-every/ensemble';

import { getCommunicationManager } from './communication.js';
import type { ResponseOutputEvent } from '@just-every/ensemble/dist/types/types.js';

/**
 * Agent runner class for executing agents with tools
 */
export class Runner {
    /**
     * Helper function to get the next fallback model, avoiding already tried ones.
     * Special handling for rate-limited models to try paid alternatives.
     */
    private static getNextFallbackModel(
        agent: Agent,
        triedModels: Set<string>,
        errorMessage?: string,
        lastModelEntry?: ModelEntry
    ): string | undefined {
        if (
            errorMessage &&
            (errorMessage.includes('429') ||
                errorMessage.includes('Too Many Requests')) &&
            lastModelEntry &&
            lastModelEntry.rate_limit_fallback
        ) {
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
            modelsToConsider = [
                ...(MODEL_CLASSES[agentModelClass].models || []),
            ];
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
        const availableFallbacks = modelsToConsider.filter(
            model => !triedModels.has(model)
        );

        // 4. Return the first available fallback, or undefined if none left
        return availableFallbacks.length > 0
            ? availableFallbacks[0]
            : undefined;
    }

    /**
     * Unified function to run an agent with streaming and handle all events including tool calls
     */
    static async runStreamedWithTools(
        agent: Agent,
        input?: string,
        conversationHistory: ResponseInput = [],
        communicationManager?: any // Add optional communicationManager parameter
    ): Promise<string> {
        try {
            const messageItems: ResponseInput = [...conversationHistory];

            if (input) {
                messageItems.push({
                    type: 'message',
                    role: 'user',
                    content: input,
                });
            }

            let fullResponse = '';
            const comm = communicationManager || getCommunicationManager();

            // Send agent_start event if this is a sub-agent (has parent_id)
            if (agent.parent_id) {
                comm.send({
                    type: 'agent_start',
                    agent: {
                        agent_id: agent.agent_id,
                        name: agent.name,
                        model: agent.model,
                        modelClass: agent.modelClass,
                        parent_id: agent.parent_id,
                    },
                    input: input,
                });
            }

            const stream = ensembleRequest(messageItems, agent);
            for await (const event of stream) {
                const eventType = event.type as StreamEventType;
                if (eventType === 'response_output') {
                    messageItems.push((event as ResponseOutputEvent).message);
                }
                if (eventType === 'message_complete') {
                    fullResponse = (event as MessageEvent).content;
                }
            }

            return fullResponse;
        } catch (error) {
            // Handle other errors
            console.error(`[Runner] Error in runStreamedWithTools: ${error}`);
            // Consider wrapping non-signal errors if needed, or just re-throw
            throw error; // Re-throw other errors
        }
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
    public static ensureToolResultSequence(
        messages: ResponseInput
    ): ResponseInput {
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
                    console.warn(
                        `[Runner] Found orphaned function_call_output with call_id ${funcOutput.call_id}. Converting to regular message.`
                    );

                    // Create a regular message with the function name and output as content
                    const regularMessage: ResponseInputMessage = {
                        role: 'user',
                        type: 'message',
                        content: `Tool result (${funcOutput.name || 'unknown_tool'}): ${funcOutput.output}`, // Added fallback for optional name
                        status: 'completed',
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

            while (
                i < currentMessages.length /* Recalculate length each time */
            ) {
                const currentMsg: ResponseInputItem = currentMessages[i]; // Use the specific type

                if (currentMsg.type && currentMsg.type === 'function_call') {
                    // Assert type now that we've checked it
                    const functionCallMsg =
                        currentMsg as ResponseInputFunctionCall;
                    const targetId = functionCallMsg.id;
                    const targetCallId = functionCallMsg.call_id;
                    const nextMsgIndex = i + 1;
                    const nextMsg: ResponseInputItem | null =
                        nextMsgIndex < currentMessages.length
                            ? currentMessages[nextMsgIndex]
                            : null;

                    // Check if the next message is the corresponding output
                    const isNextMsgCorrectOutput =
                        nextMsg &&
                        nextMsg.type &&
                        nextMsg.type === 'function_call_output' &&
                        (nextMsg as ResponseInputFunctionCallOutput).call_id ===
                            targetCallId;

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
                                potentialOutput.type ===
                                    'function_call_output' &&
                                (
                                    potentialOutput as ResponseInputFunctionCallOutput
                                ).call_id === targetCallId
                            ) {
                                foundOutputIndex = j;
                                break;
                            }
                        }

                        if (foundOutputIndex !== -1) {
                            // Found the output later in the array. Move it.
                            //console.debug(`[Runner] Found matching output for ${targetCallId} at index ${foundOutputIndex}. Moving it to index ${i + 1}.`);
                            // Remove the found output (which is ResponseInputFunctionCallOutput)
                            const [outputMessage] = currentMessages.splice(
                                foundOutputIndex,
                                1
                            );
                            // Insert it right after the function call
                            currentMessages.splice(i + 1, 0, outputMessage);
                        } else {
                            // Output not found anywhere in the array. Create and insert an error output.
                            console.warn(
                                `[Runner] No matching output found for call_id ${targetCallId}. Inserting error message.`
                            );
                            // Create an object conforming to ResponseInputFunctionCallOutput
                            const errorOutput: ResponseInputFunctionCallOutput =
                                {
                                    type: 'function_call_output',
                                    id: targetId,
                                    call_id: targetCallId,
                                    // Use the name from the original function call
                                    name: functionCallMsg.name,
                                    // Output must be a string according to the interface
                                    output: JSON.stringify({
                                        error: 'Error: Tool call did not complete or output was missing.',
                                    }),
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

    public static async rotateModel(
        agent: Agent,
        modelClass?: ModelClassID
    ): Promise<string | undefined> {
        // Use the ensemble's getModelFromClass to select a model
        // If modelClass is provided, use it; otherwise use the agent's modelClass or 'standard' as default
        const classToUse =
            modelClass || agent.modelClass || ('standard' as ModelClassID);
        return getModelFromClass(classToUse);
    }
}
