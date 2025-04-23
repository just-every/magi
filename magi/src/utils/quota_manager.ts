/**
 * Quota management for model providers
 *
 * This module tracks quota usage across different model providers and their free/paid tiers
 */

import { ModelProviderID } from '../model_providers/model_data.js';
import { QuotaUpdateEvent } from '../types/shared-types.js';
import { sendStreamEvent } from './communication.js';

// Main interface for tracking quota and credit information
export interface ProviderQuota {
    provider: ModelProviderID;
    // Daily limits in tokens
    dailyLimit: number;
    dailyUsed: number;
    // Rate limits
    rateLimit?: {
        requestsPerMinute: number;
        tokensPerMinute: number;
        requestsPerDay: number;
    };
    // Monthly credit balances (in USD)
    creditBalance?: number;
    creditLimit?: number;
    // Specific provider information
    info?: Record<string, any>;
    // Reset dates/tracking
    lastResetDate?: Date;
}

// Helper for tracking OpenAI free tier quotas
interface OpenAIFreeQuota {
    // 1M GPT-4o/4.5 family tokens per day
    gpt4Family: {
        limit: number;
        used: number;
    };
    // 10M GPT-4o-mini/o1-mini family tokens per day
    gptMiniFamily: {
        limit: number;
        used: number;
    };
    // Models that count against the GPT-4o/4.5 quota
    gpt4Models: string[];
    // Models that count against the GPT-4o-mini quota
    gptMiniModels: string[];
}

/**
 * QuotaManager class to track and manage API quotas across providers
 */
export class QuotaManager {
    private quotas: Record<string, ProviderQuota> = {};

    // Provider-specific tracking
    private openAIFreeQuota: OpenAIFreeQuota = {
        gpt4Family: {
            limit: 1000000, // 1M tokens
            used: 0,
        },
        gptMiniFamily: {
            limit: 10000000, // 10M tokens
            used: 0,
        },
        // Models counting against the 1M token limit
        gpt4Models: [
            'gpt-4.5-preview',
            'gpt-4.5-preview-2025-02-27',
            'gpt-4o',
            'gpt-4o-2024-05-13',
            'gpt-4o-2024-08-06',
            'gpt-4o-2024-11-20',
            'o1-preview-2024-09-12',
            'o1-2024-12-17',
        ],
        // Models counting against the 10M token limit
        gptMiniModels: [
            'gpt-4o-mini',
            'gpt-4o-mini-2024-07-18',
            'o1-mini',
            'o1-mini-2024-09-12',
            'o3-mini',
            'o3-mini-2025-01-31',
        ],
    };

    constructor() {
        this.initializeProviderQuotas();
    }

    /**
     * Initialize the quota information for all supported providers
     */
    private initializeProviderQuotas() {
        // Google/Gemini
        this.quotas['google'] = {
            provider: 'google',
            dailyLimit: 25, // 25 requests per day for gemini-2.5-pro-exp
            dailyUsed: 0,
            rateLimit: {
                requestsPerMinute: 5,
                tokensPerMinute: 1000000,
                requestsPerDay: 25,
            },
            lastResetDate: new Date(),
        };

        // OpenAI
        this.quotas['openai'] = {
            provider: 'openai',
            dailyLimit: 0, // No generic daily limit, tracking per tier
            dailyUsed: 0,
            creditBalance: 150, // $150 credit per month
            creditLimit: 150,
            info: {
                freeQuota: this.openAIFreeQuota,
            },
            lastResetDate: new Date(),
        };

        // X.AI/Grok
        this.quotas['xai'] = {
            provider: 'xai',
            dailyLimit: 0,
            dailyUsed: 0,
            creditBalance: 150, // $150 credit per month
            creditLimit: 150,
            lastResetDate: new Date(),
        };

        // Anthropic/Claude
        this.quotas['anthropic'] = {
            provider: 'anthropic',
            dailyLimit: 0,
            dailyUsed: 0,
            lastResetDate: new Date(),
        };

        // DeepSeek
        this.quotas['deepseek'] = {
            provider: 'deepseek',
            dailyLimit: 0,
            dailyUsed: 0,
            lastResetDate: new Date(),
        };
    }

