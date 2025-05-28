// ================================================================
// Provider Registry - Auto-registration of providers
// ================================================================

import { registerProvider } from './base_provider.js';
import { testProvider } from './test_provider.js';
import { adaptModelProvider } from './model_provider_adapter.js';

// Import model providers
import { openaiProvider } from '../model_providers/openai.js';
import { claudeProvider } from '../model_providers/claude.js';
import { geminiProvider } from '../model_providers/gemini.js';
import { deepSeekProvider } from '../model_providers/deepseek.js';
import { grokProvider } from '../model_providers/grok.js';
import { openRouterProvider } from '../model_providers/openrouter.js';

/**
 * Initialize and register all available providers
 */
export function initializeProviders(): void {
    // Register test provider (already adapted to new interface)
    registerProvider('test-', testProvider);
    
    // Register model providers using the adapter
    registerProvider('gpt-', adaptModelProvider(openaiProvider));
    registerProvider('o1-', adaptModelProvider(openaiProvider)); // o1 models also use OpenAI
    registerProvider('o3-', adaptModelProvider(openaiProvider)); // o3 models also use OpenAI
    registerProvider('claude-', adaptModelProvider(claudeProvider));
    registerProvider('gemini-', adaptModelProvider(geminiProvider));
    registerProvider('deepseek-', adaptModelProvider(deepSeekProvider));
    registerProvider('grok-', adaptModelProvider(grokProvider));
    
    // OpenRouter can handle many model prefixes
    registerProvider('openrouter/', adaptModelProvider(openRouterProvider));
    registerProvider('anthropic/', adaptModelProvider(openRouterProvider));
    registerProvider('google/', adaptModelProvider(openRouterProvider));
    registerProvider('meta-llama/', adaptModelProvider(openRouterProvider));
    registerProvider('mistralai/', adaptModelProvider(openRouterProvider));
}

/**
 * Auto-initialize providers when this module is imported
 */
initializeProviders();