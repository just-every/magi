// ================================================================
// Stream Accumulator - Converts EnsembleStreamEvent stream to Conversation
// ================================================================

import { Conversation } from '../core/conversation.js';
import { 
    EnsembleStreamEvent, 
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
    isStreamEndEvent
} from './events.js';
import { 
    ToolCall, 
    ResponseInputItem
} from '../types.js';
import { 
    createAssistantMessage, 
    createToolCallMessage, 
    createThinkingMessage
} from '../core/message_factory.js';

/**
 * Result of accumulating a stream into conversation state
 */
export interface AccumulateStreamResult {
    updatedConversation: Conversation;
    assistantTextMessage?: ResponseInputItem;
    toolCallMessage?: ResponseInputItem;
    thinkingMessages: ResponseInputItem[];
    detectedToolCalls: ToolCall[];
    errors: string[];
}

/**
 * State maintained during stream accumulation
 */
interface AccumulationState {
    // Text message accumulation
    currentMessageId: string | null;
    currentMessageParts: string[];
    
    // Tool call accumulation
    toolCallBuffers: Map<string, {
        id: string;
        functionName: string;
        argumentParts: string[];
    }>;
    completedToolCalls: ToolCall[];
    
    // Thinking accumulation
    thinkingBuffers: Map<string, {
        id: string;
        contentParts: string[];
    }>;
    completedThinkingMessages: ResponseInputItem[];
    
    // Error tracking
    errors: string[];
}

/**
 * Accumulates events from a stream and builds up the conversation state
 */
export async function accumulateStream(
    stream: AsyncIterable<EnsembleStreamEvent>,
    initialConversation: Conversation,
    onEvent?: (event: EnsembleStreamEvent) => void
): Promise<AccumulateStreamResult> {
    const workingConversation = initialConversation.clone();
    
    const state: AccumulationState = {
        currentMessageId: null,
        currentMessageParts: [],
        toolCallBuffers: new Map(),
        completedToolCalls: [],
        thinkingBuffers: new Map(),
        completedThinkingMessages: [],
        errors: []
    };

    let finalAssistantMessage: ResponseInputItem | undefined;
    let finalToolCallMessage: ResponseInputItem | undefined;

    for await (const event of stream) {
        // Forward event to observer if provided
        onEvent?.(event);

        switch (event.type) {
            case 'message_start':
                handleMessageStart(event, state);
                break;
                
            case 'message_delta':
                handleMessageDelta(event, state);
                break;
                
            case 'message_complete':
                finalAssistantMessage = handleMessageComplete(event, state, workingConversation);
                break;
                
            case 'tool_call_start':
                handleToolCallStart(event, state);
                break;
                
            case 'tool_call_delta':
                handleToolCallDelta(event, state);
                break;
                
            case 'tool_call_complete':
                handleToolCallComplete(event, state);
                break;
                
            case 'tool_calls_chunk':
                handleToolCallsChunk(event, state);
                break;
                
            case 'thinking_start':
                handleThinkingStart(event, state);
                break;
                
            case 'thinking_delta':
                handleThinkingDelta(event, state);
                break;
                
            case 'thinking_complete':
                handleThinkingComplete(event, state, workingConversation);
                break;
                
            case 'error':
                handleError(event, state);
                break;
                
            case 'stream_end':
                finalizeAccumulation(state, workingConversation);
                break;
        }
    }

    // Final cleanup in case stream didn't end properly
    if (!finalAssistantMessage && !finalToolCallMessage) {
        finalizeAccumulation(state, workingConversation);
    }

    // Determine the final assistant/tool message
    if (state.completedToolCalls.length > 0 && !finalAssistantMessage) {
        // For now, we'll create a simple assistant message with tool calls
        // In a real implementation, this would need to handle multiple tool calls properly
        finalAssistantMessage = createAssistantMessage('');
        workingConversation.add(finalAssistantMessage);
    }

    return {
        updatedConversation: workingConversation,
        assistantTextMessage: finalAssistantMessage,
        toolCallMessage: finalToolCallMessage,
        thinkingMessages: state.completedThinkingMessages,
        detectedToolCalls: state.completedToolCalls,
        errors: state.errors
    };
}

/**
 * Handle message start event
 */
function handleMessageStart(event: Parameters<typeof isMessageStartEvent>[0], state: AccumulationState): void {
    if (!isMessageStartEvent(event)) return;
    
    state.currentMessageId = event.messageId;
    state.currentMessageParts = [];
}

/**
 * Handle message delta event
 */
function handleMessageDelta(event: Parameters<typeof isMessageDeltaEvent>[0], state: AccumulationState): void {
    if (!isMessageDeltaEvent(event)) return;
    
    if (state.currentMessageId === event.messageId || !state.currentMessageId) {
        state.currentMessageParts.push(event.delta);
    }
}

/**
 * Handle message complete event
 */
