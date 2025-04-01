/**
 * ValidationAgent for the Task Force
 *
 * Validates the results of the task force - if we're complete or need to keep working
 */

import {Agent} from '../../utils/agent.js';
import {createBrowserAgent} from '../common_agents/browser_agent.js';
import {createSearchAgent} from '../common_agents/search_agent.js';
import {SIMPLE_SELF_SUFFICIENCY_TEXT, DOCKER_ENV_TEXT} from '../constants.js';
import {getFileTools} from '../../utils/file_utils.js';
import {getShellTools} from '../../utils/shell_utils.js';

/**
 * Create the ValidationAgent
 */
export function createValidationAgent(): Agent {

	return new Agent({
		name: 'ValidationAgent',
		description: 'Orchestrator of specialized agents for complex tasks',
		instructions: `You are an advanced reasoning expert with a PhD in both physics and computer science. You reason through complex problems from first principals. 

You will receive the output from a previous agent and a plan to work through to validate the output.
Please use your tools to validate the output as required. You may need to write code, run shell commands, or search the web to validate the output.

${DOCKER_ENV_TEXT}

${SIMPLE_SELF_SUFFICIENCY_TEXT}

OUTPUT FORMAT
Please output in this format only:

RESULT: {PASS|FAIL}
{Explain results of the validation. Please make it short for a pass, but provide a full explanation for failures.}

Here are some example outputs:
-------
RESULT: PASS
Passed all tests in the plan and the output is correct.
-------
RESULT: FAIL
Ran all tests in the plan, but the result is incorrect. The following tests failed:
- Test 1 failed because ...
- Test 3 failed because ...
-------

Start your final output with "RESULT: " and start the explanation on the next line. Do not include any other text.
`,
		tools: [
			...getFileTools(),
			...getShellTools(),
		],
		workers: [
			createSearchAgent,
			createBrowserAgent,
		],
		modelClass: 'reasoning'
	});
}
