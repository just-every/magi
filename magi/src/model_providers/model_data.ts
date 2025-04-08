/**
 * model_data.ts
 *
 * Model data for all supported LLM providers.
 * This file consolidates information about all supported models including:
 * - Basic model metadata
 * - Cost information (including tiered pricing)
 * - Grouping by capability
 */

// Represents a tiered pricing structure based on token count
export interface TieredPrice {
    threshold_tokens: number; // The token count threshold for the price change
    price_below_threshold_per_million: number; // Price per million tokens <= threshold
    price_above_threshold_per_million: number; // Price per million tokens > threshold
}

// Structure for time-based pricing (Peak/Off-Peak)
export interface TimeBasedPrice {
    peak_price_per_million: number;
    off_peak_price_per_million: number;
    // Define UTC time boundaries for peak hours (inclusive start, exclusive end)
    peak_utc_start_hour: number; // e.g., 0 for 00:30
    peak_utc_start_minute: number; // e.g., 30 for 00:30
    peak_utc_end_hour: number; // e.g., 16 for 16:30
    peak_utc_end_minute: number; // e.g., 30 for 16:30
}

// Represents the cost structure for a model, potentially tiered or time-based
export interface ModelCost {
    // Cost components can be flat rate, token-tiered, or time-based
    input_per_million?: number | TieredPrice | TimeBasedPrice;
    output_per_million?: number | TieredPrice | TimeBasedPrice;
    cached_input_per_million?: number | TieredPrice | TimeBasedPrice;

	// Cost per image (for image generation models like Imagen)
	per_image?: number;

	// Notes about pricing specifics (e.g., free tier availability, other costs)
	notes?: string[];
}

// Represents a single model entry in the registry
export interface ModelEntry {
	id: string;           // Model identifier used in API calls
	aliases?: string[];   // Alternative names for the model
	provider: ModelProviderID;     // Provider (openai, anthropic, google, xai, deepseek)
	cost: ModelCost;      // Cost information using the updated structure
	class?: ModelClassID;       // Model class (standard, mini, reasoning, vision, etc.)
	description?: string; // Short description of the model's capabilities
	context_length?: number; // Maximum context length in tokens
}

// Represents usage data for cost calculation
export interface ModelUsage {
    model: string; // The ID of the model used (e.g., 'gemini-2.0-flash')
    cost?: number; // Calculated cost (optional, will be calculated if missing)
    input_tokens?: number; // Number of input tokens
    output_tokens?: number; // Number of output tokens
    cached_tokens?: number; // Number of cached input tokens
    image_count?: number; // Number of images generated (for models like Imagen)
    metadata?: Record<string, any>; // Allow any type for metadata flexibility
    timestamp?: Date; // Timestamp of the usage, crucial for time-based pricing
    isFreeTierUsage?: boolean; // Flag for free tier usage override
}

// Interface for grouping models by class/capability
export interface ModelClass {
	models: string[];
	random?: boolean;
}

// Available model providers
export type ModelProviderID =
	'openai'
	| 'anthropic'
	| 'google'
	| 'xai'
	| 'deepseek'
	| 'test'
	;

// Available model classes
export type ModelClassID =
	'standard'
	| 'mini'
	| 'reasoning'
	| 'monologue'
	| 'code'
	| 'vision'
	| 'search'
	| 'image_generation' // Added for Imagen
	| 'embedding'        // Added for Text Embedding
	;

