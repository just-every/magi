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
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));
}

// Add web_search_preview for GPT-4o models
function addWebSearchPreviewIfNeeded(model: string, toolsArray: any[]): any[] {
  // Only add web_search_preview to models that support it (gpt-4o)
  if (model.startsWith('gpt-4o')) {
    // Check if we already have a search tool defined to avoid duplicates
    const hasSearchTool = toolsArray.some(tool => 
      tool.name === 'web_search' || 
      tool.name === 'search_news' || 
      tool.name === 'search_with_location'
    );
    
    // If we have search tools, inject web_search_preview
    if (hasSearchTool) {
      console.log(`Adding web_search_preview for model: ${model}`);
      return [...toolsArray, { type: 'web_search_preview' }];
    }
  }
  
  // Return original array if conditions not met
  return toolsArray;
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
   * Create a streaming completion using the new OpenAI Responses API
   *
   * Uses the latest client.responses.create method which provides improved
   * features and better server-side state management.
   */
  async *createResponseStream(
    model: string,
    messages: Array<{ role: string; content: string; name?: string }>,
    tools?: ToolDefinition[],
    settings?: ModelSettings
  ): AsyncGenerator<StreamingEvent> {
    try {
      // Format the request according to the Responses API specification
      const requestParams: any = {
        model: model,
        stream: true,
        // OpenAI Responses API expects the messages array as input
        input: messages,
      };
      
      // Add model-specific parameters
      // o3 models don't support temperature and top_p
      if (!model.startsWith('o3-')) {
        if (settings?.temperature !== undefined) {
          requestParams.temperature = settings.temperature;
        }
        
        if (settings?.top_p !== undefined) {
          requestParams.top_p = settings.top_p;
        }
      } else {
        console.log(`[OpenAI] Skipping temperature/top_p settings for ${model} which doesn't support them`);
      }
      
      // Add other settings that work across models
      if (settings?.tool_choice) {
        requestParams.tool_choice = settings.tool_choice;
      }

      // Add tools if provided
      if (tools && tools.length > 0) {
        // Convert our tools to OpenAI format
        const openaiTools = convertToOpenAITools(tools);
        // Add web_search_preview for GPT-4o models if there are search tools
        requestParams.tools = addWebSearchPreviewIfNeeded(model, openaiTools);
      }

      const stream = await this.client.responses.create(requestParams);

      // Collect tool call data as it streams in
      let currentToolCall: any = null;

      // Process the response stream
      try {
        // @ts-ignore - OpenAI's stream is AsyncIterable but TypeScript doesn't recognize it properly
        for await (const event of stream) {
          // For verbose debugging - uncomment this
          // console.log(`Stream event type: ${event.type}`);
          // console.log('Stream event structure:', JSON.stringify(event, null, 2));

          // Handle web_search events from web_search_preview
          if (event.type === 'web_search.results') {
            // Log that we received web search results, but we don't emit them directly
            console.log(`Received web_search.results from OpenAI`, 
              event.results ? `Count: ${event.results.length}` : 'No results');
            
            // We don't need to yield an event here, as the model will use these results internally
            // and generate appropriate content that will come through as text deltas
          }
          
          // Handle response.output_text.delta - new format for text chunks
          else if (event.type === 'response.output_text.delta') {
            const textDelta = event.delta;
            if (textDelta) {
              yield {
                type: 'message_delta',
                model,
                content: textDelta
              };
            }
          }

          // Handle text.delta - newer format
          else if (event.type === 'text.delta' && event.delta && event.delta.value) {
            yield {
              type: 'message_delta',
              model,
              content: event.delta.value
            };
          }

          // Handle response.content.delta - older format
          else if (event.type === 'response.content.delta') {
            yield {
              type: 'message_delta',
              model,
              content: event.delta
            };
          }

          // Handle response.content_part.added - might contain text
          else if (event.type === 'response.content_part.added' &&
                  event.part &&
                  event.part.type === 'output_text' &&
                  event.part.text) {
            if (event.part.text && event.part.text.length > 0) {
              yield {
                type: 'message_complete',
                model,
                content: event.part.text
              };
            }
          }

          // Handle output_text.done - complete text message
          else if (event.type === 'response.output_text.done' && event.text) {
            yield {
              type: 'message_complete',
              model,
              content: event.text
            };
          }

          // Handle function_call.started - new format
          else if (event.type === 'function_call.started' && event.function_call) {
            currentToolCall = {
              id: event.function_call.id || `call_${Date.now()}`,
              type: 'function',
              function: {
                name: event.function_call.name,
                arguments: ''
              }
            };
          }

          // Handle function call argument deltas - new format
          else if (event.type === 'function_call.argument.delta' &&
                  currentToolCall &&
                  event.delta &&
                  event.delta.value) {
            currentToolCall.function.arguments += event.delta.value;
          }

          // Handle function call completion - new format
          else if (event.type === 'function_call.completed' &&
                  currentToolCall &&
                  event.function_call) {
            // Use complete arguments if provided
            if (event.function_call.arguments) {
              currentToolCall.function.arguments = event.function_call.arguments;
            }

            // Only emit if we have valid arguments
            if (currentToolCall.function.arguments) {
              yield {
                type: 'tool_calls',
                model,
                tool_calls: [currentToolCall as ToolCall]
              };
            }

            // Reset for next function call
            currentToolCall = null;
          }

          // Handle response.output_item.added - old format for function calls
          else if (event.type === 'response.output_item.added' &&
                  event.item &&
                  event.item.type === 'function_call') {
            currentToolCall = {
              id: event.item.id || event.item.call_id || `call_${Date.now()}`,
              type: 'function',
              function: {
                name: event.item.name,
                arguments: ''
              }
            };
          }

          // Handle response.function_call_arguments.delta - old format
          else if (event.type === 'response.function_call_arguments.delta' &&
                  currentToolCall) {
            currentToolCall.function.arguments += event.delta;
          }

          // Handle response.function_call_arguments.done - old format
          else if (event.type === 'response.function_call_arguments.done' &&
                  currentToolCall) {
            // Use complete arguments if provided
            if (event.arguments) {
              currentToolCall.function.arguments = event.arguments;
            }

            // Emit the tool call
            yield {
              type: 'tool_calls',
              model,
              tool_calls: [currentToolCall as ToolCall]
            };

            // Reset for next tool call
            currentToolCall = null;
          }

          // Handle response.output_item.done for function calls - old format
          else if (event.type === 'response.output_item.done' &&
                  event.item &&
                  event.item.type === 'function_call' &&
                  currentToolCall) {
            // Use complete arguments if provided
            if (event.item.arguments) {
              currentToolCall.function.arguments = event.item.arguments;
            }

            // Emit the tool call
            yield {
              type: 'tool_calls',
              model,
              tool_calls: [currentToolCall as ToolCall]
            };

            // Reset for next tool call
            currentToolCall = null;
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

      // If we have a partial tool call that wasn't completed, emit it now
      if (currentToolCall &&
          currentToolCall.function &&
          currentToolCall.function.name) {
        yield {
          type: 'tool_calls',
          model,
          tool_calls: [currentToolCall as ToolCall]
        };
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
