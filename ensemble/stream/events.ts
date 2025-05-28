// ================================================================
// Stream Events for Ensemble - Unified streaming event definitions
// ================================================================

import { ToolCall, StreamEventType } from '../types.js';

// Re-export StreamEventType for backward compatibility
export { StreamEventType };

/**
 * Base interface for all ensemble stream events
 */
export interface BaseEnsembleStreamEvent {
    type: StreamEventType;
    timestamp: string; // ISO 8601 timestamp
}

/**
 * Event when a message starts being generated
 */
export interface MessageStartEvent extends BaseEnsembleStreamEvent {
    type: 'message_start';
    messageId: string;
    role: 'assistant' | 'tool' | 'system';
}

/**
 * Event for incremental content during message generation
 */
export interface MessageDeltaEvent extends BaseEnsembleStreamEvent {
    type: 'message_delta';
    delta: string;
    messageId: string;
}

/**
 * Event when a message is complete
 */
export interface MessageCompleteEvent extends BaseEnsembleStreamEvent {
    type: 'message_complete';
    messageId: string;
    fullContent: string;
    toolCalls?: ToolCall[]; // If message ends with tool calls
}

/**
 * Event when a tool call starts being generated
 */
export interface ToolCallStartEvent extends BaseEnsembleStreamEvent {
    type: 'tool_call_start';
    toolCallId: string;
    functionName?: string; // May arrive early or be empty initially
}

/**
 * Event for incremental tool call data (name or arguments)
 */
export interface ToolCallDeltaEvent extends BaseEnsembleStreamEvent {
    type: 'tool_call_delta';
    toolCallId: string;
    functionName?: string; // Function name if it arrives in this delta
    argumentChunk?: string; // Incremental argument data
}

/**
 * Event when a single tool call is complete
 */
export interface ToolCallCompleteEvent extends BaseEnsembleStreamEvent {
    type: 'tool_call_complete';
    toolCall: ToolCall; // The complete ToolCall object
}

/**
 * Event when multiple tool calls arrive at once (batch)
 */
export interface ToolCallsChunkEvent extends BaseEnsembleStreamEvent {
    type: 'tool_calls_chunk';
    tool_calls: ToolCall[];
}

/**
 * Event when thinking starts (for reasoning models)
 */
export interface ThinkingStartEvent extends BaseEnsembleStreamEvent {
    type: 'thinking_start';
    thinkingId: string;
}

/**
 * Event for incremental thinking content
 */
export interface ThinkingDeltaEvent extends BaseEnsembleStreamEvent {
    type: 'thinking_delta';
    delta: string;
    thinkingId: string;
}

/**
 * Event when thinking is complete
 */
export interface ThinkingCompleteEvent extends BaseEnsembleStreamEvent {
    type: 'thinking_complete';
    thinkingId: string;
    fullContent: string;
}

/**
 * Error event for stream errors
 */
export interface ErrorEvent extends BaseEnsembleStreamEvent {
    type: 'error';
    error: string;
    code?: string;
    details?: any;
}

/**
 * Event signaling the end of the stream
 */
export interface StreamEndEvent extends BaseEnsembleStreamEvent {
    type: 'stream_end';
}

/**
 * Event for cost/usage updates
 */
export interface CostUpdateEvent extends BaseEnsembleStreamEvent {
    type: 'cost_update';
    usage: {
        input_tokens?: number;
        output_tokens?: number;
        cached_tokens?: number;
        cost?: number;
        model: string;
    };
}

/**
 * Event for arbitrary metadata
 */
export interface MetadataEvent extends BaseEnsembleStreamEvent {
    type: 'metadata';
    data: any;
    key?: string;
}

/**
 * Union type for all ensemble streaming events
 */
export type EnsembleStreamEvent =
    | MessageStartEvent
    | MessageDeltaEvent
    | MessageCompleteEvent
    | ToolCallStartEvent
    | ToolCallDeltaEvent
    | ToolCallCompleteEvent
    | ToolCallsChunkEvent
    | ThinkingStartEvent
    | ThinkingDeltaEvent
    | ThinkingCompleteEvent
    | ErrorEvent
    | StreamEndEvent
    | CostUpdateEvent
    | MetadataEvent;

/**
 * Type guards for stream events
 */
export function isMessageStartEvent(event: EnsembleStreamEvent): event is MessageStartEvent {
    return event.type === 'message_start';
}

export function isMessageDeltaEvent(event: EnsembleStreamEvent): event is MessageDeltaEvent {
    return event.type === 'message_delta';
}

export function isMessageCompleteEvent(event: EnsembleStreamEvent): event is MessageCompleteEvent {
    return event.type === 'message_complete';
}

