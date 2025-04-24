/**
 * Content Extraction agent for the Research Engine.
 *
 * This agent navigates web pages and extracts relevant content from the sources
 * identified by the Web Search agent.
 */

import { Agent } from '../../utils/agent.js';
import { getFileTools } from '../../utils/file_utils.js';
import { getBrowserVisionTools } from '../../utils/browser_utils.js';
import {
    COMMON_WARNINGS,
    DOCKER_ENV_TEXT,
    SELF_SUFFICIENCY_TEXT,
} from '../constants.js';
import { createBrowserAgent } from '../common_agents/browser_agent.js';

const content_extraction_agent_prompt = `
[Context & Role]
You are the Content Extraction Agent (the "Extractor"). Your goal is to:
1. Navigate to prioritized URLs from search results.
2. Extract relevant content, facts, and key information.
3. Organize and structure the extracted data.

[Input]
- Search results with prioritized URLs: {{search_results}}

[Instructions]
1. For each prioritized URL:
   a. Navigate to the web page using the browser tools.
   b. Analyze the page content to identify relevant sections.
   c. Extract text, facts, code snippets, or other information pertinent to the research query.
   d. Capture direct quotes when appropriate for citation purposes.
   e. Organize the extracted information in a structured format.
2. Process multiple URLs in parallel when possible.
3. Handle different content types appropriately (text, code, data, etc.).
4. If needed, follow relevant links on a page to gather additional context.

[Output Format]
Your response must include:

EXTRACTED CONTENT:

1. [Source Title] - [URL]
   Date Accessed: [Date]

   Key Content:
   [Extracted text, facts, quotes, or code snippets with clear structure]


   Summary: [Brief summary of the extracted content]

   Relevance: [HIGH/MEDIUM/LOW]

   Additional Notes: [Any observations about the source's reliability, biases, etc.]

2. [Source Title] - [URL]
   ...

SYNTHESIS NOTES:
- Key facts: [List of the most important facts discovered]
- Points of consensus: [Information that multiple sources agree on]
- Contradictions: [Areas where sources provide conflicting information]
- Gaps: [Important aspects of the query that still lack information]

METADATA: {
  "extracted_content": [
    {
      "title": "Source title 1",
      "url": "https://example.com/page1",
      "date_accessed": "YYYY-MM-DD",
      "content": "Extracted text, facts, quotes, or code snippets",
      "summary": "Brief summary",
      "relevance": "HIGH/MEDIUM/LOW"
    },
    {
      "title": "Source title 2",
      "url": "https://example.com/page2",
      "date_accessed": "YYYY-MM-DD",
      "content": "Extracted text, facts, quotes, or code snippets",
      "summary": "Brief summary",
      "relevance": "HIGH/MEDIUM/LOW"
    }
  ],
  "key_facts": ["Fact 1", "Fact 2"],
  "consensus_points": ["Consensus 1", "Consensus 2"],
  "contradictions": ["Contradiction 1", "Contradiction 2"],
  "gaps": ["Gap 1", "Gap 2"]
}

${COMMON_WARNINGS}

${DOCKER_ENV_TEXT}

${SELF_SUFFICIENCY_TEXT}

NEXT: synthesis
`;

/**
 * Create the content extraction agent
 */
export function createContentExtractionAgent(search_results: any): Agent {
    // Convert search_results to a string if it's an object
    const searchResultsStr =
        typeof search_results === 'object'
            ? JSON.stringify(search_results, null, 2)
            : search_results;

    return new Agent({
        name: 'ContentExtractionAgent',
        description:
            'Navigates websites and extracts relevant content from web pages',
        instructions: content_extraction_agent_prompt.replaceAll(
            '{{search_results}}',
            searchResultsStr
        ),
        tools: [...getFileTools(), ...getBrowserVisionTools()],
        workers: [createBrowserAgent],
        modelClass: 'standard',
    });
}

export default content_extraction_agent_prompt;
