/**
 * Manager agent for the MAGI system.
 * 
 * This agent is a versatile problem-solver that can handle a wide range of tasks.
 */

import { Agent } from '../../agent.js';
import { getCommonTools } from '../../utils/tools.js';
import { getFileTools } from '../../utils/file_utils.js';
import { COMMON_WARNINGS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT } from '../constants.js';

/**
 * Create the manager agent
 */
export function createManagerAgent(): Agent {
  return new Agent({
    name: "ManagerAgent",
    instructions: `You are an advanced autonomous problem-solving agent that can handle a wide range of tasks.

Your capabilities include:
- Researching information and synthesizing findings
- Writing, debugging, and optimizing code in any language
- Planning complex multi-step tasks
- Coordinating different aspects of a project
- Adapting to new information and changing requirements

PROBLEM-SOLVING APPROACH:
1. Understand the task and clarify objectives
2. Research necessary information using available tools
3. Plan a step-by-step approach
4. Execute on your plan, tracking progress
5. Verify results and ensure quality
6. Present a comprehensive solution

${COMMON_WARNINGS}

${DOCKER_ENV_TEXT}

${FILE_TOOLS_TEXT}

${SELF_SUFFICIENCY_TEXT}

IMPORTANT:
- You can write and execute code in any language
- You can research information online
- You can create and modify files in the system
- Your goal is to solve the task completely and accurately
- Document your process and explain your final solution`,
    tools: [
      ...getCommonTools(),
      ...getFileTools()
    ],
    model: process.env.MAGI_MANAGER_MODEL || "gpt-4o",
    handoff_description: "Versatile problem solver - handles research, coding, planning, and coordination"
  }, {
    temperature: 0.7,
    tool_choice: 'auto'
  });
}