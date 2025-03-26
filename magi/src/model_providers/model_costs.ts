/**
 * Token cost mapping for different model providers.
 * 
 * This file provides cost mappings for various models and can be used
 * to calculate costs based on actual token usage.
 */

export interface ModelCost {
  input_per_million: number;   // Cost in USD per million input tokens
  output_per_million: number;  // Cost in USD per million output tokens
  cached_input_per_million?: number; // Cost in USD per million cached input tokens
}

/**
 * OpenAI models price mapping
 * Prices in USD per million tokens
 * Source: https://openai.com/pricing
 */
export const OPENAI_COSTS: Record<string, ModelCost> = {
  // GPT-4.5 models
  'gpt-4.5-preview': {
    input_per_million: 75.0,
    cached_input_per_million: 37.5,
    output_per_million: 150.0
  },
  'gpt-4.5-preview-2025-02-27': {
    input_per_million: 75.0,
    cached_input_per_million: 37.5,
    output_per_million: 150.0
  },

  // GPT-4o models
  'gpt-4o': {
    input_per_million: 2.5,
    cached_input_per_million: 1.25,
    output_per_million: 10.0
  },
  'gpt-4o-2024-08-06': {
    input_per_million: 2.5,
    cached_input_per_million: 1.25,
    output_per_million: 10.0
  },
  'gpt-4o-audio-preview': {
    input_per_million: 2.5,
    output_per_million: 10.0
  },
  'gpt-4o-audio-preview-2024-12-17': {
    input_per_million: 2.5,
    output_per_million: 10.0
  },
  'gpt-4o-realtime-preview': {
    input_per_million: 5.0,
    cached_input_per_million: 2.5,
    output_per_million: 20.0
  },
  'gpt-4o-realtime-preview-2024-12-17': {
    input_per_million: 5.0,
    cached_input_per_million: 2.5,
    output_per_million: 20.0
  },
  'gpt-4o-mini': {
    input_per_million: 0.15,
    cached_input_per_million: 0.075,
    output_per_million: 0.6
  },
  'gpt-4o-mini-2024-07-18': {
    input_per_million: 0.15,
    cached_input_per_million: 0.075,
    output_per_million: 0.6
  },
  'gpt-4o-mini-audio-preview': {
    input_per_million: 0.15,
    output_per_million: 0.6
  },
  'gpt-4o-mini-audio-preview-2024-12-17': {
    input_per_million: 0.15,
    output_per_million: 0.6
  },
  'gpt-4o-mini-realtime-preview': {
    input_per_million: 0.6,
    cached_input_per_million: 0.3,
    output_per_million: 2.4
  },
  'gpt-4o-mini-realtime-preview-2024-12-17': {
    input_per_million: 0.6,
    cached_input_per_million: 0.3,
    output_per_million: 2.4
  },
  'gpt-4o-mini-search-preview': {
    input_per_million: 0.15,
    output_per_million: 0.6
  },
  'gpt-4o-mini-search-preview-2025-03-11': {
    input_per_million: 0.15,
    output_per_million: 0.6
  },
  'gpt-4o-search-preview': {
    input_per_million: 2.5,
    output_per_million: 10.0
  },
  'gpt-4o-search-preview-2025-03-11': {
    input_per_million: 2.5,
    output_per_million: 10.0
  },

  // O models
  'o1': {
    input_per_million: 15.0,
    cached_input_per_million: 7.5,
    output_per_million: 60.0
  },
  'o1-2024-12-17': {
    input_per_million: 15.0,
    cached_input_per_million: 7.5,
    output_per_million: 60.0
  },
  'o1-pro': {
    input_per_million: 150.0,
    output_per_million: 600.0
  },
  'o1-pro-2025-03-19': {
    input_per_million: 150.0,
    output_per_million: 600.0
  },
  'o3-mini': {
    input_per_million: 1.1,
    cached_input_per_million: 0.55,
    output_per_million: 4.4
  },
  'o3-mini-2025-01-31': {
    input_per_million: 1.1,
    cached_input_per_million: 0.55,
    output_per_million: 4.4
  },
  'o1-mini': {
    input_per_million: 1.1,
    cached_input_per_million: 0.55,
    output_per_million: 4.4
  },
  'o1-mini-2024-09-12': {
    input_per_million: 1.1,
    cached_input_per_million: 0.55,
    output_per_million: 4.4
  },

  // Computer-use models
  'computer-use-preview': {
    input_per_million: 3.0,
    output_per_million: 12.0
  },
  'computer-use-preview-2025-03-11': {
    input_per_million: 3.0,
    output_per_million: 12.0
  },

  // GPT-3.5 Turbo models
  'gpt-3.5-turbo': {
    input_per_million: 0.5,
    output_per_million: 1.5
  },
  'gpt-3.5-turbo-0125': {
    input_per_million: 0.5,
    output_per_million: 1.5
  },
  'gpt-3.5-turbo-16k': {
    input_per_million: 1.0,
    output_per_million: 2.0
  },

  // Default for unknown models
  'default': {
    input_per_million: 10.0,
    output_per_million: 30.0
  }
};

