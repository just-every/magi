/**
 * Cost tracking module for the ensemble package.
 *
 * This is a simplified version that provides the basic interface without
 * the full MAGI system integration (no streaming events or quota management).
 */

import {
    findModel,
    ModelUsage,
    TieredPrice,
    TimeBasedPrice,
} from '../index.js';

/**
 * Simplified cost tracker for the ensemble package
 */
class CostTracker {
    private entries: ModelUsage[] = [];
    private started: Date = new Date();

    /**
     * Calculates the cost for a given model usage instance based on registry data.
     * Handles tiered pricing and free tier flags.
     *
     * @param usage - The ModelUsage object containing token counts and model ID.
     * @returns The updated ModelUsage object with the calculated cost.
     * @throws Error if the model specified in usage is not found in the registry.
     */
    calculateCost(usage: ModelUsage): ModelUsage {
        // If cost is already calculated or explicitly set to 0, return early.
        if (typeof usage.cost === 'number') {
            return usage;
        }

        // Check if this specific usage instance falls under a free tier quota.
        if (usage.isFreeTierUsage) {
            usage.cost = 0;
            return usage;
        }

        const model = findModel(usage.model);
        if (!model) {
            console.error(
                `Model not found when recording usage: ${usage.model}`
            );
            throw new Error(
                `Model not found when recording usage: ${usage.model}`
            );
        }

        // Initialize cost
        usage.cost = 0;

        // Get token counts, defaulting to 0 if undefined
        const original_input_tokens = usage.input_tokens || 0;
        const output_tokens = usage.output_tokens || 0;
        const cached_tokens = usage.cached_tokens || 0;
        const image_count = usage.image_count || 0;

        // Use provided timestamp, or current time if needed for time-based pricing
        const calculationTime = usage.timestamp || new Date();
        
        // Check if any cost component uses time-based pricing
        const usesTimeBasedPricing =
            (typeof model.cost?.input_per_million === 'object' &&
                model.cost.input_per_million !== null &&
                'peak_price_per_million' in model.cost.input_per_million) ||
            (typeof model.cost?.output_per_million === 'object' &&
                model.cost.output_per_million !== null &&
                'peak_price_per_million' in model.cost.output_per_million) ||
            (typeof model.cost?.cached_input_per_million === 'object' &&
                model.cost.cached_input_per_million !== null &&
                'peak_price_per_million' in
                    model.cost.cached_input_per_million);

        if (!usage.timestamp && usesTimeBasedPricing) {
            console.warn(
                `Timestamp missing for time-based pricing model '${usage.model}'. Defaulting to current time for calculation.`
            );
        }

        // Helper function to get price per million based on token count and cost structure
        const getPrice = (
            tokensForTierCheck: number,
            costStructure: number | TieredPrice | TimeBasedPrice | undefined
        ): number => {
            if (typeof costStructure === 'number') {
                return costStructure;
            }

            if (typeof costStructure === 'object' && costStructure !== null) {
                if ('peak_price_per_million' in costStructure) {
                    // Time-Based Pricing
                    const timeBasedCost = costStructure as TimeBasedPrice;
                    const utcHour = calculationTime.getUTCHours();
                    const utcMinute = calculationTime.getUTCMinutes();
                    const currentTimeInMinutes = utcHour * 60 + utcMinute;
                    const peakStartInMinutes =
                        timeBasedCost.peak_utc_start_hour * 60 +
                        timeBasedCost.peak_utc_start_minute;
                    const peakEndInMinutes =
                        timeBasedCost.peak_utc_end_hour * 60 +
                        timeBasedCost.peak_utc_end_minute;

                    let isPeakTime: boolean;
                    if (peakStartInMinutes <= peakEndInMinutes) {
                        isPeakTime =
                            currentTimeInMinutes >= peakStartInMinutes &&
                            currentTimeInMinutes < peakEndInMinutes;
                    } else {
                        isPeakTime =
                            currentTimeInMinutes >= peakStartInMinutes ||
                            currentTimeInMinutes < peakEndInMinutes;
                    }

                    return isPeakTime
                        ? timeBasedCost.peak_price_per_million
                        : timeBasedCost.off_peak_price_per_million;
                } else if ('threshold_tokens' in costStructure) {
                    // Token-Based Tiered Pricing
                    const tieredCost = costStructure as TieredPrice;
                    if (tokensForTierCheck <= tieredCost.threshold_tokens) {
                        return tieredCost.price_below_threshold_per_million;
                    } else {
                        return tieredCost.price_above_threshold_per_million;
                    }
                }
            }
            return 0;
        };

        // Determine how many input tokens are non-cached vs cached
        let nonCachedInputTokens = 0;
        let actualCachedTokens = 0;

        if (
            cached_tokens > 0 &&
            model.cost?.cached_input_per_million !== undefined
        ) {
            actualCachedTokens = cached_tokens;
            nonCachedInputTokens = Math.max(
                0,
                original_input_tokens - cached_tokens
            );
        } else {
            nonCachedInputTokens = original_input_tokens;
            actualCachedTokens = 0;
        }

        // Calculate Input Token Cost (Non-Cached Part)
        if (
            nonCachedInputTokens > 0 &&
            model.cost?.input_per_million !== undefined
        ) {
            const inputPricePerMillion = getPrice(
                original_input_tokens,
                model.cost.input_per_million
            );
            usage.cost +=
                (nonCachedInputTokens / 1000000) * inputPricePerMillion;
        }

        // Calculate Cached Token Cost (If applicable and cost defined)
        if (
            actualCachedTokens > 0 &&
            model.cost?.cached_input_per_million !== undefined
        ) {
            const cachedPricePerMillion = getPrice(
                actualCachedTokens,
                model.cost.cached_input_per_million
            );
            usage.cost +=
                (actualCachedTokens / 1000000) * cachedPricePerMillion;
        }

        // Calculate Output Token Cost
        if (output_tokens > 0 && model.cost?.output_per_million !== undefined) {
            const outputPricePerMillion = getPrice(
                output_tokens,
                model.cost.output_per_million
            );
            usage.cost += (output_tokens / 1000000) * outputPricePerMillion;
        }

        // Handle Per-Image Cost Calculation
        if (image_count > 0 && model.cost?.per_image) {
            usage.cost += image_count * model.cost.per_image;
        }

        // Ensure cost is not negative
        usage.cost = Math.max(0, usage.cost);

        return usage;
    }

