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
	ResponseOutputMessage,
	ResponseInputItem
} from '../types.js';
import {setDelayInterrupted} from './thought_utils.js';
import {formatHistoryForSummary, createSummary} from './summary_utils.js';

const COMPACT_TOKENS_AT = 10000;


// History structure
interface History {
	messages: ResponseInput;
}

// Global history cache
const history: History = {
	messages: [],
};

// Define the categories
type MessageCategory =
	| 'SystemInstruction'
	| 'UserSaid'
	| 'UserInput'
	| 'TalkToUserToolCall'
	| 'ToolCall'
	| 'ToolResult'
	| 'ToolError'
	| 'AssistantThought'
	| 'AssistantResponse'
	| 'SystemError'
	| 'HistorySummary'
	| 'Unknown'; // Fallback

// Helper function to categorize a message
function categorizeMessage(message: ResponseInputItem): MessageCategory {
	const userName = process.env.YOUR_NAME || 'User';
	const userSaidPrefix = `${userName} said: `;
	const talkToUserToolName = `talk_to_${userName}`;

	// History Summary
	if ('role' in message && message.role === 'system' && 'content' in message && typeof message.content === 'string' && message.content.startsWith('Summary of previous messages:')) {
		return 'HistorySummary';
	}

	// System Instruction / System Error
	if ('role' in message && message.role === 'developer') {
		if ('content' in message && typeof message.content === 'string') {
			if (message.content.startsWith('System update:')) {
				// Check if it's an error
				if (message.content.toLowerCase().includes('error:') || message.content.toLowerCase().includes('failed')) {
					return 'SystemError';
				}
				// Check if it's UserSaid
				if (message.content.startsWith(userSaidPrefix)) {
					return 'UserSaid';
				}
				// Otherwise, treat as general system instruction/update
				return 'SystemInstruction'; 
			}
		}
		// Default developer role messages as instructions if not otherwise specified
		return 'SystemInstruction';
	}
	
	// System role messages are instructions
	if ('role' in message && message.role === 'system') {
		return 'SystemInstruction';
	}

	// User Input
	if ('role' in message && message.role === 'user') {
		// Could add logic here to detect commands vs general input if needed later
		return 'UserInput';
	}

	// Assistant Thought / Response
	if ('role' in message && message.role === 'assistant') {
		if ('type' in message && message.type === 'thinking') {
			return 'AssistantThought';
		}
		// Default assistant role messages as responses
		return 'AssistantResponse';
	}

	// Tool Calls (TalkToUser vs Standard)
	if ('type' in message && message.type === 'function_call') {
		if ('name' in message && message.name === talkToUserToolName) {
			return 'TalkToUserToolCall';
		}
		return 'ToolCall';
	}

	// Tool Results / Errors
	if ('type' in message && message.type === 'function_call_output') {
		// Check if the output content indicates an error
		if ('output' in message && typeof message.output === 'string' && 
			(message.output.toLowerCase().includes('"error":') || message.output.toLowerCase().includes('error:'))) {
			return 'ToolError';
		}
		return 'ToolResult';
	}

	// Fallback for unknown types
	console.warn('[History] Unknown message type encountered during categorization:', message);
	return 'Unknown';
}

// Helper function to find related tool result for a tool call
function findRelatedToolResultIndex(
	messages: ResponseInput,
	callId: string,
	startIndex: number,
	maxLookAhead: number = 10 // Look ahead a reasonable number of messages
): number {
	for (let i = startIndex + 1; i < Math.min(messages.length, startIndex + maxLookAhead); i++) {
		const potentialMatch = messages[i];
		if ('type' in potentialMatch &&
			potentialMatch.type === 'function_call_output' &&
			'call_id' in potentialMatch &&
			potentialMatch.call_id === callId) {
			return i;
		}
	}
	return -1; // Not found
}


