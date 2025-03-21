/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import {
  ToolCall,
  ToolEvent,
} from '../types.js';
import { Agent } from './agent.js';
import { Runner } from './runner.js';

// Import all agent creation functions now that Runner is defined
import {getCommunicationManager} from "../utils/communication.js";

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

    // Process each tool call
    const results: any[] = [];

    for (const call of tool_calls) {
      try {
        // Validate tool call
        if (!call || !call.function || !call.function.name) {
          console.error('Invalid tool call structure:', call);
          results.push({
            tool: null,
            error: 'Invalid tool call structure',
            input: call
          });
          continue;
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
        results.push({
          tool: call.function.name,
          input: parsedArgs,
          output: result
        });

        // Log tool call
        const {function: {name}} = call;
        console.log(`[Tool] ${name} executed successfully`, result);
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

        results.push({
          tool: toolName,
          input: toolInput,
          error: String(error)
        });
      }
    }

    // Return results as a JSON string
    return JSON.stringify(results, null, 2);
  } catch (error) {
    console.error('Error processing tool call:', error);
    return `{"error": "${String(error).replace(/"/g, '\\"')}"}`;
  }
}

/**
 * Handle a tool call by executing the appropriate tool function
 */
export async function handleToolCall(toolCall: ToolCall, agent: Agent): Promise<any> {
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
