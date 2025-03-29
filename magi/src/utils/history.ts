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

function escapeRegex(str:string) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Make sure that we can set and remove the prefix from the monologue
const monologue_prefix = `${(process.env.AI_NAME || 'Magi')} thoughts: `;
const monologue_regex = new RegExp(`^\\s*${escapeRegex(monologue_prefix)}`);

/**
 * Add a message to history
 */
export function addMonologue(content: string): void {
	history.messages.push({
		role: 'user',
		content: monologue_prefix+content.replace(monologue_regex, ''),
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
