// ================================================================
// Request Pipeline - Main conversation handling logic
// ================================================================

import { Conversation } from '../core/conversation.js';
import { 
    RequestParams, 
    ToolRegistry, 
    ToolCall,
    ResponseInputItem,
    ToolFunction
} from '../types.js';
import { EnsembleStreamEvent } from '../stream/events.js';
import { accumulateStream, AccumulateStreamResult } from '../stream/accumulator.js';
import { executeTools, ToolExecutionOptions } from './tool_executor.js';
import { getModelProvider } from '../provider/base_provider.js';

/**
 * Handle returned by the request function, containing conversation state and metadata
 */
export interface ConversationHandle {
    conversation: Conversation;
    lastAssistantText?: string;
    rawToolCallsThisTurn?: ToolCall[];
    toolResultsThisTurn?: any[];
    rawStream: AsyncIterable<EnsembleStreamEvent>;
    errors?: string[];
    executionTimeMs: number;
}

/**
 * Options for the request pipeline
 */
export interface RequestPipelineOptions {
    /**
     * Maximum number of tool call rounds per request (default: 3)
     */
    maxToolRounds?: number;
    
    /**
     * Tool execution options
     */
    toolExecutionOptions?: ToolExecutionOptions;
    
    /**
     * Whether to auto-add tool results to conversation (default: true)
     */
    autoAddToolResults?: boolean;
    
    /**
     * Custom tool executor function (overrides default executor)
     */
    customToolExecutor?: (toolCalls: ToolCall[], tools: ToolRegistry) => Promise<any[]>;
}

/**
 * Main request pipeline function - handles the complete conversation turn with tool orchestration
 */
export async function request(
    model: string,
    initialConversation: Conversation,
    params: RequestParams,
    options: RequestPipelineOptions = {}
): Promise<ConversationHandle> {
    const startTime = Date.now();
    
    const {
        maxToolRounds = params.modelSettings?.maxToolCallRoundsPerTurn || 3,
        toolExecutionOptions = {},
        autoAddToolResults = true,
        customToolExecutor
    } = options;

    let currentConversation = initialConversation.clone();
    let accumulatedToolCalls: ToolCall[] = [];
    let accumulatedToolResults: any[] = [];
    let lastAssistantTextResponse: string | undefined;
    let finalEventStream: AsyncIterable<EnsembleStreamEvent> | null = null;
    let allErrors: string[] = [];

    for (let round = 0; round < maxToolRounds; round++) {
        const provider = getModelProvider(model);
        
        // Create stream from provider
        const stream = provider.createStream(model, currentConversation.toJSON(), {
            modelSettings: params.modelSettings,
            tools: params.tools ? Array.from(params.tools.values()).map(tf => tf.definition) : undefined,
            agentId: params.agentId
        });

        // Keep reference to the final stream
        finalEventStream = stream;

        // Accumulate events from the LLM stream
        let accumulationResult: AccumulateStreamResult;
        try {
            accumulationResult = await accumulateStream(stream, currentConversation, params.onEvent as ((event: EnsembleStreamEvent) => void));
        } catch (error: any) {
            const errorMessage = `Stream accumulation failed: ${error.message || error}`;
            allErrors.push(errorMessage);
            
            // Return what we have so far
            return {
                conversation: currentConversation,
                lastAssistantText: lastAssistantTextResponse,
                rawToolCallsThisTurn: accumulatedToolCalls,
                toolResultsThisTurn: accumulatedToolResults,
                rawStream: createErrorStream(errorMessage),
                errors: allErrors,
                executionTimeMs: Date.now() - startTime
            };
        }

        // Update conversation state
        currentConversation = accumulationResult.updatedConversation;
        allErrors.push(...accumulationResult.errors);

        // Track assistant text response
        if (accumulationResult.assistantTextMessage && 
            'content' in accumulationResult.assistantTextMessage && 
            accumulationResult.assistantTextMessage.content) {
            lastAssistantTextResponse = typeof accumulationResult.assistantTextMessage.content === 'string' 
                ? accumulationResult.assistantTextMessage.content 
                : String(accumulationResult.assistantTextMessage.content);
        }

        // Track tool calls from this round
        accumulatedToolCalls.push(...accumulationResult.detectedToolCalls);

        // If no tools were called, we're done with this turn
        if (accumulationResult.detectedToolCalls.length === 0) {
            break;
        }

        // If no tools were provided by the caller, log warning and break
        if (!params.tools || params.tools.length === 0) {
            const warningMessage = "LLM requested tools, but no tool registry was provided to request()";
            console.warn(warningMessage);
            allErrors.push(warningMessage);
            break;
        }

        // Execute detected tools
        try {
            let toolResults: any[];
            
            // Convert tools array to Map
            const toolRegistry = new Map<string, ToolFunction>();
            params.tools.forEach(tool => {
                toolRegistry.set(tool.definition.function.name, tool);
            });
            
            if (customToolExecutor) {
                toolResults = await customToolExecutor(accumulationResult.detectedToolCalls, toolRegistry);
            } else if (false) { // Disable custom execution for now
                // Use custom tool call executor if provided
                toolResults = [];
                for (const toolCall of accumulationResult.detectedToolCalls) {
                    try {
                        // Custom execution disabled for now
                        const result = { output: 'custom execution disabled' };
                        toolResults.push(result.output);
                    } catch (error: any) {
                        const errorOutput = `Error executing tool ${toolCall.function.name}: ${error.message || error}`;
                        toolResults.push({ error: errorOutput });
                        allErrors.push(errorOutput);
                    }
                }
            } else {
                // Use default tool executor
                const executionResults = await executeTools(
                    accumulationResult.detectedToolCalls, 
                    toolRegistry,
                    {
                        ...toolExecutionOptions,
                        agentId: params.agentId
                    }
                );
                
                toolResults = executionResults.map(result => result.output);
                
                // Add tool result messages to conversation if enabled
                if (autoAddToolResults) {
                    executionResults.forEach(result => {
                        currentConversation.add(result.message);
                        if (result.error) {
                            allErrors.push(`Tool execution error: ${result.error.message}`);
                        }
                    });
                }
                
                // Track execution errors
                const executionErrors = executionResults
                    .filter(result => result.error)
                    .map(result => result.error!.message);
                allErrors.push(...executionErrors);
            }
            
            accumulatedToolResults.push(...toolResults);

        } catch (error: any) {
            const errorMessage = `Tool execution failed: ${error.message || error}`;
            console.error(errorMessage, error);
            allErrors.push(errorMessage);
            
            // Continue to next round or break based on severity
            if (round === maxToolRounds - 1) {
                break;
            }
        }

        // Check if we've hit the max rounds limit
        if (round === maxToolRounds - 1 && accumulationResult.detectedToolCalls.length > 0) {
            const warningMessage = `Max tool rounds (${maxToolRounds}) reached. Returning conversation with tool results, but LLM hasn't processed them yet.`;
            console.warn(warningMessage);
            allErrors.push(warningMessage);
        }
    }

    // If we don't have a final stream (shouldn't happen), create an empty one
    if (!finalEventStream) {
        finalEventStream = createEmptyStream();
        console.warn("Final event stream was not captured; returning an empty stream in ConversationHandle.");
    }

    return {
        conversation: currentConversation,
        lastAssistantText: lastAssistantTextResponse,
        rawToolCallsThisTurn: accumulatedToolCalls,
        toolResultsThisTurn: accumulatedToolResults,
        rawStream: finalEventStream,
        errors: allErrors.length > 0 ? allErrors : undefined,
        executionTimeMs: Date.now() - startTime
    };
}

