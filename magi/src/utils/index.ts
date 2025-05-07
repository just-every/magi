import type { ToolFunction } from '../types/shared-types.js';
import { getFileTools } from '../utils/file_utils.js';
import { getShellTools } from '../utils/shell_utils.js';
import { getSummaryTools } from '../utils/summary_utils.js';
import {
    getCustomTools,
    getAgentSpecificTools,
} from '../utils/custom_tool_utils.js';
//import { getFocusTools } from '../utils/focus_utils.js';
import { getMemoryTools } from '../utils/memory_utils.js';
//import { getProcessTools } from '../utils/process_tools.js';
//import { getProjectTools } from '../utils/project_utils.js';
import { getSearchTools } from '../utils/search_utils.js';
//import { getThoughtTools } from '../utils/thought_utils.js';
import { getBrowserTools } from '../utils/browser_utils.js';

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
        //...getFocusTools(),
        ...getMemoryTools(),
        //...getProcessTools(),
        //...getProjectTools(),
        ...getSearchTools(),
        //...getThoughtTools(),
        ...getBrowserTools(),
    ];
}

/**
 * Attach agent-specific custom tools to an agent once its ID is assigned
 * This should be called immediately after an agent_id is assigned to ensure
 * the agent has access to any custom tools it should have (like modify_tool)
 *
 * This function will only add agent-specific tools if the agent already has
 * the CUSTOM_TOOL function, which indicates it was initialized with getCommonTools()
 *
 * @param agent The agent with agent_id and tools array
 */
export function attachAgentSpecificTools(agent: {
    agent_id: string;
    tools?: ToolFunction[];
}): void {
    // If tools is not set, do nothing
    if (!agent.tools) {
        return;
    }

    // Only add agent-specific tools if the agent has the CUSTOM_TOOL function
    // This ensures we only add tools to agents initialized with getCommonTools()
    const hasCreateTool = agent.tools.some(
        t => t.definition?.function?.name === 'CUSTOM_TOOL'
    );

    if (!hasCreateTool) {
        return; // Don't add agent-specific tools if CUSTOM_TOOL isn't available
    }

    // Add any agent-specific custom tools that aren't already present
    const agentSpecificTools = getAgentSpecificTools(agent.agent_id);

    // Only add tools that aren't already in the agent's toolset
    for (const tool of agentSpecificTools) {
        if (
            !agent.tools.some(
                t =>
                    t.definition.function.name === tool.definition.function.name
            )
        ) {
            agent.tools.push(tool);
        }
    }
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

    // Add relevant tools to the agent's current toolset (for immediate use)
    for (const tool of relevantTools) {
        // Avoid adding duplicate tools
        const existingIndex = agent.tools.findIndex(
            t => t.definition.function.name === tool.definition.function.name
        );

        if (existingIndex >= 0) {
            // Replace with new version
            agent.tools[existingIndex] = tool;
        } else {
            // Add new tool
            agent.tools.push(tool);
        }
    }
}
