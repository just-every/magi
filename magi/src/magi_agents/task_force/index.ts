/**
 * Task Force for running arbitrary tasks using a series of specialized agents
 *
 * Runs through a series of stages to plan, execute and validate tasks
 */

import {Runner} from '../../utils/runner.js';
import {ResponseInput, ResponseInputMessage, RunnerConfig} from '../../types.js';
import {createExecutionAgent} from './execution_agent.js';
import {createPlanningAgent} from './planning_agent.js';
import {createValidationAgent} from './validation_agent.js';
import {addFileStatus} from '../../utils/file_utils.js';
import {dateFormat} from '../../utils/date_tools.js';

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

export async function taskForceContext(messages: ResponseInput):Promise<ResponseInput> {
	messages.push({
		role: 'developer',
		content: `Current Time: ${dateFormat()}`,
	});
	return addFileStatus(messages);
}

/**
 * Task Force sequence configuration
 */
const taskForce: RunnerConfig = {
	['planning']: {
		agent: ()=> createPlanningAgent(),
		next: (): string => 'execution',
	},
	['execution']: {
		input: (history, lastOutput): ResponseInput => {

			if(lastOutput['planning']) {
				// Only pass the last message from planning to the execution agent
				history = [{
					role: 'developer',
					content: 'Planning Output:\n'+lastOutput['planning'],
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
				const firstMessage = history[0] as ResponseInputMessage;
				history = [{
					role: 'developer',
					content: 'Original Task:\n'+firstMessage.content,
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
