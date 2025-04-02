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

const COMPACT_TOKENS_AT = 8000;


// History structure
interface History {
	messages: ResponseInput;
}

// Global history cache
const history: History = {
	messages: [],
};

async function compactHistory(): Promise<void> {
	const approxTokens = (JSON.stringify(history.messages).length / 4);
	if(approxTokens > COMPACT_TOKENS_AT) {
		// Compact the history to save space

		let split = Math.ceil(history.messages.length * 0.3);
		if(split > (history.messages.length - 4)) {
			split = history.messages.length - 4;
		}

		// const compactMessages = history.messages.slice(0, split);
		history.messages = history.messages.slice(split);

		// @todo use AI to summarize compactMessages and add back as a single message


	}
	history.messages = history.messages.slice(history.messages.length * 0.3);
}

/**
 * Add a message to history
 */
export async function addHistory(message: ResponseInputMessage | ResponseOutputMessage | ResponseInputFunctionCall | ResponseInputFunctionCallOutput): Promise<void> {
	history.messages.push(message);
	await compactHistory();
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
export async function addMonologue(content: string): Promise<void> {
	return addHistory({
		role: 'user',
		content: monologue_prefix+content.replace(monologue_regex, ''),
	});
}

/**
 * Add a message to history
 */
export async function addHumanMessage(content: string): Promise<void> {
	const person = process.env.YOUR_NAME || 'Human';
	return addHistory({
		role: 'developer',
		content: `${person} said: ${content}`
	});
}

/**
 * Add a message to history
 */
export async function addSystemMessage(content: string): Promise<void> {
	return addHistory({
		role: 'developer',
		content: `System update: ${content}`
	});
}

/**
 * Get message history
 */
export function getHistory(): ResponseInput {
	return history.messages;
}
