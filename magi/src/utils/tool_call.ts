/**
 * Agent framework for the MAGI system.
 *
 * This module defines the Agent class and the runner for executing LLM agents
 * with tools.
 */

import {
    ToolCall,
    ToolCallHandler,
    ToolEvent,
    ToolFunction,
    ToolParameter,
    ToolParameterType,
    validToolParameterTypes,
    ToolParameterMap,
} from '../types/shared-types.js';
import { Agent } from './agent.js';
import { createSummary } from './summary_utils.js';
import { runningToolTracker } from './running_tool_tracker.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Process a tool call from an agent
 */
export async function processToolCall(
    toolCall: ToolEvent,
    agent: Agent,
    handlers: ToolCallHandler = {}
): Promise<string> {
    try {
        // Extract tool call data
        const { tool_calls } = toolCall;

        if (!tool_calls || tool_calls.length === 0) {
            return 'No tool calls found in event';
        }

        // Create an array of promises to process all tool calls in parallel
        const toolCallPromises = tool_calls.map(async call => {
            try {
                // Validate tool call
                if (!call || !call.function || !call.function.name) {
                    console.error('Invalid tool call structure:', call);
                    return {
                        tool: null,
                        error: 'Invalid tool call structure',
                        input: call,
                    };
                }

                // Parse arguments for better logging
                try {
                    if (
                        call.function.arguments &&
                        call.function.arguments.trim()
                    ) {
                        JSON.parse(call.function.arguments);
                    }
                } catch (parseError) {
                    console.error('Error parsing arguments:', parseError);
                }

                // Handle the tool call (pass the agent for event handlers)
                const result: string = await handleToolCall(
                    call,
                    agent,
                    handlers
                );

                // Skip summarization for get_summary_source to avoid re-summarizing
                if (
                    call.function.name === 'get_summary_source' ||
                    call.function.name === 'get_page_content'
                ) {
                    return result;
                }
                // Skip summarization for image data
                if (result.startsWith('data:image/')) {
                    return result;
                }

                return createSummary(
                    result,
                    `The following is the output of a tool \`${call.function.name}()\` used by an AI agent in an autonomous system. Focus on including the overall approach taken and the final result of the tool. Your summary will be used to decide the next steps to take.`
                );
            } catch (error) {
                console.error('Error executing tool:', error);

                return `{"error": "${String(error).replaceAll(/"/g, '\\"')}"}`;
            }
        });

        // Wait for all tool calls to complete in parallel
        const results = await Promise.all(toolCallPromises);

        // Return results as a JSON string
        return JSON.stringify(results, null, 2);
    } catch (error) {
        console.error('Error processing tool call:', error);
        return `{"error": "${String(error).replaceAll(/"/g, '\\"')}"}`;
    }
}

// Constants
const FUNCTION_TIMEOUT_MS = 10000; // 10 seconds timeout for functions

// Functions that should never be timed out
const EXCLUDED_FROM_TIMEOUT_FUNCTIONS = new Set<string>([
    'get_task_status',
    'get_running_tool_status',
]);

// Tools that enable status tracking for long‑running calls.
// If an agent does NOT include any of these, we skip the timeout to avoid
// orphaned executions that cannot be inspected or cancelled.
const STATUS_TRACKING_TOOL_NAMES = new Set<string>([
    'get_task_status',
    'get_running_tool_status',
]);

/**
 * Check whether the given agent declares ANY status‑tracking tool.
 */
function agentHasStatusTracking(agent?: Agent): boolean {
    return !!agent?.tools?.some(t =>
        STATUS_TRACKING_TOOL_NAMES.has(t.definition.function.name)
    );
}

/**
 * Helper function to coerce parameter values to their expected types
 * Returns [coercedValue, errorMessage]
 * If coercion is successful, errorMessage will be null
 * If coercion fails, errorMessage will be a string describing the error
 */
