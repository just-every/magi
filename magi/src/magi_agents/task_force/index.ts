/**
 * Task Force for running arbitrary tasks using a series of specialized agents
 *
 * Runs through a series of stages to plan, execute and validate tasks
 */

import {Runner} from '../../utils/runner.js';
import {ResponseInput, RunnerConfig} from '../../types.js';
import {createExecutionAgent} from './execution_agent.js';
import {createPlanningAgent} from './planning_agent.js';
import {createValidationAgent} from './validation_agent.js';

/**
 * Extracts execution and validation plans from planning agent output
 * @param planOutput The output from the planning agent
 * @returns Object with extracted plans or the original plan if malformed
 */
function extractPlans(planOutput: string): {
	executionPlan?: string;
	validationPlan?: string;
	isWellFormed: boolean;
	originalPlan: string;
} {
	// Store original plan for fallback
	const originalPlan = planOutput;

	// Normalize line endings and split by section markers
	const normalizedOutput = planOutput.replace(/\r\n/g, '\n');
	const sections = normalizedOutput.split(/\s*-{3,10}\s*/).filter(section => section.trim());

	let executionPlan: string | undefined;
	let validationPlan: string | undefined;

	// Look for plan sections with flexible matching
	for (const section of sections) {
		const trimmedSection = section.trim();

		if (/^EXECUTION\s+PLAN\s*:/i.test(trimmedSection)) {
			executionPlan = trimmedSection.replace(/^EXECUTION\s+PLAN\s*:/i, '').trim();
		} else if (/^VALIDATION\s+PLAN\s*:/i.test(trimmedSection)) {
			validationPlan = trimmedSection.replace(/^VALIDATION\s+PLAN\s*:/i, '').trim();
		}
	}

	// Check if both plans were successfully extracted
	const isWellFormed = !!executionPlan && !!validationPlan;

	return {
		executionPlan,
		validationPlan,
		isWellFormed,
		originalPlan
	};
}

function parsePlan(planOutput: string, type: string): string {
	const plans = extractPlans(planOutput);
	if(type === 'execution' && plans.executionPlan) {
		return plans.executionPlan;
	}
	else if(type === 'validation' && plans.validationPlan) {
		return plans.validationPlan;
	}
	return plans.originalPlan;
}

function parseValidation(output: string): string | null {
	// Normalize the output: trim whitespace and convert to lowercase for case-insensitive matching
	const normalizedOutput = output.trim().toLowerCase();

	// Check for pass/fail regardless of exact formatting
	if (/\b(result|results)?\s*:?\s*(pass|success|correct|valid|yes)\b/i.test(normalizedOutput)) {
		// Validation passed, end the sequence
		return null;
	} else if (/\b(result|results)?\s*:?\s*(fail|error|problem|invalid|no)\b/i.test(normalizedOutput)) {
		// Validation failed, loop back to planning
		return 'planning';
	}

	// Try to extract any pass/fail indicators in the text
	const hasFail = normalizedOutput.includes('fail') ||
		normalizedOutput.includes('error') ||
		normalizedOutput.includes('problem');

	if (hasFail) {
		console.warn('Validation output format irregular, but failure detected:', output);
		return 'planning';
	}

	// If no clear indication, assume format error and end sequence
	console.error('Repeating validation. Invalid validation output format:', output);
	return 'validation';
}

/**
 * Task Force sequence configuration
 */
const taskForce: RunnerConfig = {
	['planning']: {
		agent: ()=> createPlanningAgent(),
		next: (output: string): string => {
			const plans = extractPlans(output);
			if(!plans.isWellFormed) {
				console.error('Repeating planning output due to irregular format:', output);
				return 'planning';
			}
			return 'execution';
		},
	},
	['execution']: {
		input: (history, lastOutput): ResponseInput => {

			if(lastOutput['planning']) {
				// Only pass the last message from planning to the execution agent
				history = [{
					role: 'developer',
					content: 'Planning Output:\n'+parsePlan(lastOutput['planning'], 'execution'),
				}];
			}

			return history;
		},
		agent: ()=> createExecutionAgent(),
		next: (): string => 'validation',
	},
	['validation']: {
		input: (history, lastOutput): ResponseInput => {

			if(lastOutput['planning'] && lastOutput['execution']) {
				// Only pass the last message from planning to the validation agent
				history = [{
					role: 'developer',
					content: 'Planning Output:\n'+parsePlan(lastOutput['planning'], 'validation'),
				}];

				// Only pass the last message from execution to the validation agent
				history.push({
					role: 'developer',
					content: 'Execution Output:\n'+lastOutput['execution'],
				});
			}

			return history;
		},
		agent: ()=> createValidationAgent(),
		next: parseValidation,
	},
};

/**
 * Run the Task Force sequence with the given input
 * @param input The issue or feature request description
 * @returns Results from all stages of the sequence
 */
export async function runTaskForce(
	input: string
): Promise<void> {

	await Runner.runSequential(
		taskForce,
		input,
		5, // Max retries per stage
		30 // Max total retries
	);
}
