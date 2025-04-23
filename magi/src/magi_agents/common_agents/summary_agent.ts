/**
 * SummaryAgent for the MAGI system.
 *
 * This agent specializes summarizing documents and extracting key information.
 */

import { Agent } from '../../utils/agent.js';

/**
 * Create the reasoning agent
 */
export function createSummaryAgent(
    context: string,
    length = 'less than 20% of the original in length and less then 600 words (whichever is smaller)'
): Agent {
    return new Agent({
        name: 'SummaryAgent',
        description:
            'Expert at summarizing documents and extracting key information',
        instructions: `Summarize the key factual information and vital warnings from the following document for consumption by another LLM. Aim for a summary length of ${length}, but prioritize including all essential details. Output *only* the summary text.

${context}`,
        modelClass: 'summary', // low cost, high context extraction models
    });
}
