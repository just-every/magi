/**
 * Gödel Machine module for structured code editing.
 *
 * This module exports a collection of agents that work in a series to handle
 * all stages of the code-editing workflow: Planning, Writing, Testing, PR Submission, and Review.
 */

import {Runner} from '../../utils/runner.js';
import {RunnerConfig} from '../../types.js';
import {createPlanningAgent} from './planning_agent.js';
import {createWritingAgent} from './writing_agent.js';
import {createTestingAgent} from './testing_agent.js';
import {createPRSubmissionAgent} from './pr_submission_agent.js';
import {createPRReviewAgent} from './pr_review_agent.js';
// import {createExecutionAgent} from '../task_force/execution_agent.js';

export {
	createPlanningAgent,
	createWritingAgent,
	createTestingAgent,
	createPRSubmissionAgent,
	createPRReviewAgent
};

// Define the stage sequence for the Gödel Machine
export enum GodelStage {
	PLANNING = 'planning',
	WRITING = 'writing',
	TESTING = 'testing',
	PR_SUBMISSION = 'pr_submission',
	PR_REVIEW = 'pr_review'
}

/**
 * Create a complete Gödel Machine with all agents in the sequence
 * @param input The issue or feature request description
 * @returns An object with factory functions for each agent in the sequence
 */
export function createGodelMachine(input: string) {
	return {
		// Each stage returns a factory function that optionally takes metadata from previous stages
		[GodelStage.PLANNING]: () => createPlanningAgent(input),
		[GodelStage.WRITING]: (metadata?: any) => {
			// Writing agent needs the plan document from the planning stage
			const plan_document = metadata?.plan_document || '';
			return createWritingAgent(plan_document);
		},
		[GodelStage.TESTING]: () => createTestingAgent(),
		[GodelStage.PR_SUBMISSION]: () => createPRSubmissionAgent(input),
		[GodelStage.PR_REVIEW]: (metadata?: any) => {
			// PR Review agent can use PR details from the submission stage
			const pr_details = metadata?.pr_details || '';
			return createPRReviewAgent(input, pr_details);
		}
	};
}



/**
 * Godel Machine sequence configuration
 */
const godelMachine: RunnerConfig = {
	['planning']: {
		agent: ()=> createPlanningAgent(''),
		next: (): string => 'writing',
	},
	['writing']: {
		agent: ()=> createWritingAgent(''),
		next: (): string => 'testing',
	},
	['testing']: {
		agent: ()=> createTestingAgent(), //createContentExtractionAgent
		next: (): string => 'pr_submission',
	},
	['pr_submission']: {
		agent: ()=> createPRSubmissionAgent(''), // createSynthesisAgent
		next: (): string => 'pr_review',
	},
	['pr_review']: {
		agent: ()=> createPRReviewAgent('',''), //createValidationAgent
		next: (): null => null,
	},
};

/**
 * Run the Gödel Machine sequence with the given input
 * @param input The issue or feature request description
 * @param handlers Event handlers for streaming events
 * @returns Results from all stages of the sequence
 */
export async function runGodelMachine(
	input: string
): Promise<void> {

	await Runner.runSequential(
		godelMachine,
		input,
		5, // Max retries per stage
		30 // Max total retries
	);
}
