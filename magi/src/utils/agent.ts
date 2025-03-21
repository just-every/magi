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
  LLMMessage,
  ToolEvent,
  AgentExportDefinition
} from './types.js';
import { getModelProvider } from './model_providers/model_provider.js';
import { fileToolImplementations } from './utils/file_utils.js';
import { browserToolImplementations } from './utils/browser_utils.js';
import { searchToolImplementations } from './utils/search_utils.js';
import { shellToolImplementations } from './utils/shell_utils.js';
import { MODEL_GROUPS } from './magi_agents/constants.js';

import {v4 as uuid} from 'uuid';

// Combined tool implementations for regular tools
const baseToolImplementations = {
  ...fileToolImplementations,
  ...browserToolImplementations,
  ...searchToolImplementations,
  ...shellToolImplementations
};

// Define type for tool implementation functions - accepts both Promise and non-Promise returns
export type ToolImplementationFn = (...args: any[]) => any | Promise<any>;

/**
 * Agent class representing an LLM agent with tools
 */
export class Agent {
  agent_id: string;
  name: string;
  description: string;
  instructions: string;
  parent?: Agent;
  workers?: Agent[];
  tools?: ToolDefinition[];
  model?: string;
  modelClass?: string;
  modelSettings?: ModelSettings;

  // Event handlers for tool calls and results
  onToolCall?: (toolCall: any) => void;
  onToolResult?: (result: any) => void;

  constructor(definition: AgentDefinition, modelSettings?: ModelSettings) {
    this.agent_id = definition.agent_id || uuid();
    this.name = definition.name;
    this.description = definition.description;
    this.instructions = definition.instructions;
    this.tools = definition.tools || [];
    this.model = definition.model;
    this.modelClass = definition.modelClass;
    this.modelSettings = modelSettings;
    if(definition.workers) {
        this.workers = definition.workers.map((createAgent: Function) => {
          let agent = createAgent();
          agent.parent = this;
          return agent;
        });
        this.tools = this.tools.concat(this.workers.map((worker: Agent) => worker.asTool()));
    }
  }

  /**
   * Create a tool from this agent that can be used by other agents
   */
  asTool(): ToolDefinition {
    let description = `An AI agent called ${this.name}.\n\n${this.description}`;
    if(this.tools) {
        description += `\n\nThis agent has access to the following tools:\n`;
        this.tools.forEach(tool => {
            description += `- ${tool.function.name}: ${tool.function.description}\n`;
        });
        description += `\nUse the tool list as a guide when to call the agent, but generally you should let the agent decide which tools to use. You do not need to specify the tools in the prompt, as the agent will automatically choose the best tool for the task.`;
    }
    return {
      type: 'function',
      function: {
        name: this.name,
        description,
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The task or question for the agent to process. The agent only has the information you provide in this prompt. They have no other context beyond this. As all your agents are AI agents, you should provide them with sufficient context to complete their tasks. The best approach is to give them an overall view of the general task and their specific goal within that task. Agents are expected to work autonomously, so will rarely ask additional questions.'
            }
          },
          required: ['prompt']
        }
      }
    };
  }

  /**
   * Export this agent for event passing
   */
  export(): AgentExportDefinition {
    // Return a simplified representation of the agent
    let agentExport: AgentExportDefinition = {
      agent_id: this.agent_id,
      name: this.name,
    };
    if(this.model) {
      agentExport.model = this.model;
    }
    if(this.parent) {
      agentExport.parent = this.parent.export();
    }
    return agentExport;
  }
}

/**
 * Handle a tool call by executing the appropriate tool function
 */
export async function handleToolCall(toolCall: ToolCall, agent?: Agent): Promise<any> {
  // Validate the tool call structure
  if (!toolCall.function || !toolCall.function.name) {
    throw new Error('Invalid tool call structure: missing function name');
  }

  const { function: { name, arguments: argsString } } = toolCall;

  // Trigger onToolCall handler if available
  if (agent && agent.onToolCall) {
    try {
      agent.onToolCall(toolCall);
    } catch (error) {
      console.error('Error in onToolCall handler:', error);
    }
  }

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
    console.error('Error parsing tool arguments:', error);
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
    let result;
    if (typeof args === 'object' && args !== null) {
      // Extract named parameters based on implementation function definition
      const functionStr = implementation.toString();
      // Extract parameter names from function definition using regex
      const paramMatch = functionStr.match(/\(([^)]*)\)/);
      const paramNames = paramMatch && paramMatch[1]
        ? paramMatch[1].split(',').map((p: string) => p.trim().split('=')[0].trim())
        : [];

      // Map args to parameters in correct order
      if (paramNames.length > 0) {
        const orderedArgs = paramNames.map((param: string) => {
          return args[param as keyof typeof args];
        });
        result = await implementation(...orderedArgs);
        console.log(`Implementation 1 ${functionStr}`, orderedArgs, result);
      } else {
        // Fallback to using args values directly if parameter extraction fails
        const argValues = Object.values(args);
        result = await implementation(...argValues);
        console.log('Implementation 2', result);
      }
    } else {
      // If args is not an object, pass it directly (shouldn't occur with OpenAI)
      result = await implementation(args);
      console.log('Implementation 3', result);
    }

    // Trigger onToolResult handler if available
    if (agent && agent.onToolResult) {
      try {
        agent.onToolResult(result);
      } catch (error) {
        console.error('Error in onToolResult handler:', error);
      }
    }

    return result;
  } catch (error: any) {
    console.error(`Error executing tool ${name}:`, error);
    throw new Error(`Error executing tool ${name}: ${error?.message || String(error)}`);
  }
}

