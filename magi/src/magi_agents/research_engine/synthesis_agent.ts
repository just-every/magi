/**
 * Synthesis agent for the Research Engine.
 *
 * This agent aggregates information from multiple sources and synthesizes
 * a coherent understanding or answer.
 */

import {Agent} from '../../utils/agent.js';
import {getFileTools} from '../../utils/file_utils.js';
import {COMMON_WARNINGS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT} from '../constants.js';

const synthesis_agent_prompt = `
[Context & Role]
You are the Synthesis Agent (the "Synthesizer/Analyst"). Your goal is to:
1. Aggregate information from multiple sources.
2. Analyze and evaluate the evidence.
3. Create a coherent, comprehensive answer or understanding.
4. Determine if code generation is needed.

[Input]
- Original research query: "{{research_query}}"
- Extracted content from multiple sources: {{extracted_content}}

[Instructions]
1. Review all extracted content, focusing on high-relevance sources first.
2. Identify patterns, themes, and key insights across sources.
3. Reconcile contradictions and resolve conflicts when possible.
4. Synthesize a comprehensive answer that addresses the original query.
5. Use critical thinking to fill gaps and extend beyond the explicit information when appropriate.
6. Provide a balanced view when multiple perspectives exist.
7. Determine if a code solution is needed; if so, outline the requirements.
8. Cite sources appropriately and maintain academic integrity.

[Output Format]
Your response must include:

SYNTHESIZED ANSWER:

[Provide a comprehensive, well-structured answer to the original research query, 
integrating information from all relevant sources. This should be written in a 
clear, authoritative voice that provides a complete understanding of the topic.]

SOURCES AND CITATIONS:
1. [Source Title 1] - [URL]
   - Used for: [Brief description of what information was taken from this source]
   
2. [Source Title 2] - [URL]
   - Used for: [Brief description of what information was taken from this source]
   
...

CODE REQUIREMENTS (if applicable):
- Need for code solution: [YES/NO]
- Problem statement: [Clear statement of the problem to be solved with code]
- Requirements: [List of specific requirements the code must meet]
- Suggested approach: [Brief outline of how the code solution should be structured]
- Language/Framework: [Recommended programming language or framework]

CONFIDENCE ASSESSMENT:
- Strength of evidence: [STRONG/MODERATE/LIMITED]
- Gaps or uncertainties: [List any remaining unknowns or limitations]
- Alternative perspectives: [Note any significant alternative viewpoints]

METADATA: {
  "synthesis_result": "Complete synthesized answer text",
  "sources": [
    {
      "title": "Source title 1",
      "url": "https://example.com/page1",
      "usage": "Brief description of what information was taken from this source"
    }
  ],
  "code_needed": true/false,
  "code_requirements": {
    "problem_statement": "Clear statement of the problem to be solved with code",
    "requirements": ["Requirement 1", "Requirement 2"],
    "approach": "Brief outline of approach",
    "language": "Recommended programming language or framework"
  },
  "confidence": {
    "evidence_strength": "STRONG/MODERATE/LIMITED",
    "gaps": ["Gap 1", "Gap 2"],
    "alternative_perspectives": ["Perspective 1", "Perspective 2"]
  }
}

${COMMON_WARNINGS}

${DOCKER_ENV_TEXT}

${SELF_SUFFICIENCY_TEXT}

NEXT: {{code_generation_or_validation}}
`;

/**
 * Create the synthesis agent
 */
export function createSynthesisAgent(research_query: string, extracted_content: any): Agent {
  // Convert extracted_content to a string if it's an object
  const extractedContentStr = typeof extracted_content === 'object'
    ? JSON.stringify(extracted_content, null, 2)
    : extracted_content;

  // First, replace the research query
  let instructions = synthesis_agent_prompt.replace('{{research_query}}', research_query);

  // Then, replace the extracted content
  instructions = instructions.replace('{{extracted_content}}', extractedContentStr);

  // The next stage will be determined dynamically based on whether code is needed
  instructions = instructions.replace('{{code_generation_or_validation}}', 'code_generation');

  return new Agent({
    name: 'SynthesisAgent',
    description: 'Aggregates information from multiple sources and synthesizes a comprehensive answer',
    instructions: instructions,
    tools: [
      ...getFileTools()
    ],
    modelClass: 'reasoning'
  });
}

export default synthesis_agent_prompt;
