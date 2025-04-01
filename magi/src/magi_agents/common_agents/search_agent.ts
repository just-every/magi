/**
 * Search agent for the MAGI system.
 *
 * This agent specializes in performing web searches and gathering information.
 */

import {Agent} from '../../utils/agent.js';
import {getSearchTools} from '../../utils/search_utils.js';
import {AGENT_DESCRIPTIONS, SELF_SUFFICIENCY_TEXT} from '../constants.js';
import {createBrowserAgent} from './browser_agent.js';

/**
 * Create the search agent
 */
export function createSearchAgent(): Agent {
	return new Agent({
		name: 'SearchAgent',
		description: 'Performs web searches for current information from various sources',
		instructions: `You are a specialized search agent with the ability to find information on the web.
		
You will be given a search task to work on. Your job is to find the most relevant and accurate information available online.

STANDARD APPROACH:
1. Understand the search query and its INTENT
2. Formulate effective search terms and run searches
3. If necessary, visit individual websites you find to gather more information
4. Run multiple searches and browse websites in parallel to speed up your task
5. Refine searches if initial results are insufficient
6. Synthesize findings into a comprehensive answer

SEARCH TOOLS:
- web_search: Perform a web search and get results
- ${AGENT_DESCRIPTIONS['BrowserAgent']}

${SELF_SUFFICIENCY_TEXT}

IMPORTANT:
- Prioritize recent and authoritative sources when appropriate
- Be transparent about the sources of your information
- Avoid speculative information and clearly mark uncertain findings
- Use multiple search queries to verify information when necessary`,
		tools: [
			...getSearchTools()
		],
		workers: [
			createBrowserAgent,
		],
		modelClass: 'search'
	});
}