/**
 * Anthropic models price mapping
 * Prices in USD per million tokens
 * Source: https://www.anthropic.com/api/pricing
 */
export const ANTHROPIC_COSTS: Record<string, ModelCost> = {
  // Claude 3.7 Sonnet (200K context)
  'claude-3-7-sonnet': {
    input_per_million: 3.0,
    output_per_million: 15.0,
    cached_input_per_million: 0.3 // Prompt caching read
  },
  // Note: Prompt caching write is $3.75/MTok, batch processing 50% discount

  // Claude 3.5 Haiku (200K context)
  'claude-3-5-haiku': {
    input_per_million: 0.8,
    output_per_million: 4.0,
    cached_input_per_million: 0.08 // Prompt caching read
  },
  // Note: Prompt caching write is $1/MTok, batch processing 50% discount

  // Claude 3 Opus (200K context)
  'claude-3-opus': {
    input_per_million: 15.0,
    output_per_million: 75.0,
    cached_input_per_million: 1.5 // Prompt caching read
  },
  'claude-3-opus-20240229': {
    input_per_million: 15.0,
    output_per_million: 75.0,
    cached_input_per_million: 1.5
  },
  // Note: Prompt caching write is $18.75/MTok, batch processing 50% discount

  // Claude 3 Sonnet
  'claude-3-sonnet': {
    input_per_million: 3.0,
    output_per_million: 15.0
  },
  'claude-3-sonnet-20240229': {
    input_per_million: 3.0,
    output_per_million: 15.0
  },

  // Claude 3 Haiku
  'claude-3-haiku': {
    input_per_million: 0.25,
    output_per_million: 1.25
  },
  'claude-3-haiku-20240307': {
    input_per_million: 0.25,
    output_per_million: 1.25
  },

  // Claude 2
  'claude-2': {
    input_per_million: 8.0,
    output_per_million: 24.0
  },
  'claude-2.0': {
    input_per_million: 8.0,
    output_per_million: 24.0
  },

  // Claude Instant
  'claude-instant-1': {
    input_per_million: 1.63,
    output_per_million: 5.51
  },

  // Claude CLI (use Claude 3.7 Sonnet pricing as default)
  'claude-cli': {
    input_per_million: 3.0,
    output_per_million: 15.0,
    cached_input_per_million: 0.3
  },

  // Default for unknown models
  'default': {
    input_per_million: 3.0,
    output_per_million: 15.0
  }
};

/**
 * Google (Gemini) models price mapping
 * Prices in USD per million tokens
 * Source: https://ai.google.dev/gemini-api/docs/pricing
 */
export const GOOGLE_COSTS: Record<string, ModelCost> = {
  // Gemini 2.0 models
  'gemini-2.0-flash': {
    input_per_million: 0.10,
    output_per_million: 0.40,
    cached_input_per_million: 0.025
    // Note: Audio input is $0.70 per million tokens
  },
  'gemini-2.0-flash-lite': {
    input_per_million: 0.075,
    output_per_million: 0.30
  },

  // Gemini 1.5 models
  'gemini-1.5-pro': {
    input_per_million: 7.0,
    output_per_million: 21.0
  },
  'gemini-1.5-pro-latest': {
    input_per_million: 7.0,
    output_per_million: 21.0
  },

  // Gemini 1.5 Flash
  'gemini-1.5-flash': {
    input_per_million: 0.075, // First 128K
    output_per_million: 0.30  // First 128K
    // Note: Beyond 128K - input: $0.15, output: $0.60 per million tokens
  },
  'gemini-1.5-flash-latest': {
    input_per_million: 0.075, // First 128K
    output_per_million: 0.30  // First 128K
    // Note: Beyond 128K - input: $0.15, output: $0.60 per million tokens
  },

  // Gemini 1.0 Pro
  'gemini-1.0-pro': {
    input_per_million: 0.125,
    output_per_million: 0.375
  },
  'gemini-1.0-pro-latest': {
    input_per_million: 0.125,
    output_per_million: 0.375
  },

  // Default for unknown models
  'default': {
    input_per_million: 1.0,
    output_per_million: 3.0
  }
};