function coerceValue(
    value: any,
    paramSpec: any,
    paramName: string
): [any, string | null] {
    // Skip undefined/null values
    if (value === undefined || value === null) {
        return [value, null];
    }

    // No conversion if no type is specified
    if (!paramSpec || !paramSpec.type) {
        return [value, null];
    }

    try {
        // Convert based on parameter type
        switch (paramSpec.type) {
            case 'boolean':
                if (typeof value === 'boolean') {
                    return [value, null];
                }

                // Convert string to boolean
                if (typeof value === 'string') {
                    const lowercaseValue = value.toLowerCase().trim();
                    if (['true', 'yes', '1'].includes(lowercaseValue)) {
                        return [true, null];
                    }
                    if (['false', 'no', '0'].includes(lowercaseValue)) {
                        return [false, null];
                    }
                }

                // Convert 1/0 to boolean
                if (value === 1 || value === 0) {
                    return [Boolean(value), null];
                }

                return [
                    value,
                    `Could not convert "${value}" to boolean for parameter "${paramName}"`,
                ];

            case 'number':
                if (typeof value === 'number') {
                    return [value, null];
                }

                // Try to convert string to number
                if (
                    typeof value === 'string' &&
                    /^\s*-?\d+(\.\d+)?\s*$/.test(value)
                ) {
                    return [Number(value), null];
                }

                return [
                    value,
                    `Could not convert "${value}" to number for parameter "${paramName}"`,
                ];

            case 'array':
                if (Array.isArray(value)) {
                    // Check enum constraints if specified
                    if (paramSpec.items && paramSpec.items.enum) {
                        for (const item of value) {
                            if (!paramSpec.items.enum.includes(item)) {
                                return [
                                    value,
                                    `Value "${item}" is not in allowed enum values for parameter "${paramName}"`,
                                ];
                            }
                        }
                    }
                    return [value, null];
                }

                // Try to parse JSON array
                if (
                    typeof value === 'string' &&
                    value.trim().startsWith('[') &&
                    value.trim().endsWith(']')
                ) {
                    try {
                        const parsed = JSON.parse(value);
                        if (Array.isArray(parsed)) {
                            // Check enum constraints
                            if (paramSpec.items && paramSpec.items.enum) {
                                for (const item of parsed) {
                                    if (!paramSpec.items.enum.includes(item)) {
                                        return [
                                            parsed,
                                            `Value "${item}" is not in allowed enum values for parameter "${paramName}"`,
                                        ];
                                    }
                                }
                            }
                            return [parsed, null];
                        }
                    } catch (e) {
                        // Fall through to next case if JSON parse fails
                    }
                }

                // Try comma-separated string
                if (
                    typeof value === 'string' &&
                    (value.includes(',') || value.includes(', '))
                ) {
                    const items = value.split(',').map(item => item.trim());
                    // Check enum constraints
                    if (paramSpec.items && paramSpec.items.enum) {
                        for (const item of items) {
                            if (!paramSpec.items.enum.includes(item)) {
                                return [
                                    items,
                                    `Value "${item}" is not in allowed enum values for parameter "${paramName}"`,
                                ];
                            }
                        }
                    }
                    return [items, null];
                }

                // Convert single value to array with one item
                if (value !== undefined) {
                    const result = [value];
                    // Check enum constraints
                    if (
                        paramSpec.items &&
                        paramSpec.items.enum &&
                        !paramSpec.items.enum.includes(value)
                    ) {
                        return [
                            result,
                            `Value "${value}" is not in allowed enum values for parameter "${paramName}"`,
                        ];
                    }
                    return [result, null];
                }

                return [value, null];

            case 'object':
                if (typeof value === 'object' && !Array.isArray(value)) {
                    return [value, null];
                }

                // Try to parse JSON object
                if (
                    typeof value === 'string' &&
                    value.trim().startsWith('{') &&
                    value.trim().endsWith('}')
                ) {
                    try {
                        const parsed = JSON.parse(value);
                        if (
                            typeof parsed === 'object' &&
                            !Array.isArray(parsed)
                        ) {
                            return [parsed, null];
                        }
                    } catch (e) {
                        return [
                            value,
                            `Could not parse JSON object for parameter "${paramName}": ${e.message}`,
                        ];
                    }
                }

                return [
                    value,
                    `Could not convert "${value}" to object for parameter "${paramName}"`,
                ];

            default:
                // Direct enum validation for string type
                if (paramSpec.enum && !paramSpec.enum.includes(value)) {
                    return [
                        value,
                        `Value "${value}" is not in allowed enum values ${JSON.stringify(paramSpec.enum)} for parameter "${paramName}"`,
                    ];
                }

                return [value, null];
        }
    } catch (error) {
        return [
            value,
            `Error converting value for parameter "${paramName}": ${error.message}`,
        ];
    }
}

/**
 * Creates a promise that resolves after the specified time
 */
function timeoutPromise(ms: number): Promise<string> {
    return new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), ms));
}

/**
 * Handle a tool call by executing the appropriate tool function or worker agent
 */
