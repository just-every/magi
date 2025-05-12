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
import { runSequential } from './sequential_tool_queue.js';

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
                // Note: onToolResult handlers are now called *after* summarization/truncation below
                const rawResult: string = await handleToolCall(
                    call,
                    agent,
                    handlers
                );

                let finalResult: string;

                // Skip summarization for certain tools but limit output to 1000 characters
                if (
                    call.function.name === 'read_source' ||
                    call.function.name === 'get_page_content' ||
                    rawResult.startsWith('data:image/')
                ) {
                    if (rawResult.length > 1000) {
                        finalResult =
                            rawResult.substring(0, 1000) +
                            '... Output truncated to 1000 characters' +
                            (call.function.name === 'read_source'
                                ? '\n\n[Full output truncated: Use write_source(summary_id, file_path) to write full output to a file.]'
                                : '');
                    } else {
                        finalResult = rawResult;
                    }
                } else {
                    // Summarize the result
                    finalResult = await createSummary(
                        rawResult,
                        `The following is the output of a tool call \`${call.function.name}(${call.function.arguments})\` used by an AI agent in an autonomous system. Focus on summarizing both the overall output and the final result of the tool. Your summary will be used to understand what the result of the tool call was.`
                    );
                }

                // Trigger onToolResult handler with the final (potentially summarized/truncated) result
                try {
                    if (agent && agent.onToolResult) {
                        await agent.onToolResult(call, finalResult);
                    }
                    if (handlers.onToolResult) {
                        handlers.onToolResult(call, finalResult);
                    }
                } catch (handlerError) {
                    console.error(
                        'Error in onToolResult handler:',
                        handlerError
                    );
                }

                return finalResult;
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
const FUNCTION_TIMEOUT_MS = 8000; // 8 seconds timeout for functions

// Functions that should never be timed out
const EXCLUDED_FROM_TIMEOUT_FUNCTIONS = new Set<string>([
    'inspect_running_tool',
    'wait_for_running_tool',
    'terminate_running_tool',
    'start_task',
    'send_message',
    'get_task_status',
    'check_all_task_health',
    'wait_for_running_task',
    'read_source',
    'write_source',
    'read_file',
    'write_file',
    'list_directory',
]);

// Tools that enable status tracking for long‑running calls.
// If an agent does NOT include any of these, we skip the timeout to avoid
// orphaned executions that cannot be inspected or cancelled.
const STATUS_TRACKING_TOOL_NAMES = new Set<string>([
    'inspect_running_tool',
    'terminate_running_tool',
]);

/**
 * Check whether the given agent declares ANY status‑tracking tool.
 */