/**
 * X.AI (Grok) models price mapping
 * Prices in USD per million tokens (as of March 2025)
 * Source: X.AI documentation
 */
export const XAI_COSTS: Record<string, ModelCost> = {
  // Grok-2 vision models
  'grok-2-vision-1212': {
    input_per_million: 2.0,  // Same for text and image input
    output_per_million: 10.0  // Text completion
  },
  'grok-2-vision': {
    input_per_million: 2.0,
    output_per_million: 10.0
  },
  'grok-2-vision-latest': {
    input_per_million: 2.0,
    output_per_million: 10.0
  },
  
  // Grok-2 image generation models
  // Note: image generation is priced per image, not per token
  'grok-2-image-1212': {
    input_per_million: 2.0,  // Using text input rate
    output_per_million: 10.0  // Not directly applicable for image generation
  },
  'grok-2-image': {
    input_per_million: 2.0,
    output_per_million: 10.0
  },
  'grok-2-image-latest': {
    input_per_million: 2.0,
    output_per_million: 10.0
  },
  
  // Grok-2 text models
  'grok-2-1212': {
    input_per_million: 2.0,
    output_per_million: 10.0
  },
  'grok-2': {
    input_per_million: 2.0,
    output_per_million: 10.0
  },
  'grok-2-latest': {
    input_per_million: 2.0,
    output_per_million: 10.0
  },
  
  // Grok vision beta models
  'grok-vision-beta': {
    input_per_million: 5.0,  // Same for text and image input
    output_per_million: 15.0
  },
  
  // Grok beta models
  'grok-beta': {
    input_per_million: 5.0,
    output_per_million: 15.0
  },
  
  // Default for unknown models
  'default': {
    input_per_million: 5.0,
    output_per_million: 15.0
  }
};

/**
 * Get cost rates for a specific model
 * 
 * @param provider The model provider (openai, anthropic, google, xai)
 * @param model The model name
 * @returns The cost rates for the model
 */
export function getModelCost(provider: string, model: string): ModelCost {
  let providerCosts: Record<string, ModelCost>;
  
  // Select the appropriate provider's cost mapping
  switch (provider.toLowerCase()) {
    case 'openai':
      providerCosts = OPENAI_COSTS;
      break;
    case 'anthropic':
      providerCosts = ANTHROPIC_COSTS;
      break;
    case 'google':
      providerCosts = GOOGLE_COSTS;
      break;
    case 'xai':
      providerCosts = XAI_COSTS;
      break;
    default:
      return {
        input_per_million: 5.0,  // Default fallback rate
        output_per_million: 15.0 // Default fallback rate
      };
  }
  
  // Try to find exact match
  if (providerCosts[model]) {
    return providerCosts[model];
  }
  
  // Try to find a partial match (e.g., if model is gpt-4o-2024-05-13, match with gpt-4o)
  for (const modelPrefix of Object.keys(providerCosts)) {
    if (model.startsWith(modelPrefix)) {
      return providerCosts[modelPrefix];
    }
  }
  
  // Return the default cost for this provider if no match found
  return providerCosts['default'];
}

/**
 * Calculate cost based on token usage
 * 
 * @param provider Provider name (openai, anthropic, google, xai)
 * @param model Model name
 * @param inputTokens Number of input tokens
 * @param outputTokens Number of output tokens
 * @param cachedTokens Number of cached input tokens (OpenAI only)
 * @returns The calculated cost in USD
 */
export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const rates = getModelCost(provider, model);
  
  // Calculate standard input token cost (excluding cached tokens)
  const standardInputTokens = inputTokens - cachedTokens;
  const inputCost = (standardInputTokens > 0 ? standardInputTokens : 0) / 1000000 * rates.input_per_million;
  
  // Calculate cached token cost if applicable
  let cachedCost = 0;
  if (cachedTokens > 0 && rates.cached_input_per_million !== undefined) {
    cachedCost = (cachedTokens / 1000000) * rates.cached_input_per_million;
  }
  
  const outputCost = (outputTokens / 1000000) * rates.output_per_million;
  
  return inputCost + cachedCost + outputCost;
}