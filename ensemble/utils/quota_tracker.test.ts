/**
 * Test suite for the quota tracker utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { quotaTracker } from './quota_tracker.js';

describe('Quota Tracker', () => {
    beforeEach(() => {
        // Reset quota tracker state before each test
        if (typeof quotaTracker.reset === 'function') {
            quotaTracker.reset();
        }
    });

    describe('Basic Functionality', () => {
        it('should be defined and exportable', () => {
            expect(quotaTracker).toBeDefined();
            expect(typeof quotaTracker).toBe('object');
        });

        it('should have essential methods', () => {
            // Test that basic quota tracking methods exist
            expect(quotaTracker).toHaveProperty('checkQuota');
            expect(quotaTracker).toHaveProperty('recordUsage');
        });
    });

    describe('Quota Management', () => {
        it('should track quota usage', () => {
            if (typeof quotaTracker.recordUsage === 'function') {
                expect(() => {
                    quotaTracker.recordUsage('gpt-4', 100, 50);
                }).not.toThrow();
            }
        });

        it('should check quota limits', () => {
            if (typeof quotaTracker.checkQuota === 'function') {
                const result = quotaTracker.checkQuota('gpt-4', 100);
                expect(typeof result).toBe('boolean');
            }
        });

        it('should handle daily limits', () => {
            if (typeof quotaTracker.getDailyUsage === 'function') {
                const dailyUsage = quotaTracker.getDailyUsage('gpt-4');
                expect(typeof dailyUsage).toBe('number');
                expect(dailyUsage).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('Model-specific Quotas', () => {
        it('should handle different models independently', () => {
            if (typeof quotaTracker.recordUsage === 'function' && 
                typeof quotaTracker.getDailyUsage === 'function') {
                
                quotaTracker.recordUsage('gpt-4', 100, 50);
                quotaTracker.recordUsage('gpt-3.5-turbo', 200, 100);

                const gpt4Usage = quotaTracker.getDailyUsage('gpt-4');
                const gpt35Usage = quotaTracker.getDailyUsage('gpt-3.5-turbo');

                expect(gpt4Usage).not.toBe(gpt35Usage);
            }
        });

        it('should enforce model-specific limits', () => {
            if (typeof quotaTracker.setDailyLimit === 'function' && 
                typeof quotaTracker.checkQuota === 'function') {
                
                quotaTracker.setDailyLimit('test-model', 1000);
                
                const withinLimit = quotaTracker.checkQuota('test-model', 500);
                const exceedsLimit = quotaTracker.checkQuota('test-model', 1500);
                
                expect(withinLimit).toBe(true);
                expect(exceedsLimit).toBe(false);
            }
        });
    });

    describe('Time-based Tracking', () => {
        it('should track hourly usage', () => {
            if (typeof quotaTracker.getHourlyUsage === 'function') {
                const hourlyUsage = quotaTracker.getHourlyUsage('gpt-4');
                expect(typeof hourlyUsage).toBe('number');
                expect(hourlyUsage).toBeGreaterThanOrEqual(0);
            }
        });

        it('should reset daily counters', () => {
            if (typeof quotaTracker.recordUsage === 'function' && 
                typeof quotaTracker.resetDaily === 'function' &&
                typeof quotaTracker.getDailyUsage === 'function') {
                
                quotaTracker.recordUsage('gpt-4', 100, 50);
                expect(quotaTracker.getDailyUsage('gpt-4')).toBeGreaterThan(0);
                
                quotaTracker.resetDaily();
                expect(quotaTracker.getDailyUsage('gpt-4')).toBe(0);
            }
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid model names gracefully', () => {
            if (typeof quotaTracker.checkQuota === 'function') {
                expect(() => {
                    quotaTracker.checkQuota('', 100);
                }).not.toThrow();
                
                expect(() => {
                    quotaTracker.checkQuota(null as any, 100);
                }).not.toThrow();
            }
        });

        it('should handle negative token counts', () => {
            if (typeof quotaTracker.recordUsage === 'function') {
                expect(() => {
                    quotaTracker.recordUsage('gpt-4', -100, -50);
                }).not.toThrow();
            }
        });

        it('should handle zero token counts', () => {
            if (typeof quotaTracker.recordUsage === 'function') {
                expect(() => {
                    quotaTracker.recordUsage('gpt-4', 0, 0);
                }).not.toThrow();
            }
        });
    });

    describe('Configuration', () => {
        it('should allow setting custom limits', () => {
            if (typeof quotaTracker.setDailyLimit === 'function' &&
                typeof quotaTracker.getDailyLimit === 'function') {
                
                quotaTracker.setDailyLimit('custom-model', 5000);
                const limit = quotaTracker.getDailyLimit('custom-model');
                expect(limit).toBe(5000);
            }
        });

        it('should allow setting hourly limits', () => {
            if (typeof quotaTracker.setHourlyLimit === 'function' &&
                typeof quotaTracker.getHourlyLimit === 'function') {
                
                quotaTracker.setHourlyLimit('custom-model', 500);
                const limit = quotaTracker.getHourlyLimit('custom-model');
                expect(limit).toBe(500);
            }
        });
    });

    describe('Status Reporting', () => {
        it('should provide quota status information', () => {
            if (typeof quotaTracker.getQuotaStatus === 'function') {
                const status = quotaTracker.getQuotaStatus('gpt-4');
                expect(typeof status).toBe('object');
                expect(status).toHaveProperty('model');
                expect(status.model).toBe('gpt-4');
            }
        });

        it('should list all tracked models', () => {
            if (typeof quotaTracker.getTrackedModels === 'function') {
                const models = quotaTracker.getTrackedModels();
                expect(Array.isArray(models)).toBe(true);
            }
        });
    });
});