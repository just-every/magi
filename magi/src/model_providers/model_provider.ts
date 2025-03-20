/**
 * Model provider interface for the MAGI system.
 *
 * This module defines the ModelProvider interface and factory function
 * to get the appropriate provider implementation.
 */

import { ModelProvider } from '../types.js';
import { openaiProvider } from './openai.js';
import { claudeProvider } from './claude.js';
import { geminiProvider } from './gemini.js';
import { grokProvider } from './grok.js';

// Provider mapping by model prefix
const MODEL_PROVIDER_MAP: Record<string, ModelProvider> = {
  // OpenAI models
  'gpt-': openaiProvider,
  'o3-': openaiProvider,
  'computer-use-preview': openaiProvider,
  
  // Claude/Anthropic models
  'claude-': claudeProvider,
  
  // Gemini/Google models
  'gemini-': geminiProvider,
  
  // Grok/X.AI models
  'grok': grokProvider,
  'grok-': grokProvider,
};

// Import MODEL_GROUPS directly to avoid circular import
// This matches the exact structure in constants.ts
export const MODEL_GROUPS: Record<string, string[]> = {
  // Standard models with good all-around capabilities
  "standard": [
    "gpt-4o",              // OpenAI
    "gemini-2.0-flash",    // Google
    "gemini-pro",          // Google
  ],

  // Mini/smaller models - faster but less capable
  "mini": [
    "gpt-4o-mini",             // OpenAI
    "claude-3-5-haiku-latest", // Anthropic
    "gemini-2.0-flash-lite",   // Google
  ],

  // Advanced reasoning models
  "reasoning": [
    "o3-mini",                  // OpenAI
    "claude-3-7-sonnet-latest", // Anthropic
    "gemini-2.0-ultra",         // Google
    "grok-2-latest",            // X.AI
    "grok-2",                   // X.AI
    "grok",                     // X.AI
  ],

  // Models with vision capabilities
  "vision": [
    "computer-use-preview",     // OpenAI
    "gemini-pro-vision",        // Google
    "gemini-2.0-pro-vision",    // Google
    "gemini-2.0-ultra-vision",  // Google
    "grok-1.5-vision",          // X.AI
    "grok-2-vision-1212",       // X.AI
  ],

  // Models with search capabilities
  "search": [
    "gpt-4o-search-preview",       // OpenAI
    "gpt-4o-mini-search-preview",  // OpenAI
  ],
};

/**
 * Check if an API key for a model provider exists and is valid
 */
function isProviderKeyValid(provider: string): boolean {
  // Basic check to see if an API key exists with the expected format
  switch (provider) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
    case 'anthropic':
      return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-');
    case 'google':
      return !!process.env.GOOGLE_API_KEY;
    case 'xai':
      return !!process.env.XAI_API_KEY;
    default:
      return false;
  }
}

/**
 * Get the provider name from a model name
 */
function getProviderFromModel(model: string): string {
  if (model.startsWith('gpt-') || model.startsWith('o3-') || model.startsWith('computer-use-preview')) {
    return 'openai';
  } else if (model.startsWith('claude-')) {
    return 'anthropic';
  } else if (model.startsWith('gemini-')) {
    return 'google';
  } else if (model.startsWith('grok')) {
    return 'xai';
  }
  return 'unknown';
}

/**
 * Get a suitable model from a model class, with fallback
 */
export function getModelFromClass(modelClass?: string): string {
  // Default to standard class if none specified
  const modelGroup = modelClass && MODEL_GROUPS[modelClass] ? modelClass : 'standard';
  console.log(`Using model class: ${modelGroup}`);
  
  // Try each model in the group until we find one with a valid API key
  if (MODEL_GROUPS[modelGroup]) {
    for (const model of MODEL_GROUPS[modelGroup]) {
      const provider = getProviderFromModel(model);
      if (isProviderKeyValid(provider)) {
        console.log(`Selected model ${model} from class ${modelGroup}`);
        return model;
      }
    }
  }
  
  // If we couldn't find a valid model in the specified class, try the standard class
  if (modelGroup !== 'standard' && MODEL_GROUPS['standard']) {
    console.log(`No valid model found in class ${modelGroup}, trying standard class`);
    for (const model of MODEL_GROUPS['standard']) {
      const provider = getProviderFromModel(model);
      if (isProviderKeyValid(provider)) {
        console.log(`Selected fallback model ${model} from standard class`);
        return model;
      }
    }
  }
  
  // Last resort: return first model in the class, even if we don't have a valid key
  // The provider will handle the error appropriately
  const defaultModel = MODEL_GROUPS[modelGroup]?.[0] || 'gpt-4o';
  console.log(`No valid API key found for any model in class ${modelGroup}, using default: ${defaultModel}`);
  return defaultModel;
}

/**
 * Get the appropriate model provider based on the model name
 */
export function getModelProvider(model?: string): ModelProvider {
  if (!model) {
    // Default to OpenAI if no model specified
    return openaiProvider;
  }
  
  // Find the matching provider based on model prefix
  for (const [prefix, provider] of Object.entries(MODEL_PROVIDER_MAP)) {
    if (model.startsWith(prefix)) {
      return provider;
    }
  }
  
  // Default to OpenAI if no matching provider found
  console.warn(`No specific provider found for model "${model}", defaulting to OpenAI`);
  return openaiProvider;
}