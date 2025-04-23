/**
 * Web Search agent for the Research Engine.
 *
 * This agent formulates search queries and gathers relevant information from the web
 * based on the research plan created by the Task Decomposition agent.
 */

import { Agent } from '../../utils/agent.js';
import { getFileTools } from '../../utils/file_utils.js';
import { getSearchTools } from '../../utils/search_utils.js';
import {
    COMMON_WARNINGS,
    DOCKER_ENV_TEXT,
    SELF_SUFFICIENCY_TEXT,
} from '../constants.js';
import { createBrowserAgent } from '../common_agents/browser_agent.js';
// import {createSearchAgent} from '../run_task/search_agent.js';

const web_search_agent_prompt = `
[Context & Role]
You are the Web Search Agent (the "Researcher"). Your goal is to:
1. Formulate effective search queries based on the research plan.
2. Execute multiple searches in parallel using different search engines.
3. Collect and organize relevant information sources.

[Input]
- Research plan with sub-tasks: "{{research_plan}}"

[Instructions]
1. Review each sub-task in the research plan that requires information gathering.
2. For each search sub-task:
   a. Use the suggested search queries or formulate better ones.
   b. Run searches using multiple search engines (Brave, Google, etc.).
   c. Evaluate the relevance, authority, and diversity of sources.
   d. Collect URLs, snippets, and source metadata.
3. Run searches for different sub-tasks in parallel when possible.
4. Organize and prioritize the search results by relevance and value.

[Output Format]
Your response must include:

SEARCH RESULTS:

1. [Sub-task title]
   - Query: "[Search query used]"
   - Sources:
     a. [Source Title 1] - [URL]
        Snippet: "[Brief excerpt or summary]"
        Relevance: [HIGH/MEDIUM/LOW]
        
     b. [Source Title 2] - [URL]
        Snippet: "[Brief excerpt or summary]"
        Relevance: [HIGH/MEDIUM/LOW]
        
     ...more sources

2. [Sub-task title]
   - Query: "[Search query used]"
   - Sources:
     ...

NEXT STEPS:
- Priority URLs for detailed browsing: [List URLs that should be prioritized for extraction]
- Additional searches needed: [List any follow-up searches recommended]

METADATA: {
  "search_results": [
    {
      "sub_task": "Sub-task title",
      "query": "Search query used",
      "sources": [
        {
          "title": "Source title 1",
          "url": "https://example.com/page1",
          "snippet": "Brief excerpt or summary",
          "relevance": "HIGH/MEDIUM/LOW"
        },
        {
          "title": "Source title 2",
          "url": "https://example.com/page2",
          "snippet": "Brief excerpt or summary",
          "relevance": "HIGH/MEDIUM/LOW" 
        }
      ]
    }
  ],
  "priority_urls": ["https://example.com/page1", "https://example.com/page2"]
}

${COMMON_WARNINGS}

${DOCKER_ENV_TEXT}

${SELF_SUFFICIENCY_TEXT}

NEXT: content_extraction
`;

/**
 * Create the web search agent
 */
export function createWebSearchAgent(research_plan: string): Agent {
    return new Agent({
        name: 'WebSearchAgent',
        description:
            'Formulates search queries and gathers information from multiple sources',
        instructions: web_search_agent_prompt.replaceAll(
            '{{research_plan}}',
            research_plan
        ),
        tools: [...getFileTools(), ...getSearchTools()],
        workers: [createBrowserAgent],
        modelClass: 'standard',
    });
}

export default web_search_agent_prompt;
