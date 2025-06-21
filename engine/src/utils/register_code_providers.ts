/**
 * Register custom code providers with the ensemble library
 */

import {
    Agent,
    registerExternalModel,
    ModelProvider as EnsembleModelProvider,
    ProviderStreamEvent,
    overrideModelClass,
} from '@just-every/ensemble';
import { claudeCodeProvider } from '../code_providers/claude_code.js';
import { codexProvider } from '../code_providers/codex.js';
import { ModelProvider as MagiModelProvider } from '../types/shared-types.js';
/**
 * Create a wrapper that adapts a magi ModelProvider to ensemble's ModelProvider interface
 */
function createProviderAdapter(
    provider: MagiModelProvider
): EnsembleModelProvider {
    return {
        provider_id: provider.provider_id,
        async *createResponseStream(
            messages: any,
            model: string,
            agent: Agent
        ): AsyncGenerator<ProviderStreamEvent> {
            // Use the magi provider's stream
            const stream = provider.createResponseStream(
                messages,
                model,
                agent
            );

            // Convert each event from magi's StreamingEvent to ensemble's ProviderStreamEvent
            for await (const event of stream) {
                // Most events should pass through unchanged as they share common types
                // We just need to ensure the type is compatible
                yield event as unknown as ProviderStreamEvent;
            }
        },
    };
}

/**
 * Register the custom code providers as external models in ensemble
 */
export function registerCodeProviders(): void {
    // Register Claude Code provider
    registerExternalModel(
        {
            id: 'claude-code',
            provider: 'magi-claude-code' as any, // Unique provider ID to avoid conflicts
            features: {
                context_length: 200000,
                tool_use: true,
                input_modality: ['text', 'image'],
                output_modality: ['text'],
                streaming: true,
            },
            cost: {
                input_per_million: 3, // $3 per 1M tokens
                output_per_million: 15, // $15 per 1M tokens
            },
            score: 85,
            scores: {
                code: 95, // High code score for this specialized model
            },
        },
        createProviderAdapter(claudeCodeProvider)
    );

    // Register Codex provider
    /*registerExternalModel(
        {
            id: 'codex',
            provider: 'magi-codex' as any, // Unique provider ID to avoid conflicts
            features: {
                context_length: 8192,
                tool_use: true,
                input_modality: ['text'],
                output_modality: ['text'],
                streaming: true,
            },
            cost: {
                input_per_million: 1, // $1 per 1M tokens
                output_per_million: 5, // $5 per 1M tokens
            },
            score: 80,
            scores: {
                code: 90, // High code score
            },
        },
        createProviderAdapter(codexProvider)
    );*/

    console.log('[MAGI] Registered code providers: claude-code, codex');

    // Override the code model class to use our custom providers
    overrideModelClass('code', {
        models: ['claude-code', 'codex'],
        random: false, // Always prefer claude-code first
    });

    console.log(
        '[MAGI] Overrode code model class to use claude-code and codex'
    );
}
