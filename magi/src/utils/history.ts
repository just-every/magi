/**
 * Message history management for the MAGI system.
 *
 * This module provides functions to store and retrieve conversation history
 * across sessions.
 */
import {
	ResponseInput,
	ResponseInputFunctionCall, ResponseInputFunctionCallOutput,
	ResponseInputMessage,
	ResponseOutputMessage
} from '../types.js';

// History structure
interface History {
	messages: ResponseInput;
}

// Global history cache
const history: History = {
	messages: [],
};

/**
 * Add a message to history
 */
export function addHistory(message: ResponseInputMessage | ResponseOutputMessage | ResponseInputFunctionCall | ResponseInputFunctionCallOutput): void {
	history.messages.push(message);
}

/**
 * Add a message to history
 */
export function addMonologue(content: string): void {
	history.messages.push({
		role: 'user',
		content: `Magi thought: ${content}`
	});
}

/**
 * Add a message to history
 */
export function addHumanMessage(content: string): void {
	const person = process.env.YOUR_NAME || 'Human';
	history.messages.push({
		role: 'developer',
		content: `${person} said: ${content}`
	});
}

/**
 * Get message history
 */
export function getHistory(): ResponseInput {
	return history.messages;
}