export async function handleToolCall(
    toolCall: ToolCall,
    agent: Agent,
    handlers: ToolCallHandler = {}
): Promise<string> {
    // Validate the tool call structure
    if (!toolCall.function || !toolCall.function.name) {
        throw new Error('Invalid tool call structure: missing function name');
    }

    const {
        function: { name, arguments: argsString },
    } = toolCall;

    // Generate a unique ID for this function call
    const fnId = uuidv4();

    // Trigger onToolCall handler if available
    try {
        if (agent && agent.onToolCall) {
            await agent.onToolCall(toolCall);
        }
        if (handlers.onToolCall) {
            handlers.onToolCall(toolCall);
        }
    } catch (error) {
        console.error('Error in onToolCall handler:', error);
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
        throw new Error(
            `Invalid JSON in tool arguments: ${error?.message || String(error)}`
        );
    }

    if (!agent.tools) {
        throw new Error(`Agent ${agent.name} has no tools defined`);
    }

    const tool = agent.tools.find(
        tool => tool.definition.function.name === name
    );
    if (!tool) {
        throw new Error(`Tool ${name} not found in agent ${agent.name}`);
    }

    // Call the implementation with the parsed arguments
    try {
        // Register this function with the tracker
        runningToolTracker.addRunningTool(fnId, name, agent.name, argsString);

        // Setup the actual function call
        const executeFunction = async () => {
            let result: string;
            try {
                if (typeof args === 'object' && args !== null) {
                    // Extract named parameters based on implementation function definition
                    const paramNames = Object.keys(
                        tool.definition.function.parameters.properties
                    );

                    // Filter out unknown parameters that aren't in the tool definition
                    Object.keys(args).forEach(key => {
                        if (!paramNames.includes(key)) {
                            console.warn(
                                `Removing unknown parameter "${key}" for tool "${name}"`
                            );
                            delete args[key];
                        }
                    });

                    // Map args to parameters in correct order and convert to appropriate types
                    if (paramNames.length > 0) {
                        const orderedArgs = paramNames.map((param: string) => {
                            const value = args[param as keyof typeof args];
                            const paramSpec =
                                tool.definition.function.parameters.properties[
                                    param
                                ];

                            // Skip empty values for optional params
                            if (
                                (value === undefined || value === '') &&
                                !tool.definition.function.parameters.required?.includes(
                                    param
                                )
                            ) {
                                return undefined;
                            }

                            // Apply type coercion using the helper function
                            const [coercedValue, error] = coerceValue(
                                value,
                                paramSpec,
                                param
                            );

                            // If this is a required parameter and coercion failed, throw an error
                            if (
                                error &&
                                tool.definition.function.parameters.required?.includes(
                                    param
                                )
                            ) {
                                throw new Error(
                                    JSON.stringify({
                                        error: {
                                            param,
                                            expected:
                                                paramSpec.type +
                                                (paramSpec.items?.type
                                                    ? `<${paramSpec.items.type}>`
                                                    : ''),
                                            received: String(value),
                                            message: error,
                                        },
                                    })
                                );
                                // Otherwise just log a warning
                            } else if (error) {
                                console.warn(
                                    `Parameter coercion warning for ${param}: ${error}`
                                );
                            }

                            return coercedValue;
                        });

                        if (tool.injectAgentId) {
                            orderedArgs.unshift(agent.agent_id);
                        }
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

                // Mark as completed in tracker if it hasn't timed out
                await runningToolTracker.completeRunningTool(fnId, result);

                return result;
            } catch (error) {
                // Record the error in the tracker
                await runningToolTracker.failRunningTool(fnId, String(error));
                throw error;
            }
        };

        // Determine if we should apply a timeout:
        //   • Always skip for the explicitly excluded functions
        //   • Apply timeout ONLY if the calling agent has status‑tracking tools
        const hasStatusTools = agentHasStatusTracking(agent);

        if (EXCLUDED_FROM_TIMEOUT_FUNCTIONS.has(name) || !hasStatusTools) {
            const result = await executeFunction();

            // Trigger onToolResult handler if available
            try {
                if (agent && agent.onToolResult) {
                    await agent.onToolResult(toolCall, result);
                }
                if (handlers.onToolResult) {
                    handlers.onToolResult(toolCall, result);
                }
            } catch (error) {
                console.error('Error in onToolResult handler:', error);
            }

            return result;
        }

        // Race the function against a timeout
        const raceResult = await Promise.race([
            executeFunction().catch(error => {
                throw error; // Re-throw to be caught by the outer try-catch
            }),
            timeoutPromise(FUNCTION_TIMEOUT_MS),
        ]);

        // If we got a timeout, inform the user but let the function continue running
        if (raceResult === 'TIMEOUT') {
            // The function is still running in the background
            // executeFunction() will complete/fail the function in the tracker when it finishes
            return `Tool ${name} is now running in the background (RunningTool: ${fnId}).`;
        }

        // If we get here, the function completed before the timeout
        const result = raceResult;

        // Trigger onToolResult handler if available
        try {
            if (agent && agent.onToolResult) {
                await agent.onToolResult(toolCall, result);
            }
            if (handlers.onToolResult) {
                handlers.onToolResult(toolCall, result);
            }
        } catch (error) {
            console.error('Error in onToolResult handler:', error);
        }

        return result;
    } catch (error: any) {
        console.error(`Error executing tool ${name}:`, error);
        throw new Error(
            `Error executing tool ${name}: ${error?.message || String(error)}`
        );
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
    func: (...args: any[]) => any,
    description?: string,
    paramMap?: ToolParameterMap,
    returns?: string,
    functionName?: string
): ToolFunction {
    const funcStr = func.toString();
    const funcName = (functionName || '').replaceAll(' ', '_') || func.name;

    let toolDescription = description || `Tool for ${funcName}`;
    if (returns) {
        toolDescription += ` Returns: ${returns}`;
    }

    // Clean up multiline parameter definitions
    const cleanFuncStr = funcStr.replaceAll(/\n\s*/g, ' ');
    const paramMatch = cleanFuncStr.match(/\(([^)]*)\)/);

    const properties: Record<string, ToolParameter> = {};
    const required: string[] = [];

    let injectAgentId = false;
    const params = paramMap
        ? Object.keys(paramMap)
        : paramMatch && paramMatch[1]
          ? paramMatch[1]
                .split(',')
                .map(p => p.trim())
                .filter(Boolean)
          : [];
    for (const param of params) {
        // Extract parameter name and default value
        const paramParts = param.split('=').map(p => p.trim());
        const paramName = paramParts[0].trim();
        const defaultValue =
            paramParts.length > 1 ? paramParts[1].trim() : undefined;

        // Handle rest parameters
        const isRestParam = paramName.startsWith('...');
        const cleanParamName = isRestParam ? paramName.substring(3) : paramName;

        if (cleanParamName === 'inject_agent_id') {
            // Skip agent_id parameter
            injectAgentId = true;
            continue;
        }

        // Check if we have custom mapping for this parameter
        let paramInfo = paramMap?.[cleanParamName];
        if (typeof paramInfo === 'string') {
            paramInfo = { description: paramInfo };
        }

        // Convert to snake_case for API consistency if needed
        const apiParamName = paramInfo?.name || cleanParamName;

        // Determine parameter type based on default value or param map
        let paramType: ToolParameterType = 'string'; // Default type

        if (
            paramInfo?.type &&
            validToolParameterTypes.includes(paramInfo.type as any)
        ) {
            // Use explicit type from paramMap if provided
            paramType = paramInfo.type as ToolParameterType;
        } else if (isRestParam) {
            // Rest parameters are arrays
            paramType = 'array';
        } else if (defaultValue !== undefined) {
            // Infer type from default value
            if (defaultValue === 'false' || defaultValue === 'true') {
                paramType = 'boolean';
            } else if (
                !isNaN(Number(defaultValue)) &&
                !defaultValue.startsWith('"') &&
                !defaultValue.startsWith("'")
            ) {
                paramType = 'number';
            } else if (defaultValue === '[]' || defaultValue.startsWith('[')) {
                paramType = 'array';
            } else if (defaultValue === '{}' || defaultValue.startsWith('{')) {
                paramType = 'object';
            }
        }

        const description =
            paramInfo?.description || `The ${cleanParamName} parameter`;

        // Create parameter definition
        properties[apiParamName] = {
            type: paramType,
            description,
        };

        if (paramType === 'array') {
            // If the parameter is an array, prioritize the items definition from paramInfo if available
            if (paramInfo?.items) {
                properties[apiParamName].items = paramInfo.items;
            } else {
                // Fallback to default string items if not specified in paramInfo
                properties[apiParamName].items = {
                    type: 'string',
                };
            }
            // Note: Enum handling inside items might need refinement if enums are defined within paramInfo.items itself.
            // The current logic assumes enum applies directly to items if items is just {type: 'string'}.
            // If paramInfo.items is complex, its internal structure should define enums.
            if (
                paramInfo?.enum &&
                properties[apiParamName].items.type === 'string'
            ) {
                properties[apiParamName].items.enum = paramInfo.enum;
            }
        } else if (paramInfo?.enum) {
            // Handle enum for non-array types
            properties[apiParamName].enum = paramInfo.enum;
        }

        // If parameter has no default value, it's required
        if (defaultValue === undefined && !paramInfo?.optional) {
            required.push(apiParamName);
        }
    }

    // If the underlying function signature expects an inject_agent_id argument
    // but we built the paramNames list from paramMap (thereby skipping it),
    // we still need to flag injectAgentId so that handleToolCall prepends the
    // agent ID, ensuring parameters line up correctly.
    if (!injectAgentId && /\(\s*inject_agent_id\b/.test(funcStr)) {
        injectAgentId = true;
    }

    // Create and return tool definition
    return {
        function: func,
        injectAgentId,
        definition: {
            type: 'function',
            function: {
                name: funcName,
                description: toolDescription,
                parameters: {
                    type: 'object',
                    properties,
                    required,
                },
            },
        },
    };
}
