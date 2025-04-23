/**
 * model_data.ts
 *
 * Model data for all supported LLM providers.
 * This file consolidates information about all supported models including:
 * - Basic model metadata
 * - Cost information (including tiered pricing)
 * - Grouping by capability
 * - Feature information (context length, modalities, tool use, etc.)
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
}

// Represents the feature set of a model
export interface ModelFeatures {
    context_length?: number; // Maximum context length in tokens
    input_modality?: ('text' | 'image' | 'audio' | 'video')[]; // Supported input types
    output_modality?: ('text' | 'image' | 'audio' | 'embedding')[]; // Supported output types
    tool_use?: boolean; // Whether the model supports tool/function calling
    streaming?: boolean; // Whether the model supports streaming responses
    json_output?: boolean; // Whether the model reliably outputs JSON
    max_output_tokens?: number; // Maximum output tokens for the model
    reasoning_output?: boolean; // Whether the model outputs reasoning steps
}

// Represents a single model entry in the registry
export interface ModelEntry {
    id: string; // Model identifier used in API calls
    aliases?: string[]; // Alternative names for the model
    provider: ModelProviderID; // Provider (openai, anthropic, google, xai, deepseek)
    cost: ModelCost; // Cost information using the updated structure
    features: ModelFeatures; // Feature information for the model
    class?: string; // Model class as a string to avoid strict typing issues
    description?: string; // Short description of the model's capabilities
    rate_limit_fallback?: string; // Fallback model ID in case of rate limit errors
    openrouter_id?: string; // OpenRouter model ID for this model (if available)
    score?: number; // Legacy overall MECH model score (0-100)
    scores?: {
        // Class-specific scores from artificialanalysis.ai benchmarks
        monologue?: number; // Humanity's Last Exam (Reasoning & Knowledge) score
        code?: number; // HumanEval (Coding) score
        reasoning?: number; // GPQA Diamond (Scientific Reasoning) score
        // Add more class-specific scores as needed
    };
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
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'xai'
    | 'deepseek'
    | 'openrouter'
    | 'test';

// Import from the local symlink which points to the common file
import { ModelClassID } from '../types/shared-types.js';

// Re-export for backward compatibility
export type { ModelClassID };

// --- MODEL_CLASSES remains largely the same, but ensure model IDs match the registry ---
// (Keep your existing MODEL_CLASSES definition here, just ensure IDs are consistent
//  with the updated MODEL_REGISTRY below)
// Define model classes object with a type assertion to avoid TypeScript errors
// This allows us to use a subset of the ModelClassID types
export const MODEL_CLASSES = {
    // Standard models with good all-around capabilities
    standard: {
        models: [
            'gpt-4.1', // OpenAI
            'gemini-2.0-flash', // Google
            'claude-3-5-haiku-latest', // Anthropic
            'grok-3-mini', // X.AI
            'deepseek-chat', // DeepSeek
            'meta-llama/llama-4-maverick', // Meta/OpenRouter
        ],
        random: true,
    },

    // Mini/smaller models - faster but less capable
    mini: {
        models: [
            'gpt-4.1-nano', // OpenAI
            'claude-3-5-haiku-latest', // Anthropic
            'gemini-2.0-flash-lite', // Google
            'grok-3-mini', // X.AI
            'meta-llama/llama-4-scout', // Meta/OpenRouter
            'mistral/ministral-8b', // Mistral/OpenRouter
        ],
        random: true,
    },

    // Advanced reasoning models
    reasoning: {
        models: [
            'gemini-2.5-pro-exp-03-25', // Google
            'o3', // OpenAI
            'o4-mini', // OpenAI
            'claude-3-7-sonnet-latest', // Anthropic
            'grok-3', // X.AI
            'deepseek-reasoner', // DeepSeek
            'meta-llama/llama-4-maverick', // Meta/OpenRouter
            'qwen/qwen-max', // Qwen/OpenRouter
        ],
        random: true,
    },

    // Monologue models
    monologue: {
        models: [
            'gemini-2.5-pro-exp-03-25', // Google
            'o4-mini', // OpenAI
            'gpt-4.1', // OpenAI
            'claude-3-7-sonnet-latest', // Anthropic
            'grok-3', // X.AI
            'grok-3-mini', // X.AI
            'deepseek-reasoner', // DeepSeek
            'meta-llama/llama-4-maverick', // Meta/OpenRouter
            'qwen/qwen-max', // Qwen/OpenRouter
        ],
        // Remove random: true, as we're using weighted selection based on scores
    },

    // Programming models
    code: {
        models: [
            'claude-code', // Anthropic
            'codex', // OpenAI
            'cline-cli', // Cline
        ],
        //random: true,
    },

    // Writing models - optimized for conversation and text generation
    writing: {
        models: [
            'gpt-4.1-mini', // OpenAI
            'gemini-2.0-flash', // Google
            'meta-llama/llama-4-scout', // Meta/OpenRouter
        ],
    },

    // Summary models - optimized for extracting information from text
    // High quality, low cost allows this to be used heavily and reduce token usage for other models
    summary: {
        models: [
            'meta-llama/llama-4-scout', // Meta/OpenRouter
            'gemini-2.0-flash', // Google
            'gpt-4.1-nano', // OpenAI
            'mistral/ministral-8b', // Mistral/OpenRouter
        ],
        random: true,
    },

    // Models with vision capabilities
    vision: {
        models: [
            //'computer-use-preview',     // OpenAI
            'o3', // OpenAI
            'gemini-2.5-pro-exp-03-25', // Google
            'claude-3-7-sonnet-latest', // Anthropic
            'o4-mini', // OpenAI
            'grok-2-vision', // X.AI
            'gpt-4.1', // OpenAI
        ],
        //random: true,
    },

    // Mini models with vision capabilities
    vision_mini: {
        models: [
            'gpt-4.1-mini', // OpenAI
            'gemini-2.0-flash-lite', // Google
        ],
        random: true,
    },

    // Models with search capabilities
    search: {
        models: [
            'gpt-4o', // OpenAI
            'o4-mini', // OpenAI
            'deepseek-reasoner', // DeepSeek
            'gemini-2.5-pro-exp-03-25', // Google
        ],
        random: true,
    },

    image_generation: {
        models: ['imagen-3'], // Including test model
    },

    embedding: {
        models: ['text-embedding-004'], // Including test model
    },
};

// Main model registry with all supported models
export const MODEL_REGISTRY: ModelEntry[] = [
    // Models used via OpenRouter
    // Note: Specific pricing/features via OpenRouter can fluctuate. Validation based on general model info & provider docs.
    {
        id: 'meta-llama/llama-4-maverick',
        provider: 'openrouter',
        cost: {
            input_per_million: 0.18,
            output_per_million: 0.6,
        },
        features: {
            context_length: 1048576,
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'standard',
        score: 78, // Legacy overall score
        scores: {
            monologue: 72, // Humanity's Last Exam
            code: 64, // HumanEval
            reasoning: 56, // GPQA Diamond
        },
        description:
            'Llama 4 Maverick 17B Instruct (128E) is a high-capacity multimodal language model from Meta, built on a mixture-of-experts (MoE) architecture with 128 experts and 17 billion active parameters per forward pass (400B total).',
    },
    {
        id: 'meta-llama/llama-4-scout',
        provider: 'openrouter',
        cost: {
            input_per_million: 0.08,
            output_per_million: 0.3,
        },
        features: {
            context_length: 327680,
            input_modality: ['text'], // Assuming text-only based on description, verify if image needed
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'mini',
        score: 65, // Smaller model with decent performance
        description:
            'Llama 4 Scout 17B Instruct (16E) is a mixture-of-experts (MoE) language model developed by Meta, activating 17 billion parameters out of a total of 109B.',
    },
    {
        id: 'qwen/qwen-max',
        provider: 'openrouter',
        cost: {
            input_per_million: 1.6,
            output_per_million: 6.4,
        },
        features: {
            context_length: 131072, // Updated context length; Note: Actual context on OpenRouter can vary.
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'reasoning', // High-capability model suitable for complex tasks.
        score: 80, // Legacy overall score
        scores: {
            monologue: 73, // Humanity's Last Exam
            code: 61, // HumanEval
            reasoning: 57, // GPQA Diamond
        },
        description:
            'Qwen-Max, based on Qwen2.5, provides the best inference performance among Qwen models, especially for complex multi-step tasks.',
    },
    {
        id: 'mistral/ministral-8b',
        provider: 'openrouter',
        cost: {
            input_per_million: 0.1,
            output_per_million: 0.1,
        },
        features: {
            context_length: 131072,
            input_modality: ['text'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'standard', // Efficient standard model.
        score: 55, // Lower score due to smaller size, but still useful
        description:
            'Ministral 8B is a state-of-the-art language model optimized for on-device and edge computing. Designed for efficiency in knowledge-intensive tasks, commonsense reasoning, and function-calling.',
    },

    //
    // OpenAI models
    //

    // GPT-4.1 models
    {
        id: 'gpt-4.1',
        aliases: ['gpt-4.1-2025-04-14'],
        provider: 'openai',
        cost: {
            input_per_million: 2.0,
            cached_input_per_million: 0.5,
            output_per_million: 8.0,
        },
        features: {
            context_length: 1048576, // Confirmed ~1M token context
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'standard',
        score: 82, // Legacy overall score
        scores: {
            monologue: 86, // Humanity's Last Exam
            code: 83, // HumanEval
            reasoning: 71, // GPQA Diamond
        },
        description: 'Flagship GPT model for complex tasks',
    },
    {
        id: 'gpt-4.1-mini',
        aliases: ['gpt-4.1-mini-2025-04-14'],
        provider: 'openai',
        cost: {
            input_per_million: 0.4,
            cached_input_per_million: 0.1,
            output_per_million: 1.6,
        },
        features: {
            context_length: 1048576, // Confirmed ~1M token context
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'mini',
        score: 75, // Good balance of capability and cost
        description: 'Balanced for intelligence, speed, and cost',
    },
    {
        id: 'gpt-4.1-nano',
        aliases: ['gpt-4.1-nano-2025-04-14'],
        provider: 'openai',
        cost: {
            input_per_million: 0.1,
            cached_input_per_million: 0.025,
            output_per_million: 0.4,
        },
        features: {
            context_length: 1048576, // Confirmed ~1M token context
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'mini',
        score: 60, // Lower score due to smaller size
        description: 'Fastest, most cost-effective GPT-4.1 model',
    },

    // GPT-4.5 models
    {
        id: 'gpt-4.5-preview',
        aliases: ['gpt-4.5-preview-2025-02-27'],
        provider: 'openai',
        cost: {
            input_per_million: 75.0,
            cached_input_per_million: 37.5,
            output_per_million: 150.0,
        },
        features: {
            context_length: 128000, // Confirmed
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'standard', // High-end standard model
        description: 'Latest premium GPT model from OpenAI',
    },

    // GPT-4o models
    {
        id: 'gpt-4o',
        aliases: ['gpt-4o-2024-08-06'],
        provider: 'openai',
        cost: {
            input_per_million: 2.5, // Base text cost
            cached_input_per_million: 1.25,
            output_per_million: 10.0,
        },
        features: {
            context_length: 128000, // Confirmed
            input_modality: ['text', 'image', 'audio'],
            output_modality: ['text', 'audio'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'standard',
        score: 80, // Strong score for all-around capabilities
        description: 'OpenAI standard model with multimodal capabilities',
    },
    {
        id: 'gpt-4o-mini',
        aliases: ['gpt-4o-mini-2024-07-18'],
        provider: 'openai',
        cost: {
            input_per_million: 0.15,
            cached_input_per_million: 0.075,
            output_per_million: 0.6,
        },
        features: {
            context_length: 128000, // Confirmed
            input_modality: ['text', 'image', 'audio'],
            output_modality: ['text', 'audio'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'mini',
        score: 65, // Legacy overall score
        scores: {
            monologue: 70, // Humanity's Last Exam
            code: 63, // HumanEval
            reasoning: 60, // GPQA Diamond
        },
        description: 'Smaller, faster version of GPT-4o',
    },
    {
        id: 'gpt-4o-search-preview',
        aliases: ['gpt-4o-search-preview-2025-03-11'],
        provider: 'openai',
        cost: {
            input_per_million: 2.5, // Base model cost
            output_per_million: 10.0, // Base model cost
            // Note: Web search adds per-1k-call costs ($30-$50)
        },
        features: {
            context_length: 128000, // Assumed based on gpt-4o
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true, // Includes built-in search tool
            streaming: true,
            json_output: true,
        },
        class: 'search',
        description: 'GPT-4o with built-in search capabilities',
    },
    {
        id: 'gpt-4o-mini-search-preview',
        aliases: ['gpt-4o-mini-search-preview-2025-03-11'],
        provider: 'openai',
        cost: {
            input_per_million: 0.15, // Base model cost
            output_per_million: 0.6, // Base model cost
            // Note: Web search adds per-1k-call costs ($25-$30)
        },
        features: {
            context_length: 128000, // Assumed based on gpt-4o-mini
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true, // Includes built-in search tool
            streaming: true,
            json_output: true,
        },
        class: 'search',
        description: 'Smaller GPT-4o with built-in search capabilities',
    },

    // O series models
    {
        id: 'o4-mini',
        aliases: ['o4-mini-2025-04-16'],
        provider: 'openai',
        cost: {
            input_per_million: 1.1,
            cached_input_per_million: 0.275,
            output_per_million: 4.4,
        },
        features: {
            context_length: 200000, // Confirmed
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'reasoning',
        score: 80, // Legacy overall score
        scores: {
            monologue: 85, // Humanity's Last Exam
            code: 82, // HumanEval
            reasoning: 76, // GPQA Diamond
        },
        description: 'Faster, more affordable reasoning model',
    },
    {
        id: 'o3',
        aliases: ['o3-2025-04-16'],
        provider: 'openai',
        cost: {
            input_per_million: 10,
            cached_input_per_million: 2.5,
            output_per_million: 40,
        },
        features: {
            context_length: 200000, // Confirmed
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'reasoning',
        score: 85, // Legacy overall score
        scores: {
            monologue: 87, // Humanity's Last Exam
            code: 84, // HumanEval
            reasoning: 79, // GPQA Diamond
        },
        description: 'Powerful reasoning model (superseded by o1-pro)',
    },
    {
        id: 'o1',
        aliases: ['o1-2024-12-17'],
        provider: 'openai',
        cost: {
            input_per_million: 15.0,
            cached_input_per_million: 7.5,
            output_per_million: 60.0,
        },
        features: {
            context_length: 200000, // Confirmed
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'reasoning',
        description: 'Advanced reasoning model from OpenAI',
    },
    {
        id: 'o1-pro',
        aliases: ['o1-pro-2025-03-19'],
        provider: 'openai',
        cost: {
            input_per_million: 150.0,
            // "cached_input_per_million": null, // Cached input not listed
            output_per_million: 600.0,
        },
        features: {
            context_length: 200000, // Confirmed
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: false, // Explicitly does not support streaming
            json_output: true,
        },
        class: 'reasoning',
        score: 90, // Very high score for premium model
        description:
            'Premium O-series model from OpenAI, highest reasoning capability',
    },
    {
        id: 'o3-mini',
        aliases: ['o3-mini-2025-01-31', 'o1-mini', 'o1-mini-2024-09-12'],
        provider: 'openai',
        cost: {
            input_per_million: 1.1,
            cached_input_per_million: 0.55,
            output_per_million: 4.4,
        },
        features: {
            context_length: 200000, // Confirmed
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'reasoning',
        score: 70, // Good score for smaller reasoning model
        description: 'Smaller O-series model with reasoning capabilities',
    },

    // Computer-use models
    {
        id: 'computer-use-preview',
        aliases: ['computer-use-preview-2025-03-11'],
        provider: 'openai',
        cost: {
            input_per_million: 3.0,
            // "cached_input_per_million": null, // Not listed
            output_per_million: 12.0,
            // Note: Also has Code Interpreter session cost if used
        },
        features: {
            // "context_length": Unknown,
            input_modality: ['text', 'image'],
            output_modality: ['text'], // Outputs actions/text
            tool_use: true, // Specialized for computer control
            streaming: true, // Assumed
            json_output: true, // Assumed
        },
        class: 'vision', // Changed class to 'agent' as it's more descriptive
        description:
            'Model that can understand and control computer interfaces',
    },

    //
    // Anthropic (Claude) models
    //

    // Claude 3.7 Sonnet
    {
        id: 'claude-3-7-sonnet-latest', // Maps to claude-3-7-sonnet-20250219
        provider: 'anthropic',
        cost: {
            input_per_million: 3.0,
            output_per_million: 15.0,
            cached_input_per_million: 0.3, // Check Anthropic docs for specifics
        },
        features: {
            context_length: 200000, // Confirmed
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
            max_output_tokens: 64000, // Default, higher possible
        },
        class: 'reasoning',
        score: 85, // Legacy overall score
        scores: {
            monologue: 83, // Humanity's Last Exam
            code: 77, // HumanEval
            reasoning: 69, // GPQA Diamond
        },
        description:
            'Latest Claude model with strong reasoning capabilities (extended thinking internal)',
    },

    // Claude 3.5 Haiku
    {
        id: 'claude-3-5-haiku-latest', // Maps to claude-3-5-haiku-20241022
        provider: 'anthropic',
        cost: {
            input_per_million: 0.8,
            output_per_million: 4.0,
            cached_input_per_million: 0.08, // Check Anthropic docs for specifics
        },
        features: {
            context_length: 200000, // Confirmed
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
            max_output_tokens: 8192, // Confirmed
        },
        class: 'mini',
        score: 70, // Legacy overall score
        scores: {
            monologue: 66, // Humanity's Last Exam
            code: 63, // HumanEval
            reasoning: 55, // GPQA Diamond
        },
        description: 'Fast, cost-effective Claude model',
    },

    // Claude CLI (Access Method)
    {
        id: 'claude-cli',
        provider: 'anthropic',
        cost: {
            // Assumes use of Claude 3.7 Sonnet
            input_per_million: 3.0,
            output_per_million: 15.0,
            cached_input_per_million: 0.3,
        },
        features: {
            // Assumes use of Claude 3.7 Sonnet
            context_length: 200000,
            input_modality: ['text', 'image'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'reasoning', // Assuming Sonnet backend
        description:
            'Claude accessed via CLI (likely uses latest Sonnet or Haiku model)',
    },

    //
    // Google (Gemini) models
    //

    // Gemini 2.5 Pro (Experimental/Free)
    {
        id: 'gemini-2.5-pro-exp-03-25',
        provider: 'google',
        cost: {
            input_per_million: 0,
            output_per_million: 0,
            cached_input_per_million: 0,
        },
        features: {
            context_length: 1048576, // Confirmed
            input_modality: ['text', 'image', 'video', 'audio'],
            output_modality: ['text'],
            tool_use: true, // Function calling
            streaming: true,
            json_output: true,
            max_output_tokens: 65536, // Confirmed
        },
        rate_limit_fallback: 'gemini-2.5-pro-preview-03-25',
        class: 'reasoning',
        score: 85, // Legacy overall score
        scores: {
            monologue: 78, // Humanity's Last Exam
            code: 70, // HumanEval
            reasoning: 66, // GPQA Diamond
        },
        description:
            'Free experimental version of Gemini 2.5 Pro. Excels at coding & complex reasoning.',
    },
    // Gemini 2.5 Pro (Paid Preview)
    {
        id: 'gemini-2.5-pro-preview-03-25',
        provider: 'google',
        cost: {
            // Tiered pricing
            input_per_million: {
                threshold_tokens: 200000,
                price_below_threshold_per_million: 1.25,
                price_above_threshold_per_million: 2.5,
            },
            output_per_million: {
                threshold_tokens: 200000,
                price_below_threshold_per_million: 10.0,
                price_above_threshold_per_million: 15.0,
            },
        },
        features: {
            context_length: 1048576, // Confirmed
            input_modality: ['text', 'image', 'video', 'audio'],
            output_modality: ['text'],
            tool_use: true, // Function calling
            streaming: true,
            json_output: true,
            max_output_tokens: 65536, // Confirmed
        },
        class: 'reasoning',
        score: 80, // High score for paid preview version
        description:
            'Paid preview of Gemini 2.5 Pro. State-of-the-art multipurpose model.',
    },

    // Gemini 2.0 Flash
    {
        id: 'gemini-2.0-flash',
        provider: 'google',
        cost: {
            input_per_million: 0.1,
            output_per_million: 0.4,
            cached_input_per_million: 0.025,
        },
        features: {
            context_length: 1048576,
            input_modality: ['text', 'image', 'video', 'audio'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
            max_output_tokens: 8192,
        },
        class: 'standard',
        score: 75, // Legacy overall score
        scores: {
            monologue: 70, // Humanity's Last Exam
            code: 55, // HumanEval
            reasoning: 56, // GPQA Diamond
        },
        description:
            'Balanced multimodal model with large context, built for Agents.',
    },

    // Code-specific models
    {
        id: 'claude-code',
        provider: 'anthropic',
        cost: {
            input_per_million: 3.0,
            output_per_million: 15.0,
        },
        features: {
            context_length: 200000,
            input_modality: ['text'],
            output_modality: ['text'],
            tool_use: true,
            streaming: true,
            json_output: true,
        },
        class: 'code',
        score: 75, // Legacy overall score
        scores: {
            code: 48, // HumanEval score
        },
        description: 'Claude model optimized for coding tasks',
    },

    {
        id: 'codex',
        provider: 'openai',
        cost: {
            input_per_million: 1.0,
            output_per_million: 5.0,
        },
        features: {
            context_length: 8000,
            input_modality: ['text'],
            output_modality: ['text'],
            tool_use: false,
            streaming: true,
            json_output: true,
        },
        class: 'code',
        score: 70, // Legacy overall score
        scores: {
            code: 44, // HumanEval score (legacy)
        },
        description: 'OpenAI model optimized for coding tasks',
    },
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
    return MODEL_REGISTRY.find(model => model.aliases?.includes(modelId));
}
