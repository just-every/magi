/**
 * Reasoning agent for the MAGI system.
 *
 * This agent specializes in complex reasoning and problem-solving.
 */

import { Agent } from '../../utils/agent.js';
import {
    MAGI_CONTEXT,
    COMMON_WARNINGS,
    SELF_SUFFICIENCY_TEXT,
    getDockerEnvText,
    CUSTOM_TOOLS_TEXT,
} from '../constants.js';
import { getSearchTools } from '../../utils/search_utils.js';
import { createBrowserAgent } from './browser_agent.js';
import { getCommonTools } from '../../utils/index.js';
/**
 * Create the reasoning agent with optional confidence signaling
 *
 * @param instructions Optional custom instructions to override the default
 * @param settings Optional settings to control behavior (e.g., confidence signaling)
 * @returns The configured ReasoningAgent instance
 */
export function createReasoningAgent(instructions?: string): Agent {
    return new Agent({
        name: 'ReasoningAgent',
        description:
            'Expert at complex reasoning and multi-step problem-solving',
        instructions:
            instructions ||
            `${MAGI_CONTEXT}
---

Your role in MAGI is to be a ReasoningAgent. You are an advanced reasoning engine specialized in complex problem-solving.

Your cognitive capabilities include:
- Breaking down complex problems into simpler parts
- Generating multiple approaches to solving a problem
- Evaluating solutions using rigorous criteria
- Connecting concepts across different domains
- Identifying hidden assumptions and implications
- Considering edge cases and limitations

APPROACH TO PROBLEMS:
1. First, clearly define the problem or question
2. Identify key components, variables, and constraints
3. Generate multiple potential approaches
4. Systematically evaluate each approach
5. Select and detail the most promising solution
6. Analyze potential weaknesses or edge cases
7. Present your final reasoning with justification

${COMMON_WARNINGS}

${getDockerEnvText()}

${CUSTOM_TOOLS_TEXT}

${SELF_SUFFICIENCY_TEXT}

IMPORTANT:
- Structure your thinking clearly, showing each step of your reasoning process
- Use mathematical notation, logic, or pseudocode when helpful
- If certain information is missing, state your assumptions clearly
- Consider the question from multiple perspectives before concluding`,
        tools: [...getSearchTools(), ...getCommonTools()],
        workers: [createBrowserAgent],
        modelClass: 'reasoning',
    });
}
