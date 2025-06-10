/**
 * Utility functions for making quick, ad-hoc LLM calls
 *
 * Provides standardized ways to call models while ensuring
 * proper model rotation, cost tracking, and quota management.
 */

import { Runner } from './runner.js';
import {
    createAgent,
    AgentType,
    createQuickAgent,
} from '../magi_agents/index.js';
import { ModelClassID } from '../types/shared-types.js';
import { Agent, ResponseInput, AgentDefinition } from '@just-every/ensemble';
/**
 * Make a quick LLM call and return the result as a string
 *
 * This helper allows for easy, one-off calls to LLMs without manually creating
 * an agent and processing the stream. It uses the existing model rotation,
 * cost tracking, and quota management infrastructure.
 *
 * @param messages - Either a string (wrapped as user message) or a full ResponseInput array
 * @param communicationManager - Optional communication manager instance to use
 * @returns A promise that resolves to the complete text response
 */
export async function quick_llm_call(
    messages: ResponseInput | string,
    modelClass?: ModelClassID,
    agent?: AgentType | AgentDefinition,
    parent_id?: string,
    communicationManager?: any // Add optional communicationManager parameter
): Promise<string> {
    if (modelClass && agent) {
        if (typeof agent === 'string') {
            throw new Error('Cannot specify both agent and modelClass');
        }
        agent.modelClass = modelClass;
        modelClass = undefined;
    }

    const quickAgent =
        typeof modelClass === 'string'
            ? createQuickAgent(modelClass)
            : typeof agent === 'string'
              ? await createAgent({ agent })
              : new Agent(agent as AgentDefinition);

    // Let the controller know this isn't the root agent
    quickAgent.parent_id = parent_id ?? 'quick';

    // Set up historyThread for the agent
    quickAgent.historyThread = [];

    // Prepare messages array
    const messagesArray: ResponseInput = messages
        ? typeof messages === 'string'
            ? [{ type: 'message', role: 'user', content: messages }]
            : messages
        : [];

    // Call the Runner with our agent and message array, passing the communicationManager
    // Runner.runStreamedWithTools already returns a string promise
    return await Runner.runStreamedWithTools(
        quickAgent,
        '',
        messagesArray,
        communicationManager
    );
}
