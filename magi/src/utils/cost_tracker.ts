/**
 * Cost tracking module for the MAGI system.
 *
 * This is now a thin wrapper around the Ensemble cost tracker,
 * adding quota tracking and MAGI-specific functionality.
 */
import { ModelUsage } from '@magi-system/ensemble';
import { costTracker as ensembleCostTracker } from '@magi-system/ensemble/cost_tracker';
import { quotaTracker } from './quota_tracker.js';

/**
 * Wrapper class that delegates to Ensemble's cost tracker
 * while maintaining MAGI-specific functionality like quota summaries
 */
class MagiCostTracker {
    /**
     * Add usage - delegates to Ensemble cost tracker
     * The ensemble logger bridge handles quota tracking and stream events
     */
    addUsage(usage: ModelUsage): void {
        // Simply delegate to Ensemble's cost tracker
        // The callback we set up in ensemble_logger_bridge.ts will handle
        // quota tracking and sending stream events
        ensembleCostTracker.addUsage(usage);
    }

    /**
     * Get total cost - delegates to Ensemble
     */
    getTotalCost(): number {
        return ensembleCostTracker.getTotalCost();
    }

    /**
     * Get costs by model - delegates to Ensemble
     */
    getCostsByModel(): Record<string, { cost: number; calls: number }> {
        return ensembleCostTracker.getCostsByModel();
    }

    /**
     * Calculate cost - delegates to Ensemble
     */
    calculateCost(usage: ModelUsage): ModelUsage {
        return ensembleCostTracker.calculateCost(usage);
    }

    /**
     * Print summary with MAGI-specific quota information
     */
    printSummary(): void {
        // First print the cost summary from Ensemble
        ensembleCostTracker.printSummary();

        // Then add quota information
        console.log('\nQuota Summary:');
        const quotaSummary = quotaTracker.getSummary();

        // Google/Gemini
        if (quotaSummary.google) {
            console.log('\tGoogle/Gemini:');
            console.log(
                `\t  • Daily Usage: ${quotaSummary.google.dailyUsed} / ${quotaSummary.google.dailyLimit} (${((quotaSummary.google.dailyUsed / quotaSummary.google.dailyLimit) * 100).toFixed(1)}%)`
            );
            console.log(
                `\t  • Last Reset: ${quotaSummary.google.lastReset?.toISOString().split('T')[0] || 'N/A'}`
            );
        }

        // OpenAI
        if (quotaSummary.openai) {
            console.log('\tOpenAI:');
            if (quotaSummary.openai.creditBalance !== undefined) {
                console.log(
                    `\t  • Credit Balance: $${quotaSummary.openai.creditBalance.toFixed(2)} / $${quotaSummary.openai.creditLimit.toFixed(2)}`
                );
            }

            // Free tier details
            if (quotaSummary.openai.freeTier) {
                console.log(
                    `\t  • Free Tier GPT-4/4o Family: ${quotaSummary.openai.freeTier.gpt4Family.used.toLocaleString()} / ${quotaSummary.openai.freeTier.gpt4Family.limit.toLocaleString()} tokens (${quotaSummary.openai.freeTier.gpt4Family.percent.toFixed(1)}%)`
                );
                console.log(
                    `\t  • Free Tier Mini Family: ${quotaSummary.openai.freeTier.gptMiniFamily.used.toLocaleString()} / ${quotaSummary.openai.freeTier.gptMiniFamily.limit.toLocaleString()} tokens (${quotaSummary.openai.freeTier.gptMiniFamily.percent.toFixed(1)}%)`
                );
            }
        }

        // X.AI/Grok
        if (quotaSummary.xai && quotaSummary.xai.creditBalance !== undefined) {
            console.log('\tX.AI/Grok:');
            console.log(
                `\t  • Credit Balance: $${quotaSummary.xai.creditBalance.toFixed(2)} / $${quotaSummary.xai.creditLimit.toFixed(2)}`
            );
        }
    }

    /**
     * Reset - delegates to Ensemble
     */
    reset(): void {
        ensembleCostTracker.reset();
    }
}

// Export a singleton instance that wraps the Ensemble cost tracker
export const costTracker = new MagiCostTracker();
