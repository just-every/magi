/**
 * Research Engine module for deep research.
 *
 * This module exports a collection of agents that work in parallel and sequence to handle
 * all stages of the deep research workflow: Task Decomposition, Web Search, Content Extraction,
 * Synthesis, Code Generation, and Validation.
 */

import {Runner} from '../../utils/runner.js';
import {RunnerConfig} from '../../types.js';
import {createTaskDecompositionAgent} from './task_decomposition_agent.js';
import {createWebSearchAgent} from './web_search_agent.js';
import {createContentExtractionAgent} from './content_extraction_agent.js';
import {createSynthesisAgent} from './synthesis_agent.js';
import {createCodeGenerationAgent} from './code_generation_agent.js';
import {createValidationAgent} from './validation_agent.js';
// import {createPlanningAgent} from '../task_force/planning_agent.js';
import {createExecutionAgent} from '../task_force/execution_agent.js';

export {
  createTaskDecompositionAgent,
  createWebSearchAgent,
  createContentExtractionAgent,
  createSynthesisAgent,
  createCodeGenerationAgent,
  createValidationAgent
};

// Define the stage sequence for the Research Engine
export enum UnderstandingStage {
  TASK_DECOMPOSITION = 'task_decomposition',
  WEB_SEARCH = 'web_search',
  CONTENT_EXTRACTION = 'content_extraction',
  SYNTHESIS = 'synthesis',
  CODE_GENERATION = 'code_generation',
  VALIDATION = 'validation'
}

/**
 * Create a complete Research Engine with all agents in the sequence
 * @param query The research query or question
 * @returns An object with factory functions for each agent in the sequence
 */
export function createUnderstandingEngine(query: string) {
  return {
    // Each stage returns a factory function that optionally takes metadata from previous stages
    [UnderstandingStage.TASK_DECOMPOSITION]: () => createTaskDecompositionAgent(query),
    [UnderstandingStage.WEB_SEARCH]: (metadata?: any) => {
      // Search agent needs the research plan from the task decomposition stage
      const research_plan = metadata?.research_plan || '';
      return createWebSearchAgent(research_plan);
    },
    [UnderstandingStage.CONTENT_EXTRACTION]: (metadata?: any) => {
      // Content extraction agent needs the search results from the web search stage
      const search_results = metadata?.search_results || [];
      return createContentExtractionAgent(search_results);
    },
    [UnderstandingStage.SYNTHESIS]: (metadata?: any) => {
      // Synthesis agent needs the extracted content from the content extraction stage
      const extracted_content = metadata?.extracted_content || [];
      return createSynthesisAgent(query, extracted_content);
    },
    [UnderstandingStage.CODE_GENERATION]: (metadata?: any) => {
      // Code generation agent needs the synthesis result if code is required
      const synthesis_result = metadata?.synthesis_result || '';
      return createCodeGenerationAgent(synthesis_result);
    },
    [UnderstandingStage.VALIDATION]: (metadata?: any) => {
      // Validation agent needs the synthesis result and code (if any)
      const synthesis_result = metadata?.synthesis_result || '';
      const code_result = metadata?.code_result || '';
      return createValidationAgent(query, synthesis_result, code_result);
    }
  };
}


/**
 * Task Force sequence configuration
 */
const researchEngine: RunnerConfig = {
  ['task_decomposition']: {
    agent: ()=> createTaskDecompositionAgent(),
    next: (): string => 'web_search',
  },
  ['web_search']: {
    agent: ()=> createExecutionAgent(), // createWebSearchAgent
    next: (): string => 'content_extraction',
  },
  ['content_extraction']: {
    agent: ()=> createExecutionAgent(), //createContentExtractionAgent
    next: (): string => 'synthesis',
  },
  ['synthesis']: {
    agent: ()=> createExecutionAgent(), // createSynthesisAgent
    next: (): string => 'code_generation',
  },
  ['code_generation']: {
    agent: ()=> createExecutionAgent(), //createCodeGenerationAgent
    next: (): string => 'web_search',
  },
  ['validation']: {
    agent: ()=> createExecutionAgent(), //createValidationAgent
    next: (): null => null,
  },
};

/**
 * Run the Research Engine sequence with the given query
 * @param query The research query or question
 * @returns Results from all stages of the sequence
 */
export async function runResearchEngine(
    input: string
): Promise<void> {

  await Runner.runSequential(
      researchEngine,
      input,
      5, // Max retries per stage
      30 // Max total retries
  );
}
