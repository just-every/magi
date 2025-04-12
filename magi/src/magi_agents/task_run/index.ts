/**
 * Task Force for running arbitrary tasks using a series of specialized agents
 *
 * Runs through a series of stages to plan, execute and validate tasks
 */

import {Runner} from '../../utils/runner.js';
import {ResponseInput, RunnerConfig, ToolFunction, TaskCompleteSignal, TaskFatalErrorSignal} from '../../types.js';
import {createToolFunction} from '../../utils/tool_call.js';
import {createOperatorAgent} from './operator_agent.js';
import {addFileStatus} from '../../utils/file_utils.js';
import {dateFormat} from '../../utils/date_tools.js';
import {getCommunicationManager} from '../../utils/communication.js';

// Removed let continueRun = true; - No longer needed

export async function taskForceContext(messages: ResponseInput):Promise<ResponseInput> {
	messages.push({
		role: 'developer',
		content: `Current Time: ${dateFormat()}`,
	});
	return addFileStatus(messages);
}

/**
 * Tool function to signal successful task completion.
 * Throws TaskCompleteSignal instead of returning a string.
 * @param result Description of the successful outcome.
 */
export function task_complete(result: string): never { // Return type 'never' as it always throws
	throw new TaskCompleteSignal(result);
}

/**
 * Tool function to signal a fatal task error.
 * Throws TaskFatalErrorSignal instead of returning a string.
 * @param error Description of the error.
 */
export function task_fatal_error(error: string): never { // Return type 'never' as it always throws
	throw new TaskFatalErrorSignal(error);
}

/**
 * Get all file tools as an array of tool definitions
 */
export function getTaskTools(): ToolFunction[] {
	return [
		createToolFunction(
			task_complete,
			'Report that the task has completed successfully',
			{'result': 'A few paragraphs describing the result of the task. Include any assumptions you made, problems overcome and what the final outcome was.'},
		),
		createToolFunction(
			task_fatal_error,
			'Report that you were not able to complete the task',
			{'error': 'Describe the error that occurred in a few sentences'},
		),
	];
}

/**
 * Task Force sequence configuration
 */
const taskForce: RunnerConfig = {
	['operator']: {
		agent: () => createOperatorAgent(),
		// The 'next' function now always returns 'operator' as termination is handled by signals.
		// The runSequential loop will catch the signal and stop.
		next: (): string => 'operator',
	},
};

/**
 * Run the Task Force sequence with the given input
 * @param input The issue or feature request description
 * @returns The final result string (success or error message) from the task execution.
 */
export async function runTask(
	input: string
): Promise<string> { // Changed return type to string
	// Removed continueRun reset - No longer needed

	try {
		const finalOutput = await Runner.runSequential(
			taskForce,
			input,
			30, // Max retries per stage
			30 // Max total retries
		);
		// If runSequential completes without throwing a signal, it means the loop finished unexpectedly.
		// This shouldn't happen with the current 'next' logic, but handle it defensively.
		console.warn('[TaskRun] runSequential completed without a TaskComplete or TaskFatalError signal.');
		return finalOutput || "Task sequence completed without explicit success/error signal.";
	} catch (error) {

		const comm = getCommunicationManager();
		// Catch the signals thrown by the tools
		if (error instanceof TaskCompleteSignal) {
			console.log(`[TaskRun] Task completed successfully: ${error.result}`);
			comm.send({
				type: 'process_done',
				output: error.result,
				history: error.history,
			});
			return `Task ended successfully\n\n${error.result}`;
		} else if (error instanceof TaskFatalErrorSignal) {
			console.error(`[TaskRun] Task failed: ${error.errorDetails}`);
			comm.send({
				type: 'process_failed',
				error: error.errorDetails,
				history: error.history,
			});
			return `Task failed\n\nError: ${error.errorDetails}`;
		} else {
			// Re-throw unexpected errors
			console.error(`[TaskRun] Unexpected error during task execution:`, error);
			throw error;
		}
	}
}
