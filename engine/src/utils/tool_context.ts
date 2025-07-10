/**
 * Tool Context Builder
 *
 * Creates a context object with helpful functions that can be injected into
 * the VM sandbox for custom tool execution. This allows generated tools
 * to call existing agent functionality safely.
 */

import { quick_llm_call } from './llm_call_utils.js';
import { getToolsForCustomFunctions } from './index.js';
import type { ModelClassID } from '../types/shared-types.js';
import type { ToolFunction } from '@just-every/ensemble';
import { v4 as uuid } from 'uuid';

/**
 * Generate detailed descriptions of all available helper functions for inclusion in prompts
 * This extracts the name, description, parameters, and return value of each tool function
 * along with additional built-in utilities
 * @returns Array of formatted strings describing each helper function with complete signature
 */
export function getHelperDescriptions(): string[] {
    const lines: string[] = [];

    // Get all tools available to custom functions
    const tools = getToolsForCustomFunctions();

    // Sort tools by name for consistency
    tools.sort((a, b) => {
        const nameA = a.definition?.function?.name || '';
        const nameB = b.definition?.function?.name || '';
        return nameA.localeCompare(nameB);
    });

    // Add each tool with its complete function specification
    for (const tool of tools) {
        if (tool.definition?.function?.name) {
            const name = tool.definition.function.name;
            const desc = tool.definition.function.description || '';
            const params =
                tool.definition.function.parameters?.properties || {};
            const required =
                tool.definition.function.parameters?.required || [];

            // Build the function signature with JSDoc-style comment
            let functionSpec = '/**\n * ' + desc + '\n';

            // Add parameter documentation
            Object.entries(params).forEach(([paramName, paramDef]) => {
                const isRequired = required.includes(paramName);
                const optionalMark = isRequired ? '' : '?';

                // Add parameter description with type information
                functionSpec +=
                    ' * @param ' +
                    paramName +
                    optionalMark +
                    ' ' +
                    (paramDef.description || '') +
                    '\n';
            });

            // Add return type if available
            functionSpec += ' * @returns Promise<string>\n';

            functionSpec += ' */\n';

            // Build the actual function signature as a TypeScript ambient declaration
            functionSpec += 'declare function ' + name + '(';

            // Add parameters to function signature
            const paramEntries = Object.entries(params);
            if (paramEntries.length > 0) {
                functionSpec += '\n';
                paramEntries.forEach(([paramName, paramDef], index) => {
                    const isRequired = required.includes(paramName);
                    const optionalMark = isRequired ? '' : '?';

                    // Format type information
                    let typeInfo = paramDef.type || 'any';
                    if (paramDef.type === 'array' && paramDef.items?.type) {
                        typeInfo =
                            paramDef.type + '<' + paramDef.items.type + '>';
                    }

                    // Add enum values if available
                    if (paramDef.enum) {
                        if (typeof paramDef.enum === 'function') {
                            typeInfo = 'string'; // Just use string for dynamic enums
                        } else {
                            typeInfo = paramDef.enum
                                .map(v => "'" + v + "'")
                                .join(' | ');
                        }
                    } else if (paramDef.items?.enum) {
                        if (typeof paramDef.items.enum === 'function') {
                            typeInfo = 'array<string>'; // Just use array of strings for dynamic enums
                        } else {
                            typeInfo =
                                'array<' +
                                paramDef.items.enum
                                    .map(v => "'" + v + "'")
                                    .join(' | ') +
                                '>';
                        }
                    }

                    // Add parameter to signature with type
                    functionSpec +=
                        '    ' + paramName + optionalMark + ': ' + typeInfo;

                    // Add comma if not the last parameter
                    if (index < paramEntries.length - 1) {
                        functionSpec += ',';
                    }

                    functionSpec += '\n';
                });
                functionSpec += ')';
            } else {
                functionSpec += ')';
            }

            // Add return type
            functionSpec += ': Promise<string>;\n';

            lines.push(functionSpec);
        }
    }

    // Add other core utilities that aren't part of ToolFunctions
    lines.push(`/**
 * Call an LLM with the specified text prompt
 * @param messages Either a string or array of message objects to send to the LLM. Include your full request here.
 * @param modelClass The type of agent to use for the call. 'reasoning_mini' is a good choice for non-specialized tasks. It's fast, cheap, and accurate.
 * @returns The LLM's response as a string
 */
declare function quick_llm_call(
    messages: string | Array<{ type: 'message'; role: 'user' | 'system' | 'developer'; content: string }>,
    modelClass: 'reasoning_mini' | 'reasoning' | 'code' | 'writing' | 'summary' | 'vision' | 'image_generation',
): Promise<string>;`);

    lines.push(`/**
 * Generate a v4 uuid
 * @returns A random alphanumeric string in UUID format
 */
declare function uuid(): string;`);

    // Add the agent_id declaration
    lines.push(`/**
 * The ID of the current agent.
 */
export declare const agent_id: string;`);

    return lines;
}

/**
 * Extract the actual function implementations from ToolFunction objects
 * @param tools Array of ToolFunction objects
 * @param agent_id Optional agent ID to inject into functions that require it
 * @returns Object with function names as keys and implementations as values
 */
function extractFunctionsFromTools(
    tools: ToolFunction[],
    agent_id?: string
): Record<string, (...args: any[]) => Promise<string> | string> {
    const functions: Record<
        string,
        (...args: any[]) => Promise<string> | string
    > = {};

    for (const tool of tools) {
        if (
            tool.definition?.function?.name &&
            typeof tool.function === 'function'
        ) {
            const name = tool.definition.function.name;

            // If tool requires agent_id injection and we have an agent_id,
            // wrap the function to inject the agent_id as first parameter
            if (tool.injectAgentId && agent_id) {
                functions[name] = (...args: any[]) =>
                    tool.function(agent_id, ...args);
            } else {
                functions[name] = tool.function;
            }
        }
    }

    return functions;
}

/**
 * Build a tool context object containing helpful functions for custom tools
 * @param agent_id Optional agent ID to include agent-specific tools
 * @param communicationManager Optional communication manager instance to use
 * @returns Object with helper functions that can be used in a custom tool
 */
export function buildToolContext(
    agent_id?: string,
    communicationManager?: any
): Record<string, any> {
    // Get all tools that should be available to custom functions
    const tools = getToolsForCustomFunctions();

    // Extract the function implementations, passing agent_id for injection when needed
    const toolFunctions = extractFunctionsFromTools(tools, agent_id);

    // Create the context object with all extracted functions
    // plus additional core utilities
    return {
        ...toolFunctions,

        // Add more utility functions here
        // Wrap quick_llm_call to pass the communicationManager from the context
        quick_llm_call: (messages: any, modelClass: ModelClassID) =>
            quick_llm_call(
                messages,
                modelClass,
                undefined,
                agent_id,
                communicationManager
            ),

        // Add simple helpers
        uuid,

        // Add any information about the current agent
        agent_id,
    };
}
