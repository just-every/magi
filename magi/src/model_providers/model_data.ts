/**
 * Model data for all supported LLM providers.
 *
 * This file consolidates information about all supported models including:
 * - Basic model metadata
 * - Cost information
 * - Grouping by capability
 */

export interface ModelCost {
	input_per_million: number;   // Cost in USD per million input tokens
	output_per_million: number;  // Cost in USD per million output tokens
	cached_input_per_million?: number; // Cost in USD per million cached input tokens
}

export interface ModelEntry {
	id: string;           // Model identifier used in API calls
	aliases?: string[];   // Alternative names for the model
	provider: string;     // Provider (openai, anthropic, google, xai)
	cost: ModelCost;      // Cost information
	class?: string;       // Model class (standard, mini, reasoning, vision, etc.)
	description?: string; // Short description of the model's capabilities
	context_length?: number; // Maximum context length in tokens
}


export interface ModelUsage {
	model: string,
	cost?: number,
	input_tokens?: number,
	output_tokens?: number,
	cached_tokens?: number,
	metadata?: Record<string, number>,
	timestamp?: Date;
}

export interface ModelClass {
	models: string[],
	random?: boolean,
}

// Model groups organized by capability
export const MODEL_CLASSES: Record<string, ModelClass> = {
	// Standard models with good all-around capabilities
	'standard': {
		models: [
			'gpt-4o',              		// OpenAI
			'gemini-2.0-flash',    		// Google
			'claude-3-5-haiku',     	// Anthropic
			'grok-2',               	// X.AI
			'deepseek-chat',        	// DeepSeek
		]
	},

	// Mini/smaller models - faster but less capable
	'mini': {
		models: [
			'gpt-4o-mini',             	// OpenAI
			'claude-3-5-haiku',        	// Anthropic
			'gemini-2.0-flash-lite',		// Google
			'deepseek-chat',        	// DeepSeek
		],
	},

	// Advanced reasoning models
	'reasoning': {
		models: [
			'gemini-2.5-pro-exp-03-25', // Google
			'o3-mini',                  // OpenAI
			'claude-3-7-sonnet',        // Anthropic
			'grok-2',                   // X.AI
			'deepseek-reasoner',       	// DeepSeek
		],
	},

	// Monologue models
	'monologue': {
		models: [
			'gemini-2.5-pro-exp-03-25', // Google
			'o3-mini',                  // OpenAI
			'gpt-4o-mini',             	// OpenAI
			'gpt-4o',              		// OpenAI
			'gemini-2.5-pro-exp-03-25', // Google
			'gemini-2.0-flash',    		// Google
			'claude-3-7-sonnet',        // Anthropic
			'grok-2',                   // X.AI
			'deepseek-chat',        	// DeepSeek
			'deepseek-reasoner',       	// DeepSeek
		],
		random: true,
	},

	// Programming models
	'code': {
		models: [
			'gemini-2.5-pro-exp-03-25', // Google
			'claude-code',              // Claude Code
			'claude-3-7-sonnet',        // Anthropic
			'o3-mini',                  // OpenAI
			'gemini-2.0-flash',    		// Google
		],
	},

	// Models with vision capabilities
	'vision': {
		models:  [
			'computer-use-preview',     // OpenAI
			'gpt-4o',              		// OpenAI
			'gemini-2.0-flash',    		// Google
			'grok-2-vision',            // X.AI
		],
	},

	// Models with search capabilities
	'search':{
		models: [
			'gpt-4o-search-preview',       // OpenAI
			'gpt-4o-mini-search-preview',  // OpenAI
		],
	},

};

