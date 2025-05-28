// ================================================================
// Tool Executor - Handles execution of tool calls
// ================================================================

import { ToolCall, ToolRegistry, ToolFunction } from '../types.js';
import { createToolResultMessage } from '../core/message_factory.js';

/**
 * Result of executing a single tool call
 */
export interface ToolExecutionResult {
    callId: string;
    name: string;
    output: any;
    message: ReturnType<typeof createToolResultMessage>;
    error?: Error;
    executionTimeMs: number;
}

/**
 * Options for tool execution
 */
export interface ToolExecutionOptions {
    /**
     * Whether to execute tools in parallel (default: true)
     */
    parallel?: boolean;
    
    /**
     * Timeout for tool execution in milliseconds (default: 30000)
     */
    timeoutMs?: number;
    
    /**
     * Maximum number of concurrent tool executions (default: 5)
     */
    maxConcurrency?: number;
    
    /**
     * Agent ID for context (optional)
     */
    agentId?: string;
    
    /**
     * Whether to continue execution if one tool fails (default: true)
     */
    continueOnError?: boolean;
}

/**
 * Execute a list of tool calls using the provided tool registry
 */
export async function executeTools(
    toolCalls: ToolCall[],
    toolRegistry: ToolRegistry,
    options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult[]> {
    const {
        parallel = true,
        timeoutMs = 30000,
        maxConcurrency = 5,
        agentId,
        continueOnError = true
    } = options;

    if (toolCalls.length === 0) {
        return [];
    }

    const executeToolCall = async (call: ToolCall): Promise<ToolExecutionResult> => {
        const startTime = Date.now();
        const toolFunction = toolRegistry.get(call.function.name);
        
        if (!toolFunction) {
            const errorMessage = `Tool '${call.function.name}' not found in registry`;
            const error = new Error(errorMessage);
            return {
                callId: call.id,
                name: call.function.name,
                output: { error: errorMessage },
                message: createToolResultMessage(call.id, errorMessage, call.function.name),
                error,
                executionTimeMs: Date.now() - startTime
            };
        }

        try {
            // Parse arguments
            let args: any;
            try {
                args = JSON.parse(call.function.arguments);
            } catch (parseError) {
                const errorMessage = `Invalid JSON arguments for tool '${call.function.name}': ${parseError}`;
                const error = new Error(errorMessage);
                return {
                    callId: call.id,
                    name: call.function.name,
                    output: { error: errorMessage },
                    message: createToolResultMessage(call.id, errorMessage, call.function.name),
                    error,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Execute the tool with timeout
            const output = await executeWithTimeout(
                () => toolFunction.execute(args),
                timeoutMs
            );

            return {
                callId: call.id,
                name: call.function.name,
                output,
                message: createToolResultMessage(call.id, call.function.name, output),
                executionTimeMs: Date.now() - startTime
            };

        } catch (error: any) {
            const errorMessage = `Error executing tool '${call.function.name}': ${error.message || error}`;
            console.error(errorMessage, error);
            
            return {
                callId: call.id,
                name: call.function.name,
                output: { error: errorMessage },
                message: createToolResultMessage(call.id, errorMessage, call.function.name),
                error: error instanceof Error ? error : new Error(errorMessage),
                executionTimeMs: Date.now() - startTime
            };
        }
    };

    if (parallel && toolCalls.length > 1) {
        // Execute tools in parallel with concurrency limit
        return await executeInParallel(toolCalls, executeToolCall, maxConcurrency, continueOnError);
    } else {
        // Execute tools sequentially
        return await executeSequentially(toolCalls, executeToolCall, continueOnError);
    }
}

/**
 * Execute tools in parallel with concurrency control
 */
async function executeInParallel<T>(
    items: T[],
    executor: (item: T) => Promise<ToolExecutionResult>,
    maxConcurrency: number,
    continueOnError: boolean
): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    const executing: Promise<void>[] = [];
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // If we're at max concurrency, wait for one to complete
        if (executing.length >= maxConcurrency) {
            await Promise.race(executing);
        }
        
        const promise = executor(item)
            .then(result => {
                results[i] = result;
                if (result.error && !continueOnError) {
                    throw result.error;
                }
            })
            .catch(error => {
                if (!continueOnError) {
                    throw error;
                }
                // Error already handled in executor
            })
            .finally(() => {
                const index = executing.indexOf(promise);
                if (index > -1) {
                    executing.splice(index, 1);
                }
            });
        
        executing.push(promise);
    }
    
    // Wait for all remaining executions to complete
    await Promise.all(executing);
    
    return results.filter(Boolean); // Remove any undefined results
}

/**
 * Execute tools sequentially
 */
async function executeSequentially(
    toolCalls: ToolCall[],
    executor: (call: ToolCall) => Promise<ToolExecutionResult>,
    continueOnError: boolean
): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    
    for (const call of toolCalls) {
        try {
            const result = await executor(call);
            results.push(result);
            
            if (result.error && !continueOnError) {
                break;
            }
        } catch (error) {
            if (!continueOnError) {
                throw error;
            }
            // Error already handled in executor
        }
    }
    
    return results;
}

/**
 * Execute a function with a timeout
 */
async function executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        fn()
            .then(result => {
                clearTimeout(timer);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

/**
 * Validate a tool call structure
 */
export function validateToolCall(toolCall: ToolCall): { valid: boolean; error?: string } {
    if (!toolCall.id) {
        return { valid: false, error: 'Tool call missing ID' };
    }
    
    if (toolCall.type !== 'function') {
        return { valid: false, error: 'Tool call type must be "function"' };
    }
    
    if (!toolCall.function?.name) {
        return { valid: false, error: 'Tool call missing function name' };
    }
    
    if (typeof toolCall.function.arguments !== 'string') {
        return { valid: false, error: 'Tool call arguments must be a string' };
    }
    
    // Try to parse arguments to ensure they're valid JSON
    try {
        JSON.parse(toolCall.function.arguments);
    } catch {
        return { valid: false, error: 'Tool call arguments must be valid JSON' };
    }
    
    return { valid: true };
}

/**
 * Validate a tool registry
 */
export function validateToolRegistry(toolRegistry: ToolRegistry): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const [name, toolFunction] of toolRegistry.entries()) {
        if (!toolFunction.definition) {
            errors.push(`Tool '${name}' missing definition`);
            continue;
        }
        
        if (!toolFunction.execute || typeof toolFunction.execute !== 'function') {
            errors.push(`Tool '${name}' missing or invalid execute function`);
            continue;
        }
        
        if (toolFunction.definition.function.name !== name) {
            errors.push(`Tool registry key '${name}' does not match definition name '${toolFunction.definition.function.name}'`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Create a tool registry from an array of tool functions
 */
export function createToolRegistry(tools: ToolFunction[]): ToolRegistry {
    const registry = new Map<string, ToolFunction>();
    
    for (const tool of tools) {
        registry.set(tool.definition.function.name, tool);
    }
    
    return registry;
}

/**
 * Merge multiple tool registries
 */
export function mergeToolRegistries(...registries: ToolRegistry[]): ToolRegistry {
    const merged = new Map<string, ToolFunction>();
    
    for (const registry of registries) {
        for (const [name, tool] of registry.entries()) {
            if (merged.has(name)) {
                console.warn(`Tool '${name}' is defined in multiple registries, using the last one`);
            }
            merged.set(name, tool);
        }
    }
    
    return merged;
}