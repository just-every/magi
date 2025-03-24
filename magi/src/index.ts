/**
 * Simple test script for the TypeScript MAGI system
 */

import 'dotenv/config';
import {runCommand} from './magi.js';

// Default prompt to test with
const DEFAULT_PROMPT = 'Tell me a short story about a robot named MAGI who helps humans solve problems.';

// Get prompt from command line args if provided
const args = process.argv.slice(2);
const prompt = args.length > 0 ? args.join(' ') : DEFAULT_PROMPT;

// Execute the prompt with the supervisor agent
async function main() {
	console.log(`Running prompt: ${prompt}`);
	console.log('-'.repeat(80));

	try {
		// Check if environment variables are properly configured
		if (!process.env.OPENAI_API_KEY) {
			console.error('Error: OPENAI_API_KEY environment variable is not set.');
			console.error('Please set this variable with your OpenAI API key before running.');
			return;
		}

		// Process the command
		const result = await runCommand(prompt);
		console.log('\nResult:');
		console.log(result);
	} catch (error) {
		console.error('Error running prompt:', error);
		// Log additional context for troubleshooting
		if (error instanceof Error) {
			console.error('Error details:', error.message);
			console.error('Stack trace:', error.stack);
		}
	}
}

// Run the main function
main().catch(console.error);
