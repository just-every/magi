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
			return !!process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.startsWith('sk-');
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
	}
	throw new Error(`Unknown model prefix: ${model}`);
}

/**
 * Get a suitable model from a model class, with fallback
 */
export function getModelFromClass(modelClass?: ModelClassID): string {
	// Default to standard class if none specified
	const modelGroup = modelClass && MODEL_CLASSES[modelClass] ? modelClass : 'standard';

	// Try each model in the group until we find one with a valid API key
	if (MODEL_CLASSES[modelGroup]) {
		let models = [...MODEL_CLASSES[modelGroup].models];

		if (MODEL_CLASSES[modelGroup].random) {
			models = models.sort(() => Math.random() - 0.5);
		}

		for (const model of models) {
			const provider = getProviderFromModel(model);
			if (isProviderKeyValid(provider)) {
				return model;
			}
		}
	}

	// If we couldn't find a valid model in the specified class, try the standard class
	if (modelGroup !== 'standard' && MODEL_CLASSES['standard']) {
		for (const model of MODEL_CLASSES['standard'].models) {
			const provider = getProviderFromModel(model);
			if (isProviderKeyValid(provider)) {
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