    /**
     * Get quota information for a specific provider
     */
    getQuota(provider: ModelProviderID): ProviderQuota {
        return (
            this.quotas[provider] || {
                provider,
                dailyLimit: 0,
                dailyUsed: 0,
            }
        );
    }

    /**
     * Track usage for a specific provider and model
     * Returns true if the quota is still available, false if exceeded
     */
    trackUsage(
        provider: ModelProviderID,
        model: string,
        inputTokens: number,
        outputTokens: number
    ): boolean {
        // Check if we have quota information for this provider
        if (!this.quotas[provider]) {
            return true; // Assume quota is available if we don't track it
        }

        const quota = this.quotas[provider];
        let significantChange = false;

        // Check if we need to reset daily counters
        const today = new Date();
        if (
            quota.lastResetDate &&
            (today.getUTCDate() !== quota.lastResetDate.getUTCDate() ||
                today.getUTCMonth() !== quota.lastResetDate.getUTCMonth() ||
                today.getUTCFullYear() !== quota.lastResetDate.getUTCFullYear())
        ) {
            // Reset daily counters
            quota.dailyUsed = 0;
            quota.lastResetDate = today;

            // Reset OpenAI free tier quotas if applicable
            if (provider === 'openai' && quota.info?.freeQuota) {
                quota.info.freeQuota.gpt4Family.used = 0;
                quota.info.freeQuota.gptMiniFamily.used = 0;
            }

            significantChange = true; // Daily reset is significant
        }

        // Track general usage
        const totalTokens = inputTokens + outputTokens;
        const previousDailyUsed = quota.dailyUsed;
        quota.dailyUsed += totalTokens;

        // Check if this usage significantly changes our daily usage percentage
        if (quota.dailyLimit > 0) {
            const previousPercent = Math.floor(
                (previousDailyUsed / quota.dailyLimit) * 10
            ); // Percentage in tenths
            const currentPercent = Math.floor(
                (quota.dailyUsed / quota.dailyLimit) * 10
            );

            if (previousPercent !== currentPercent) {
                significantChange = true; // 10% increment in usage
            }
        }

        // Provider-specific tracking
        if (provider === 'google') {
            // Track Gemini rate limits
            if (model === 'gemini-2.5-pro-exp-03-25') {
                // Check if we've exceeded daily limit
                if (quota.dailyUsed >= quota.dailyLimit) {
                    console.log(
                        `[QuotaManager] Gemini experimental model daily limit reached: ${quota.dailyUsed} > ${quota.dailyLimit}`
                    );
                    significantChange = true; // Exceeding quota is significant
                    this.sendQuotaUpdate(); // Update immediately when quota is exceeded
                    return false; // Exceeded quota
                }
            }
        } else if (provider === 'openai' && quota.info?.freeQuota) {
            // Track OpenAI free tier usage
            const freeQuota = quota.info.freeQuota as OpenAIFreeQuota;

            // Track GPT-4o/4.5 family usage
            if (freeQuota.gpt4Models.includes(model)) {
                const prevUsed = freeQuota.gpt4Family.used;
                freeQuota.gpt4Family.used += totalTokens;
                console.log(
                    `[QuotaManager] OpenAI GPT-4 family usage: ${freeQuota.gpt4Family.used}/${freeQuota.gpt4Family.limit}`
                );

                // Check for significant changes in GPT-4 family usage
                const prevPercent = Math.floor(
                    (prevUsed / freeQuota.gpt4Family.limit) * 10
                );
                const currPercent = Math.floor(
                    (freeQuota.gpt4Family.used / freeQuota.gpt4Family.limit) *
                        10
                );
                if (prevPercent !== currPercent) {
                    significantChange = true;
                }
            }

            // Track GPT-4o-mini family usage
            if (freeQuota.gptMiniModels.includes(model)) {
                const prevUsed = freeQuota.gptMiniFamily.used;
                freeQuota.gptMiniFamily.used += totalTokens;
                console.log(
                    `[QuotaManager] OpenAI GPT-Mini family usage: ${freeQuota.gptMiniFamily.used}/${freeQuota.gptMiniFamily.limit}`
                );

                // Check for significant changes in Mini family usage
                const prevPercent = Math.floor(
                    (prevUsed / freeQuota.gptMiniFamily.limit) * 10
                );
                const currPercent = Math.floor(
                    (freeQuota.gptMiniFamily.used /
                        freeQuota.gptMiniFamily.limit) *
                        10
                );
                if (prevPercent !== currPercent) {
                    significantChange = true;
                }
            }
        }

        // If there was a significant change in quotas, send an update
        if (significantChange) {
            this.sendQuotaUpdate();
        }

        return true; // Quota available
    }

