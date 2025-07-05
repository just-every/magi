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
import { geminiCliProvider } from '../code_providers/gemini_cli.js';
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
    registerExternalModel(
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
    );

    // Register Gemini CLI provider
    registerExternalModel(
        {
            id: 'gemini-cli',
            provider: 'magi-gemini-cli' as any, // Unique provider ID to avoid conflicts
            features: {
                context_length: 128000, // Gemini's context window
                tool_use: true,
                input_modality: ['text'],
                output_modality: ['text'],
                streaming: true,
            },
            cost: {
                input_per_million: 2, // $2 per 1M tokens (estimate)
                output_per_million: 10, // $10 per 1M tokens (estimate)
            },
            score: 82,
            scores: {
                code: 92, // High code score for Gemini
            },
        },
        createProviderAdapter(geminiCliProvider)
    );

    console.log(
        '[MAGI] Registered code providers: claude-code, codex, gemini-cli'
    );

    // Override the code model class to use our custom providers
    overrideModelClass('code', {
        models: ['claude-code', 'gemini-cli'], //, 'codex'],
        //random: false, // Always prefer claude-code first, then gemini-cli, then codex
    });

    console.log(
        '[MAGI] Overrode code model class to use claude-code, gemini-cli, and codex'
    );
}