import { getModelFromClass } from './model_providers/model_provider.js';

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

// Import all agent creation functions now that Runner is defined
import {
  createManagerAgent,
  createReasoningAgent,
  createCodeAgent,
  createBrowserAgent,
  createBrowserVisionAgent,
  createSearchAgent,
  createShellAgent
} from './magi_agents/index.js';
import { AICoder } from './magi_agents/workers/code_agent.js';
import {getCommunicationManager} from "./utils/communication.js";

/**
 * Run an agent and capture its streamed response
 */
async function runAgentTool(
  createAgentFn: () => Agent,
  prompt: string,
  agentName: string,
  parentAgent?: Agent
): Promise<string> {
  const agent = createAgentFn();
  const messages = [{ role: 'user', content: prompt }];
  let response = '';
  let toolResultsToInclude = '';
  const toolCalls: any[] = [];

  try {
    // Create a custom event handler to intercept tool calls and results
    // for agents running within agents
    const onToolCall = (toolCall: any) => {
      console.log(`${agentName} intercepted tool call:`, toolCall);
      toolCalls.push(toolCall);
    };

    const onToolResult = (result: any) => {
      try {
        console.log(`${agentName} intercepted tool result:`, result);
        if (result) {
          const resultString = typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2);

          // Store results so we can include them in the response if needed
          toolResultsToInclude += resultString + '\n';
          console.log(`${agentName} captured tool result: ${resultString.substring(0, 100)}...`);
        }
      } catch (err) {
        console.error(`Error processing intercepted tool result in ${agentName}:`, err);
      }
    };

    // Set up interception
    agent.onToolCall = onToolCall;
    agent.onToolResult = onToolResult;

    const comm = getCommunicationManager();

    console.log(`runAgentTool Runner.runStreamed`, agent, prompt, messages);
    const stream = Runner.runStreamed(agent, prompt, messages);
    for await (const event of stream) {
      if(parentAgent && !event.parentAgent) {
        event.parentAgent = parentAgent.export();
      }
      comm.send(event);

      if (event.type === 'message_delta' || event.type === 'message_done') {
        if (event.content) {
          response += event.content;
        }
      } else if (event.type === 'tool_start') {
        // Capture tool calls when they happen
      } else if (event.type === 'tool_done') {
        // Capture tool results
        try {
          console.log(`${agentName} captured tool result event through stream`);
          // Extract results from the event
          const ToolEvent = event as ToolEvent;
          const results = ToolEvent.results;
          if (results) {
            const resultString = typeof results === 'string'
              ? results
              : JSON.stringify(results, null, 2);

            // Store results so we can include them in the response if needed
            toolResultsToInclude += resultString + '\n';
            console.log(`${agentName} captured tool result from stream: ${resultString.substring(0, 100)}...`);
          }
        } catch (err) {
          console.error(`Error processing tool result in ${agentName}:`, err);
        }
      }
    }

    // If we have a response but it doesn't seem to include tool results, append them
    if (response && toolResultsToInclude &&
        !response.includes(toolResultsToInclude.substring(0, Math.min(50, toolResultsToInclude.length)))) {
      // Only append if the tool results aren't already reflected in the response
      console.log(`${agentName} appending tool results to response`);
      response += '\n\nTool Results:\n' + toolResultsToInclude;
    }

    console.log(`${agentName} final response: ${response}`);
    return response || `No response from ${agentName.toLowerCase()}`;
  } catch (error) {
    console.error(`Error in ${agentName}: ${error}`);
    return `Error in ${agentName}: ${error}`;
  }
}

// Agent tool implementations with shared implementation pattern
const agentToolImplementations: Record<string, ToolImplementationFn> = {
  'ManagerAgent': async (prompt: string) => {
    return await runAgentTool(createManagerAgent, prompt, 'ManagerAgent');
  },

  'ReasoningAgent': async (prompt: string) => {
    return await runAgentTool(createReasoningAgent, prompt, 'ReasoningAgent');
  },

  'CodeAgent': async (prompt: string) => {
    return await runAgentTool(createCodeAgent, prompt, 'CodeAgent');
  },

  'BrowserAgent': async (prompt: string) => {
    return await runAgentTool(createBrowserAgent, prompt, 'BrowserAgent');
  },

  'BrowserVisionAgent': async (prompt: string) => {
    return await runAgentTool(createBrowserVisionAgent, prompt, 'BrowserVisionAgent');
  },

  'SearchAgent': async (prompt: string) => {
    // Enhanced error logging for SearchAgent
    try {
      console.log(`SearchAgent processing prompt: ${prompt}`);
      const result = await runAgentTool(createSearchAgent, prompt, 'SearchAgent');
      console.log(`SearchAgent completed with result length: ${result?.length || 0} chars`);
      return result;
    } catch (error) {
      console.error(`SearchAgent error: ${error instanceof Error ? error.stack : String(error)}`);
      return `Error in SearchAgent: ${error instanceof Error ? error.message : String(error)}`;
    }
  },

  'ShellAgent': async (prompt: string) => {
    return await runAgentTool(createShellAgent, prompt, 'ShellAgent');
  }
};

// Complete tool implementations
const allToolImplementations: Record<string, ToolImplementationFn> = {
  ...baseToolImplementations,
  ...agentToolImplementations,
  'AICoder': AICoder
};
