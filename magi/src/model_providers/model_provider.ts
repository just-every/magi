/**
 * Model provider interface for the MAGI system.
 *
 * This module defines the ModelProvider interface and factory function
 * to get the appropriate provider implementation.
 */

import { ModelProvider } from '../types.js';
import { openaiProvider } from './openai.js';

/**
 * Get the appropriate model provider based on the model name
 */
export function getModelProvider(): ModelProvider {
  // For now, we only support OpenAI
  return openaiProvider;
}