    /**
     * Check if there's remaining quota for a provider/model
     * Returns true if quota is available
     */
    hasQuota(provider: ModelProviderID, model: string): boolean {
        // Handle specific cases
        if (provider === 'google' && model === 'gemini-2.5-pro-exp-03-25') {
            const quota = this.quotas[provider];
            return quota.dailyUsed < quota.dailyLimit;
        }

        // Default to true for cases we don't track
        return true;
    }

    /**
     * Check if there's remaining free tier quota for specific OpenAI model families
     */
    hasOpenAIFreeQuota(model: string): boolean {
        const quota = this.quotas['openai'];
        if (!quota || !quota.info?.freeQuota) return true;

        const freeQuota = quota.info.freeQuota as OpenAIFreeQuota;

        // Check GPT-4o/4.5 family
        if (freeQuota.gpt4Models.includes(model)) {
            return freeQuota.gpt4Family.used < freeQuota.gpt4Family.limit;
        }

        // Check GPT-4o-mini family
        if (freeQuota.gptMiniModels.includes(model)) {
            return freeQuota.gptMiniFamily.used < freeQuota.gptMiniFamily.limit;
        }

        return true;
    }

    /**
     * Track credit usage for a provider
     */
    trackCreditUsage(provider: ModelProviderID, creditAmount: number): void {
        if (
            !this.quotas[provider] ||
            this.quotas[provider].creditBalance === undefined
        ) {
            return;
        }

        const quota = this.quotas[provider];
        if (quota.creditBalance !== undefined) {
            quota.creditBalance = Math.max(
                0,
                quota.creditBalance - creditAmount
            );
        }
    }

    /**
     * Get the remaining credit balance for a provider
     */
    getCreditBalance(provider: ModelProviderID): number {
        return this.quotas[provider]?.creditBalance || 0;
    }

    /**
     * Get a summary of all quota usage across providers
     */
    getSummary(): Record<string, any> {
        const summary: Record<string, any> = {};

        for (const [provider, quota] of Object.entries(this.quotas)) {
            summary[provider] = {
                dailyUsed: quota.dailyUsed,
                dailyLimit: quota.dailyLimit,
                creditBalance: quota.creditBalance,
                creditLimit: quota.creditLimit,
                lastReset: quota.lastResetDate,
            };

            // Add OpenAI free tier details if available
            if (provider === 'openai' && quota.info?.freeQuota) {
                const freeQuota = quota.info.freeQuota as OpenAIFreeQuota;
                summary[provider].freeTier = {
                    gpt4Family: {
                        used: freeQuota.gpt4Family.used,
                        limit: freeQuota.gpt4Family.limit,
                        percent:
                            (freeQuota.gpt4Family.used /
                                freeQuota.gpt4Family.limit) *
                            100,
                    },
                    gptMiniFamily: {
                        used: freeQuota.gptMiniFamily.used,
                        limit: freeQuota.gptMiniFamily.limit,
                        percent:
                            (freeQuota.gptMiniFamily.used /
                                freeQuota.gptMiniFamily.limit) *
                            100,
                    },
                };
            }
        }

        return summary;
    }

    /**
     * Send the current quota information to the UI
     */
    sendQuotaUpdate(): void {
        try {
            const quotas = this.getSummary();
            const quotaEvent: QuotaUpdateEvent = {
                type: 'quota_update',
                quotas,
            };
            sendStreamEvent(quotaEvent);
        } catch (error) {
            console.error('Error sending quota update:', error);
        }
    }
}

// Export a singleton instance
export const quotaManager = new QuotaManager();