async function agentHasStatusTracking(agent?: Agent): Promise<boolean> {
    if (!agent) return false;
    const tools = await agent.getTools();
    return tools.some(t =>
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

    const agentTools = await agent.getTools();
    if (!agentTools || agentTools.length === 0) {
        throw new Error(`Agent ${agent.name} has no tools defined`);
    }

    const tool = agentTools.find(
        tool => tool.definition.function.name === name
    );
    if (!tool) {
        throw new Error(`Tool ${name} not found in agent ${agent.name}`);
    }

    // Call the implementation with the parsed arguments
    try {
        // Register this function with the tracker and get its abortController
        const runningTool = runningToolTracker.addRunningTool(
            fnId,
            name,
            agent.name,
            argsString
        );
        const { signal } = runningTool.abortController!;

        // Actual function execution logic
        const runToolLogic = async (): Promise<string> => {
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

                        // Inject abort signal if the tool needs it
                        if (tool.injectAbortSignal) {
                            orderedArgs.push(signal);
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

        // Setup the actual function call with abort support
        const executeFunction = async (): Promise<string> => {
            // Special case:
            // For `wait_for_running_tool` we allow the tool itself to handle
            // the abort signal and return a descriptive string. Propagating
            // the abort as an error here causes the overall tool call to fail
            // with “Error: Operation was aborted”, which is not helpful to
            // the agent/user. By bypassing the outer Promise.race for this
            // tool we avoid converting the abort into an unhandled rejection.
            if (name === 'wait_for_running_tool') {
                return runToolLogic();
            }

            return Promise.race([
                // Actual tool execution
                runToolLogic(),
                // Promise that rejects when abort signal is triggered
                new Promise<string>((_, reject) => {
                    signal.addEventListener(
                        'abort',
                        () => {
                            reject(new Error('Operation was aborted'));
                        },
                        { once: true }
                    );
                }),
            ]);
        };

        // Check if this agent requires sequential tool execution
        const sequential = !!agent?.modelSettings?.sequential_tools;

        // Determine if we should apply a timeout:
        //   • Always skip for the explicitly excluded functions
        //   • Skip for sequential tools (we need to wait for completion)
        //   • Apply timeout ONLY if the calling agent has status‑tracking tools
        const hasStatusTools = agentHasStatusTracking(agent);

        // Create the execute function that respects sequential queue if needed
        const execute = sequential
            ? () => runSequential(agent.agent_id, executeFunction)
            : executeFunction;

        if (
            EXCLUDED_FROM_TIMEOUT_FUNCTIONS.has(name) ||
            !hasStatusTools ||
            sequential
        ) {
            const result = await execute();

            // onToolResult handlers are now called in processToolCall
            return result;
        }

        // Race the function against a timeout (only for non-sequential tools)
        let result = await Promise.race([
            execute().catch(error => {
                throw error; // Re-throw to be caught by the outer try-catch
            }),
            timeoutPromise(FUNCTION_TIMEOUT_MS),
        ]);

        // If we got a timeout, inform the user but let the function continue running
        if (result === 'TIMEOUT') {
            // The function is still running in the background
            // executeFunction() will complete/fail the function in the tracker when it finishes
            result = `Tool ${name} is running in the background (RunningTool: ${fnId}).`;
        }

        // onToolResult handlers are now called in processToolCall
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
    func: (...args: unknown[]) => Promise<string> | string, // Match ExecutableFunction
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
    let injectAbortSignal = false;
    const params = paramMap
        ? Object.keys(paramMap)
        : paramMatch && paramMatch[1]
          ? paramMatch[1]
                .split(',')
                .map(p => p.trim())
                .filter(Boolean)
          : [];

    for (const paramUnknown of params) {
        // --- Start Type Assertion ---
        if (typeof paramUnknown !== 'string') {
            console.warn(
                `Skipping non-string parameter in function signature analysis: ${paramUnknown}`
            );
            continue;
        }
        const param = paramUnknown as string;
        // --- End Type Assertion ---

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

        if (cleanParamName === 'abort_signal') {
            // Skip abort_signal parameter (will be injected internally)
            injectAbortSignal = true;
            continue;
        }

        // Check if we have custom mapping for this parameter
        const paramInfoRaw: ToolParameter | string | undefined =
            paramMap?.[cleanParamName]; // Use cleanParamName as key
        let paramInfoObj: ToolParameter | undefined = undefined;
        let paramInfoDesc: string | undefined = undefined;

        if (typeof paramInfoRaw === 'string') {
            paramInfoDesc = paramInfoRaw;
            paramInfoObj = { description: paramInfoRaw }; // Create a basic object for consistency
        } else if (typeof paramInfoRaw === 'object' && paramInfoRaw !== null) {
            paramInfoObj = paramInfoRaw;
            paramInfoDesc = typeof paramInfoRaw.description === 'function'
                ? paramInfoRaw.description()
                : paramInfoRaw.description;
        }

        // Convert to snake_case for API consistency if needed
        // Ensure paramInfoObj.name is treated as string if it exists
        const apiParamName =
            (typeof paramInfoObj?.name === 'string'
                ? paramInfoObj.name
                : undefined) || cleanParamName;

        // Determine parameter type based on default value or param map
        let paramType: ToolParameterType = 'string'; // Default type

        // Check type from paramInfoObj first
        if (
            paramInfoObj?.type &&
            validToolParameterTypes.includes(paramInfoObj.type)
        ) {
            paramType = paramInfoObj.type;
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

        // Use description from paramInfo if available, otherwise default
        const description = paramInfoDesc || `The ${cleanParamName} parameter`;

        // Create parameter definition
        properties[apiParamName] = {
            type: paramType,
            description,
        };

        // Handle array items definition
        if (paramType === 'array') {
            if (paramInfoObj?.items) {
                properties[apiParamName].items = paramInfoObj.items;
            } else {
                // Fallback to default string items if not specified
                properties[apiParamName].items = {
                    type: 'string',
                };
            }
            // Handle enum within items if specified in paramInfoObj
            if (
                paramInfoObj?.enum &&
                properties[apiParamName].items?.type === 'string'
            ) {
                // Ensure items exists and is a simple type before assigning enum
                if (
                    typeof properties[apiParamName].items === 'object' &&
                    properties[apiParamName].items !== null &&
                    !('properties' in properties[apiParamName].items)
                ) {
                    // Don't set enum directly if it's a function - it will be resolved later
                    if (typeof paramInfoObj.enum !== 'function') {
                        (
                            properties[apiParamName].items as {
                                type: ToolParameterType;
                                enum?: string[];
                            }
                        ).enum = paramInfoObj.enum as string[];
                    }
                }
            }
        } else if (paramInfoObj?.enum) {
            // Handle enum for non-array types
            properties[apiParamName].enum = paramInfoObj.enum;
        }

        // If parameter has no default value and is not marked optional, it's required
        if (defaultValue === undefined && !paramInfoObj?.optional) {
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
        injectAbortSignal,
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
