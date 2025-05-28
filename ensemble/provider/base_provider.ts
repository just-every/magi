// ================================================================
// Base Provider Interface and Factory
// ================================================================

import { ResponseInputItem, ToolDefinition, ModelSettings } from '../types.js';
import { EnsembleStreamEvent } from '../stream/events.js';

/**
 * Parameters passed to provider's createStream method
 */
export interface ProviderRequestParams {
    modelSettings?: ModelSettings;
    tools?: ToolDefinition[];
    agentId?: string;
}

/**
 * Interface that all model providers must implement
 */
export interface BaseProvider {
    /**
     * Create a stream of events for the given model and messages
     */
    createStream(
        model: string,
        messages: ResponseInputItem[],
        params: ProviderRequestParams
    ): AsyncIterable<EnsembleStreamEvent>;

    /**
     * Optional: Create embeddings for text input
     */
    createEmbedding?(
        modelId: string,
        input: string | string[],
        opts?: {
            taskType?: string;
            dimensions?: number;
            normalize?: boolean;
        }
    ): Promise<number[] | number[][]>;

    /**
     * Optional: Get supported models for this provider
     */
    getSupportedModels?(): string[];

    /**
     * Optional: Validate if a model is supported by this provider
     */
    supportsModel?(model: string): boolean;
}

/**
 * Registry for model providers
 */
const providerRegistry = new Map<string, BaseProvider>();

/**
 * Register a provider for specific models or prefixes
 */
export function registerProvider(identifier: string, provider: BaseProvider): void {
    providerRegistry.set(identifier, provider);
}

/**
 * Get a provider for a specific model
 */
export function getModelProvider(model: string): BaseProvider {
    // Check for exact model match first
    if (providerRegistry.has(model)) {
        return providerRegistry.get(model)!;
    }

    // Check for prefix matches
    for (const [identifier, provider] of providerRegistry.entries()) {
        if (model.startsWith(identifier)) {
            return provider;
        }
    }

    // Check if any provider explicitly supports this model
    for (const provider of providerRegistry.values()) {
        if (provider.supportsModel?.(model)) {
            return provider;
        }
    }

    throw new Error(`No provider found for model: ${model}`);
}

/**
 * Get all registered providers
 */
export function getAllProviders(): Map<string, BaseProvider> {
    return new Map(providerRegistry);
}

/**
 * Clear all registered providers (mainly for testing)
 */
export function clearProviders(): void {
    providerRegistry.clear();
}

/**
 * Check if a provider is registered for a model
 */
export function hasProvider(model: string): boolean {
    try {
        getModelProvider(model);
        return true;
    } catch {
        return false;
    }
}

/**
 * Abstract base class that providers can extend for common functionality
 */
export abstract class AbstractProvider implements BaseProvider {
    abstract createStream(
        model: string,
        messages: ResponseInputItem[],
        params: ProviderRequestParams
    ): AsyncIterable<EnsembleStreamEvent>;

    /**
     * Default implementation that throws an error
     */
    async createEmbedding(
        modelId: string,
        input: string | string[],
        opts?: { taskType?: string; dimensions?: number; normalize?: boolean }
    ): Promise<number[] | number[][]> {
        throw new Error(`Embedding not supported by this provider for model: ${modelId}`);
    }

    /**
     * Default implementation that returns empty array
     */
    getSupportedModels(): string[] {
        return [];
    }

    /**
     * Default implementation that returns false
     */
    supportsModel(model: string): boolean {
        return false;
    }

    /**
     * Helper method to validate required environment variables
     */
    protected requireEnvVar(name: string): string {
        const value = process.env[name];
        if (!value) {
            throw new Error(`Environment variable ${name} is required but not set`);
        }
        return value;
    }

    /**
     * Helper method to get optional environment variables
     */
    protected getEnvVar(name: string, defaultValue?: string): string | undefined {
        return process.env[name] || defaultValue;
    }

    /**
     * Helper method to convert ResponseInputItem[] to provider-specific format
     */
    protected convertMessages(messages: ResponseInputItem[]): any[] {
        // Default implementation - providers should override this
        return messages.map(msg => {
            if (msg.type === 'message' && 'role' in msg && 'content' in msg) {
                return {
                    role: msg.role,
                    content: msg.content || ''
                };
            }
            // For other types, create a basic message representation
            return {
                role: 'system',
                content: `[${msg.type}]`
            };
        });
    }

    /**
     * Helper method to convert ToolDefinition[] to provider-specific format
     */
    protected convertTools(tools: ToolDefinition[]): any[] {
        // Default implementation - providers should override this
        return tools;
    }

    /**
     * Helper method to create common error events
     */
    protected createErrorEvent(error: string, code?: string, details?: any): EnsembleStreamEvent {
        return {
            type: 'error',
            error,
            code,
            details,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Helper method to create stream end events
     */
    protected createStreamEndEvent(): EnsembleStreamEvent {
        return {
            type: 'stream_end',
            timestamp: new Date().toISOString()
        };
    }
}