/**
 * Simplified MECH API
 * 
 * Easy-to-use functions that require minimal setup
 */

import { runMECH as internalRunMECH } from './mech_tools.js';
import { runMECHWithMemory as internalRunMECHWithMemory } from './mech_memory_wrapper.js';
import type { 
    MechAgent, 
    MechResult, 
    SimpleAgent,
    RunMechOptions,
    SimpleMechOptions 
} from './types.js';
import { createFullContext, globalCostTracker } from './utils/internal_utils.js';

/**
 * Convert a simple agent to MechAgent
 */
function toMechAgent(agent: SimpleAgent): MechAgent {
    return {
        name: agent.name,
        agent_id: agent.agent_id || `${agent.name}-${Date.now()}`,
        model: agent.model,
        modelClass: agent.modelClass,
        tools: [],  // Tools will be added by MECH
        instructions: agent.instructions,
        export: () => ({ ...agent } as Record<string, unknown>),
        getTools: async () => []  // Tools will be added by MECH
    };
}

/**
 * Run MECH with a simple interface
 * 
 * @example
 * ```typescript
 * const result = await runMECH({
 *     agent: { name: 'MyAgent' },
 *     task: 'Analyze this code and suggest improvements',
 *     runAgent: async (agent, input, history) => {
 *         // Your LLM call here
 *         return { response: 'Analysis complete' };
 *     }
 * });
 * ```
 */
export async function runMECH(options: RunMechOptions): Promise<MechResult> {
    const mechAgent = toMechAgent(options.agent);
    const context: SimpleMechOptions = {
        runAgent: options.runAgent,
        onHistory: options.onHistory,
        onStatus: options.onStatus
    };
    
    const fullContext = createFullContext(context);
    return internalRunMECH(mechAgent, options.task, fullContext, options.loop || false, options.model);
}

/**
 * Run MECH with memory using a simple interface
 * 
 * @example
 * ```typescript
 * const result = await runMECHWithMemory({
 *     agent: { name: 'MyAgent' },
 *     task: 'Build a web app',
 *     runAgent: async (agent, input, history) => {
 *         // Your LLM call here
 *         return { response: 'App built' };
 *     },
 *     // Optional memory functions
 *     embed: async (text) => embeddings.create(text),
 *     lookupMemories: async (embedding) => db.findSimilar(embedding)
 * });
 * ```
 */
export async function runMECHWithMemory(options: RunMechOptions): Promise<MechResult> {
    const mechAgent = toMechAgent(options.agent);
    
    // Build context with memory features if provided
    const context: SimpleMechOptions = {
        runAgent: options.runAgent,
        onHistory: options.onHistory,
        onStatus: options.onStatus,
        embed: options.embed,
        lookupMemories: options.lookupMemories,
        saveMemory: options.saveMemory
    };
    
    const fullContext = createFullContext(context);
    return internalRunMECHWithMemory(mechAgent, options.task, fullContext, options.loop || false, options.model);
}

/**
 * Get the total cost of all MECH operations
 */
export function getTotalCost(): number {
    return globalCostTracker.getTotalCost();
}

/**
 * Reset the cost tracker
 */
export function resetCostTracker(): void {
    globalCostTracker.reset();
}

// Re-export useful types and state management
export type { 
    MechResult, 
    MechOutcome,
    SimpleAgent,
    RunMechOptions 
} from './types.js';

export { mechState, set_meta_frequency } from './mech_state.js';
export { set_thought_delay } from './thought_utils.js';