/**
 * Simplified request function that doesn't handle tools - just a single LLM call
 */
export async function simpleRequest(
    model: string,
    initialConversation: Conversation,
    params: Omit<RequestParams, 'tools'> & { modelSettings?: RequestParams['modelSettings'] }
): Promise<ConversationHandle> {
    return request(model, initialConversation, { ...params, tools: undefined }, { maxToolRounds: 1 });
}

/**
 * Stream a request without waiting for completion - returns an async iterator
 */
export async function* streamRequest(
    model: string,
    initialConversation: Conversation,
    params: RequestParams
): AsyncIterable<EnsembleStreamEvent> {
    const provider = getModelProvider(model);
    
    const stream = provider.createStream(model, initialConversation.toJSON(), {
        modelSettings: params.modelSettings,
        tools: params.tools ? Array.from(params.tools.values()).map(tf => tf.definition) : undefined,
        agentId: params.agentId
    });

    for await (const event of stream) {
        params.onEvent?.(event as EnsembleStreamEvent);
        yield event;
    }
}

/**
 * Create an empty stream for fallback cases
 */
async function* createEmptyStream(): AsyncIterable<EnsembleStreamEvent> {
    yield {
        type: 'stream_end',
        timestamp: new Date().toISOString()
    };
}

/**
 * Create an error stream
 */
async function* createErrorStream(errorMessage: string): AsyncIterable<EnsembleStreamEvent> {
    yield {
        type: 'error',
        error: errorMessage,
        timestamp: new Date().toISOString()
    };
    yield {
        type: 'stream_end',
        timestamp: new Date().toISOString()
    };
}

/**
 * Validate request parameters
 */
export function validateRequestParams(
    model: string,
    conversation: Conversation,
    params: RequestParams
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!model || typeof model !== 'string') {
        errors.push('Model must be a non-empty string');
    }

    if (!conversation || !(conversation instanceof Conversation)) {
        errors.push('Conversation must be a valid Conversation instance');
    }

    if (params.tools && !(params.tools instanceof Map)) {
        errors.push('Tools must be a Map instance (ToolRegistry)');
    }

    if (params.modelSettings && typeof params.modelSettings !== 'object') {
        errors.push('ModelSettings must be an object');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Helper to check if the provider supports a model
 */
export function isModelSupported(model: string): boolean {
    try {
        getModelProvider(model);
        return true;
    } catch {
        return false;
    }
}