/**
 * Simplified Manager Agent - Fast CEO-level analysis without complex workflows
 */

import { runMECH, runMECHStreaming, type Agent as MechAgent } from '../interfaces/mech.js';
import { Agent } from '@just-every/ensemble';
import type { MANAGER_ASSET_TYPES } from '../constants.js';

/**
 * Create a simplified manager agent for fast strategic analysis
 */
export function createSimpleManagerAgent(
    userPrompt: string,
    assetType?: MANAGER_ASSET_TYPES
): Agent {
    
    const analysisType = assetType || 'executive_summary';
    
    const agentConfig = {
        name: 'SimpleManagerAgent',
        agent_id: `simple_manager_${Date.now()}`,
        modelClass: 'standard' as const,
        instructions: `You are a **Manager-as-CEO** for JustEvery Inc., a company that democratizes software creation.

**COMPANY CONTEXT:**
- Mission: "Turn any single prompt into a live product—UI, back-end, hosting and all." 
- Goal: Ship JustEvery App v1.0 to public beta by December 2025
- Values: 100% MIT-licensed, community-first, radical openness

**YOUR TASK:**
Create a ${analysisType} for: "${userPrompt}"

**DELIVERABLE REQUIREMENTS:**
- Provide actionable strategic insights
- Include specific recommendations  
- Focus on executive-level decision making
- Keep it concise but comprehensive
- Address JustEvery's specific context and goals

**FORMAT:**
Structure your response as a clear executive deliverable with:
1. Executive Summary (2-3 key points)
2. Strategic Analysis 
3. Key Recommendations
4. Next Steps

**IMPORTANT:** Provide ONLY the analysis content itself. Do NOT include meta-commentary about completing the task or awaiting feedback. Start directly with the Executive Summary.

Be direct, actionable, and strategic. Focus on insights that help JustEvery achieve its December 2025 launch goal.`,
        tools: [], // No complex tools to avoid delays
    };

    return new Agent(agentConfig);
}

/**
 * Run simplified manager agent analysis
 */
export async function runSimpleManagerAgent(
    userPrompt: string,
    assetType?: MANAGER_ASSET_TYPES
): Promise<string> {
    console.log(`[SimpleManagerAgent] Starting analysis for: ${userPrompt}`);
    
    const agent = createSimpleManagerAgent(userPrompt, assetType);
    
    try {
        const task = `Please provide a ${assetType || 'strategic analysis'} for: ${userPrompt}`;
        const response = await runMECH(agent, task);

        // Extract the final content from the MECH response
        let result = 'Analysis completed successfully.';
        if (response.status === 'complete' && response.history.length > 0) {
            const lastMessage = response.history[response.history.length - 1];
            if (lastMessage && 'type' in lastMessage && lastMessage.type === 'message' &&
                'role' in lastMessage && lastMessage.role === 'assistant' &&
                'content' in lastMessage && typeof lastMessage.content === 'string') {
                result = lastMessage.content;
            }
        }
        console.log(`[SimpleManagerAgent] Analysis completed, length: ${result.length} characters`);
        
        return result;
    } catch (error) {
        console.error('[SimpleManagerAgent] Error:', error);
        throw error;
    }
}

/**
 * Run simplified manager agent with streaming (for Slack integration)
 */
export async function* runSimpleManagerAgentStreaming(
    userPrompt: string,
    assetType?: MANAGER_ASSET_TYPES
): AsyncGenerator<any> {
    console.log(`[SimpleManagerAgent] Starting streaming analysis for: ${userPrompt}`);
    
    const agent = createSimpleManagerAgent(userPrompt, assetType);
    
    try {
        const task = `Please provide a ${assetType || 'strategic analysis'} for: ${userPrompt}`;
        const stream = runMECHStreaming(agent, task);

        yield* stream;
    } catch (error) {
        console.error('[SimpleManagerAgent] Streaming error:', error);
        throw error;
    }
}