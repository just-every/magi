/**
 * Public cost tracker API for the Ensemble package.
 *
 * This module provides access to the cost tracking functionality
 * that tracks API usage and costs across all model providers.
 *
 * @example
 * ```typescript
 * import { costTracker } from '@magi-system/ensemble/cost_tracker';
 *
 * // Listen for cost updates
 * costTracker.onAddUsage((usage) => {
 *   console.log(`New usage: ${usage.model} - $${usage.cost}`);
 * });
 *
 * // Get current total cost
 * const total = costTracker.getTotalCost();
 * console.log(`Total cost: $${total}`);
 *
 * // Print summary
 * costTracker.printSummary();
 * ```
 */

// Re-export everything from the internal cost tracker
export * from './utils/cost_tracker.js';
