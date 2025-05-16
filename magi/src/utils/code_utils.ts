/**
 * Code utility functions for the MAGI system.
 *
 * This module provides utilities for code agents, including parameter handling
 * and processing.
 */

import type { AgentInterface } from '../types/shared-types.js';

/**
 * Defines parameters typically used when initializing a code agent.
 */
export function getCodeParams(agentName = 'CodeAgent'): Record<string, any> {
    return {
        task: {
            type: 'string',
            description: `What should ${agentName} work on? Generally you should leave the way the task is performed up to the agent unless the agent previously failed. Agents are expected to work mostly autonomously.`,
        },
        context: {
            type: 'string',
            description: `What else might the ${agentName} need to know? Explain why you are asking for this - summarize the task you were given or the project you are working on. Please make it comprehensive. A couple of paragraphs is ideal.`,
            optional: true,
        },
        warnings: {
            type: 'string',
            description: `Is there anything the ${agentName} should avoid or be aware of? You can leave this as a blank string if there's nothing obvious.`,
            optional: true,
        },
        goal: {
            type: 'string',
            description: `This is the final goal/output or result you expect from the task. Try to focus on the overall goal and allow the ${agentName} to make its own decisions on how to get there. One sentence is ideal.`,
            optional: true,
        },
        cwd: {
            type: 'string',
            description: `Optional working directory path where ${agentName} should operate. If provided, the agent will execute commands within this directory.`,
            optional: true,
        },
        example: {
            type: 'string',
            description: `Optional example code or JSON schema (as a string) describing the file(s) ${agentName} should create or update.`,
            optional: true,
        },
    };
}

/**
 * Processes the initial parameters for a code agent, storing cwd for
 * model providers and formatting the initial prompt.
 *
 * @param agent - The agent instance.
 * @param params - The parameters provided for agent initialization.
 * @returns An object containing the initial prompt.
 */
export async function processCodeParams(
    agent: AgentInterface,
    params: Record<string, any>
): Promise<{ prompt: string }> {
    console.log('[code_utils] Processing code params:', params);

    // Build the prompt
    const prompts: string[] = [];

    if (params.task) {
        prompts.push(`**Task:** ${params.task}`);
    }

    if (params.context) {
        prompts.push(`\n\n**Context:** ${params.context}`);
    }

    if (params.warnings) {
        prompts.push(`\n\n**Warnings:** ${params.warnings}`);
    }

    if (params.goal) {
        prompts.push(`\n\n**Goal:** ${params.goal}`);
    }

    // Process cwd parameter - store in agent for model providers
    if (params.cwd && typeof params.cwd === 'string' && params.cwd.trim()) {
        (agent as any).cwd = params.cwd;
        prompts.push(`\n\n**Working directory:** ${params.cwd}`);
    }

    // Process example parameter - store in agent.args for reference
    if (
        params.example &&
        typeof params.example === 'string' &&
        params.example.trim()
    ) {
        prompts.push(`\n\n**File example:**\n${params.example}`);
    }

    // Return the prompt
    return {
        prompt: prompts.join(''),
    };
}
