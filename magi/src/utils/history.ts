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
import {setDelayInterrupted} from './thought_utils.js';

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

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
function escapeRegex(str: string): string {
	// Escape characters with special meaning in regex.
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Define the AI's name, using environment variable or a default.
const aiName = process.env.AI_NAME || 'Magi';

// --- Generalized Combined Regex ---
// This regex aims to capture various potential prefixes LLMs might generate.
const generalizedPrefixRegex = new RegExp(
	'^' +                                  // Start of string
	'\\s*' +                               // Optional leading whitespace
	'(?:[#*\\-+=\\s]+)?' +                 // Optional markers (#, *, -, =, +, spaces)
	'\\s*' +                               // Optional whitespace
	`${escapeRegex(aiName)}\\s*` +               // AI name, surrounded by optional whitespace (Required)
	'(?:' +                                // Optional non-capturing group for keyword
	'(?:' +                              // Non-capturing group for actual keywords
	'[Tt]houghts?' +                   // Thoughts or Thought
	'|[Tt]hinking' +                   // Thinking
	'|[Nn]otes?' +                     // Notes or Note
	'|[Ii]nternal\\s+[Mm]onologue' +   // Internal Monologue
	'|[Rr]eflections?' +               // Reflections or Reflection
	'|[Ll]ogs?' +                         // Logs or Log
	'|[Aa]nalysis' +                      // Analysis
	'|[Ss]aid' +                      // Said
	'|[Ss]ays?' +                      // Say or Says
	'|[Uu]pdate' +                      // Update
	')' +
	'\\s*' +                             // Optional whitespace after keyword
	')?' +                                 // Keyword group is optional overall
	'(?:[:\\-=\\s]|$)' +                   // Optional separator character (:, -, =, whitespace) or end of line on the *same* line as name/keyword
	'.*?' +                                // Consume any other characters on the line non-greedily (like " - Step 1")
	'\\s*' +                               // Optional whitespace before the main separator
	'(?:[\\n\\r]+|[:\\- =]+\\s*|$)' +      // Main separator: Newlines OR punctuation (:, ---, ===) OR end of the matched prefix part
	'\\s*'                                 // Optional trailing whitespace before the actual content
);

/**
 * Removes potential LLM prefixes from the start of a string.
 * @param {string} text The input string.
 * @returns {string} The string with the prefix removed, if found.
 */
function removePrefix(text: string): string {
	if (text === null || text === undefined) {
		return '';
	}
	return text.replace(generalizedPrefixRegex, '');
}


/**
 * Add a message to history
 */
export async function addMonologue(content: string): Promise<void> {
	return addHistory({
		role: 'user',
		content: `${aiName} thoughts: ${removePrefix(content)}`,
	});
}

/**
 * Add a message to history
 */
export async function addHumanMessage(content: string): Promise<void> {
	// Interrupt any active delay
	setDelayInterrupted(true);

	const person = process.env.YOUR_NAME || 'User';
	return addHistory({
		role: 'developer',
		content: `${person} said: ${content}`
	});
}

/**
 * Add a message to history
 */
export async function addSystemMessage(content: string): Promise<void> {
	// Interrupt any active delay
	setDelayInterrupted(true);

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
