/**
 * API Tests for model providers
 */
import { test, expect } from '../../utils/test-utils';
import {
    getModelProvider,
    getModelFromClass,
    getProviderFromModel,
} from '../../../../magi/src/model_providers/model_provider.js';
import {
    MODEL_CLASSES,
    ModelClassID,
} from '../../../../magi/src/model_providers/model_data.js';
import { testProviderConfig } from '../../../../magi/src/model_providers/test_provider.js';

test.describe('Model Provider API', () => {
    test('should get the correct provider for each model', async () => {
        // Test mapping models to providers
        expect(getProviderFromModel('gpt-4o')).toBe('openai');
        expect(getProviderFromModel('claude-3-7-sonnet-latest')).toBe(
            'anthropic'
        );
        expect(getProviderFromModel('gemini-2.5-pro-exp-03-25')).toBe('google');
        expect(getProviderFromModel('grok-2')).toBe('xai');
        expect(getProviderFromModel('deepseek-chat')).toBe('deepseek');
        expect(getProviderFromModel('test-standard')).toBe('test');

        // Should throw for unknown models
        expect(() => getProviderFromModel('unknown-model')).toThrow(
            'Unknown model prefix'
        );
    });

    test('should get the appropriate provider instance', async () => {
        // Verify we get the right provider for each model type
        const openaiProvider = getModelProvider('gpt-4o');
        expect(openaiProvider).toBeDefined();

        const claudeProvider = getModelProvider('claude-3-7-sonnet-latest');
        expect(claudeProvider).toBeDefined();

        const geminiProvider = getModelProvider('gemini-2.5-pro-exp-03-25');
        expect(geminiProvider).toBeDefined();

        const testProvider = getModelProvider('test-standard');
        expect(testProvider).toBeDefined();

        // Should default to OpenAI if model not specified
        const defaultProvider = getModelProvider();
        expect(defaultProvider).toBe(getModelProvider('gpt-4o'));

        // Unsupported model defaults to OpenAI
        const fallbackProvider = getModelProvider('unsupported-model');
        expect(fallbackProvider).toBe(getModelProvider('gpt-4o'));
    });

    test('should get models for each class', async () => {
        // Verify that each model class has models defined
        for (const [className, modelClass] of Object.entries(MODEL_CLASSES)) {
            expect(modelClass.models.length).toBeGreaterThan(0);

            // At least one model in each class should be our test model
            const hasTestModel = modelClass.models.some(model =>
                model.startsWith('test-')
            );
            expect(hasTestModel).toBeTruthy();
        }

        // Configure test provider to be available
        testProviderConfig.shouldError = false;

        // Get models from different classes
        const standardModel = await getModelFromClass('standard');
        expect(standardModel).toBeDefined();

        const miniModel = await getModelFromClass('mini');
        expect(miniModel).toBeDefined();

        const reasoningModel = await getModelFromClass('reasoning');
        expect(reasoningModel).toBeDefined();

        // Undefined model class should default to standard
        const defaultModel = await getModelFromClass(undefined);
        expect(defaultModel).toBeDefined();

        // For testing, we expect to get test models since they're always valid
        expect(standardModel.startsWith('test-')).toBeTruthy();
    });

    test('should select models with quota available', async ({
        configureTestProvider,
    }) => {
        // Keep track of which models we obtain
        const selectedModels = new Map<ModelClassID, string>();

        // Configure test provider to be available
        configureTestProvider({
            shouldError: false,
            fixedResponse: 'Test response',
        });

        // Get a model from each class
        for (const modelClass of Object.keys(MODEL_CLASSES) as ModelClassID[]) {
            const model = await getModelFromClass(modelClass);
            selectedModels.set(modelClass, model);

            // Verify the model belongs to the class we requested
            const belongsToClass =
                MODEL_CLASSES[modelClass].models.includes(model);
            expect(belongsToClass).toBeTruthy();
        }

        // Verify we got different models for different classes
        const uniqueModels = new Set(selectedModels.values());
        expect(uniqueModels.size).toBeGreaterThan(1);
    });
});