// --- MODEL_CLASSES remains largely the same, but ensure model IDs match the registry ---
// (Keep your existing MODEL_CLASSES definition here, just ensure IDs are consistent
//  with the updated MODEL_REGISTRY below)
export const MODEL_CLASSES: Record<ModelClassID, ModelClass> = {
	// Standard models with good all-around capabilities
	'standard': {
		models: [
			'gpt-4o',              		// OpenAI
			'gemini-2.0-flash',    		// Google
			'claude-3-7-sonnet-latest', // Anthropic
			'grok-2',               	// X.AI
			'deepseek-chat',        	// DeepSeek
			'test-standard',            // Test provider
		],
		random: true,
	},

	// Mini/smaller models - faster but less capable
	'mini': {
		models: [
			'gpt-4o-mini',             	// OpenAI
			'claude-3-5-haiku-latest',  // Anthropic
			'gemini-2.0-flash-lite',		// Google
			'test-mini',                // Test provider
		],
		random: true,
	},

	// Advanced reasoning models
	'reasoning': {
		models: [
			'gemini-2.5-pro-exp-03-25', // Google
			'o3-mini',                  // OpenAI
			'claude-3-7-sonnet-latest', // Anthropic
			'grok-2',                   // X.AI
			'deepseek-reasoner',       	// DeepSeek
			'test-reasoning',           // Test provider
		],
		random: true,
	},

	// Monologue models
	'monologue': {
		models: [
			'gemini-2.5-pro-exp-03-25', // Google
			'o3-mini',                  // OpenAI
			'claude-3-7-sonnet-latest', // Anthropic
			'deepseek-reasoner',       	// DeepSeek
			'test-monologue',           // Test provider
		],
		random: true,
	},

	// Programming models
	'code': {
		models: [
			'gemini-2.5-pro-exp-03-25', // Google
			'claude-code',              // Anthropic
			'claude-3-7-sonnet',        // Anthropic
			'o3-mini',                  // OpenAI
			'test-code',                // Test provider
		],
	},

	// Models with vision capabilities
	'vision': {
		models:  [
			'computer-use-preview',     // OpenAI
			'gpt-4o',              		// OpenAI
			'gemini-2.0-flash',    		// Google
			'grok-2-vision',            // X.AI
			'test-vision',              // Test provider
		],
	},

	// Models with search capabilities
	'search':{
		models: [
			'gpt-4o',					// OpenAI
			'deepseek-reasoner',       	// DeepSeek
			'gemini-2.5-pro-exp-03-25', // Google
			'test-search',              // Test provider
		],
		random: true,
	},

	'image_generation': {
		models: ['imagen-3', 'test-image-gen'], // Including test model
	},

	'embedding': {
		models: ['text-embedding-004', 'test-embedding'], // Including test model
	}
};

