/**
 * Test suite for the main ensemble package exports
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    // Main API
    request,
    
    // Model provider functions
    getModelProvider,
    getProviderFromModel,
    getModelFromClass,
    isProviderKeyValid,
    
    // Model data
    MODEL_REGISTRY,
    MODEL_CLASSES,
    findModel,
    
    // Types and interfaces
    ModelProviderID,
    ModelUsage,
    TieredPrice,
    TimeBasedPrice,
    ModelEntry,
    EnsembleStreamEvent,
    ModelClassID,
    
    // Utilities
    costTracker,
    quotaTracker,
    
    // Test provider
    TestProvider,
    testProviderConfig,
    resetTestProviderConfig,
} from './index.js';

describe('Ensemble Package Exports', () => {
    beforeEach(() => {
        // Reset test provider config before each test
        resetTestProviderConfig();
    });

    describe('Main API Functions', () => {
        it('should export the request function', () => {
            expect(typeof request).toBe('function');
        });

        it('should export model provider functions', () => {
            expect(typeof getModelProvider).toBe('function');
            expect(typeof getProviderFromModel).toBe('function');
            expect(typeof getModelFromClass).toBe('function');
            expect(typeof isProviderKeyValid).toBe('function');
        });
    });

    describe('Model Data Exports', () => {
        it('should export MODEL_REGISTRY as an object', () => {
            expect(MODEL_REGISTRY).toBeDefined();
            expect(typeof MODEL_REGISTRY).toBe('object');
        });

        it('should export MODEL_CLASSES as an array', () => {
            expect(MODEL_CLASSES).toBeDefined();
            expect(Array.isArray(MODEL_CLASSES)).toBe(true);
        });

        it('should export findModel function', () => {
            expect(typeof findModel).toBe('function');
        });
    });

    describe('Utility Exports', () => {
        it('should export costTracker', () => {
            expect(costTracker).toBeDefined();
            expect(typeof costTracker.addUsage).toBe('function');
            expect(typeof costTracker.calculateCost).toBe('function');
        });

        it('should export quotaTracker', () => {
            expect(quotaTracker).toBeDefined();
            expect(typeof quotaTracker).toBe('object');
        });
    });

    describe('Test Provider Exports', () => {
        it('should export TestProvider class', () => {
            expect(TestProvider).toBeDefined();
            expect(typeof TestProvider).toBe('function');
        });

        it('should export test provider config utilities', () => {
            expect(testProviderConfig).toBeDefined();
            expect(typeof resetTestProviderConfig).toBe('function');
        });
    });

    describe('Request API Integration', () => {
        it('should handle test provider requests', async () => {
            const events: EnsembleStreamEvent[] = [];
            const errors: unknown[] = [];
            
            testProviderConfig.fixedResponse = 'Test response';
            testProviderConfig.streamingDelay = 10;

            const handle = request('test-model', [
                { type: 'message', role: 'user', content: 'Hello test' }
            ], {
                agentId: 'test-agent',
                tools: [],
                onEvent: (event) => events.push(event),
                onError: (error) => errors.push(error)
            });

            // Wait for the async operation to complete
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(errors).toHaveLength(0);
            expect(events.length).toBeGreaterThan(0);
            
            // Should have message_start event
            const startEvent = events.find(e => e.type === 'message_start');
            expect(startEvent).toBeDefined();
            
            // Should have message_complete event
            const completeEvent = events.find(e => e.type === 'message_complete');
            expect(completeEvent).toBeDefined();
            
            // Should have stream_end event
            const endEvent = events.find(e => e.type === 'stream_end');
            expect(endEvent).toBeDefined();

            handle.cancel();
        });

        it('should handle cancellation', () => {
            const handle = request('test-model', [
                { type: 'message', role: 'user', content: 'Hello test' }
            ], {
                agentId: 'test-agent',
                tools: [],
                onEvent: () => {},
                onError: () => {}
            });

            expect(() => handle.cancel()).not.toThrow();
        });
    });

    describe('Type Definitions', () => {
        it('should have proper TypeScript types', () => {
            // Test that TypeScript types are properly exported by attempting to use them
            const mockUsage: ModelUsage = {
                model: 'test-model',
                input_tokens: 100,
                output_tokens: 200,
                cost: 0.01,
                timestamp: new Date()
            };
            
            expect(mockUsage.model).toBe('test-model');
            
            const mockEvent: EnsembleStreamEvent = {
                type: 'message_start',
                message_id: 'test-id',
                content: 'test'
            };
            
            expect(mockEvent.type).toBe('message_start');
        });
    });
});