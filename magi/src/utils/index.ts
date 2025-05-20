import type { ToolFunction } from '../types/shared-types.js';
import { getFileTools } from './file_utils.js';
import { getShellTools } from './shell_utils.js';
import { getSummaryTools } from './summary_utils.js';
import { getCustomTools } from './custom_tool_utils.js';
import { getMemoryTools } from './memory_utils.js';
import { getSearchTools } from './search_utils.js';
import {
    getImageGenerationTools,
    getDesignImageTools,
} from './image_generation.js';
import { getDesignSearchTools, getSmartDesignTools } from './design_search.js';
import { getBrowserTools } from './browser_utils.js';

/**
 * Get all common tools as an array of tool definitions
 *
 * @returns Array of tool functions
 */
export function getCommonTools(): ToolFunction[] {
    return [
        ...getFileTools(),
        ...getShellTools(),
        ...getSummaryTools(),
        ...getCustomTools(),
    ];
}

/**
 * All possible core tools available to custom functions. This may provide too many options for some LLMs, so use this in limited situations.
 *
 * @returns Array of tool functions
 */
export function getToolsForCustomFunctions(): ToolFunction[] {
    return [
        ...getFileTools(),
        ...getShellTools(),
        ...getSummaryTools(),
        ...getMemoryTools(),
        ...getSearchTools(),
        ...getImageGenerationTools(),
        ...getDesignImageTools(),
        ...getDesignSearchTools(),
        ...getSmartDesignTools(),
        ...getBrowserTools(),
    ];
}

/**
 * Register relevant custom tools based on the current context
 * This function can be called after determining the embedding for a task
 * to dynamically add relevant custom tools to an agent's toolset.
 *
 * @param embedding The embedding vector representing the current task or context
 * @param agent The agent to register the tools with
 */
export async function registerRelevantCustomTools(
    embedding: number[],
    agent: { agent_id?: string; tools?: ToolFunction[] }
): Promise<void> {
    // Import dynamically to avoid circular dependencies
    const { getRelevantCustomTools, MAX_AGENT_TOOLS } = await import(
        './custom_tool_utils.js'
    );

    // Initialize agent tools array if needed
    if (!agent.tools) {
        agent.tools = [];
    }

    // Get relevant tools based on embedding similarity
    const relevantTools = await getRelevantCustomTools(embedding);

    if (relevantTools.length === 0) {
        return; // No relevant tools found
    }

    // Update the agent-specific cache if agent_id is available
    if (agent.agent_id) {
        // Import the agent tool cache to update it
        const { agentToolCache } = await import('./custom_tool_utils.js');

        // Initialize the agent's tool cache if needed
        if (!agentToolCache.has(agent.agent_id)) {
            agentToolCache.set(agent.agent_id, []);
        }

        const agentTools = agentToolCache.get(agent.agent_id)!;

        // Calculate how many more tools this agent can accept
        const remainingSlots = MAX_AGENT_TOOLS - agentTools.length;

        // Limit to remaining slots if needed
        const toolsToAdd = relevantTools.slice(0, Math.max(0, remainingSlots));

        for (const tool of toolsToAdd) {
            // Check if this tool already exists in the agent's toolset
            const existingIndex = agentTools.findIndex(
                t =>
                    t.definition.function.name === tool.definition.function.name
            );

            if (existingIndex >= 0) {
                // Replace with newer version if it already exists
                agentTools[existingIndex] = tool;
            } else {
                // Add new tool
                agentTools.push(tool);
            }
        }
    }
}
