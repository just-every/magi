/**
 * MECH Wrapper
 * 
 * This module provides wrapper functions that bridge the MECH module with
 * magi's implementation details, creating the required MechContext.
 */

import type { MechAgent, MechContext, MechResult } from '@just-every/ecot';
import { runMECHAdvanced as mechRunMECH, runMECHWithMemoryAdvanced as mechRunMECHWithMemory } from '@just-every/ecot';
import { Agent } from './agent.js';
import type { AgentDefinition } from '../types/shared-types.js';
import { Runner } from './runner.js';
import { getCommunicationManager, sendComms, sendStreamEvent } from './communication.js';
import {
    addHistory,
    getHistory,
    processPendingHistoryThreads,
    describeHistory,
} from './history.js';
import { costTracker } from './cost_tracker.js';
import { createToolFunction } from './tool_call.js';
import { dateFormat, readableTime } from './date_tools.js';
import { listActiveProjects, getProcessProjectIds } from './project_utils.js';
import { planAndCommitChanges } from './commit_planner.js';
import {
    recordTaskStart,
    recordTaskEnd,
    lookupMemoriesEmbedding,
    formatMemories,
    insertMemories,
} from './db_utils.js';
import { embed } from './embedding_utils.js';
import { registerRelevantCustomTools } from './index.js';
import { quick_llm_call } from './llm_call_utils.js';
import { runningToolTracker } from './running_tool_tracker.js';
import { MAGI_CONTEXT } from '../magi_agents/constants.js';
import type { ResponseInput } from '@magi-system/ensemble';

/**
 * Convert a magi Agent to a MechAgent
 */
function agentToMechAgent(agent: Agent): MechAgent {
    return {
        name: agent.name,
        agent_id: agent.agent_id,
        model: agent.model,
        modelClass: agent.modelClass,
        tools: agent.tools,
        instructions: agent.instructions,
        historyThread: agent.historyThread,
        args: agent.args,
        export: () => agent.export() as unknown as Record<string, unknown>,
        getTools: () => agent.getTools(),
    };
}

/**
 * Create the MechContext with all required utilities
 */
function createMechContext(): MechContext {
    return {
        // Communication functions
        sendComms,
        getCommunicationManager,
        sendStreamEvent: (event: any) => sendStreamEvent(event),
        
        // History management
        addHistory,
        getHistory,
        processPendingHistoryThreads,
        describeHistory: (agent: MechAgent, messages: ResponseInput, showCount: number) => {
            // Convert MechAgent back to Agent for describeHistory
            const fullAgent = new Agent({
                name: agent.name,
                agent_id: agent.agent_id,
                model: agent.model,
                modelClass: agent.modelClass,
                tools: agent.tools,
                instructions: agent.instructions,
                historyThread: agent.historyThread,
                args: agent.args,
            } as any);
            return describeHistory(fullAgent, messages, showCount);
        },
        
        // Cost tracking
        costTracker,
        
        // Project utilities
        getProcessProjectIds,
        planAndCommitChanges: async (agent: MechAgent, projectId: string) => {
            // Convert MechAgent back to Agent for planAndCommitChanges
            const fullAgent = new Agent({
                name: agent.name,
                agent_id: agent.agent_id,
                model: agent.model,
                modelClass: agent.modelClass,
                tools: agent.tools,
                instructions: agent.instructions,
                historyThread: agent.historyThread,
                args: agent.args,
            } as any);
            return planAndCommitChanges(fullAgent, projectId);
        },
        listActiveProjects,
        
        // Database utilities
        recordTaskStart: async (params: any) => {
            return recordTaskStart(params);
        },
        recordTaskEnd: async (params: any) => {
            return recordTaskEnd(params);
        },
        lookupMemoriesEmbedding,
        formatMemories,
        insertMemories,
        
        // Embedding utilities
        embed,
        
        // Custom tools
        registerRelevantCustomTools: async (embedding: number[], agent: MechAgent) => {
            // Convert MechAgent back to Agent for registerRelevantCustomTools
            const fullAgent = new Agent({
                name: agent.name,
                agent_id: agent.agent_id,
                model: agent.model,
                modelClass: agent.modelClass,
                tools: agent.tools,
                instructions: agent.instructions,
                historyThread: agent.historyThread,
                args: agent.args,
            } as any);
            return registerRelevantCustomTools(embedding, fullAgent);
        },
        
        // LLM utilities
        quick_llm_call: async (messages: ResponseInput, systemPrompt: string | null, config: any, agentId: string) => {
            // Adapt the config to match the expected signature
            return quick_llm_call(messages, config.modelClass, config, undefined, undefined);
        },
        
        // Tool creation
        createToolFunction,
        
        // Running tools tracking
        runningToolTracker,
        
        // Date tools
        dateFormat,
        readableTime,
        
        // Constants
        MAGI_CONTEXT,
        
        // Runner integration
        runStreamedWithTools: async (agent: MechAgent, input: string, history: ResponseInput) => {
            // Convert MechAgent back to Agent for Runner
            const fullAgent = new Agent({
                name: agent.name,
                agent_id: agent.agent_id,
                model: agent.model,
                modelClass: agent.modelClass,
                tools: agent.tools,
                instructions: agent.instructions,
                historyThread: agent.historyThread,
                args: agent.args,
            } as any);
            const response = await Runner.runStreamedWithTools(fullAgent, input, history);
            // Convert string response to LLMResponse format
            return { response, tool_calls: [] };
        },
    };
}

