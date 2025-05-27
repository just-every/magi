/**
 * Test suite for the quota tracker utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuotaTracker } from '../utils/quota_tracker.js';

describe('Quota Tracker', () => {
    let quotaTracker: QuotaTracker;

    beforeEach(() => {
        // Create a fresh instance for each test
        quotaTracker = new QuotaTracker();
    });

    describe('Basic Functionality', () => {
        it('should be defined and instantiable', () => {
            expect(quotaTracker).toBeDefined();
            expect(quotaTracker).toBeInstanceOf(QuotaTracker);
        });

        it('should have essential methods', () => {
            // Test that basic quota tracking methods exist
            expect(typeof quotaTracker.trackUsage).toBe('function');
            expect(typeof quotaTracker.hasQuota).toBe('function');
            expect(typeof quotaTracker.getProviderQuota).toBe('function');
            expect(typeof quotaTracker.getModelQuota).toBe('function');
        });
    });

    describe('Quota Management', () => {
        it('should track quota usage', () => {
            expect(() => {
                quotaTracker.trackUsage('openai', 'gpt-4', 100, 50);
            }).not.toThrow();
        });

        it('should check quota availability', () => {
            const result = quotaTracker.hasQuota('openai', 'gpt-4');
            expect(typeof result).toBe('boolean');
        });

        it('should track usage for Google models', () => {
            const result = quotaTracker.trackUsage('google', 'gemini-2.0-flash', 100, 50);
            expect(typeof result).toBe('boolean');
            
            const modelQuota = quotaTracker.getModelQuota('google', 'gemini-2.0-flash');
            expect(modelQuota).not.toBeNull();
            expect(modelQuota?.dailyTokensUsed).toBe(150);
            expect(modelQuota?.dailyRequestsUsed).toBe(1);
        });
    });

    describe('OpenAI Free Tier Quotas', () => {
        it('should track GPT-4 family usage', () => {
            // Use up some of the GPT-4 family quota
            quotaTracker.trackUsage('openai', 'gpt-4o', 500000, 0);
            
            const hasQuota = quotaTracker.hasQuota('openai', 'gpt-4o');
            expect(hasQuota).toBe(true);
            
            // Use up the rest
            quotaTracker.trackUsage('openai', 'gpt-4o', 500000, 0);
            
            const hasQuotaAfter = quotaTracker.hasQuota('openai', 'gpt-4o');
            expect(hasQuotaAfter).toBe(false);
        });

        it('should track GPT-Mini family usage separately', () => {
            // Use up GPT-4 family quota
            quotaTracker.trackUsage('openai', 'gpt-4o', 1000000, 0);
            
            // Mini family should still have quota
            const hasMiniQuota = quotaTracker.hasQuota('openai', 'gpt-4o-mini');
            expect(hasMiniQuota).toBe(true);
            
            // Track mini usage
            quotaTracker.trackUsage('openai', 'gpt-4o-mini', 5000000, 0);
            expect(quotaTracker.hasQuota('openai', 'gpt-4o-mini')).toBe(true);
        });
    });

    describe('Provider Credit Tracking', () => {
        it('should track credit usage', () => {
            quotaTracker.trackCreditUsage('xai', 10);
            const balance = quotaTracker.getCreditBalance('xai');
            expect(balance).toBe(140); // Started with 150
        });

        it('should not allow negative credit balance', () => {
            quotaTracker.trackCreditUsage('xai', 200);
            const balance = quotaTracker.getCreditBalance('xai');
            expect(balance).toBe(0);
        });
    });

    describe('Summary Reporting', () => {
        it('should provide a summary of all quotas', () => {
            quotaTracker.trackUsage('google', 'gemini-2.0-flash', 100, 50);
            quotaTracker.trackUsage('openai', 'gpt-4o', 1000, 500);
            
            const summary = quotaTracker.getSummary();
            expect(typeof summary).toBe('object');
            expect(summary).toHaveProperty('google');
            expect(summary).toHaveProperty('openai');
            expect(summary.google.models).toHaveProperty('gemini-2.0-flash');
        });
    });

    describe('Update Callbacks', () => {
        it('should call update callback on significant changes', () => {
            const mockCallback = vi.fn();
            quotaTracker.setUpdateCallback(mockCallback);
            
            // Track enough usage to trigger a 10% change
            // Use a model with token limits - gemini-2.5-pro-exp-03-25 has 1M daily limit
            quotaTracker.trackUsage('google', 'gemini-2.5-pro-exp-03-25', 150000, 0);
            
            expect(mockCallback).toHaveBeenCalled();
        });

        it('should handle callback errors gracefully', () => {
            const errorCallback = vi.fn(() => {
                throw new Error('Callback error');
            });
            
            quotaTracker.setUpdateCallback(errorCallback);
            
            expect(() => {
                quotaTracker.trackUsage('google', 'gemini-2.0-flash', 100000, 0);
            }).not.toThrow();
        });
    });

    describe('Daily Reset', () => {
        it('should reset quotas on a new day', () => {
            // Track some usage
            quotaTracker.trackUsage('google', 'gemini-2.0-flash', 100, 50);
            
            const providerQuota = quotaTracker.getProviderQuota('google');
            if (providerQuota.lastResetDate) {
                // Simulate yesterday's date
                providerQuota.lastResetDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
            }
            
            // Track usage again (should trigger reset)
            quotaTracker.trackUsage('google', 'gemini-2.0-flash', 100, 50);
            
            const modelQuota = quotaTracker.getModelQuota('google', 'gemini-2.0-flash');
            expect(modelQuota?.dailyTokensUsed).toBe(150); // Only the new usage
            expect(modelQuota?.dailyRequestsUsed).toBe(1);
        });
    });

    describe('hasOpenAIFreeQuota', () => {
        it('should check OpenAI free quota correctly', () => {
            expect(quotaTracker.hasOpenAIFreeQuota('gpt-4o')).toBe(true);
            expect(quotaTracker.hasOpenAIFreeQuota('gpt-4o-mini')).toBe(true);
            expect(quotaTracker.hasOpenAIFreeQuota('unknown-model')).toBe(true);
        });
    });
});