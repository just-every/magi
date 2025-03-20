/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import {
  AgentDefinition,
  ToolDefinition,
  ModelSettings,
  StreamingEvent,
  ToolCall,
  LLMResponse,
  LLMMessage
} from './types.js';
import { getModelProvider } from './model_providers/model_provider.js';
import { toolImplementations } from './utils/tools.js';
import { fileToolImplementations } from './utils/file_utils.js';

// Combined tool implementations
const allToolImplementations = {
  ...toolImplementations,
  ...fileToolImplementations
};

/**
 * Agent class representing an LLM agent with tools
 */
export class Agent {
  name: string;
  instructions: string;
  tools: ToolDefinition[];
  model: string;
  handoff_description?: string;
  modelSettings?: ModelSettings;

  constructor(definition: AgentDefinition, modelSettings?: ModelSettings) {
    this.name = definition.name;
    this.instructions = definition.instructions;
    this.tools = definition.tools;
    this.model = definition.model;
    this.handoff_description = definition.handoff_description;
    this.modelSettings = modelSettings;
  }

  /**
   * Create a tool from this agent that can be used by other agents
   */
  asTool(toolName: string, toolDescription: string): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: toolName,
        description: toolDescription || this.handoff_description || `${this.name} specializing in ${toolName} tasks`,
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The task or question to process'
            },
            working_directory: {
              type: 'string',
              description: 'Optional working directory for file operations'
            }
          },
          required: ['prompt']
        }
      }
    };
  }

  /**
   * Make a copy of this agent
   */
  copy(): Agent {
    return new Agent({
      name: this.name,
      instructions: this.instructions,
      tools: [...this.tools],
      model: this.model,
      handoff_description: this.handoff_description
    }, this.modelSettings);
  }
}

/**
 * Handle a tool call by executing the appropriate tool function
 */
export async function handleToolCall(toolCall: ToolCall): Promise<any> {
  // Validate the tool call structure
  if (!toolCall.function || !toolCall.function.name) {
    throw new Error('Invalid tool call structure: missing function name');
  }

  const { function: { name, arguments: argsString } } = toolCall;

  // Parse the arguments with better error handling
  let args: Record<string, any>;
  try {
    // Handle empty arguments case
    if (!argsString || argsString.trim() === '') {
      args = {};
    } else {
      args = JSON.parse(argsString);
    }
  } catch (error: any) {
    console.error(`Error parsing tool arguments:`, error);
    console.error(`Arguments string: ${argsString}`);
    throw new Error(`Invalid JSON in tool arguments: ${error?.message || String(error)}`);
  }

  // Find the tool implementation
  const implementation = allToolImplementations[name];
  if (!implementation) {
    throw new Error(`Tool implementation not found for: ${name}`);
  }

  // Call the implementation with the parsed arguments
  try {
    if (typeof args === 'object' && args !== null) {
      // Extract named parameters based on implementation function definition
      const functionStr = implementation.toString();
      // Extract parameter names from function definition using regex
      const paramMatch = functionStr.match(/\(([^)]*)\)/);
      const paramNames = paramMatch && paramMatch[1]
        ? paramMatch[1].split(',').map(p => p.trim().split('=')[0].trim())
        : [];

      // Map args to parameters in correct order
      if (paramNames.length > 0) {
        const orderedArgs = paramNames.map(param => args[param]);
        return await implementation(...orderedArgs);
      } else {
        // Fallback to using args values directly if parameter extraction fails
        const argValues = Object.values(args);
        return await implementation(...argValues);
      }
    } else {
      // If args is not an object, pass it directly (shouldn't occur with OpenAI)
      return await implementation(args);
    }
  } catch (error: any) {
    console.error(`Error executing tool ${name}:`, error);
    throw new Error(`Error executing tool ${name}: ${error?.message || String(error)}`);
  }
}

/**
 * Agent runner class for executing agents with tools
 */
export class Runner {
  /**
   * Run an agent non-streaming (returns complete response)
   */
  static async run(
    agent: Agent,
    input: string,
    conversationHistory: Array<{role: string, content: string}> = []
  ): Promise<LLMResponse> {
    // Get the model provider
    const provider = getModelProvider();

    // Prepare messages with conversation history and the current input
    const messages = [
      // Add developer message with instructions
      { role: 'developer', content: agent.instructions },
      // Add conversation history
      ...conversationHistory,
      // Add the current user input
      { role: 'user', content: input }
    ];

    // Run the completion
    return await provider.createResponse(
      agent.model,
      messages,
      agent.tools,
      agent.modelSettings
    );
  }

  /**
   * Run an agent with streaming responses
   */
  static async *runStreamed(
    agent: Agent,
    input: string,
    conversationHistory: Array<LLMMessage> = []
  ): AsyncGenerator<StreamingEvent> {
    // Get the model provider
    const provider = getModelProvider();

    // Prepare messages with conversation history and the current input
    const messages = [
      // Add a developer message with instructions
      { role: 'developer', content: agent.instructions },
      // Add conversation history
      ...conversationHistory,
      // Add the current user input
      { role: 'user', content: input }
    ];

    // Create a streaming generator
    const stream = provider.createResponseStream(
      agent.model,
      messages,
      agent.tools,
      agent.modelSettings
    );

    // Forward all events from the stream
    for await (const event of stream) {
      yield event;
    }
  }
}