async function compactHistory(): Promise<void> {
	const currentMessages = history.messages; // Reference to the current history
	const approxTokens = (JSON.stringify(currentMessages).length / 4);

	if (approxTokens <= COMPACT_TOKENS_AT) {
		return; // No need to compact
	}

	console.log(`[History] Compacting history: approx ${approxTokens} tokens exceeds limit of ${COMPACT_TOKENS_AT}`);

	// --- Categorization and Pairing ---
	const categorizedMessages: { category: MessageCategory; index: number; message: ResponseInputItem; pairIndex?: number }[] = [];
	const processedIndexes = new Set<number>(); // Track indexes already included (e.g., results paired with calls)

	for (let i = 0; i < currentMessages.length; i++) {
		if (processedIndexes.has(i)) continue;

		const message = currentMessages[i];
		const category = categorizeMessage(message);
		let pairIndex: number | undefined = undefined;

		// Attempt to pair Tool Calls with their Results/Errors
		if ((category === 'ToolCall' || category === 'TalkToUserToolCall') && 'call_id' in message) {
			const resultIndex = findRelatedToolResultIndex(currentMessages, message.call_id, i);
			if (resultIndex !== -1) {
				pairIndex = resultIndex;
				processedIndexes.add(resultIndex); // Mark the result as processed
			}
		}

		categorizedMessages.push({ category, index: i, message, pairIndex });
		processedIndexes.add(i); // Mark the current message as processed
	}

	// --- Determine Compaction Target ---
	const totalMessages = categorizedMessages.length; // Use count of categorized items
	// Calculate how many messages *roughly* correspond to the excess tokens
	// This is an estimate, actual token count varies.
	const excessTokens = approxTokens - COMPACT_TOKENS_AT;
	const averageTokensPerMessage = approxTokens / currentMessages.length;
	let targetCompactCount = Math.ceil(excessTokens / averageTokensPerMessage);

	// Ensure we keep at least a few messages (e.g., 4)
	const minMessagesToKeep = 4;
	if (targetCompactCount >= totalMessages - minMessagesToKeep) {
		targetCompactCount = totalMessages - minMessagesToKeep;
		if (targetCompactCount <= 0) {
			console.warn('[History] Compaction target is zero or negative, skipping compaction.');
			return; // Avoid compacting everything
		}
	}
	
	console.log(`[History] Target compaction count: ${targetCompactCount} messages`);

	// --- Select Messages for Compaction Based on Priority ---
	const compactionPriority: MessageCategory[] = [
		'AssistantThought',
		'ToolResult', // Compact results slightly before calls if unpaired
		'ToolCall',
		'AssistantResponse',
		'UserInput',
		'HistorySummary', // Compact older summaries before critical items
		'ToolError',
		'SystemError',
		'TalkToUserToolCall', // Compact talk_to_user later
		'UserSaid',
		'SystemInstruction',
		'Unknown', // Compact unknown last before critical
	];

	const messagesToCompactIndexes = new Set<number>();
	let compactedCount = 0;

	for (const category of compactionPriority) {
		if (compactedCount >= targetCompactCount) break;

		// Get messages of the current category, sorted by original index (oldest first)
		const categoryMessages = categorizedMessages
			.filter(item => item.category === category)
			.sort((a, b) => a.index - b.index);

		for (const item of categoryMessages) {
			if (compactedCount >= targetCompactCount) break;

			// Avoid adding already selected indexes (e.g., if a pair was added)
			if (!messagesToCompactIndexes.has(item.index)) {
				messagesToCompactIndexes.add(item.index);
				compactedCount++;
				// If it has a pair, add the pair as well
				if (item.pairIndex !== undefined && !messagesToCompactIndexes.has(item.pairIndex)) {
					messagesToCompactIndexes.add(item.pairIndex);
					// Don't increment compactedCount here, as the pair is implicitly part of compacting the call/result unit
				}
			}
		}
	}

	if (messagesToCompactIndexes.size === 0) {
		console.log('[History] No messages selected for compaction.');
		return;
	}

	console.log(`[History] Selected ${messagesToCompactIndexes.size} message indexes for compaction.`);

	// --- Perform Summarization ---
	const messagesToSummarize = Array.from(messagesToCompactIndexes)
		.sort((a, b) => a - b) // Sort indexes to maintain original order in summary input
		.map(index => currentMessages[index]);

	try {
		const preparedHistory = formatHistoryForSummary(messagesToSummarize);
		// Use a generic summary prompt for the mixed batch
		const summary = await createSummary(
			preparedHistory,
			'You are summarizing a portion of a conversation history for an LLM. Retain key decisions, actions, tool usage (calls and results/errors), user requests, and critical system information.'
		);

		console.log(`[History] Generated summary: ${summary.substring(0, 100)}...`);

		// --- Construct New History ---
		const newMessages: ResponseInput = [];
		// Add the summary message first
		newMessages.push({
			role: 'system',
			content: `Summary of previous messages:\n\n${summary}`
		});

		// Add back messages that were *not* compacted
		for (let i = 0; i < currentMessages.length; i++) {
			if (!messagesToCompactIndexes.has(i)) {
				newMessages.push(currentMessages[i]);
			}
		}

		// Update the global history object
		history.messages = newMessages;

		console.log(`[History] Compacted history. Removed ${messagesToSummarize.length} messages. New length: ${history.messages.length}`);

	} catch (error) {
		console.error('[History] Error summarizing history:', error);
		// Fallback: Simple truncation if summarization fails
		console.log('[History] Falling back to simple truncation due to summarization error.');
		// Calculate a simple split point based on the target count
		const keepCount = currentMessages.length - targetCompactCount;
		history.messages = currentMessages.slice(-keepCount); // Keep the most recent 'keepCount' messages
		console.log(`[History] Truncated history to ${history.messages.length} messages.`);
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