// Main model registry with all supported models
export const MODEL_REGISTRY: ModelEntry[] = [
	//
	// Test provider models (add at the beginning for better visibility during tests)
	{
		id: 'test-standard',
		provider: 'test',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			notes: ['Free test model for standard capabilities.']
		},
		class: 'standard',
		description: 'Test model with standard capabilities',
		context_length: 16000
	},
	{
		id: 'test-mini',
		provider: 'test',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			notes: ['Free test model for mini capabilities.']
		},
		class: 'mini',
		description: 'Test model with mini capabilities',
		context_length: 8000
	},
	{
		id: 'test-reasoning',
		provider: 'test',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			notes: ['Free test model for reasoning capabilities.']
		},
		class: 'reasoning',
		description: 'Test model with reasoning capabilities',
		context_length: 32000
	},
	{
		id: 'test-monologue',
		provider: 'test',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			notes: ['Free test model for monologue generation.']
		},
		class: 'monologue',
		description: 'Test model with monologue capabilities',
		context_length: 32000
	},
	{
		id: 'test-code',
		provider: 'test',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			notes: ['Free test model for code generation.']
		},
		class: 'code',
		description: 'Test model with code capabilities',
		context_length: 32000
	},
	{
		id: 'test-vision',
		provider: 'test',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			notes: ['Free test model for vision capabilities.']
		},
		class: 'vision',
		description: 'Test model with vision capabilities',
		context_length: 32000
	},
	{
		id: 'test-search',
		provider: 'test',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			notes: ['Free test model for search capabilities.']
		},
		class: 'search',
		description: 'Test model with search capabilities',
		context_length: 32000
	},
	{
		id: 'test-image-gen',
		provider: 'test',
		cost: {
			per_image: 0,
			notes: ['Free test model for image generation.']
		},
		class: 'image_generation',
		description: 'Test model for image generation'
	},
	{
		id: 'test-embedding',
		provider: 'test',
		cost: {
			input_per_million: 0,
			notes: ['Free test model for embeddings.']
		},
		class: 'embedding',
		description: 'Test model for text embeddings'
	},
	{
		id: 'test-error',
		provider: 'test',
		cost: {
			input_per_million: 0,
			output_per_million: 0
		},
		description: 'Test model that always produces errors'
	},
	{
		id: 'test-rate-limit',
		provider: 'test',
		cost: {
			input_per_million: 0,
			output_per_million: 0
		},
		description: 'Test model that always produces rate limit errors'
	},
	
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
		class: 'standard',
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
		class: 'standard',
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
		class: 'standard',
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
		class: 'standard',
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
		class: 'standard',
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
		class: 'standard',
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
		id: 'claude-3-7-sonnet-latest',
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
		id: 'claude-3-5-haiku-latest',
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
		class: 'standard',
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

	// Gemini 2.5 Pro (Experimental/Free)
	{
		id: 'gemini-2.5-pro-exp-03-25',
		provider: 'google',
		cost: {
			// Explicitly zero cost for the free experimental version
			input_per_million: 0,
			output_per_million: 0,
			cached_input_per_million: 0,
			notes: ['Free tier experimental model.']
		},
		class: 'reasoning',
		description: 'Free experimental version of Gemini 2.5 Pro. Excels at coding & complex reasoning.',
		context_length: 1048576 // Assuming same context as paid preview
	},
	// Gemini 2.5 Pro (Paid Preview)
	{
		id: 'gemini-2.5-pro-preview-03-25', // Distinct ID for the paid version
		provider: 'google',
		cost: {
			input_per_million: { // Tiered pricing for input
				threshold_tokens: 200000, // 200k token threshold
				price_below_threshold_per_million: 1.25,
				price_above_threshold_per_million: 2.50,
			},
			output_per_million: { // Tiered pricing for output
				threshold_tokens: 200000, // 200k token threshold
				price_below_threshold_per_million: 10.00,
				price_above_threshold_per_million: 15.00,
			},
			// cached_input_per_million: Not available according to pricing table
			notes: [
				'Paid preview version.',
				'Grounding with Google Search: Free up to 1,500 RPD, then $35 / 1,000 requests.'
			]
		},
		class: 'reasoning',
		description: 'Paid preview of Gemini 2.5 Pro. State-of-the-art multipurpose model.',
		context_length: 1048576
	},

	// Gemini 2.0 Flash
	{
		id: 'gemini-2.0-flash',
		provider: 'google',
		cost: {
			// Paid tier costs (assuming text/image/video input)
			input_per_million: 0.10,
			output_per_million: 0.40,
			// Paid tier cache cost (assuming text/image/video)
			cached_input_per_million: 0.025, // Per million tokens used from cache
			notes: [
				'Free tier available with usage limits.',
				'Paid input cost is $0.70/million tokens for audio.',
				'Paid cached input cost is $0.175/million tokens for audio.',
				'Context caching storage cost (paid tier): $1.00 / 1M tokens per hour (effective Apr 15, 2025).',
				'Grounding with Google Search (paid tier): Free up to 1,500 RPD, then $35 / 1,000 requests.'
			]
		},
		class: 'standard',
		description: 'Balanced multimodal model with large context, built for Agents.',
		context_length: 1048576 // Assuming 1M context
	},

	// Gemini 2.0 Flash-Lite
	{
		id: 'gemini-2.0-flash-lite',
		provider: 'google',
		cost: {
			// Paid tier costs
			input_per_million: 0.075,
			output_per_million: 0.30,
			// cached_input_per_million: Not specified, assume N/A or included in above
			notes: [
				'Free tier available with usage limits.',
				'Context caching costs expected April 15, 2025 (details TBC).',
			]
		},
		class: 'mini',
		description: 'Smallest and most cost-effective model for at-scale usage.',
		context_length: 1048576 // Assuming 1M context
	},
	// Gemini 2.0 Flash Thinking (Assuming free experimental like 2.5 Pro Exp)
	{
		id: 'gemini-2.0-flash-thinking-exp-01-21',
		provider: 'google',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			notes: ['Experimental model, likely free.']
		},
		class: 'reasoning',
		description: 'Thinking version of gemini-2.0-flash'
		// context_length: Unknown
	},

	// Gemini 1.5 Pro
	{
		id: 'gemini-1.5-pro',
		aliases: ['gemini-1.5-pro-latest'],
		provider: 'google',
		cost: {
			input_per_million: { // Tiered pricing
				threshold_tokens: 128000, // 128k token threshold
				price_below_threshold_per_million: 1.25, // Mismatched pricing in user's original vs table ($7.0 vs $1.25/$2.50). Using table pricing.
				price_above_threshold_per_million: 2.50,
			},
			output_per_million: { // Tiered pricing
				threshold_tokens: 128000, // 128k token threshold
				price_below_threshold_per_million: 5.00, // Mismatched pricing ($21.0 vs $5.0/$10.0). Using table pricing.
				price_above_threshold_per_million: 10.00,
			},
			cached_input_per_million: { // Tiered pricing
				threshold_tokens: 128000,
				price_below_threshold_per_million: 0.3125,
				price_above_threshold_per_million: 0.625,
			},
			notes: [
				'Free tier available via AI Studio.', // API access seems paid
				'Context caching storage cost (paid tier): $4.50 / 1M tokens per hour.',
				'Grounding with Google Search (paid tier): $35 / 1K requests (up to 5K/day).'
			]
		},
		class: 'standard', // Or 'reasoning' given capabilities? Table implies high intelligence. Let's keep 'standard' as per user's original.
		description: 'Highest intelligence Gemini 1.5 model with 2M token context window.',
		context_length: 2000000 // Updated context length
	},

	// Gemini 1.5 Flash
	{
		id: 'gemini-1.5-flash',
		aliases: ['gemini-1.5-flash-latest'],
		provider: 'google',
		cost: {
			input_per_million: { // Tiered pricing
				threshold_tokens: 128000, // 128k token threshold
				price_below_threshold_per_million: 0.075,
				price_above_threshold_per_million: 0.15,
			},
			output_per_million: { // Tiered pricing
				threshold_tokens: 128000, // 128k token threshold
				price_below_threshold_per_million: 0.30,
				price_above_threshold_per_million: 0.60,
			},
			cached_input_per_million: { // Tiered pricing
				threshold_tokens: 128000,
				price_below_threshold_per_million: 0.01875,
				price_above_threshold_per_million: 0.0375,
			},
			notes: [
				'Free tier available via AI Studio.', // API access seems paid
				'Context caching storage cost (paid tier): $1.00 / 1M tokens per hour.',
				'Tuning service is free; token prices remain the same for tuned models.',
				'Grounding with Google Search (paid tier): $35 / 1K requests (up to 5K/day).'
			]
		},
		class: 'mini',
		description: 'Fastest multimodal 1.5 model with 1M token context window.',
		context_length: 1000000
	},

	// Gemini 1.5 Flash-8B (New)
	{
		id: 'gemini-1.5-flash-8b',
		provider: 'google',
		cost: {
			input_per_million: { // Tiered pricing
				threshold_tokens: 128000, // 128k token threshold
				price_below_threshold_per_million: 0.0375,
				price_above_threshold_per_million: 0.075,
			},
			output_per_million: { // Tiered pricing
				threshold_tokens: 128000, // 128k token threshold
				price_below_threshold_per_million: 0.15,
				price_above_threshold_per_million: 0.30,
			},
			cached_input_per_million: { // Tiered pricing
				threshold_tokens: 128000,
				price_below_threshold_per_million: 0.01,
				price_above_threshold_per_million: 0.02,
			},
			notes: [
				'Free tier available via AI Studio.', // API access seems paid
				'Context caching storage cost (paid tier): $0.25 / 1M tokens per hour.',
				'Tuning service is free; token prices remain the same for tuned models.',
				'Grounding with Google Search (paid tier): $35 / 1K requests (up to 5K/day).'
			]
		},
		class: 'mini',
		description: 'Smallest 1.5 model for lower intelligence use cases, 1M token context window.',
		context_length: 1000000
	},

	// Gemini 1.0 Pro
	{
		id: 'gemini-1.0-pro',
		aliases: ['gemini-1.0-pro-latest', 'gemini-pro'],
		provider: 'google',
		cost: {
			// Flat rate pricing, seems superseded by newer models but kept for compatibility
			input_per_million: 0.125,
			output_per_million: 0.375,
			notes: ['Older model. Consider using newer Gemini versions.']
		},
		class: 'standard',
		description: 'Original Gemini Pro model.',
		context_length: 32768
	},

	// Gemini 1.0 Pro Vision
	{
		id: 'gemini-pro-vision', // Matches user's existing ID
		provider: 'google',
		cost: {
			// Assuming same pricing as 1.0 Pro based on user's original data
			input_per_million: 0.125, // Cost likely includes image analysis component implicitly
			output_per_million: 0.375,
			notes: ['Older model with vision. Consider using newer multimodal models.']
		},
		class: 'vision',
		description: 'Original Gemini model with vision capabilities.',
		context_length: 32768
	},

	// --- Other Google Models ---

	// Imagen 3 (New)
	{
		id: 'imagen-3',
		provider: 'google',
		cost: {
			per_image: 0.03, // Cost is per image, not tokens
			notes: ['Paid tier only. Cost is per generated image.']
		},
		class: 'image_generation',
		description: 'State-of-the-art image generation model.',
		// context_length: Not applicable in the same way
	},

	// Gemma 3 (New)
	{
		id: 'gemma-3',
		provider: 'google',
		cost: {
			input_per_million: 0,
			output_per_million: 0,
			notes: ['Free tier only. Lightweight open model.']
		},
		class: 'standard', // Or define a new 'open_model' class
		description: 'Lightweight, state-of-the-art open model.',
		// context_length: Check Gemma documentation for specifics
	},

	// Text Embedding 004 (New)
	{
		id: 'text-embedding-004',
		provider: 'google',
		cost: {
			// Pricing seems to be per 1M *input* tokens only for embedding models
			input_per_million: 0, // Free tier only according to the table
			output_per_million: 0, // No output tokens in the traditional sense
			notes: ['Free tier only. Text embedding model.']
		},
		class: 'embedding',
		description: 'State-of-the-art text embedding model.',
		// context_length: Check embedding model documentation
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

	// --- DeepSeek Models ---
	{
		id: 'deepseek-chat',
		provider: 'deepseek',
		cost: {
			// Time-based pricing: Peak UTC 00:30 to 16:30
			cached_input_per_million: { // Cache Hit Input
				peak_price_per_million: 0.07,
				off_peak_price_per_million: 0.035, // 50% off
				peak_utc_start_hour: 0, peak_utc_start_minute: 30,
				peak_utc_end_hour: 16, peak_utc_end_minute: 30,
			},
			input_per_million: { // Cache Miss Input
				peak_price_per_million: 0.27,
				off_peak_price_per_million: 0.135, // 50% off
				peak_utc_start_hour: 0, peak_utc_start_minute: 30,
				peak_utc_end_hour: 16, peak_utc_end_minute: 30,
			},
			output_per_million: { // Output
				peak_price_per_million: 1.10,
				off_peak_price_per_million: 0.550, // 50% off
				peak_utc_start_hour: 0, peak_utc_start_minute: 30,
				peak_utc_end_hour: 16, peak_utc_end_minute: 30,
			},
			notes: ['Pricing varies based on UTC time (Peak: 00:30-16:30, Off-Peak: 16:30-00:30).']
		},
		class: 'standard',
		description: 'Front line DeepSeek model',
		context_length: 64000
	},
	{
		id: 'deepseek-reasoner',
		provider: 'deepseek',
		cost: {
			// Time-based pricing: Peak UTC 00:30 to 16:30
			cached_input_per_million: { // Cache Hit Input
				peak_price_per_million: 0.14,
				off_peak_price_per_million: 0.035, // 75% off
				peak_utc_start_hour: 0, peak_utc_start_minute: 30,
				peak_utc_end_hour: 16, peak_utc_end_minute: 30,
			},
			input_per_million: { // Cache Miss Input
				peak_price_per_million: 0.55,
				off_peak_price_per_million: 0.135, // 75% off
				peak_utc_start_hour: 0, peak_utc_start_minute: 30,
				peak_utc_end_hour: 16, peak_utc_end_minute: 30,
			},
			output_per_million: { // Output
				peak_price_per_million: 2.19,
				off_peak_price_per_million: 0.550, // 75% off
				peak_utc_start_hour: 0, peak_utc_start_minute: 30,
				peak_utc_end_hour: 16, peak_utc_end_minute: 30,
			},
			notes: ['Pricing varies based on UTC time (Peak: 00:30-16:30, Off-Peak: 16:30-00:30).']
		},
		class: 'reasoning',
		description: 'Thinking version of DeepSeek model',
		context_length: 64000
	},
];

/**
 * Find a model entry by ID or alias
 *
 * @param modelId The model ID or alias to search for
 * @returns The model entry or undefined if not found
 */

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