// Main model registry with all supported models
export const MODEL_REGISTRY: ModelEntry[] = [
	//
	// OpenAI models
	//

	// GPT-4.5 models
	{
		id: 'gpt-4.5-preview',
		aliases: ['gpt-4.5-preview-2025-02-27'],
		provider: 'openai',
		cost: {
			input_per_million: 75.0,
			cached_input_per_million: 37.5,
			output_per_million: 150.0
		},
		class: 'premium',
		description: 'Latest premium GPT model from OpenAI'
	},

	// GPT-4o models
	{
		id: 'gpt-4o',
		aliases: ['gpt-4o-2024-08-06'],
		provider: 'openai',
		cost: {
			input_per_million: 2.5,
			cached_input_per_million: 1.25,
			output_per_million: 10.0
		},
		class: 'standard',
		description: 'OpenAI standard model with multimodal capabilities',
		context_length: 128000
	},
	{
		id: 'gpt-4o-mini',
		aliases: ['gpt-4o-mini-2024-07-18'],
		provider: 'openai',
		cost: {
			input_per_million: 0.15,
			cached_input_per_million: 0.075,
			output_per_million: 0.6
		},
		class: 'mini',
		description: 'Smaller, faster version of GPT-4o',
		context_length: 128000
	},
	{
		id: 'gpt-4o-audio-preview',
		aliases: ['gpt-4o-audio-preview-2024-12-17'],
		provider: 'openai',
		cost: {
			input_per_million: 2.5,
			output_per_million: 10.0
		},
		class: 'audio',
		description: 'GPT-4o with enhanced audio capabilities'
	},
	{
		id: 'gpt-4o-mini-audio-preview',
		aliases: ['gpt-4o-mini-audio-preview-2024-12-17'],
		provider: 'openai',
		cost: {
			input_per_million: 0.15,
			output_per_million: 0.6
		},
		class: 'audio',
		description: 'Smaller GPT-4o with audio capabilities'
	},
	{
		id: 'gpt-4o-realtime-preview',
		aliases: ['gpt-4o-realtime-preview-2024-12-17'],
		provider: 'openai',
		cost: {
			input_per_million: 5.0,
			cached_input_per_million: 2.5,
			output_per_million: 20.0
		},
		class: 'realtime',
		description: 'GPT-4o optimized for realtime applications'
	},
	{
		id: 'gpt-4o-mini-realtime-preview',
		aliases: ['gpt-4o-mini-realtime-preview-2024-12-17'],
		provider: 'openai',
		cost: {
			input_per_million: 0.6,
			cached_input_per_million: 0.3,
			output_per_million: 2.4
		},
		class: 'realtime',
		description: 'Smaller GPT-4o optimized for realtime applications'
	},
	{
		id: 'gpt-4o-search-preview',
		aliases: ['gpt-4o-search-preview-2025-03-11'],
		provider: 'openai',
		cost: {
			input_per_million: 2.5,
			output_per_million: 10.0
		},
		class: 'search',
		description: 'GPT-4o with built-in search capabilities'
	},
	{
		id: 'gpt-4o-mini-search-preview',
		aliases: ['gpt-4o-mini-search-preview-2025-03-11'],
		provider: 'openai',
		cost: {
			input_per_million: 0.15,
			output_per_million: 0.6
		},
		class: 'search',
		description: 'Smaller GPT-4o with built-in search capabilities'
	},

	// O series models
	{
		id: 'o1',
		aliases: ['o1-2024-12-17'],
		provider: 'openai',
		cost: {
			input_per_million: 15.0,
			cached_input_per_million: 7.5,
			output_per_million: 60.0
		},
		class: 'reasoning',
		description: 'Advanced reasoning model from OpenAI'
	},
	{
		id: 'o1-pro',
		aliases: ['o1-pro-2025-03-19'],
		provider: 'openai',
		cost: {
			input_per_million: 150.0,
			output_per_million: 600.0
		},
		class: 'premium',
		description: 'Premium O-series model from OpenAI'
	},
	{
		id: 'o3-mini',
		aliases: ['o3-mini-2025-01-31', 'o1-mini', 'o1-mini-2024-09-12'],
		provider: 'openai',
		cost: {
			input_per_million: 1.1,
			cached_input_per_million: 0.55,
			output_per_million: 4.4
		},
		class: 'reasoning',
		description: 'Smaller O-series model with reasoning capabilities'
	},

	// Computer-use models
	{
		id: 'computer-use-preview',
		aliases: ['computer-use-preview-2025-03-11'],
		provider: 'openai',
		cost: {
			input_per_million: 3.0,
			output_per_million: 12.0
		},
		class: 'vision',
		description: 'Model that can understand and control computer interfaces'
	},

	// GPT-3.5 Turbo models
	{
		id: 'gpt-3.5-turbo',
		aliases: ['gpt-3.5-turbo-0125'],
		provider: 'openai',
		cost: {
			input_per_million: 0.5,
			output_per_million: 1.5
		},
		class: 'standard',
		description: 'Cost-effective model for general purpose text tasks',
		context_length: 16385
	},
	{
		id: 'gpt-3.5-turbo-16k',
		provider: 'openai',
		cost: {
			input_per_million: 1.0,
			output_per_million: 2.0
		},
		class: 'standard',
		description: 'GPT-3.5 with extended context length',
		context_length: 16385
	},

	//
	// Anthropic (Claude) models
	//

	// Claude 3.7 Sonnet
	{
		id: 'claude-3-7-sonnet',
		provider: 'anthropic',
		cost: {
			input_per_million: 3.0,
			output_per_million: 15.0,
			cached_input_per_million: 0.3
		},
		class: 'reasoning',
		description: 'Latest Claude model with strong reasoning capabilities',
		context_length: 200000
	},

	// Claude 3.5 Haiku
	{
		id: 'claude-3-5-haiku',
		provider: 'anthropic',
		cost: {
			input_per_million: 0.8,
			output_per_million: 4.0,
			cached_input_per_million: 0.08
		},
		class: 'mini',
		description: 'Fast, cost-effective Claude model',
		context_length: 200000
	},

	// Claude 3 Opus
	{
		id: 'claude-3-opus',
		aliases: ['claude-3-opus-20240229'],
		provider: 'anthropic',
		cost: {
			input_per_million: 15.0,
			output_per_million: 75.0,
			cached_input_per_million: 1.5
		},
		class: 'premium',
		description: 'Most powerful Claude model',
		context_length: 200000
	},

	// Claude 3 Sonnet
	{
		id: 'claude-3-sonnet',
		aliases: ['claude-3-sonnet-20240229'],
		provider: 'anthropic',
		cost: {
			input_per_million: 3.0,
			output_per_million: 15.0
		},
		class: 'standard',
		description: 'Balanced Claude model for most use cases',
		context_length: 200000
	},

	// Claude 3 Haiku
	{
		id: 'claude-3-haiku',
		aliases: ['claude-3-haiku-20240307'],
		provider: 'anthropic',
		cost: {
			input_per_million: 0.25,
			output_per_million: 1.25
		},
		class: 'mini',
		description: 'Fast, lightweight Claude model',
		context_length: 200000
	},

	// Claude 2.x
	{
		id: 'claude-2',
		aliases: ['claude-2.0'],
		provider: 'anthropic',
		cost: {
			input_per_million: 8.0,
			output_per_million: 24.0
		},
		class: 'standard',
		description: 'Previous generation Claude model',
		context_length: 100000
	},

	// Claude Instant
	{
		id: 'claude-instant-1',
		provider: 'anthropic',
		cost: {
			input_per_million: 1.63,
			output_per_million: 5.51
		},
		class: 'mini',
		description: 'Fast, cost-effective first-gen Claude model',
		context_length: 100000
	},

	// Claude CLI (use Claude 3.7 Sonnet pricing)
	{
		id: 'claude-cli',
		provider: 'anthropic',
		cost: {
			input_per_million: 3.0,
			output_per_million: 15.0,
			cached_input_per_million: 0.3
		},
		class: 'reasoning',
		description: 'Claude accessed via CLI',
		context_length: 200000
	},


	//
	// Google (Gemini) models
	//

	// Gemini 2.5 models
	{
		id: 'gemini-2.5-pro-exp-03-25',
		provider: 'google',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			cached_input_per_million: 0
		},
		class: 'reasoning',
		description: 'Coding, Reasoning & Multimodal understanding',
		context_length: 1048576
	},

	// Gemini 2.0 models
	{
		id: 'gemini-2.0-flash',
		provider: 'google',
		cost: {
			input_per_million: 0.10,
			output_per_million: 0.40,
			cached_input_per_million: 0.025
		},
		class: 'standard',
		description: 'Fast, cost-effective Gemini model',
		context_length: 1048576
	},
	{
		id: 'gemini-2.0-flash-lite',
		provider: 'google',
		cost: {
			input_per_million: 0.075,
			output_per_million: 0.30
		},
		class: 'mini',
		description: 'Lightweight version of Gemini 2.0 Flash',
		context_length: 1048576
	},
	{
		id: 'gemini-2.0-flash-thinking-exp-01-21',
		provider: 'google',
		cost: {
			input_per_million: 0,
			output_per_million: 0
		},
		class: 'reasoning',
		description: 'Thinking version of gemini-2.0-flash'
	},

	// Gemini 1.5 models
	{
		id: 'gemini-1.5-pro',
		aliases: ['gemini-1.5-pro-latest'],
		provider: 'google',
		cost: {
			input_per_million: 7.0,
			output_per_million: 21.0
		},
		class: 'standard',
		description: 'Powerful Gemini model with large context window',
		context_length: 1000000
	},
	{
		id: 'gemini-1.5-flash',
		aliases: ['gemini-1.5-flash-latest'],
		provider: 'google',
		cost: {
			input_per_million: 0.075,
			output_per_million: 0.30
		},
		class: 'mini',
		description: 'Fast, efficient Gemini model',
		context_length: 1000000
	},

	// Gemini 1.0 models
	{
		id: 'gemini-1.0-pro',
		aliases: ['gemini-1.0-pro-latest', 'gemini-pro'],
		provider: 'google',
		cost: {
			input_per_million: 0.125,
			output_per_million: 0.375
		},
		class: 'standard',
		description: 'Original Gemini model',
		context_length: 32768
	},
	{
		id: 'gemini-pro-vision',
		provider: 'google',
		cost: {
			input_per_million: 0.125,
			output_per_million: 0.375
		},
		class: 'vision',
		description: 'Original Gemini model with vision capabilities',
		context_length: 32768
	},

	//
	// X.AI (Grok) models
	//

	// Grok 2 vision models
	{
		id: 'grok-2-vision',
		aliases: ['grok-2-vision-1212', 'grok-2-vision-latest'],
		provider: 'xai',
		cost: {
			input_per_million: 2.0,
			output_per_million: 10.0
		},
		class: 'vision',
		description: 'Grok model with vision capabilities'
	},

	// Grok 2 text models
	{
		id: 'grok-2',
		aliases: ['grok-2-1212', 'grok-2-latest', 'grok'],
		provider: 'xai',
		cost: {
			input_per_million: 2.0,
			output_per_million: 10.0
		},
		class: 'reasoning',
		description: 'Grok model with strong reasoning abilities'
	},

	// Grok 1.5 vision
	{
		id: 'grok-1.5-vision',
		provider: 'xai',
		cost: {
			input_per_million: 5.0,
			output_per_million: 15.0
		},
		class: 'vision',
		description: 'Original Grok vision model'
	},

	// DeepSeek models
	{
		id: 'deepseek-chat',
		provider: 'deepseek',
		cost: {
			// @todo add support for peak/off-peak pricing
			input_per_million: 0.27,
			output_per_million: 1.10,
			cached_input_per_million: 0.07
		},
		class: 'standard',
		description: 'Front line DeepSeek model',
		context_length: 64000
	},
	{
		id: 'deepseek-reasoner',
		provider: 'deepseek',
		cost: {
			// @todo add support for peak/off-peak pricing
			input_per_million: 0.55,
			output_per_million: 2.19,
			cached_input_per_million: 0.14
		},
		class: 'reasoning',
		description: 'Thinking version of DeepSeek model',
		context_length: 64000
	}
];

/**
 * Find a model entry by ID or alias
 *
 * @param modelId The model ID or alias to search for
 * @returns The model entry or undefined if not found
 */
export function findModel(modelId: string): ModelEntry | undefined {
	// Direct match on ID
	const directMatch = MODEL_REGISTRY.find(model => model.id === modelId);
	if (directMatch) return directMatch;

	// Check for alias match
	return MODEL_REGISTRY.find(model =>
		model.aliases?.includes(modelId)
	);
}

