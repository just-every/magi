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
		console.log(`[History] Compacting history: approx ${approxTokens} tokens exceeds limit of ${COMPACT_TOKENS_AT}`);
		
		// Determine how much of the history to summarize (approximately the oldest 30%)
		let split = Math.ceil(history.messages.length * 0.3);
		if(split > (history.messages.length - 4)) {
			split = history.messages.length - 4;
		}
		
		// Extract the messages to be summarized
		const messagesToSummarize = history.messages.slice(0, split);
		console.log(`[History] Summarizing ${messagesToSummarize.length} messages`);
		
		try {
			// Import the necessary modules and create the agent
			// We need to import these here to avoid circular dependencies
			const { createReasoningAgent } = await import('../magi_agents/common_agents/reasoning_agent.js');
			const { Runner } = await import('./runner.js');
			
			// Create a reasoning agent specifically for summarization
			const summarizationAgent = createReasoningAgent(`You are a history summarization agent. 
Your task is to concisely summarize conversation history, preserving the most important information
while significantly reducing the token count. Focus on key points, decisions, and outcomes. 
Maintain a neutral, factual tone. The summary will replace these messages in the conversation history.`);
			
			// Summarize the messages using our new summarization method
			const summary = await Runner.summarizeContent(
				summarizationAgent,
				messagesToSummarize,
				1000 // Reasonable token limit for the summary
			);
			
			console.log(`[History] Generated summary: ${summary.substring(0, 100)}...`);
			
			// Replace the summarized messages with a single summary message
			history.messages = [
				{
					role: 'system',
					content: `Summary of previous conversation:\n\n${summary}`
				},
				...history.messages.slice(split) // Keep the messages after the summarized portion
			];
			
			console.log(`[History] Compacted history from ${messagesToSummarize.length} messages to a summary + ${history.messages.length - 1} recent messages`);
		} catch (error) {
			console.error('[History] Error summarizing history:', error);
			
			// Fallback: if summarization fails, just trim the older messages
			console.log('[History] Falling back to simple truncation');
			history.messages = history.messages.slice(split);
		}
	}
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
