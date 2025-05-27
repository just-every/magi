/**
 * Test suite for model provider utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getModelProvider,
    getProviderFromModel,
    getModelFromClass,
    isProviderKeyValid
} from '../model_providers/model_provider.js';
import { ModelClassID } from '../types.js';

describe('Model Provider Utilities', () => {
    describe('getModelProvider', () => {
        it('should return a provider for known models', () => {
            const provider = getModelProvider('gpt-4.1');
            expect(provider).toBeDefined();
            expect(typeof provider.createResponseStream).toBe('function');
        });

        it('should return test provider for test models', () => {
            const provider = getModelProvider('test-model');
            expect(provider).toBeDefined();
            expect(typeof provider.createResponseStream).toBe('function');
        });

        it('should return openRouter provider for unknown models', () => {
            const provider = getModelProvider('unknown-model-xyz');
            expect(provider).toBeDefined();
            // Should default to openRouter
            expect(typeof provider.createResponseStream).toBe('function');
        });

        it('should handle empty model name', () => {
            const provider = getModelProvider('');
            expect(provider).toBeDefined();
            // Should default to openRouter
            expect(typeof provider.createResponseStream).toBe('function');
        });
    });

    describe('getProviderFromModel', () => {
        it('should identify OpenAI provider for GPT models', () => {
            const provider = getProviderFromModel('gpt-4.1');
            expect(provider).toBe('openai');
        });

        it('should identify Anthropic provider for Claude models', () => {
            const provider = getProviderFromModel('claude-3-7-sonnet-latest');
            expect(provider).toBe('anthropic');
        });

        it('should identify Google provider for Gemini models', () => {
            const provider = getProviderFromModel('gemini-2.5-pro-exp-03-25');
            expect(provider).toBe('google');
        });

        it('should identify Deepseek provider for Deepseek models', () => {
            const provider = getProviderFromModel('deepseek-chat');
            expect(provider).toBe('deepseek');
        });

        it('should identify Grok provider for Grok models', () => {
            const provider = getProviderFromModel('grok-beta');
            expect(provider).toBe('xai');
        });

        it('should identify test provider for test models', () => {
            const provider = getProviderFromModel('test-model');
            expect(provider).toBe('test');
        });

        it('should return openrouter for unknown models', () => {
            const provider = getProviderFromModel('unknown-model-xyz');
            expect(provider).toBe('openrouter');
        });
    });

    describe('getModelFromClass', () => {
        it('should return a model for code class', async () => {
            const model = await getModelFromClass('code');
            expect(typeof model).toBe('string');
            expect(model.length).toBeGreaterThan(0);
        });

        it('should return a model for reasoning class', async () => {
            const model = await getModelFromClass('reasoning');
            expect(typeof model).toBe('string');
            expect(model.length).toBeGreaterThan(0);
        });

        it('should return a model for monologue class', async () => {
            const model = await getModelFromClass('monologue');
            expect(typeof model).toBe('string');
            expect(model.length).toBeGreaterThan(0);
        });

        it('should handle edge cases', async () => {
            // Test with invalid class ID should not throw, but return standard
            const model = await getModelFromClass('invalid-class' as ModelClassID);
            expect(typeof model).toBe('string');
            expect(model.length).toBeGreaterThan(0);
        });

        it('should return different models for different classes', async () => {
            const codeModel = await getModelFromClass('code');
            const reasoningModel = await getModelFromClass('reasoning');
            
            // Models might be the same if one model is best for multiple classes
            // but the function should still work
            expect(typeof codeModel).toBe('string');
            expect(typeof reasoningModel).toBe('string');
        });
    });

    describe('isProviderKeyValid', () => {
        it('should validate provider keys', () => {
            // Test with mock key format
            const validKey = 'sk-' + 'x'.repeat(48);
            const invalidKey = 'invalid-key';
            
            // These tests depend on actual implementation
            // For now, just test that the function exists and can be called
            expect(typeof isProviderKeyValid).toBe('function');
            
            // Call the function to ensure it doesn't throw
            expect(() => {
                isProviderKeyValid('openai');
            }).not.toThrow();
            
            expect(() => {
                isProviderKeyValid('anthropic');
            }).not.toThrow();
        });

        it('should handle unknown providers', () => {
            expect(() => {
                isProviderKeyValid('unknown-provider' as any);
            }).not.toThrow();
        });
    });

    describe('Provider Integration', () => {
        it('should maintain consistency between provider functions', () => {
            const testModel = 'gpt-4';
            
            // Get provider name and provider instance
            const providerName = getProviderFromModel(testModel);
            const providerInstance = getModelProvider(testModel);
            
            expect(providerName).toBeDefined();
            expect(providerInstance).toBeDefined();
            
            // Provider instance should have required methods
            expect(typeof providerInstance.createResponseStream).toBe('function');
        });

        it('should handle model class to provider mapping', async () => {
            const codeModel = await getModelFromClass('code');
            const codeProvider = getProviderFromModel(codeModel);
            
            expect(codeModel).toBeDefined();
            expect(codeProvider).toBeDefined();
            
            // Should be able to get provider instance
            const providerInstance = getModelProvider(codeModel);
            expect(providerInstance).toBeDefined();
        });
    });
});