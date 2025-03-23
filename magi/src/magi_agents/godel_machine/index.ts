/**
 * Gödel Machine module for structured code editing.
 *
 * This module exports a collection of agents that work in a series to handle
 * all stages of the code-editing workflow: Planning, Writing, Testing, PR Submission, and Review.
 */

import {Runner} from '../../utils/runner.js';
import {RunResult} from '../../types.js';
import {createPlanningAgent} from './planning_agent.js';
import {createWritingAgent} from './writing_agent.js';
import {createTestingAgent} from './testing_agent.js';
import {createPRSubmissionAgent} from './pr_submission_agent.js';
import {createPRReviewAgent} from './pr_review_agent.js';

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
 * @param issue_description The issue or feature request description
 * @param issue_number Optional issue number for PR reference
 * @returns An object with factory functions for each agent in the sequence
 */
export function createGodelMachine(issue_description: string, issue_number?: string) {
	return {
		// Each stage returns a factory function that optionally takes metadata from previous stages
		[GodelStage.PLANNING]: () => createPlanningAgent(issue_description),
		[GodelStage.WRITING]: (metadata?: any) => {
			// Writing agent needs the plan document from the planning stage
			const plan_document = metadata?.plan_document || '';
			return createWritingAgent(plan_document);
		},
		[GodelStage.TESTING]: () => createTestingAgent(),
		[GodelStage.PR_SUBMISSION]: () => createPRSubmissionAgent(issue_description, issue_number),
		[GodelStage.PR_REVIEW]: (metadata?: any) => {
			// PR Review agent can use PR details from the submission stage
			const pr_details = metadata?.pr_details || '';
			return createPRReviewAgent(issue_description, pr_details);
		}
	};
}

/**
 * Run the Gödel Machine sequence with the given input
 * @param issue_description The issue or feature request description
 * @param issue_number Optional issue number for PR reference
 * @param handlers Event handlers for streaming events
 * @returns Results from all stages of the sequence
 */
export async function runGodelMachine(
	issue_description: string,
	issue_number?: string,
	handlers: {
		onEvent?: (event: any, stage: string) => void,
		onResponse?: (content: string, stage: string) => void,
		onStageComplete?: (stage: string, result: RunResult) => void,
		onComplete?: (allResults: Record<string, RunResult>) => void
	} = {}
): Promise<Record<string, RunResult>> {
	// Create the Gödel Machine agents
	const godelMachine = createGodelMachine(issue_description, issue_number);

	// Run the sequence starting with the planning stage
	return await Runner.runSequential(
		godelMachine,
		issue_description, // Initial input is the issue description
		GodelStage.PLANNING, // Start with the planning stage
		3, // Max retries per stage
		10, // Max total retries
		handlers
	);
}
