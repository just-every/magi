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
   * Create a completion using the OpenAI API
   */
  async createResponse(
    model: string,
    messages: Array<{ role: string; content: string; name?: string }>,
    tools?: ToolDefinition[],
    settings?: ModelSettings
  ): Promise<LLMResponse> {
    try {
      // Create the request params
      const requestParams: any = {
        model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          ...(msg.name ? { name: msg.name } : {})
        })),
        // Add optional parameters
        ...(settings?.temperature ? { temperature: settings.temperature } : {}),
        ...(settings?.top_p ? { top_p: settings.top_p } : {}),
        ...(settings?.seed ? { seed: settings.seed } : {}),
        ...(settings?.tool_choice ? { tool_choice: settings.tool_choice } : {})
      };

      // Convert and add tools if provided
      if (tools && tools.length > 0) {
        requestParams.tools = convertToOpenAITools(tools);
      }

      // Create the response using the chat API
      const completion = await this.client.chat.completions.create(requestParams);

      // Extract response components
      let content: string | null = null;
      const toolCalls: ToolCall[] = [];

      // Safely extract content from response with proper null checks
      if (completion?.choices?.[0]?.message?.content !== undefined) {
        content = completion.choices[0].message.content;
      }

      // Safely extract tool calls if present
      if (completion?.choices?.[0]?.message?.tool_calls &&
          completion.choices[0].message.tool_calls.length > 0) {
        // Safe to access since we've checked it exists and has length > 0
        const toolCallsList = completion.choices[0].message.tool_calls;
        for (const call of toolCallsList) {
          // Validate the tool call has required properties
          if (call && call.id && call.function && call.function.name) {
            toolCalls.push({
              id: call.id,
              type: 'function',
              function: {
                name: call.function.name,
                arguments: call.function.arguments || '{}'
              }
            });
          } else {
            console.warn('Received invalid tool call from OpenAI:', call);
          }
        }
      }

      // Construct the LLM response
      const llmResponse: LLMResponse = {
        content,
        role: 'assistant'
      };

      if (toolCalls.length > 0) {
        llmResponse.tool_calls = toolCalls;
      }

      return llmResponse;
    } catch (error) {
      console.error(`Error in OpenAI completion:`, error);
      throw error;
    }
  }

  /**
   * Create a streaming completion using the OpenAI API
   */
  async *createResponseStream(
    model: string,
    messages: Array<{ role: string; content: string; name?: string }>,
    tools?: ToolDefinition[],
    settings?: ModelSettings
  ): AsyncGenerator<StreamingEvent> {
    try {
      // Create the request params
      const requestParams: any = {
        model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          ...(msg.name ? { name: msg.name } : {})
        })),
        stream: true,
        // Add optional parameters
        ...(settings?.temperature ? { temperature: settings.temperature } : {}),
        ...(settings?.top_p ? { top_p: settings.top_p } : {}),
        ...(settings?.seed ? { seed: settings.seed } : {}),
        ...(settings?.tool_choice ? { tool_choice: settings.tool_choice } : {})
      };

      // Convert and add tools if provided
      if (tools && tools.length > 0) {
        requestParams.tools = convertToOpenAITools(tools);
      }

      // Create the streaming response
      const stream = await this.client.chat.completions.create(requestParams);

      // Collect text content for tool calls (which might be streamed in chunks)
      let currentToolCalls: Record<string, any> = {};

      // Handle each chunk manually with proper typings
      try {
        // OpenAI's stream is not directly compatible with for-await-of
        // Use its custom AsyncIterable implementation
        // @ts-ignore - OpenAI's stream is AsyncIterable but TypeScript doesn't recognize it
        for await (const chunk of stream) {
          // Safely extract relevant data with type checking
          const choices = chunk.choices;
          if (!choices || choices.length === 0) continue;

          const choice = choices[0];
          const delta = choice.delta;

          // Handle text content
          if (delta?.content) {
            yield {
              type: 'message',
              model,
              content: delta.content
            };
          }

          // Handle tool calls
          if (delta?.tool_calls && delta.tool_calls.length > 0) {
            for (const toolCallDelta of delta.tool_calls) {
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
          if (choice?.finish_reason === 'tool_calls' || choice?.finish_reason === 'stop') {
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
      } catch (streamError) {
        console.error('Error processing stream:', streamError);
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
