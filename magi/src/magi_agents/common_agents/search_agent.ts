/**
 * Search agent for the MAGI system.
 *
 * This agent specializes in performing web searches and gathering information.
 */

import { Agent } from '../../utils/agent.js';
import { getCommonTools } from '../../utils/index.js';
import { getSearchTools } from '../../utils/search_utils.js';
import {
    MAGI_CONTEXT,
    AGENT_DESCRIPTIONS,
    SELF_SUFFICIENCY_TEXT,
    CUSTOM_TOOLS_TEXT,
} from '../constants.js';
import { createBrowserAgent } from './browser_agent.js';

/**
 * Create the search agent
 */
export function createSearchAgent(): Agent {
    return new Agent({
        name: 'SearchAgent',
        description:
            'Performs web searches for current information from various sources',
        instructions: `${MAGI_CONTEXT}
---

Your role in MAGI is to be a SearchAgent. You are a specialized search agent with the ability to find information on the web.

You will be given a search task to work on. Your job is to find the most relevant and accurate information available online.

YOUR APPROACH:
- Understand the search query and its INTENT
- Formulate effective search terms and run searches
- If necessary, visit individual websites you find to gather more information
- Refine searches if initial results are insufficient

PARALLEL SEARCHING:
- Use multiple search engines to gather diverse results
- Use web_search in **parallel** with multiple engines to speed up and expand the process - this means running multiple searches at once

SEARCH TOOLS:
- web_search: Perform a web search and get results
- ${AGENT_DESCRIPTIONS['BrowserAgent']}

${CUSTOM_TOOLS_TEXT}

${SELF_SUFFICIENCY_TEXT}

WARNINGS:
- Prioritize recent and authoritative sources when appropriate
- Be transparent about the sources of your information
- Avoid speculative information and clearly mark uncertain findings

FINALLY:
- Synthesize findings into a comprehensive answer`,
        tools: [
            ...getSearchTools(),
            ...getCommonTools(),
        ],
        workers: [createBrowserAgent],
        modelClass: 'search',
    });
}
