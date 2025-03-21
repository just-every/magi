/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import {
  ToolCall,
  ToolEvent, ToolFunction, ToolParameter,
} from '../types.js';
import { Agent } from './agent.js';

/**
 * Process a tool call from an agent
 */
export async function processToolCall(toolCall: ToolEvent, agent: Agent): Promise<string> {
  try {
    // Extract tool call data
    const {tool_calls} = toolCall;

    if (!tool_calls || tool_calls.length === 0) {
      return 'No tool calls found in event';
    }

    // Create an array of promises to process all tool calls in parallel
    const toolCallPromises = tool_calls.map(async (call) => {
      try {
        // Validate tool call
        if (!call || !call.function || !call.function.name) {
          console.error('Invalid tool call structure:', call);
          return {
            tool: null,
            error: 'Invalid tool call structure',
            input: call
          };
        }

        // Parse arguments for better logging
        let parsedArgs = {};
        try {
          if (call.function.arguments && call.function.arguments.trim()) {
            parsedArgs = JSON.parse(call.function.arguments);
          }
        } catch (parseError) {
          console.error('Error parsing arguments:', parseError);
          parsedArgs = { _raw: call.function.arguments };
        }

        // Handle the tool call (pass the agent for event handlers)
        const result = await handleToolCall(call, agent);

        // Add structured response with tool name, input and output
        const toolResult = {
          tool: call.function.name,
          input: parsedArgs,
          output: result
        };

        // Log tool call
        const {function: {name}} = call;
        console.log(`[Tool] ${name} executed successfully`, result);
        
        return toolResult;
      } catch (error) {
        console.error('Error executing tool:', error);

        // Include tool name and input in error response
        let toolName = 'unknown';
        let toolInput = {};

        if (call && call.function) {
          toolName = call.function.name || 'unknown';
          try {
            if (call.function.arguments && call.function.arguments.trim()) {
              toolInput = JSON.parse(call.function.arguments);
            }
          } catch (e) {
            toolInput = { _raw: call.function.arguments };
          }
        }

        return {
          tool: toolName,
          input: toolInput,
          error: String(error)
        };
      }
    });

    // Wait for all tool calls to complete in parallel
    const results = await Promise.all(toolCallPromises);

    // Return results as a JSON string
    return JSON.stringify(results, null, 2);
  } catch (error) {
    console.error('Error processing tool call:', error);
    return `{"error": "${String(error).replace(/"/g, '\\"')}"}`;
  }
}

/**
 * Handle a tool call by executing the appropriate tool function or worker agent
 */
export async function handleToolCall(toolCall: ToolCall, agent: Agent): Promise<string> {
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

  if(!agent.tools) {
    throw new Error(`Agent ${agent.name} has no tools defined`);
  }

  const tool = agent.tools.find(tool => tool.definition.function.name === name);
  if(!tool) {
    throw new Error(`Tool ${name} not found in agent ${agent.name}`);
  }

  // Call the implementation with the parsed arguments
  try {
    let result;
    if (typeof args === 'object' && args !== null) {
      // Extract named parameters based on implementation function definition
      const paramNames = Object.keys(tool.definition.function.parameters.properties);

      // Map args to parameters in correct order
      if (paramNames.length > 0) {
        const orderedArgs = paramNames.map((param: string) => {
          return args[param as keyof typeof args];
        });
        result = await tool.function(...orderedArgs);
      } else {
        // Fallback to using args values directly if parameter extraction fails
        const argValues = Object.values(args);
        result = await tool.function(...argValues);
      }
    } else {
      // If args is not an object, pass it directly (shouldn't occur with OpenAI)
      result = await tool.function(args);
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



/**
 * Create a tool definition from a function
 *
 * @param func - Function to create definition for
 * @param name - Tool name (defaults to snake_case function name)
 * @param description - Tool description
 * @param paramMap - Optional mapping of function params to API params
 * @returns Tool definition object
 */
export function createToolFunction(
    // Use a more specific type than Function
    func: (...args: any[]) => any,
    description?: string,
    paramMap?: Record<string, string|{name?: string, description?: string, type?: string}>,
    returns?: string
): ToolFunction {
  // Get function info
  const funcStr = func.toString();
  const funcName = func.name;

  // Try to extract description from JSDoc if not provided
  let toolDescription = description || `Tool for ${funcName}`;
  if(returns) {
    toolDescription += ` Returns: ${returns}`;
  }

  // Extract parameter info from function signature
  const paramMatch = funcStr.match(/\(([^)]*)\)/);

  const properties: Record<string, ToolParameter> = {};
  const required: string[] = [];

  if (paramMatch && paramMatch[1]) {
    const params = paramMatch[1].split(',').map(p => p.trim()).filter(Boolean);

    // Process each parameter
    for (const param of params) {
      const nameMatch = param.match(/^(\w+)(?:\s*:\s*([^=]+))?(?:\s*=\s*.+)?$/);
      if (nameMatch) {
        const paramName = nameMatch[1];
        const tsParamType = (nameMatch[2] || '').trim();

        // Check if we have custom mapping for this parameter
        let paramInfo = paramMap?.[paramName];
        if(typeof paramInfo === 'string') {
            paramInfo = { description: paramInfo };
        }

        // Convert to snake_case for API consistency
        const apiParamName = paramInfo?.name || paramName;

        // Determine parameter type
        let paramType = 'string';
        if (paramInfo?.type) {
          paramType = paramInfo.type;
        } else if (tsParamType === 'number') {
          paramType = 'number';
        } else if (tsParamType === 'boolean') {
          paramType = 'boolean';
        }

        // Try to get description from JSDoc if not in param map
        const paramDescription = paramInfo?.description;

        // Create parameter definition
        properties[apiParamName] = {
          type: paramType,
          description: paramDescription || `The ${paramName} parameter`
        };

        // If parameter has no default value, it's required
        if (!param.includes('=')) {
          required.push(apiParamName);
        }
      }
    }
  }

  // Create and return tool definition
  return {
    function: func,
    definition: {
      type: 'function',
      function: {
        name: funcName,
        description: toolDescription,
        parameters: {
          type: 'object',
          properties,
          required
        }
      }
    }
  };
}
