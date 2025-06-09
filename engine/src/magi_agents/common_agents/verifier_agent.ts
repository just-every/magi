import { Agent } from '@just-every/ensemble';
/**
 * Verifier agent for checking research citations.
 */

import { getCommonTools } from '../../utils/index.js';
import { getSearchTools } from '../../utils/search_utils.js';
import { MAGI_CONTEXT, COMMON_WARNINGS } from '../constants.js';

/**
 * Create the verifier agent used in research workflows.
 */
export function createVerifierAgent(): Agent {
    return new Agent({
        name: 'VerifierAgent',
        description: 'Validates research citations against gathered evidence.',
        instructions: `${MAGI_CONTEXT}
---
You are **VerifierAgent**.
Your job is to ensure that every claim in RESEARCH_REPORT.md is backed by evidence in research_notes.json.
Cross-check citations, flag mismatches, and suggest corrections.
${COMMON_WARNINGS}`,
        tools: [...getSearchTools(), ...getCommonTools()],
        modelClass: 'reasoning_mini',
    });
}
