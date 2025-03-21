/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import { StreamingEvent, LLMMessage, } from '../types.js';
import { Agent } from './agent.js';
import { getModelProvider } from '../model_providers/model_provider.js';
import { MODEL_GROUPS } from '../magi_agents/constants.js';
import { getModelFromClass } from '../model_providers/model_provider.js';

/**
 * Agent runner class for executing agents with tools
 */
export class Runner {
  /**
   * Run an agent with streaming responses
   */
  static async *runStreamed(
      agent: Agent,
      input: string,
      conversationHistory: Array<LLMMessage> = []
  ): AsyncGenerator<StreamingEvent> {
    // Get our selected model for this run
    const selectedModel = agent.model || getModelFromClass(agent.modelClass || 'standard');

    // Get the model provider based on the selected model
    const provider = getModelProvider(selectedModel);

    // Prepare messages with conversation history and the current input
    const messages = [
      // Add a system message with instructions
      { role: 'system', content: agent.instructions },
      // Add conversation history
      ...conversationHistory,
      // Add the current user input
      { role: 'user', content: input }
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
        if(!event.agent.model) event.agent.model = selectedModel;
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

            yield {
              ...event,
              model: alternativeModel,
            };
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
}
