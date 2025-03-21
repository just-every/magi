/**
 * Message history management for the MAGI system.
 *
 * This module provides functions to store and retrieve conversation history
 * across sessions.
 */
import {LLMMessage} from '../types.js';

// History structure
interface History {
  messages: LLMMessage[];
}

// Global history cache
const history: History = {
  messages: [],
};

/**
 * Add a message to history
 */
export function addHistory(message: LLMMessage): void {
  history.messages.push(message);
}

/**
 * Get message history
 */
export function getHistory(): LLMMessage[] {
  return history.messages;
}