function handleMessageComplete(
    event: Parameters<typeof isMessageCompleteEvent>[0], 
    state: AccumulationState, 
    conversation: Conversation
): ResponseInputItem | undefined {
    if (!isMessageCompleteEvent(event)) return;
    
    const fullContent = event.fullContent || state.currentMessageParts.join('');
    
    // If the message complete event contains tool calls, add them to our state
    if (event.toolCalls && event.toolCalls.length > 0) {
        state.completedToolCalls.push(...event.toolCalls);
    }
    
    // Create and add assistant message if there's text content or tool calls
    if (fullContent.trim().length > 0 || state.completedToolCalls.length > 0) {
        const assistantMessage = createAssistantMessage(fullContent);
        conversation.add(assistantMessage);
        
        // Reset message state
        state.currentMessageId = null;
        state.currentMessageParts = [];
        
        return assistantMessage;
    }
    
    return undefined;
}

/**
 * Handle tool call start event
 */
function handleToolCallStart(event: Parameters<typeof isToolCallStartEvent>[0], state: AccumulationState): void {
    if (!isToolCallStartEvent(event)) return;
    
    state.toolCallBuffers.set(event.toolCallId, {
        id: event.toolCallId,
        functionName: event.functionName || '',
        argumentParts: []
    });
}

/**
 * Handle tool call delta event
 */
function handleToolCallDelta(event: Parameters<typeof isToolCallDeltaEvent>[0], state: AccumulationState): void {
    if (!isToolCallDeltaEvent(event)) return;
    
    const buffer = state.toolCallBuffers.get(event.toolCallId);
    if (buffer) {
        if (event.functionName) {
            buffer.functionName = event.functionName;
        }
        if (event.argumentChunk) {
            buffer.argumentParts.push(event.argumentChunk);
        }
    }
}

/**
 * Handle tool call complete event
 */
function handleToolCallComplete(event: Parameters<typeof isToolCallCompleteEvent>[0], state: AccumulationState): void {
    if (!isToolCallCompleteEvent(event)) return;
    
    state.completedToolCalls.push(event.toolCall);
    
    // Clean up buffer if it exists
    state.toolCallBuffers.delete(event.toolCall.id);
}

/**
 * Handle tool calls chunk event
 */
function handleToolCallsChunk(event: Parameters<typeof isToolCallsChunkEvent>[0], state: AccumulationState): void {
    if (!isToolCallsChunkEvent(event)) return;
    
    state.completedToolCalls.push(...event.tool_calls);
}

/**
 * Handle thinking start event
 */
function handleThinkingStart(event: Parameters<typeof isThinkingStartEvent>[0], state: AccumulationState): void {
    if (!isThinkingStartEvent(event)) return;
    
    state.thinkingBuffers.set(event.thinkingId, {
        id: event.thinkingId,
        contentParts: []
    });
}

/**
 * Handle thinking delta event
 */
function handleThinkingDelta(event: Parameters<typeof isThinkingDeltaEvent>[0], state: AccumulationState): void {
    if (!isThinkingDeltaEvent(event)) return;
    
    const buffer = state.thinkingBuffers.get(event.thinkingId);
    if (buffer) {
        buffer.contentParts.push(event.delta);
    }
}

/**
 * Handle thinking complete event
 */
function handleThinkingComplete(
    event: Parameters<typeof isThinkingCompleteEvent>[0], 
    state: AccumulationState, 
    conversation: Conversation
): void {
    if (!isThinkingCompleteEvent(event)) return;
    
    const fullContent = event.fullContent || '';
    const thinkingMessage = createThinkingMessage(fullContent, event.thinkingId);
    
    state.completedThinkingMessages.push(thinkingMessage);
    conversation.add(thinkingMessage);
    
    // Clean up buffer
    state.thinkingBuffers.delete(event.thinkingId);
}

/**
 * Handle error event
 */
function handleError(event: Parameters<typeof isErrorEvent>[0], state: AccumulationState): void {
    if (!isErrorEvent(event)) return;
    
    state.errors.push(event.error);
    console.error('Stream error during accumulation:', event.error);
}

/**
 * Finalize any remaining buffered content
 */
function finalizeAccumulation(state: AccumulationState, conversation: Conversation): void {
    // Finalize any pending tool calls from buffers
    for (const buffer of state.toolCallBuffers.values()) {
        if (buffer.functionName && buffer.argumentParts.length > 0) {
            const toolCall: ToolCall = {
                id: buffer.id,
                type: 'function',
                function: {
                    name: buffer.functionName,
                    arguments: buffer.argumentParts.join('')
                }
            };
            state.completedToolCalls.push(toolCall);
        }
    }
    
    // Finalize any pending thinking from buffers
    for (const buffer of state.thinkingBuffers.values()) {
        if (buffer.contentParts.length > 0) {
            const thinkingMessage = createThinkingMessage(buffer.contentParts.join(''), buffer.id);
            state.completedThinkingMessages.push(thinkingMessage);
            conversation.add(thinkingMessage);
        }
    }
    
    // Finalize any pending text message
    if (state.currentMessageParts.length > 0) {
        const content = state.currentMessageParts.join('');
        if (content.trim().length > 0) {
            const assistantMessage = createAssistantMessage(content);
            conversation.add(assistantMessage);
        }
    }
    
    // Clear buffers
    state.toolCallBuffers.clear();
    state.thinkingBuffers.clear();
    state.currentMessageParts = [];
    state.currentMessageId = null;
}