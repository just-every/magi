// ================================================================
// Message factory functions for creating ResponseInputItem instances
// ================================================================

import { 
    ResponseInputItem, 
    ToolCall,
    ResponseContent
} from '../types.js';
import { generateToolCallId, generateMessageId, generateThinkingId } from './ids.js';

/**
 * Create a user message
 */
export function createUserMessage(content: string | ResponseContent, name?: string): ResponseInputItem {
    return {
        type: 'message',
        role: 'user',
        content,
        name,
        timestamp: Date.now()
    };
}

/**
 * Create a system message
 */
export function createSystemMessage(content: string): ResponseInputItem {
    return {
        type: 'message',
        role: 'system',
        content,
        timestamp: Date.now()
    };
}

/**
 * Create a developer message
 */
export function createDeveloperMessage(content: string): ResponseInputItem {
    return {
        type: 'message',
        role: 'developer',
        content,
        timestamp: Date.now()
    };
}

/**
 * Create an assistant message
 */
export function createAssistantMessage(content: string | null): ResponseInputItem {
    return {
        type: 'message',
        id: generateMessageId(),
        role: 'assistant',
        content: content || '',
        status: 'completed',
        timestamp: Date.now()
    };
}

/**
 * Create a tool call message
 */
export function createToolCallMessage(functionName: string, args: Record<string, any>, callId?: string): ResponseInputItem {
    return {
        type: 'function_call',
        call_id: callId || generateToolCallId(),
        name: functionName,
        arguments: JSON.stringify(args),
        timestamp: Date.now()
    };
}

/**
 * Create a tool result message
 */
export function createToolResultMessage(callId: string, output: string, functionName?: string): ResponseInputItem {
    return {
        type: 'function_call_output',
        call_id: callId,
        name: functionName,
        output,
        timestamp: Date.now()
    };
}

/**
 * Create a thinking message
 */
export function createThinkingMessage(content: string, signature?: string): ResponseInputItem {
    return {
        type: 'thinking',
        content,
        signature,
        thinking_id: generateThinkingId(),
        role: 'assistant',
        status: 'completed',
        timestamp: Date.now()
    };
}

// Helper functions for type checking

export function isUserMessage(item: ResponseInputItem): boolean {
    return item.type === 'message' && 'role' in item && item.role === 'user';
}

export function isAssistantMessage(item: ResponseInputItem): boolean {
    return item.type === 'message' && 'role' in item && item.role === 'assistant';
}

export function isToolCall(item: ResponseInputItem): boolean {
    return item.type === 'function_call';
}

export function isToolResult(item: ResponseInputItem): boolean {
    return item.type === 'function_call_output';
}

export function isThinking(item: ResponseInputItem): boolean {
    return item.type === 'thinking';
}