/**
 * Wrapper for runMECH that provides the MechContext
 */
export async function runMECH(
    agent: Agent,
    content: string,
    loop: boolean = false,
    model?: string
): Promise<MechResult> {
    const mechAgent = agentToMechAgent(agent);
    const context = createMechContext();
    return mechRunMECH(mechAgent, content, context, loop, model);
}

/**
 * Wrapper for runMECHWithMemory that provides the MechContext
 */
export async function runMECHWithMemory(
    agent: Agent,
    content: string,
    loop: boolean = false,
    model?: string
): Promise<MechResult> {
    const mechAgent = agentToMechAgent(agent);
    const context = createMechContext();
    return mechRunMECHWithMemory(mechAgent, content, context, loop, model);
}

// Wrapper functions for MECH tools that need context
export function getMECHTools() {
    const context = createMechContext();
    return context.createToolFunction ? [
        context.createToolFunction(
            (result: string) => task_complete(result),
            'Report that the task has completed successfully',
            {
                result: 'A few paragraphs describing the result of the task. Include any assumptions you made, problems overcome and what the final outcome was.',
            }
        ),
        context.createToolFunction(
            (error: string) => task_fatal_error(error),
            'Report that you were not able to complete the task',
            { error: 'Describe the error that occurred in a few sentences' }
        ),
    ] : [];
}

export function task_complete(result: string): Promise<string> {
    const context = createMechContext();
    return Promise.resolve(mechTaskComplete(result, context));
}

export function task_fatal_error(error: string): string {
    const context = createMechContext();
    return mechTaskFatalError(error, context);
}

// Import the actual functions from mech
import { 
    task_complete as mechTaskComplete, 
    task_fatal_error as mechTaskFatalError,
    getMetaCognitionTools as mechGetMetaCognitionTools,
    type MechOutcome,
} from '@just-every/ecot';

// Re-export types
export type { MechOutcome, MechResult };

// Wrapper for getMetaCognitionTools
export function getMetaCognitionTools() {
    const context = createMechContext();
    return mechGetMetaCognitionTools(context);
}

// Re-export state management
export {
    mechState,
    getModelScore,
    set_meta_frequency,
    set_model_score,
    disable_model,
    enableModel,
    listDisabledModels,
    listModelScores,
    incrementLLMRequestCount,
} from '@just-every/ecot';

// Wrapper for getThoughtTools
export function getThoughtTools() {
    const context = createMechContext();
    return mechGetThoughtTools(context);
}

// Wrapper for set_thought_delay
export function set_thought_delay(delay: string): string {
    const context = createMechContext();
    return mechSetThoughtDelay(delay, context);
}

// Import thought delay function
import { 
    set_thought_delay as mechSetThoughtDelay,
    getThoughtTools as mechGetThoughtTools 
} from '@just-every/ecot';

// Re-export thought utilities
export {
    getThoughtDelay,
    setDelayInterrupted,
    runThoughtDelay,
    isDelayInterrupted,
    getDelayAbortSignal,
} from '@just-every/ecot';

// Re-export meta-cognition
export { spawnMetaThought } from '@just-every/ecot';

// Re-export types
export type {
    MetaFrequency,
    MECHState,
    MechConfig,
    MechAgent,
    MechContext,
} from '@just-every/ecot';