    /**
     * Record usage details from a model provider
     *
     * @param usage ModelUsage object containing the cost and usage details
     */
    addUsage(usage: ModelUsage): void {
        try {
            // Calculate cost if not already set
            usage = this.calculateCost({ ...usage });
            usage.timestamp = new Date();

            // Add to entries list
            this.entries.push(usage);
        } catch (err) {
            console.error('Error recording usage:', err);
        }
    }

    /**
     * Get total cost across all providers
     */
    getTotalCost(): number {
        return this.entries.reduce((sum, entry) => sum + (entry.cost || 0), 0);
    }

    /**
     * Get costs summarized by model
     */
    getCostsByModel(): Record<string, { cost: number; calls: number }> {
        const models: Record<string, { cost: number; calls: number }> = {};

        for (const entry of this.entries) {
            if (!models[entry.model]) {
                models[entry.model] = {
                    cost: 0,
                    calls: 0,
                };
            }

            models[entry.model].cost += entry.cost || 0;
            models[entry.model].calls += 1;
        }

        return models;
    }

    /**
     * Print a summary of all costs to the console
     */
    printSummary(): void {
        if (!this.entries.length) {
            return;
        }

        const totalCost = this.getTotalCost();
        const costsByModel = this.getCostsByModel();
        const runtime = Math.round(
            (new Date().getTime() - this.started.getTime()) / 1000
        );

        console.log('\n\nCOST SUMMARY');
        console.log(`Runtime: ${runtime} seconds`);
        console.log(`Total API Cost: $${totalCost.toFixed(6)}`);

        console.log('\nModels:');
        for (const [model, modelData] of Object.entries(costsByModel)) {
            console.log(
                `\t${model}:\t$${modelData.cost.toFixed(6)} (${modelData.calls} calls)`
            );
        }

        this.reset();
    }

    /**
     * Reset the cost tracker (mainly for testing)
     */
    reset(): void {
        this.entries = [];
        this.started = new Date();
    }
}

// Export a singleton instance
export const costTracker = new CostTracker();

// Export the usage interface for compatibility
export interface UsageEntry {
    model: string;
    input_tokens?: number;
    output_tokens?: number;
    image_count?: number;
    timestamp?: Date;
}