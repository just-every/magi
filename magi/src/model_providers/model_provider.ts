/**
 * Model provider interface for the MAGI system.
 *
 * This module defines the ModelProvider interface and factory function
 * to get the appropriate provider implementation.
 */

import {ModelProvider} from '../types.js';
import {openaiProvider} from './openai.js';
import {claudeCodeProvider} from './claude_code.js';
import {claudeProvider} from './claude.js';
import {geminiProvider} from './gemini.js';
import {grokProvider} from './grok.js';
import {deepSeekProvider} from './deepseek.js';
import {testProvider} from './test_provider.js';
import {MODEL_CLASSES, ModelClassID, ModelProviderID} from './model_data.js';

// Provider mapping by model prefix
const MODEL_PROVIDER_MAP: Record<string, ModelProvider> = {
	// OpenAI models
	'gpt-': openaiProvider,
	'o3-': openaiProvider,
	'computer-use-preview': openaiProvider,

	// Claude/Anthropic models
	'claude-code': claudeCodeProvider,
	'claude-': claudeProvider,

	// Gemini/Google models
	'gemini-': geminiProvider,

	// Grok/X.AI models
	'grok-': grokProvider,

	// DeepSeek models
	'deepseek-': deepSeekProvider,
	
	// Test provider for testing
	'test-': testProvider,
};

/**
 * Check if an API key for a model provider exists and is valid
 */
function isProviderKeyValid(provider: ModelProviderID): boolean {
	// Basic check to see if an API key exists with the expected format
	switch (provider) {
		case 'openai':
			return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
		case 'anthropic':
			return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-');
		case 'google':
			return !!process.env.GOOGLE_API_KEY;
		case 'xai':
			return !!process.env.XAI_API_KEY && process.env.XAI_API_KEY.startsWith('xai-');
		case 'deepseek':
			return false; //!!process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.startsWith('sk-');
		case 'test':
			return true; // Test provider is always valid
		default:
			return false;
	}
}

/**
 * Get the provider name from a model name
 */
export function getProviderFromModel(model: string): ModelProviderID {
	if (model.startsWith('gpt-') || model.startsWith('o3-') || model.startsWith('computer-use-preview')) {
		return 'openai';
	} else if (model.startsWith('claude-')) {
		return 'anthropic';
	} else if (model.startsWith('gemini-')) {
		return 'google';
	} else if (model.startsWith('grok-')) {
		return 'xai';
	} else if (model.startsWith('deepseek-')) {
		return 'deepseek';
	} else if (model.startsWith('test-')) {
		return 'test';
	}
	throw new Error(`Unknown model prefix: ${model}`);
}

/**
 * Get a suitable model from a model class, with fallback
 */
export async function getModelFromClass(modelClass?: ModelClassID): Promise<string> {
	// Import via dynamic import to avoid circular dependencies
	// Using dynamic import instead of require to comply with ESM standards
	const QuotaModule = await import('../utils/quota_manager.js');
	const quotaManager = QuotaModule.quotaManager;
	
	// Default to standard class if none specified
	const modelGroup = modelClass && MODEL_CLASSES[modelClass] ? modelClass : 'standard';

	// Try each model in the group until we find one with a valid API key and quota
	if (MODEL_CLASSES[modelGroup]) {
		let models = [...MODEL_CLASSES[modelGroup].models];

		if (MODEL_CLASSES[modelGroup].random) {
			models = models.sort(() => Math.random() - 0.5);
		}

		// First pass: Try all models checking both API key and quota
		for (const model of models) {
			const provider = getProviderFromModel(model);
			
			// Check if we have a valid API key and available quota
			if (isProviderKeyValid(provider) && quotaManager.hasQuota(provider, model)) {
				console.log(`Using model ${model} from class ${modelGroup} (has API key and quota)`);
				return model;
			}
		}
		
		// Second pass: If we couldn't find a model with quota, just check for API key
		// (This allows exceeding quota when necessary)
		for (const model of models) {
			const provider = getProviderFromModel(model);
			if (isProviderKeyValid(provider)) {
				console.log(`Using model ${model} from class ${modelGroup} (has API key but may exceed quota)`);
				return model;
			}
		}
	}

	// If we couldn't find a valid model in the specified class, try the standard class
	if (modelGroup !== 'standard' && MODEL_CLASSES['standard']) {
		// First check for models with both API key and quota
		for (const model of MODEL_CLASSES['standard'].models) {
			const provider = getProviderFromModel(model);
			if (isProviderKeyValid(provider) && quotaManager.hasQuota(provider, model)) {
				console.log(`Falling back to standard class model ${model} (has API key and quota)`);
				return model;
			}
		}
		
		// Then just check for API key
		for (const model of MODEL_CLASSES['standard'].models) {
			const provider = getProviderFromModel(model);
			if (isProviderKeyValid(provider)) {
				console.log(`Falling back to standard class model ${model} (has API key but may exceed quota)`);
				return model;
			}
		}
	}

	// Last resort: return first model in the class, even if we don't have a valid key
	// The provider will handle the error appropriately
	const defaultModel = MODEL_CLASSES[modelGroup]?.models?.[0] || 'gpt-4o';
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
