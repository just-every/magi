import { Agent } from '@just-every/ensemble';
/**
 * Code agent for the MAGI system.
 *
 * This agent specializes in writing, explaining, and modifying code using the Claude CLI.
 */

import { getCommonTools } from '../../utils/index.js';
import { getCodeParams, processCodeParams } from '../../utils/code_utils.js';
import { MAGI_CONTEXT, getDockerEnvText } from '../constants.js';

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

${getDockerEnvText()}

WARNINGS:
- Please test thoroughly with linting or other means, and fix all errors you find, even if not related.
- If you encounter an error, try a different approach rather than giving up.
- NEVER CREATE MOCK CODE OR HIDE ERRORS. Always fix the underlying error when encountering problems.

LANGUAGE CHOICE:
If the language to use is specified or and there is no existing code, please prefer TypeScript and React.
When using TypeScript please build and maintain explicit interfaces for all objects and types.

COMPLETION:
- If you add debugging code, please clean it up.
- Always test your code before returning it. Fix all errors, including linting errors.
- Ensure your final code is easily maintainable.
- **IMPORTANT** Once you are satisfied you have completed your task, please make the VERY LAST LINE of your output only the string '[complete]'

Please think this through extensively and take as long as you need. Thank you so much!`,
        tools: [...getCommonTools()],
        modelClass: 'code',
        params: getCodeParams('CodeAgent'),
        processParams: processCodeParams,
    });
}
