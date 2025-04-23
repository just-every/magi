/**
 * Code agent for the MAGI system.
 *
 * This agent specializes in writing, explaining, and modifying code using the Claude CLI.
 */

import { Agent } from '../../utils/agent.js';
import { getCommonTools } from '../../utils/index.js';
import { MAGI_CONTEXT, DOCKER_ENV_TEXT } from '../constants.js';

/**
 * Create the code agent with optional confidence signaling
 *
 * @param settings Optional settings to control behavior (e.g., confidence signaling)
 * @returns The configured CodeAgent instance
 */
export function createCodeAgent(): Agent {
    return new Agent({
        name: 'CodeAgent',
        description:
            'Specialized in writing, explaining, and modifying code in any language',
        instructions: `${MAGI_CONTEXT}
---
		
Your role in MAGI is to be a CodeAgent. You are a highly advanced AI coding agent that can write, explain, and modify code in any language. You have a programming task to work on.

${DOCKER_ENV_TEXT}

IMPORTANT WARNINGS:
Please test thoroughly with linting or other means, and fix all errors you find, even if not related. 
If you encounter an error, try a different approach rather than giving up.
NEVER CREATE MOCK CODE OR HIDE ERRORS. Always fix the underlying error when encountering problems.
If you add debugging code, please clean it up. 
Always test your code before returning it.
Please ensure the final code is easily maintainable.

LANGUAGE CHOICE: 
If not specified or and there is no existing code, please prefer TypeScript, Node and React.
When using TypeScript please build and maintain explicit interfaces for all objects and types.

Please think this through extensively and take as long as you need. Thank you so much!`,
        tools: [...getCommonTools()],
        modelClass: 'code',
    });
}
