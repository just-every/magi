/**
 * Gödel Machine module for structured code editing.
 *
 * This module exports a collection of agents that work in a series to handle
 * all stages of the code-editing workflow: Planning, Writing, Testing, PR Submission, and Review.
 *
 * It also provides a TDD-based orchestrator that implements the Test-Driven Development workflow
 * for more disciplined and testable code development.
 */

import { Runner } from '../../utils/runner.js';
import { RunnerConfig } from '../../types/shared-types.js';
import { createPlanningAgent } from './planning_agent.js';
import { createWritingAgent } from './writing_agent.js';
import { createTestingAgent } from './testing_agent.js';
import { createPRSubmissionAgent } from './pr_submission_agent.js';
import { createPRReviewAgent } from './pr_review_agent.js';
import { TddGodelOrchestrator } from './tdd_orchestrator.js';

export {
    createPlanningAgent,
    createWritingAgent,
    createTestingAgent,
    createPRSubmissionAgent,
    createPRReviewAgent,
    TddGodelOrchestrator,
};

// Define the stage sequence for the Gödel Machine
export enum GodelStage {
    PLANNING = 'planning',
    WRITING = 'writing',
    TESTING = 'testing',
    PR_SUBMISSION = 'pr_submission',
    PR_REVIEW = 'pr_review',
    TDD = 'tdd', // Test-Driven Development workflow
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
        },
    };
}

/**
 * Godel Machine sequence configuration
 */
const godelMachine: RunnerConfig = {
    ['planning']: {
        agent: () => createPlanningAgent(''),
        next: (): string => 'writing',
    },
    ['writing']: {
        agent: () => createWritingAgent(''),
        next: (): string => 'testing',
    },
    ['testing']: {
        agent: () => createTestingAgent(), //createContentExtractionAgent
        next: (): string => 'pr_submission',
    },
    ['pr_submission']: {
        agent: () => createPRSubmissionAgent(''), // createSynthesisAgent
        next: (): string => 'pr_review',
    },
    ['pr_review']: {
        agent: () => createPRReviewAgent('', ''), //createValidationAgent
        next: (): null => null,
    },
};

/**
 * Run the Gödel Machine sequence with the given input
 * @param input The issue or feature request description
 * @param useTDD Whether to use the TDD workflow instead of the standard workflow
 * @returns Results from all stages of the sequence
 */
export async function runGodelMachine(
    input: string,
    useTDD: boolean = false
): Promise<void> {
    if (useTDD) {
        // Use the TDD Orchestrator for a test-driven development workflow
        console.log('Starting TDD Gödel Machine workflow...');
        const tddOrchestrator = new TddGodelOrchestrator(input);
        const report = await tddOrchestrator.execute();
        console.log('TDD workflow complete');
        console.log(report);
        return;
    }

    // Use the standard Gödel Machine workflow
    console.log('Starting standard Gödel Machine workflow...');
    await Runner.runSequential(
        godelMachine,
        input,
        5, // Max retries per stage
        30 // Max total retries
    );
}

/**
 * Create a TDD Gödel Orchestrator for test-driven development workflow
 * @param goal The goal or feature request description
 * @returns A TDD orchestrator instance ready to execute
 */
export function createTddOrchestrator(goal: string): TddGodelOrchestrator {
    return new TddGodelOrchestrator(goal);
}
