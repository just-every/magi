import { getCommonTools } from '../../utils/index.js';
import { createReasoningAgent } from '../common_agents/reasoning_agent.js';
import { createSearchAgent } from '../common_agents/search_agent.js';
import { createVerifierAgent } from '../common_agents/verifier_agent.js';
import { createOperatorAgent, startTime } from '../operator_agent.js';
import { MAGI_CONTEXT } from '../constants.js';
import { getSearchTools } from '../../utils/search_utils.js';
import { get_output_dir } from '../../utils/file_utils.js';
import {
    Agent,ResponseInput
} from '@just-every/ensemble';
import { runningToolTracker } from '../../utils/running_tool_tracker.js';
import { dateFormat, readableTime } from '../../utils/date_tools.js';
import { getThoughtDelay } from '@just-every/task';

/**
 * ResearchOperatorAgent v2 – Incorporating multi-engine parallel search, explicit planning, and a verify-after-write pass.
 */

export async function createResearchOperatorAgent(): Promise<Agent> {
    const outputDir = get_output_dir('research');
    const depth = process.env.RESEARCH_DEPTH ?? 'standard';

    /* --------------------------- Agent Instructions --------------------------- */
    const instructions = `${MAGI_CONTEXT}

---
You are **ResearchOperatorAgent**

**Mission:** Deliver a *fully cited*, high-quality research report while following a rigorous, auditable workflow.

## Workflow Overview
0. **Clarify Scope** – Detect ambiguities; if any, ask the user concise follow-up questions *once* before continuing.
1. **Plan & Decompose**
   • Break the prompt into granular sub-questions.
   • For each sub-question, choose preferred search engines (multi-engine strategy) and priority level.
   • Persist this plan to \`research_plan.json\`.
2. **Search & Gather**
   • Spawn SearchAgents in parallel using the planned engines.
   • Merge findings into \`research_notes.json#evidence\`.
3. **Synthesize**
   • Use a ReasoningAgent to compose \`RESEARCH_REPORT.md\` with citations.
4. **Verify**
   • Run a VerifierAgent to check citations against the evidence.
   • Fix issues or trigger additional searches until verification passes.

Depth mode: ${depth}. Save all output files in ${outputDir}.`;

    return createOperatorAgent({
        name: 'ResearchOperatorAgent',
        description:
            'Coordinates multi-engine research and produces verified reports.',
        instructions,
        tools: [...getSearchTools(), ...getCommonTools()],
        workers: [createSearchAgent, createReasoningAgent, createVerifierAgent],
        onRequest: async (
            agent: Agent,
            messages: ResponseInput
        ): Promise<[Agent, ResponseInput]> => {
            messages.push({
                type: 'message',
                role: 'developer',
                content: `=== Operator Status ===\n\nCurrent Time: ${dateFormat()}\nYour Running Time: ${readableTime(
                    new Date().getTime() - startTime.getTime()
                )}\nYour Thought Delay: ${getThoughtDelay()} seconds\n\nActive Tools:\n${runningToolTracker.listActive()}\nOutput Directory: ${outputDir}\nDepth Mode: ${depth}`,
            });
            return [agent, messages];
        },
    });
}
