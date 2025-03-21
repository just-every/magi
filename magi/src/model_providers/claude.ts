/**
 * Claude model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for Anthropic's Claude models and handles streaming responses.
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  ModelProvider,
  ToolDefinition,
  ModelSettings,
  StreamingEvent,
  ToolCall,
  LLMMessage
} from '../types.js';

// Convert our tool definition to Claude's format
function convertToClaudeTools(tools: ToolDefinition[]): any[] {
  return tools.map(tool => ({
    type: 'custom',
    custom: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters
    }
  }));
}

/**
 * Claude model provider implementation
 */
export class ClaudeProvider implements ModelProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });

    if (!this.client) {
      throw new Error('Failed to initialize Claude client. Make sure ANTHROPIC_API_KEY is set.');
    }
  }

  /**
   * Create a streaming completion using Claude's API
   */
  async *createResponseStream(
    model: string,
    messages: Array<LLMMessage>,
    tools?: ToolDefinition[],
    settings?: ModelSettings
  ): AsyncGenerator<StreamingEvent> {
    try {
      // Convert messages format for Claude
      const claudeMessages = messages.map(msg => ({
        role: msg.role === 'system' ? 'user' : msg.role,
        content: msg.content || ''
      }));

      // Extract system message if present (Claude handles it differently)
      const systemMessage = messages.find(m => m.role === 'system')?.content || '';

      // Format the request according to Claude API specifications
      const requestParams: any = {
        model: model,
        messages: claudeMessages.filter(m => m.role !== 'system'), // Remove system message from array
        system: systemMessage,
        stream: true,
        // Add optional parameters
        ...(settings?.temperature ? { temperature: settings.temperature } : {}),
        ...(settings?.max_tokens ? { max_tokens: settings.max_tokens } : {})
      };

      // Add tools if provided
      if (tools && tools.length > 0) {
        requestParams.tools = convertToClaudeTools(tools);
      }

      const stream = await this.client.messages.create(requestParams);

      // Track current tool call info
      let currentToolCall: any = null;
      let accumulatedContent = ''; // To collect all content for final message_done

      try {
        // @ts-expect-error - Claude's stream is AsyncIterable but TypeScript might not recognize it properly
        for await (const event of stream) {
          // Handle content block delta
          if (event.type === 'content_block_delta' && event.delta.text) {
            // Emit delta event for streaming UI updates
            yield {
              type: 'message_delta',
              model,
              content: event.delta.text
            };

            // Accumulate content for complete message
            accumulatedContent += event.delta.text;
          }
          // Handle content block start for text
          else if (event.type === 'content_block_start' &&
                  event.content_block.type === 'text') {
            if (event.content_block.text) {
              // Emit delta event
              yield {
                type: 'message_delta',
                model,
                content: event.content_block.text
              };

              // Accumulate content for complete message
              accumulatedContent += event.content_block.text;
            }
          }
          // Handle content block stop for text
          else if (event.type === 'content_block_stop' &&
                  event.content_block.type === 'text') {
            if (event.content_block.text) {
              // For non-streaming responses, add as delta too
              yield {
                type: 'message_delta',
                model,
                content: event.content_block.text
              };

              // Accumulate content for complete message
              accumulatedContent += event.content_block.text;
            }
          }
          // Handle tool use start
          else if (event.type === 'content_block_start' &&
                  event.content_block.type === 'tool_use') {
            // Start building the tool call
            const toolUse = event.content_block.tool_use;
            currentToolCall = {
              id: toolUse.id || `call_${Date.now()}`,
              type: 'function',
              function: {
                name: toolUse.name,
                arguments: typeof toolUse.input === 'string'
                  ? toolUse.input
                  : JSON.stringify(toolUse.input)
              }
            };
          }
          // Handle tool use delta (for streaming arguments)
          else if (event.type === 'content_block_delta' &&
                  event.delta.type === 'tool_use' &&
                  currentToolCall) {
            // Update the tool call with more argument data
            if (event.delta.tool_use && event.delta.tool_use.input) {
              if (typeof event.delta.tool_use.input === 'string') {
                currentToolCall.function.arguments += event.delta.tool_use.input;
              } else {
                // For object inputs, replace the entire arguments with the updated version
                currentToolCall.function.arguments = JSON.stringify(event.delta.tool_use.input);
              }
            }

            // Emit the tool_start event with current partial state for streaming UI
            yield {
              type: 'tool_start',
              model,
              tool_calls: [currentToolCall as ToolCall]
            };
          }
          // Handle tool use stop
          else if (event.type === 'content_block_stop' &&
                  event.content_block.type === 'tool_use' &&
                  currentToolCall) {
            // Finalize the tool call and emit it
            if (event.content_block.tool_use && event.content_block.tool_use.input) {
              // Use the complete input if available
              currentToolCall.function.arguments = typeof event.content_block.tool_use.input === 'string'
                ? event.content_block.tool_use.input
                : JSON.stringify(event.content_block.tool_use.input);
            }

            yield {
              type: 'tool_start',
              model,
              tool_calls: [currentToolCall as ToolCall]
            };

            currentToolCall = null;
          }
          // Handle message stop
          else if (event.type === 'message_stop') {
            // Complete any pending tool call
            if (currentToolCall) {
              yield {
                type: 'tool_start',
                model,
                tool_calls: [currentToolCall as ToolCall]
              };
              currentToolCall = null;
            }

            // Always emit a message_done at the end with the accumulated content
            if (accumulatedContent) {
              yield {
                type: 'message_done',
                model,
                content: accumulatedContent
              };
            }
          }
          // Handle error event
          else if (event.type === 'error') {
            yield {
              type: 'error',
              model,
              error: event.error ? event.error.message : 'Unknown Claude API error'
            };
          }
        }

        // Ensure a message_done is emitted if somehow message_stop didn't fire
        if (accumulatedContent && !currentToolCall) {
          yield {
            type: 'message_done',
            model,
            content: accumulatedContent
          };
        }

      } catch (streamError) {
        console.error('Error processing Claude stream:', streamError);
        yield {
          type: 'error',
          model,
          error: String(streamError)
        };

        // If we have accumulated content but no message_done was sent
        // due to an error, still try to send it
        if (accumulatedContent) {
          yield {
            type: 'message_done',
            model,
            content: accumulatedContent
          };
        }
      }

    } catch (error) {
      console.error('Error in Claude streaming completion:', error);
      yield {
        type: 'error',
        model,
        error: String(error)
      };
    }
  }
}

// Export an instance of the provider
export const claudeProvider = new ClaudeProvider();
