/**
 * OpenAI model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for OpenAI's models and handles streaming responses.
 */

import 'dotenv/config';
import { ModelProvider, ToolDefinition, ModelSettings, LLMResponse, StreamingEvent, ToolCall } from '../types.js';
import OpenAI from 'openai';

// Convert our tool definition to OpenAI's format
function convertToOpenAITools(tools: ToolDefinition[]): any[] {
  return tools.map(tool => ({
    type: tool.type,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }
  }));
}

/**
 * OpenAI model provider implementation
 */
export class OpenAIProvider implements ModelProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });

    if (!this.client) {
      throw new Error('Failed to initialize OpenAI client. Make sure OPENAI_API_KEY is set.');
    }
  }

  /**
   * Create a streaming completion using the OpenAI API
   * 
   * Note: We're still using the chat.completions API with the standard format
   * In the future, when Responses API is more stable and documented, we can
   * switch to using client.responses.create with the appropriate structure
   */
  async *createResponseStream(
    model: string,
    messages: Array<{ role: string; content: string; name?: string }>,
    tools?: ToolDefinition[],
    settings?: ModelSettings
  ): AsyncGenerator<StreamingEvent> {
    try {
      // Convert messages to the format expected by the API
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.name ? { name: msg.name } : {})
      }));
      
      // Prepare the parameters for responses.create
      // For the responses API, we need to use chat completions format
      const requestParams: any = {
        model: model,
        stream: true,
        // The OpenAI Responses API expects 'input' to be a string
        // But we'll use the chat.completions API which is more compatible
        messages: formattedMessages,
        // Add optional parameters
        ...(settings?.temperature ? { temperature: settings.temperature } : {}),
        ...(settings?.top_p ? { top_p: settings.top_p } : {}),
        ...(settings?.seed ? { seed: settings.seed } : {}),
        ...(settings?.tool_choice ? { tool_choice: settings.tool_choice } : {})
      };
      
      // Add tools if provided
      if (tools && tools.length > 0) {
        requestParams.tools = convertToOpenAITools(tools);
      }

      // Use the chat completions API since our structure is more compatible with it
      const stream = await this.client.chat.completions.create(requestParams);

      // Collect text content for tool calls (which might be streamed in chunks)
      let currentToolCalls: Record<string, any> = {};

      // Handle each chunk manually with proper typings
      try {
        // Process the response stream
        // @ts-ignore - OpenAI's stream is AsyncIterable but TypeScript doesn't recognize it
        for await (const chunk of stream) {
          if (chunk.choices && chunk.choices.length > 0) {
            const choice = chunk.choices[0];
            
            // Handle text content (delta.content in chat completions API)
            if (choice.delta?.content) {
              yield {
                type: 'message',
                model,
                content: choice.delta.content
              };
            }

            // Handle tool calls
            if (choice.delta?.tool_calls && choice.delta.tool_calls.length > 0) {
              for (const toolCallDelta of choice.delta.tool_calls) {
                // Guard against invalid tool calls
                if (toolCallDelta.index === undefined) continue;

                const index = toolCallDelta.index.toString();

                // Initialize this tool call if it's the first chunk
                if (!currentToolCalls[index]) {
                  currentToolCalls[index] = {
                    id: toolCallDelta.id || `call_${index}`,
                    type: 'function',
                    function: {
                      name: '',
                      arguments: ''
                    }
                  };
                }

                // Update the function name if provided
                if (toolCallDelta.function?.name) {
                  currentToolCalls[index].function.name += toolCallDelta.function.name;
                }

                // Update the function arguments if provided
                if (toolCallDelta.function?.arguments) {
                  currentToolCalls[index].function.arguments += toolCallDelta.function.arguments;
                }
              }
            }

            // Emit completed tool calls when finished
            if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
              const completedToolCalls = Object.values(currentToolCalls);
              if (completedToolCalls.length > 0) {
                yield {
                  type: 'tool_calls',
                  model,
                  tool_calls: completedToolCalls as ToolCall[]
                };

                // Reset for next batch
                currentToolCalls = {};
              }
            }
          }
        }
      } catch (streamError) {
        console.error('Error processing response stream:', streamError);
        yield {
          type: 'error',
          model,
          error: String(streamError)
        };
      }

      // If the stream ended without yielding tool calls but we have some, yield them now
      // This handles cases where the stream ends without a finish_reason
      const remainingToolCalls = Object.values(currentToolCalls);
      if (remainingToolCalls.length > 0) {
        // Validate the tool calls before yielding
        const validToolCalls = remainingToolCalls.filter(call =>
          call.function &&
          typeof call.function.name === 'string' &&
          call.function.name.length > 0
        );

        if (validToolCalls.length > 0) {
          yield {
            type: 'tool_calls',
            model,
            tool_calls: validToolCalls as ToolCall[]
          };
        }
      }

    } catch (error) {
      console.error(`Error in OpenAI streaming completion:`, error);
      yield {
        type: 'error',
        model,
        error: String(error)
      };
    }
  }
}

// Export an instance of the provider
export const openaiProvider = new OpenAIProvider();
