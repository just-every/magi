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
} from '../types.js';
import {Agent} from './agent.js';

/**
 * Process a tool call from an agent
 */
export async function processToolCall(
	toolCall: ToolEvent,
	agent: Agent,
	handlers: ToolCallHandler = {}): Promise<string> {

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
				try {
					if (call.function.arguments && call.function.arguments.trim()) {
						JSON.parse(call.function.arguments);
					}
				} catch (parseError) {
					console.error('Error parsing arguments:', parseError);
				}

				// Handle the tool call (pass the agent for event handlers)
				const result = await handleToolCall(call, agent, handlers);

				// Log tool call
				const {function: {name}} = call;
				console.log(`[Tool] ${name} executed successfully`, result);

				return result;
			} catch (error) {
				console.error('Error executing tool:', error);

				return `{"error": "${String(error).replace(/"/g, '\\"')}"}`;
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
export async function handleToolCall(
	toolCall: ToolCall,
	agent: Agent,
	handlers: ToolCallHandler = {}): Promise<string> {

	// Validate the tool call structure
	if (!toolCall.function || !toolCall.function.name) {
		throw new Error('Invalid tool call structure: missing function name');
	}

	const {function: {name, arguments: argsString}} = toolCall;

	// Trigger onToolCall handler if available
	try {
		if (agent && agent.onToolCall) {
			await agent.onToolCall(toolCall);
		}
		if(handlers.onToolCall) {
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
		throw new Error(`Invalid JSON in tool arguments: ${error?.message || String(error)}`);
	}

	if (!agent.tools) {
		throw new Error(`Agent ${agent.name} has no tools defined`);
	}

	const tool = agent.tools.find(tool => tool.definition.function.name === name);
	if (!tool) {
		throw new Error(`Tool ${name} not found in agent ${agent.name}`);
	}

	// Call the implementation with the parsed arguments
	try {
		let result: string;
		if (typeof args === 'object' && args !== null) {
			// Extract named parameters based on implementation function definition
			const paramNames = Object.keys(tool.definition.function.parameters.properties);

			// Map args to parameters in correct order and convert to appropriate types
			if (paramNames.length > 0) {
				const orderedArgs = paramNames.map((param: string) => {
					const value = args[param as keyof typeof args];
					const paramSpec = tool.definition.function.parameters.properties[param];

					// Convert to expected type based on parameter definition
					if (paramSpec && paramSpec.type) {
						if (paramSpec.type === 'boolean' && typeof value !== 'boolean') {
							// Convert to boolean
							return value === 'true' || value === true;
						}
						if (paramSpec.type === 'number' && typeof value !== 'number') {
							// Convert to number
							return Number(value);
						}
					}

					return value;
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
		try {
			if (agent && agent.onToolResult) {
				await agent.onToolResult(toolCall, result);
			}
			if(handlers.onToolResult) {
				handlers.onToolResult(toolCall, result);
			}
		} catch (error) {
			console.error('Error in onToolResult handler:', error);
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
	func: (...args: any[]) => any,
	description?: string,
	paramMap?: Record<string, string | { name?: string, description?: string, type?: ToolParameterType, enum?: string[], optional?: boolean }>,
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
	const cleanFuncStr = funcStr.replace(/\n\s*/g, ' ');
	const paramMatch = cleanFuncStr.match(/\(([^)]*)\)/);

	const properties: Record<string, ToolParameter> = {};
	const required: string[] = [];

	if (paramMatch && paramMatch[1]) {
		const params = paramMatch[1].split(',').map(p => p.trim()).filter(Boolean);

		for (const param of params) {
			// Extract parameter name and default value
			const paramParts = param.split('=').map(p => p.trim());
			const paramName = paramParts[0].trim();
			const defaultValue = paramParts.length > 1 ? paramParts[1].trim() : undefined;

			// Handle rest parameters
			const isRestParam = paramName.startsWith('...');
			const cleanParamName = isRestParam ? paramName.substring(3) : paramName;

			// Check if we have custom mapping for this parameter
			let paramInfo = paramMap?.[cleanParamName];
			if (typeof paramInfo === 'string') {
				paramInfo = {description: paramInfo};
			}

			// Convert to snake_case for API consistency if needed
			const apiParamName = paramInfo?.name || cleanParamName;

			// Determine parameter type based on default value or param map
			let paramType: ToolParameterType = 'string'; // Default type

			if (paramInfo?.type && validToolParameterTypes.includes(paramInfo.type as any)) {
				// Use explicit type from paramMap if provided
				paramType = paramInfo.type as ToolParameterType;
			} else if (isRestParam) {
				// Rest parameters are arrays
				paramType = 'array';
			} else if (defaultValue !== undefined) {
				// Infer type from default value
				if (defaultValue === 'false' || defaultValue === 'true') {
					paramType = 'boolean';
				} else if (!isNaN(Number(defaultValue)) &&
					!defaultValue.startsWith('"') &&
					!defaultValue.startsWith("'")) {
					paramType = 'number';
				} else if (defaultValue === '[]' || defaultValue.startsWith('[')) {
					paramType = 'array';
				} else if (defaultValue === '{}' || defaultValue.startsWith('{')) {
					paramType = 'object';
				}
			}

			const description = paramInfo?.description || `The ${cleanParamName} parameter`;

			// Create parameter definition
			properties[apiParamName] = {
				type: paramType,
				description,
			};

			if (paramType === 'string' && paramInfo?.enum) {
				properties[apiParamName].enum = paramInfo.enum;
			}

			// If parameter has no default value, it's required
			if (defaultValue === undefined && !paramInfo?.optional) {
				required.push(apiParamName);
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
