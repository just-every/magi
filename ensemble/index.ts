// ================================================================
// Ensemble - Standalone Conversation Engine
// Public API Exports
// ================================================================

// Initialize providers (this happens when the module is imported)
import './provider/registry.js';

// ================================================================
// Core Abstractions
// ================================================================
export { Conversation } from './core/conversation.js';
export {
    createUserMessage,
    createSystemMessage,
    createDeveloperMessage,
    createAssistantMessage,
    createToolCallMessage,
    createToolResultMessage,
    createThinkingMessage,
    isUserMessage,
    isAssistantMessage,
    isToolCall,
    isToolResult,
    isThinking
} from './core/message_factory.js';
export {
    generateId,
    generateIdWithPrefix,
    generateToolCallId,
    generateMessageId,
    generateThinkingId
} from './core/ids.js';

// ================================================================
// Main Request Pipeline
// ================================================================
export {
    request,
    simpleRequest,
    streamRequest,
    validateRequestParams,
    isModelSupported,
    type ConversationHandle,
    type RequestPipelineOptions
} from './orchestration/request_pipeline.js';

// ================================================================
// Tool Orchestration
// ================================================================
export {
    executeTools,
    validateToolCall,
    validateToolRegistry,
    createToolRegistry,
    mergeToolRegistries,
    type ToolExecutionResult,
    type ToolExecutionOptions
} from './orchestration/tool_executor.js';

// ================================================================
// Stream Processing
// ================================================================
export {
    accumulateStream,
    type AccumulateStreamResult
} from './stream/accumulator.js';
export {
    EventFactory,
    isMessageStartEvent,
    isMessageDeltaEvent,
    isMessageCompleteEvent,
    isToolCallStartEvent,
    isToolCallDeltaEvent,
    isToolCallCompleteEvent,
    isToolCallsChunkEvent,
    isThinkingStartEvent,
    isThinkingDeltaEvent,
    isThinkingCompleteEvent,
    isErrorEvent,
    isStreamEndEvent,
    isCostUpdateEvent,
    isMetadataEvent,
    type StreamEventType
} from './stream/events.js';

// ================================================================
// Provider System
// ================================================================
export {
    getModelProvider,
    registerProvider,
    getAllProviders,
    clearProviders,
    hasProvider,
    AbstractProvider,
    type BaseProvider,
    type ProviderRequestParams
} from './provider/base_provider.js';

// ================================================================
// Core Types
// ================================================================
export type {
    // Message types
    ResponseInputItem,
    ResponseInputMessage,
    ResponseThinkingMessage,
    ResponseOutputMessage,
    ResponseInputFunctionCall,
    ResponseInputFunctionCallOutput,
    ResponseContent,

    // Tool types
    ToolDefinition,
    ToolFunction,
    ToolRegistry,
    ToolCall,
    ToolParameter,
    ToolParameterType,
    ExecutableToolFunction,
    ExecutableFunction,

    // Model types
    ModelSettings,
    ResponseJSONSchema,

    // Request types
    RequestParams
} from './types.js';

// ================================================================
// Stream Event Types
// ================================================================
// Temporarily commented out due to type conflicts
// export type {
//     EnsembleStreamEvent,
//     BaseEnsembleStreamEvent,
//     MessageStartEvent,
//     MessageDeltaEvent,
//     MessageCompleteEvent,
//     ToolCallStartEvent,
//     ToolCallDeltaEvent,
//     ToolCallCompleteEvent,
//     ToolCallsChunkEvent,
//     ThinkingStartEvent,
//     ThinkingDeltaEvent,
//     ThinkingCompleteEvent,
//     ErrorEvent,
//     StreamEndEvent,
//     CostUpdateEvent,
//     MetadataEvent
// } from './stream/events.js';

// ================================================================
// Legacy Compatibility Layer
// ================================================================
// Re-export some existing functionality for backward compatibility

// Model data and provider utilities from the original system
export {
    getModelProvider as getLegacyModelProvider,
    getProviderFromModel,
    getModelFromClass,
    isProviderKeyValid
} from './model_providers/model_provider.js';

export {
    MODEL_REGISTRY,
    MODEL_CLASSES,
    findModel,
    type ModelProviderID,
    type ModelUsage,
    type TieredPrice,
    type TimeBasedPrice,
    type ModelEntry,
    type ModelClassID
} from './model_data.js';

// Additional types
export type {
    ResponseInput,
    EnsembleAgent,
    CancelHandle,
    StreamEvent,
    MessageEvent,
    ToolEvent,
    ModelProvider,
    EnsembleStreamEvent
    // ErrorEvent,  // Commented out due to duplicates
    // CostUpdateEvent,  // Commented out due to duplicates
} from './types.js';

// Utils that are commonly used
export * from './utils/cost_tracker.js';
export * from './utils/quota_tracker.js';
export * from './utils/async_queue.js';
export * from './utils/delta_buffer.js';

// Logger exports
export { EnsembleLogger, setEnsembleLogger } from './utils/llm_logger.js';

// Provider exports
export { openaiProvider } from './model_providers/openai.js';


// ================================================================
// Convenience Factory Functions
// ================================================================

import { Conversation } from './core/conversation.js';
import {
    ResponseInputItem,
    ToolFunction,
    ToolRegistry,
    ToolDefinition,
    ExecutableToolFunction
} from './types.js';
import { createToolRegistry } from './orchestration/tool_executor.js';

/**
 * Create a new conversation with optional initial messages
 */
export function createConversation(initialMessages?: ResponseInputItem[]): Conversation {
    return new Conversation(initialMessages);
}

/**
 * Create a simple tool registry from an array of functions
 */
export function createSimpleToolRegistry(tools: ToolFunction[]): ToolRegistry {
    return createToolRegistry(tools);
}

/**
 * Helper to create a basic tool function
 */
export function createToolFunction(
    name: string,
    description: string,
    parameters: ToolDefinition['function']['parameters'],
    execute: ExecutableToolFunction
): ToolFunction {
    return {
        definition: {
            type: 'function',
            function: {
                name,
                description,
                parameters
            }
        },
        function: execute as any,
        execute
    };
}