/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import { StreamingEvent, LLMMessage, ToolEvent, MessageEvent } from '../types.js';
import { Agent } from './agent.js';
import { getModelProvider } from '../model_providers/model_provider.js';
import { MODEL_GROUPS } from '../magi_agents/constants.js';
import { getModelFromClass } from '../model_providers/model_provider.js';
import { processToolCall } from './tool_call.js';

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
    conversationHistory: Array<LLMMessage> = [],
    handlers: {
      onEvent?: (event: StreamingEvent) => void,
      onResponse?: (content: string) => void,
      onComplete?: () => void
    } = {}
  ): Promise<string> {
    let fullResponse = '';
    
    try {
      const stream = this.runStreamed(agent, input, conversationHistory);
      
      for await (const event of stream) {
        // Call the event handler if provided
        if (handlers.onEvent) {
          handlers.onEvent(event);
        }
        
        // Handle different event types
        switch (event.type) {
          case 'message_delta':
          case 'message_done': {
            // Accumulate the message content
            const message = event as MessageEvent;
            if (message.content && message.content.trim()) {
              if (handlers.onResponse) {
                handlers.onResponse(message.content);
              }
              
              if (event.type === 'message_done') {
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
            
            // Format detailed tool calls for logging
            const detailedToolCalls = toolEvent.tool_calls.map(call => {
              let parsedArgs = {};
              try {
                if (call.function.arguments && call.function.arguments.trim()) {
                  parsedArgs = JSON.parse(call.function.arguments);
                }
              } catch (parseError) {
                console.error('Error parsing tool arguments:', parseError);
                parsedArgs = { _raw: call.function.arguments };
              }
              
              return {
                id: call.id,
                name: call.function.name,
                arguments: parsedArgs
              };
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
            
            // Tool results are handled by the event system now
            // No need to store separately in toolResultsToInclude
            
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
            console.error(`[Error] ${event.error}`);
            break;
          }
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
}
