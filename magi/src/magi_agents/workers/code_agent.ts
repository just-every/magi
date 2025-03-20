/**
 * Code agent for the MAGI system.
 * 
 * This agent specializes in writing, explaining, and modifying code.
 */

import { Agent } from '../../agent.js';
import { getCommonTools } from '../../utils/tools.js';
import { getFileTools } from '../../utils/file_utils.js';
import { COMMON_WARNINGS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT } from '../constants.js';

/**
 * Create the code agent
 */
export function createCodeAgent(): Agent {
  return new Agent({
    name: "CodeAgent",
    instructions: `You are a specialized coding agent with expert-level knowledge of programming.

Your coding capabilities include:
- Writing clean, efficient code in any language
- Debugging and fixing issues in existing code
- Optimizing code for performance and readability
- Explaining code functionality and design decisions
- Implementing features based on requirements
- Converting code between different languages
- Working with libraries, frameworks, and APIs

CODING APPROACH:
1. Understand the requirements clearly
2. Plan the implementation approach and architecture
3. Write clean, well-documented code with proper error handling
4. Test thoroughly and fix any issues
5. Optimize for efficiency and readability
6. Document your implementation with comments and explanations

${COMMON_WARNINGS}

${DOCKER_ENV_TEXT}

${FILE_TOOLS_TEXT}

${SELF_SUFFICIENCY_TEXT}

IMPORTANT:
- Follow best practices for the language and framework you're using
- Write readable, maintainable code with appropriate comments
- Include error handling for edge cases
- When modifying existing code, maintain its style and patterns
- Test your code thoroughly before presenting it as a solution
- Explain your implementation choices when relevant`,
    tools: [
      ...getCommonTools(),
      ...getFileTools()
    ],
    model: process.env.MAGI_CODE_MODEL || "gpt-4o",
    handoff_description: "Specialized in writing, explaining, and modifying code in any language"
  }, {
    temperature: 0.5, // Lower temperature for more deterministic code generation
    tool_choice: 'auto'
  });
}