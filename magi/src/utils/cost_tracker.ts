/**
 * Cost tracking module for the MAGI system.
 * 
 * Tracks costs across all model providers and provides reporting functions.
 */

interface CostEntry {
  timestamp: Date;
  provider: string;
  model: string;
  cost_usd: number;
  tokens?: number;
  prompt_tokens?: number;
  cached_tokens?: number;
  completion_tokens?: number;
}

interface ProviderSummary {
  total_cost: number;
  call_count: number;
  models: Record<string, {
    cost: number;
    calls: number;
  }>;
}

/**
 * Singleton class to track costs across all model providers
 */
class CostTracker {
  private entries: CostEntry[] = [];
  private started: Date = new Date();

  /**
   * Add a cost entry from any model provider
   * 
   * @param provider The model provider (e.g., 'openai', 'anthropic', 'google')
   * @param model The model name (e.g., 'gpt-4o', 'claude-3-opus')
   * @param cost_usd The cost in USD (required)
   * @param tokens Total tokens used (optional)
   * @param prompt_tokens Input tokens used (optional)
   * @param completion_tokens Output tokens used (optional)
   * @param cached_tokens Cached input tokens used (optional, for OpenAI)
   */
  addCost(provider: string, model: string, cost_usd: number, tokens?: number, prompt_tokens?: number, completion_tokens?: number, cached_tokens?: number): void {
    // Validate cost input (must be non-negative)
    if (cost_usd < 0) {
      console.warn(`[CostTracker] Ignoring negative cost value: ${cost_usd}`);
      return;
    }

    // Add the cost entry
    this.entries.push({
      timestamp: new Date(),
      provider,
      model,
      cost_usd,
      tokens,
      prompt_tokens,
      cached_tokens,
      completion_tokens
    });

    // Log the cost addition
    console.log(`[CostTracker] Added cost: $${cost_usd.toFixed(6)} for ${provider}/${model}`);
  }

  /**
   * Get total cost across all providers
   */
  getTotalCost(): number {
    return this.entries.reduce((sum, entry) => sum + entry.cost_usd, 0);
  }

  /**
   * Get costs summarized by provider
   */
  getCostsByProvider(): Record<string, ProviderSummary> {
    const summary: Record<string, ProviderSummary> = {};

    // Initialize the summary object
    for (const entry of this.entries) {
      if (!summary[entry.provider]) {
        summary[entry.provider] = {
          total_cost: 0,
          call_count: 0,
          models: {}
        };
      }

      const providerSummary = summary[entry.provider];
      providerSummary.total_cost += entry.cost_usd;
      providerSummary.call_count += 1;
      
      // Track by model
      if (!providerSummary.models[entry.model]) {
        providerSummary.models[entry.model] = {
          cost: 0,
          calls: 0
        };
      }
      
      providerSummary.models[entry.model].cost += entry.cost_usd;
      providerSummary.models[entry.model].calls += 1;
    }

    return summary;
  }

  /**
   * Print a summary of all costs to the console
   */
  printSummary(): void {
    const totalCost = this.getTotalCost();
    const costsByProvider = this.getCostsByProvider();
    const runtime = Math.round((new Date().getTime() - this.started.getTime()) / 1000);
    
    console.log('\n========== MAGI COST SUMMARY ==========');
    console.log(`Runtime: ${runtime} seconds`);
    console.log(`Total API Cost: $${totalCost.toFixed(6)}`);
    
    if (Object.keys(costsByProvider).length === 0) {
      console.log('No API costs recorded.');
      console.log('=========================================\n');
      return;
    }
    
    console.log('\nCosts by Provider:');
    
    // For each provider
    for (const [provider, summary] of Object.entries(costsByProvider)) {
      console.log(`\n${provider.toUpperCase()}: $${summary.total_cost.toFixed(6)} (${summary.call_count} calls)`);
      
      // For each model within the provider
      for (const [model, modelData] of Object.entries(summary.models)) {
        console.log(`  - ${model}: $${modelData.cost.toFixed(6)} (${modelData.calls} calls)`);
      }
    }
    
    console.log('\n=========================================\n');
  }

  /**
   * Get cost data in a structured format
   */
  getCostData(): {
    total_cost: number;
    runtime_seconds: number;
    providers: Record<string, ProviderSummary>;
  } {
    return {
      total_cost: this.getTotalCost(),
      runtime_seconds: Math.round((new Date().getTime() - this.started.getTime()) / 1000),
      providers: this.getCostsByProvider()
    };
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