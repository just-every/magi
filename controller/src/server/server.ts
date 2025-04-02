/**
 * MAGI System Server - Main Entry Point
 *
 * This is the main server module that:
 * - Provides a web interface via Express
 * - Handles WebSocket communication with the client
 * - Manages Docker containers that run the MAGI Python backend
 * - Streams logs and command results to the client
 */


// Import dotenv to load environment variables
import * as dotenv from 'dotenv';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

// Configure dotenv with the specific path relative to this file
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import {ServerManager} from './managers/server_manager';
import {initColorManager} from './managers/color_manager';

/**
 * Initialize and start the MAGI System server
 */
async function main(): Promise<void> {

	// Check OpenAI API key
	if (!process.env.OPENAI_API_KEY) {
		console.warn('\n⚠ OPENAI_API_KEY not set. Voice disabled.\n');
	}
	// Initialize color manager
	initColorManager();

	// Create and start the server
	const serverManager = new ServerManager();
	await serverManager.start();
}

// Start the application
main().catch(error => {
	console.error('Failed to start MAGI System:', error);
	process.exit(1);
});
