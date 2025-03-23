/**
 * Claude model provider for the MAGI system.
 *
 * This module provides an implementation of the ModelProvider interface
 * for Anthropic's Claude models and handles streaming responses.
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import {
  ModelProvider,
  ToolFunction,
  ModelSettings,
  StreamingEvent,
  ToolCall,
  ResponseInput
} from '../types.js';

// Convert our tool definition to Claude's format
function convertToClaudeTools(tools: ToolFunction[]): any[] {
  return tools.map(tool => ({
    type: 'custom',
    custom: {
      name: tool.definition.function.name,
      description: tool.definition.function.description,
      parameters: tool.definition.function.parameters
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
    messages: ResponseInput,
    tools?: ToolFunction[],
    settings?: ModelSettings
  ): AsyncGenerator<StreamingEvent> {
    try {
// Convert messages format for Claude
      const claudeMessages = messages.map(msg => {
        // Check if this message has a role property
        let role = 'system';
        if ('role' in msg && msg.role === 'user') {
          role = 'user';
        }

        let content = '';
        if ('content' in msg) {
          if(typeof msg.content === 'string') {
            content = msg.content;
          }
          else if('text' in msg.content && typeof msg.content.text === 'string') {
            content = msg.content.text;
          }
        }

        return {
          ...msg,
          role,
          content,
        };
      });

      // Format the request according to Claude API specifications
      const requestParams: any = {
        model: model,
        // Only include messages that have a role property and aren't system messages
        messages: claudeMessages.filter(m =>  m.role !== 'system'),
        system: claudeMessages.filter(m => m.role === 'system'),
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
      let accumulatedContent = ''; // To collect all content for final message_complete
      const messageId = uuidv4(); // Generate a unique ID for this message
      // Track delta positions for ordered message chunks
      let deltaPosition = 0;

      try {
        // @ts-expect-error - Claude's stream is AsyncIterable but TypeScript might not recognize it properly
        for await (const event of stream) {
          // Handle content block delta
          if (event.type === 'content_block_delta' && event.delta.text) {
            // Emit delta event for streaming UI updates with incrementing order
            yield {
              type: 'message_delta',
              content: event.delta.text,
              message_id: messageId,
              order: deltaPosition++
            };

            // Accumulate content for complete message
            accumulatedContent += event.delta.text;
          }
          // Handle content block start for text
          else if (event.type === 'content_block_start' &&
                  event.content_block.type === 'text') {
            if (event.content_block.text) {
              // Emit delta event with incrementing order
              yield {
                type: 'message_delta',
                content: event.content_block.text,
                message_id: messageId,
                order: deltaPosition++
              };

              // Accumulate content for complete message
              accumulatedContent += event.content_block.text;
            }
          }
          // Handle content block stop for text
          else if (event.type === 'content_block_stop' &&
                  event.content_block.type === 'text') {
            if (event.content_block.text) {
              // For non-streaming responses, add as delta too with incrementing order
              yield {
                type: 'message_delta',
                content: event.content_block.text,
                message_id: messageId,
                order: deltaPosition++
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
                tool_calls: [currentToolCall as ToolCall]
              };
              currentToolCall = null;
            }

            // Always emit a message_complete at the end with the accumulated content
            if (accumulatedContent) {
              yield {
                type: 'message_complete',
                content: accumulatedContent,
                message_id: messageId
              };
            }
          }
          // Handle error event
          else if (event.type === 'error') {
            yield {
              type: 'error',
              error: event.error ? event.error.message : 'Unknown Claude API error'
            };
          }
        }

        // Ensure a message_complete is emitted if somehow message_stop didn't fire
        if (accumulatedContent && !currentToolCall) {
          yield {
            type: 'message_complete',
            content: accumulatedContent,
            message_id: messageId
          };
        }

      } catch (streamError) {
        console.error('Error processing Claude stream:', streamError);
        yield {
          type: 'error',
          error: String(streamError)
        };

        // If we have accumulated content but no message_complete was sent
        // due to an error, still try to send it
        if (accumulatedContent) {
          yield {
            type: 'message_complete',
            content: accumulatedContent,
            message_id: messageId
          };
        }
      }

    } catch (error) {
      console.error('Error in Claude streaming completion:', error);
      yield {
        type: 'error',
        error: String(error)
      };
    }
  }
}

// Export an instance of the provider
export const claudeProvider = new ClaudeProvider();
