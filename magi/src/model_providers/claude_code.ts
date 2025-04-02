/**
 * Claude Code model provider for the MAGI system.
 *
 * This module uses claude-cli to run the Claude AI coding tool via its command-line interface.
 */

import {v4 as uuidv4} from 'uuid';
import {
	ModelProvider,
	StreamingEvent,
	ResponseInput
} from '../types.js';
import { costTracker } from '../utils/cost_tracker.js';
import pty from 'node-pty';
import {get_working_dir, log_llm_request} from '../utils/file_utils.js';

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

	// Log the request before sending
	log_llm_request('anthropic', 'claude-code', {
		prompt,
		working_directory: cwd
	});

	return new Promise<string>((resolve, reject) => {
		let stdoutData = '';
		const command = 'claude';
		const args = [
			'--print',
			'--json', // Ensure JSON output is requested
			'--dangerously-skip-permissions',
			'-p', prompt
		];

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
							costTracker.addUsage({
								model: 'claude-cli',
								cost,
							});
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
 * Claude Code provider implementation
 */
export class ClaudeCodeProvider implements ModelProvider {

	/**
	 * Create a completion using Claude Code
	 */
	async* createResponseStream(
		model: string,
		messages: ResponseInput,
	): AsyncGenerator<StreamingEvent> {
		try {
			const prompt = messages.map(msg => {
				if ('content' in msg) {
					if (typeof msg.content === 'string') {
						return msg.content;
					} else if ('text' in msg.content && typeof msg.content.text === 'string') {
						return msg.content.text;
					}
				}
				return '';
			}).join('\n\n');

			const content = await runClaudeCLI(prompt, get_working_dir());
			yield {
				type: 'message_complete',
				content,
				message_id: uuidv4()
			};

		} catch (error: any) {
			console.error('Claude Code Error', error);

			yield {
				type: 'error',
				error: 'Claude code error: '+(error instanceof Error ? error.stack : String(error))
			};
		}
	}
}

// Export an instance of the provider
export const claudeCodeProvider = new ClaudeCodeProvider();
