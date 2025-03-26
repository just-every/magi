/**
 * Code agent for the MAGI system.
 *
 * This agent specializes in writing, explaining, and modifying code using the Claude CLI.
 */

import * as pty from 'node-pty'; // <--- Import node-pty
import { Agent } from '../../utils/agent.js';
import { getFileTools } from '../../utils/file_utils.js';
import { COMMON_WARNINGS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT } from '../constants.js';
import { createToolFunction } from '../../utils/tool_call.js';
import { costTracker } from '../../utils/cost_tracker.js';

// Regex to strip ANSI escape codes (covers common CSI sequences)
// eslint-disable-next-line no-control-regex
const ansiRegex = /\x1b\[[?0-9;]*[a-zA-Z]/g;

/**
 * Run Claude CLI with a prompt using node-pty for terminal emulation.
 * Parses the JSON output, logs the cost, and returns only the result string.
 *
 * @param prompt - The prompt to send to Claude
 * @param working_directory - Optional working directory for file operations
 * @returns The string content of the "result" field from the Claude CLI JSON output.
 */
async function runClaudeCLI(prompt: string, working_directory?: string): Promise<string> {
	const cwd = working_directory || process.cwd();
	console.log('[CodeAgent] Running Claude CLI via node-pty');
	console.log(`[CodeAgent] CWD: ${cwd}`);

	return new Promise<string>((resolve, reject) => {
		let stdoutData = '';
		const command = 'claude';
		const args = [
			'--print',
			'--json', // Ensure JSON output is requested
			'--dangerously-skip-permissions',
			'-p', prompt
		];

		console.log(`[CodeAgent] Spawning: ${command} ${args.join(' ')}`);

		try {
			const ptyProcess: pty.IPty = pty.spawn(command, args, {
				name: 'xterm-color',
				cols: 80, // Basic terminal size
				rows: 30,
				cwd: cwd,
				env: process.env
			});

			// Collect all output
			ptyProcess.onData((data: string) => {
				stdoutData += data;
			});

			// Handle process exit
			ptyProcess.onExit(({ exitCode, signal }) => {
				console.log(`[CodeAgent] Claude process exited with code ${exitCode}, signal ${signal}`);

				if (exitCode === 0) {
					// Process succeeded, now parse the output
					try {
						// 1. Clean ANSI codes and trim whitespace
						const cleanedOutput = stdoutData.replace(ansiRegex, '').trim();
						console.log(`[CodeAgent] Cleaned Claude CLI output (start): ${cleanedOutput.substring(0,150)}...`);

						// 2. Parse the cleaned output as JSON
						const parsedJson = JSON.parse(cleanedOutput);

						// 3. Extract data and log cost
						const result = parsedJson.result;
						const cost = parsedJson.cost_usd;

						// Log the cost if available and track it in the global cost tracker
						if (typeof cost === 'number') {
							console.log(`[CodeAgent] Claude run cost: $${cost.toFixed(6)}`); // Format cost
							costTracker.addCost('anthropic', 'claude-cli', cost);
						}

						// 4. Validate and resolve with the result string
						if (typeof result === 'string') {
							resolve(result);
						} else {
							// Reject if 'result' key is missing or not a string
							reject(new Error('Parsed JSON response from Claude CLI does not contain a valid "result" string.'));
						}
					} catch (parseError: any) {
						// Handle errors during cleaning or JSON parsing
						console.error(`[CodeAgent] Failed to parse JSON from Claude CLI output. Error: ${parseError.message}`);
						console.error(`[CodeAgent] Raw output before cleaning (last 500 chars):\n${stdoutData.slice(-500)}`);
						reject(new Error(`Failed to parse JSON response from Claude CLI: ${parseError.message}.`));
					}
				} else {
					// Process failed (non-zero exit code)
					const errorMsg = `Claude CLI process exited with code ${exitCode}${signal ? ` (signal ${signal})` : ''}. Output tail:\n${stdoutData.slice(-500)}`;
					console.error(`[CodeAgent] ${errorMsg}`);
					reject(new Error(errorMsg));
				}
			});

		} catch (error: any) {
			// Catch synchronous errors during spawn (e.g., command not found)
			console.error('[CodeAgent] Error spawning PTY process:', error);
			if (error.code === 'ENOENT') {
				reject(new Error(`Claude CLI not available (command not found: ${command}). Make sure it's installed and in the PATH.`));
			} else {
				reject(new Error(`Error spawning PTY process: ${error?.message || String(error)}`));
			}
		}
	});
}

/**
 * Runs AICoder with the provided prompt to execute coding tasks using the Claude CLI via node-pty.
 * Handles fallback if the CLI is unavailable or fails.
 *
 * @param prompt - The coding task or question to process
 * @param working_directory - Optional working directory for file operations
 * @returns The response (either from Claude CLI's "result" field or a fallback message).
 */
async function AICoder(prompt: string, working_directory?: string): Promise<string> {
	try {
		console.log(`[CodeAgent] AICoder called with prompt: ${prompt.substring(0, 100)}...`);
		console.log(`[CodeAgent] Working directory: ${working_directory || 'not specified'}`);

		// runClaudeCLI now returns only the 'result' string on success
		// or rejects on any error (spawn, non-zero exit, parse failure, missing result key)
		const result = await runClaudeCLI(prompt, working_directory);

		console.log(`[CodeAgent] AICoder succeeded via Claude CLI, received result (${result.length} chars)`);
		return result; // Return the clean result string directly

	} catch (error: any) {
		// Catch rejections from runClaudeCLI
		console.error('[CodeAgent] Error executing or processing Claude CLI via node-pty:', error);

		const errorMessage = error?.message || String(error);

		// Handle specific 'not available' case from rejection
		if (errorMessage.includes('Claude CLI not available') || errorMessage.includes('command not found')) {
			console.log('[CodeAgent] Falling back to regular agent functionality (CLI not found)');
			// Provide a user-friendly fallback message
			return "I attempted to use the specialized Claude CLI tool, but it seems it's not available in this environment.";
		}

		// Handle other errors (non-zero exit, parse errors, missing result key, etc.)
		console.log('[CodeAgent] Falling back to regular agent functionality (CLI error)');
		// Provide a user-friendly fallback message including the error context
		return `I encountered an issue while trying to use the specialized Claude CLI tool: ${errorMessage}`;
	}
}

/**
 * Create the code agent
 */
export function createCodeAgent(): Agent {
	return new Agent({
		name: 'CodeAgent',
		description: 'Specialized in writing, explaining, and modifying code in any language',
		instructions: `You manage the tool \`AICoder\`.

Your \`AICoder\` tool uses the advanced Claude AI via its command-line interface to handle complex coding tasks. Think of it as a senior developer expert in all programming languages and frameworks. It can write, modify, explain, run, and test code.

You work with \`AICoder\` to get the job done. In most cases you should just pass your instructions on to \`AICoder\` and let it do the work. If there's an error you can try again until it completes the task.

**\`AICoder\` only knows the information you provide it in each \`prompt\`, and can read the file system at the \`working_directory\` - it has no additional context.** Please give \`AICoder\` all the information it needs to complete the task in your prompt. \`AICoder\` does not know what previous prompts were sent to it. You should summarize these before passing them to \`AICoder\` if you want it to have context.

${DOCKER_ENV_TEXT}

${FILE_TOOLS_TEXT}

${SELF_SUFFICIENCY_TEXT}

${COMMON_WARNINGS}`,
		tools: [
			...getFileTools(),
			createToolFunction(
				AICoder,
				'Runs the advanced Claude CLI AI coding tool with the provided prompt to execute any coding tasks, no matter how complicated.', // Updated description
				{
					'prompt': 'The coding task or question to process',
					'working_directory': 'Optional working directory for file operations relative to the project root.' // Added clarity
				},
				'The resulting code, explanation, or output from the Claude CLI.' // Updated description
			)
		],
		modelClass: 'mini',
	}, {
		tool_choice: 'required'
	});
}

// Export the AICoder function for tool implementation
export { AICoder };
