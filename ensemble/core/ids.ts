// ================================================================
// ID generation utilities for ensemble
// ================================================================

import { randomUUID } from 'crypto';

/**
 * Generate a unique ID for messages, tool calls, etc.
 */
export function generateId(): string {
    return randomUUID();
}

/**
 * Generate a unique ID with a prefix
 */
export function generateIdWithPrefix(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
}

/**
 * Generate a tool call ID
 */
export function generateToolCallId(): string {
    return generateIdWithPrefix('call');
}

/**
 * Generate a message ID
 */
export function generateMessageId(): string {
    return generateIdWithPrefix('msg');
}

/**
 * Generate a thinking ID
 */
export function generateThinkingId(): string {
    return generateIdWithPrefix('thinking');
}