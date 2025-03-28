/**
 * Cost tracking module for the MAGI system.
 *
 * Tracks costs across all model providers and provides reporting functions.
 */
import {findModel, ModelUsage} from '../model_providers/model_data.js';
import path from 'path';
import fs from 'fs';
import {get_output_dir} from './file_utils.js';

/**
 * Singleton class to track costs across all model providers
 */
class CostTracker {
	private entries: ModelUsage[] = [];
	private started: Date = new Date();

	/**
	 * Calculate cost for a given model and usage
	 *
	 * @param model ModelEntry object containing model details
	 * @param usage ModelUsage object containing usage details
	 * @returns ModelUsage object with updated cost
	 */
	calculateCost(usage: ModelUsage): ModelUsage {
		if (!usage.cost) {
            const model = findModel(usage.model);
            if (!model) {
              throw new Error(`Model not found when recording usage: ${usage.model}`);
            }

			usage.cost = 0;

			const input_tokens = (usage.input_tokens || 0) - (usage.cached_tokens || 0);
			const output_tokens = usage.output_tokens || 0;
			const cached_tokens = usage.cached_tokens || 0;

			if (input_tokens > 0 && model?.cost?.input_per_million) {
				usage.cost += input_tokens / 1000000 * model.cost.input_per_million;
			}
			if (output_tokens > 0 && model?.cost?.output_per_million) {
				usage.cost += input_tokens / 1000000 * model.cost.output_per_million;
			}
			if (cached_tokens > 0 && model?.cost?.cached_input_per_million) {
				usage.cost += input_tokens / 1000000 * model.cost.cached_input_per_million;
			}
		}

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
			usage = this.calculateCost(usage);
			usage.timestamp = new Date();
			this.entries.push(usage);

			// Create logs directory if needed
			const logsDir = get_output_dir('logs/usage');

			// Format timestamp for filename
			const formattedTime = usage.timestamp.toISOString().replace(/[:.]/g, '-');
			const fileName = `${formattedTime}_${usage.model}.json`;
			const filePath = path.join(logsDir, fileName);

			// Write the log file
			fs.writeFileSync(filePath, JSON.stringify(usage, null, 2), 'utf8');
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
	getCostsByModel(): Record<string, { cost: number; calls: number; }> {
		const models: Record<string, { cost: number; calls: number; }> = {};

		// Initialize the summary object
		for (const entry of this.entries) {
			// Track by model
			if (!models[entry.model]) {
				models[entry.model] = {
					cost: 0,
					calls: 0
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
        if(!this.entries.length) {
            return;
        }

		const totalCost = this.getTotalCost();
		const costsByModel = this.getCostsByModel();
		const runtime = Math.round((new Date().getTime() - this.started.getTime()) / 1000);

		console.log('\n\nCOST SUMMARY');
		console.log(`Runtime: ${runtime} seconds`);
		console.log(`Total API Cost: $${totalCost.toFixed(6)}`);

		console.log('\nModels:');
		// For each model within the provider
		for (const [model, modelData] of Object.entries(costsByModel)) {
			console.log(`\t${model}:\t$${modelData.cost.toFixed(6)} (${modelData.calls} calls)`);
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