export function isToolCallStartEvent(event: EnsembleStreamEvent): event is ToolCallStartEvent {
    return event.type === 'tool_call_start';
}

export function isToolCallDeltaEvent(event: EnsembleStreamEvent): event is ToolCallDeltaEvent {
    return event.type === 'tool_call_delta';
}

export function isToolCallCompleteEvent(event: EnsembleStreamEvent): event is ToolCallCompleteEvent {
    return event.type === 'tool_call_complete';
}

export function isToolCallsChunkEvent(event: EnsembleStreamEvent): event is ToolCallsChunkEvent {
    return event.type === 'tool_calls_chunk';
}

export function isThinkingStartEvent(event: EnsembleStreamEvent): event is ThinkingStartEvent {
    return event.type === 'thinking_start';
}

export function isThinkingDeltaEvent(event: EnsembleStreamEvent): event is ThinkingDeltaEvent {
    return event.type === 'thinking_delta';
}

export function isThinkingCompleteEvent(event: EnsembleStreamEvent): event is ThinkingCompleteEvent {
    return event.type === 'thinking_complete';
}

export function isErrorEvent(event: EnsembleStreamEvent): event is ErrorEvent {
    return event.type === 'error';
}

export function isStreamEndEvent(event: EnsembleStreamEvent): event is StreamEndEvent {
    return event.type === 'stream_end';
}

export function isCostUpdateEvent(event: EnsembleStreamEvent): event is CostUpdateEvent {
    return event.type === 'cost_update';
}

export function isMetadataEvent(event: EnsembleStreamEvent): event is MetadataEvent {
    return event.type === 'metadata';
}

/**
 * Helper to create common event instances
 */
export const EventFactory = {
    messageStart(messageId: string, role: 'assistant' | 'tool' | 'system' = 'assistant'): MessageStartEvent {
        return {
            type: 'message_start',
            messageId,
            role,
            timestamp: new Date().toISOString()
        };
    },

    messageDelta(messageId: string, delta: string): MessageDeltaEvent {
        return {
            type: 'message_delta',
            messageId,
            delta,
            timestamp: new Date().toISOString()
        };
    },

    messageComplete(messageId: string, fullContent: string, toolCalls?: ToolCall[]): MessageCompleteEvent {
        return {
            type: 'message_complete',
            messageId,
            fullContent,
            toolCalls,
            timestamp: new Date().toISOString()
        };
    },

    toolCallStart(toolCallId: string, functionName?: string): ToolCallStartEvent {
        return {
            type: 'tool_call_start',
            toolCallId,
            functionName,
            timestamp: new Date().toISOString()
        };
    },

    toolCallDelta(toolCallId: string, functionName?: string, argumentChunk?: string): ToolCallDeltaEvent {
        return {
            type: 'tool_call_delta',
            toolCallId,
            functionName,
            argumentChunk,
            timestamp: new Date().toISOString()
        };
    },

    toolCallComplete(toolCall: ToolCall): ToolCallCompleteEvent {
        return {
            type: 'tool_call_complete',
            toolCall,
            timestamp: new Date().toISOString()
        };
    },

    toolCallsChunk(tool_calls: ToolCall[]): ToolCallsChunkEvent {
        return {
            type: 'tool_calls_chunk',
            tool_calls,
            timestamp: new Date().toISOString()
        };
    },

    thinkingStart(thinkingId: string): ThinkingStartEvent {
        return {
            type: 'thinking_start',
            thinkingId,
            timestamp: new Date().toISOString()
        };
    },

    thinkingDelta(thinkingId: string, delta: string): ThinkingDeltaEvent {
        return {
            type: 'thinking_delta',
            thinkingId,
            delta,
            timestamp: new Date().toISOString()
        };
    },

    thinkingComplete(thinkingId: string, fullContent: string): ThinkingCompleteEvent {
        return {
            type: 'thinking_complete',
            thinkingId,
            fullContent,
            timestamp: new Date().toISOString()
        };
    },

    error(error: string, code?: string, details?: any): ErrorEvent {
        return {
            type: 'error',
            error,
            code,
            details,
            timestamp: new Date().toISOString()
        };
    },

    streamEnd(): StreamEndEvent {
        return {
            type: 'stream_end',
            timestamp: new Date().toISOString()
        };
    },

    costUpdate(usage: CostUpdateEvent['usage']): CostUpdateEvent {
        return {
            type: 'cost_update',
            usage,
            timestamp: new Date().toISOString()
        };
    },

    metadata(data: any, key?: string): MetadataEvent {
        return {
            type: 'metadata',
            data,
            key,
            timestamp: new Date().toISOString()
        };
    }
};