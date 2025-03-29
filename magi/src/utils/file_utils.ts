/**
 * File utility functions for the MAGI system.
 */

import fs from 'fs';
import path from 'path';
import {ToolFunction} from '../types.js';
import {createToolFunction} from './tool_call.js';
import {ModelProviderID} from '../model_providers/model_data.js';

// Global directory path for this process
let processDirectory: string | null = null;

/**
 * Create or get the directory in /magi_output for the current process and a given subdirectory
 * The output dir is where MAGI can write to persistent, isolated storage. It can be accessed by the controller and future MAGI processes.
 *
 * @param subdirectory - The subdirectory to create or access
 * @returns The path to the created directory
 */
export function get_output_dir(subdirectory?: string): string {
	if (!processDirectory) {
		// Create the working directory
		processDirectory = path.join('/magi_output', process.env.PROCESS_ID);
		console.log(`Output directory created: ${processDirectory}`);
	}
	const outputDirectory = subdirectory ? path.join(processDirectory, subdirectory) : processDirectory;
	fs.mkdirSync(outputDirectory, { recursive: true });
	return outputDirectory;
}

/**
 * Convince function to get the working output directory
 * The working directory is where MAGI works with existing code bases
 *
 * @returns The path to the working directory
 */
export function get_working_dir(): string { return get_output_dir('working'); }

/**
 * Move to the working directory for this process and create it if it doesn't exist
 */
export function move_to_working_dir(): void {
	process.chdir(get_working_dir());
}


/**
 * Read a file from the file system
 *
 * @param filePath - Path to the file to read
 * @returns File contents as a string
 */
export function read_file(filePath: string): string {
	try {
		return fs.readFileSync(filePath, 'utf-8');
	} catch (error) {
		throw new Error(`Error reading file ${filePath}: ${error}`);
	}
}

/**
 * Write content to a file
 *
 * @param filePath - Path to write the file to
 * @param content - Content to write to the file
 * @returns Success message with the path
 */
export function write_file(filePath: string, content: string | ArrayBuffer): string {
	try {
		// Ensure the directory exists
		const directory = path.dirname(filePath);
		if (!fs.existsSync(directory)) {
			fs.mkdirSync(directory, {recursive: true});
		}

		// Write the file
		if (typeof content === 'string') {
			fs.writeFileSync(filePath, content, 'utf-8');
		} else {
			// For ArrayBuffer, convert to Buffer and don't specify text encoding
			fs.writeFileSync(filePath, Buffer.from(content));
		}

		return `File written successfully to ${filePath}`;
	} catch (error) {
		throw new Error(`Error writing file ${filePath}: ${error}`);
	}
}

/**
 * Writes content to a file, ensuring the filename is unique.
 * If the initial filePath exists, it appends a counter (e.g., "file (1).txt", "file (2).txt")
 * to the base filename until a unique name is found before writing.
 *
 * @param filePath - The desired initial path to write the file to.
 * @param content - Content to write to the file (string or ArrayBuffer).
 * @returns Success message with the actual path the file was written to.
 * @throws {Error} If there's an error determining the unique path or writing the file.
 */
export function write_unique_file(filePath: string, content: string | ArrayBuffer): string {
	try {
		let uniqueFilePath = filePath;
		let counter = 1;
		const directory = path.dirname(filePath);
		const extension = path.extname(filePath);
		const baseName = path.basename(filePath, extension);

		let unique_info = '';
		// Check if the file exists and find a unique name if it does
		// Use a loop that continues as long as the generated path exists
		while (fs.existsSync(uniqueFilePath)) {
			// Construct the new file path with the counter
			uniqueFilePath = path.join(directory, `${baseName} (${counter})${extension}`);
			counter++;
			unique_info = 'File already exists, updated filename. ';
		}

		// Call the original write_file function with the determined unique path
		// This reuses the directory creation and writing logic.
		return unique_info+write_file(uniqueFilePath, content);

	} catch (error) {
		// Catch potential errors from fs.existsSync or the write_file call
		const err = error instanceof Error ? error : new Error(String(error));
		// Provide more specific context for the error source
		throw new Error(`Error in write_unique_file attempting path ${filePath}: ${err.message}`);
	}
}


/**
 * Mount a directory to the working directory
 *
 * @param sourcePath - The absolute path to the directory to mount
 * @param destName - Optional name for the mounted directory (defaults to basename of sourcePath)
 * @returns Success message or error
 */
export function mount_directory(sourcePath: string, destName?: string): string {
	// Validate source path
	if (!fs.existsSync(sourcePath)) {
		throw new Error(`Error: Source directory ${sourcePath} does not exist`);
	}

	// Determine destination name (use basename of source if not provided)
	const targetName = destName || path.basename(sourcePath);
	const targetPath = path.join(get_working_dir(), targetName);

	// Create target directory if it doesn't exist
	if (!fs.existsSync(targetPath)) {
		fs.mkdirSync(targetPath, { recursive: true });
	}

	fs.cpSync(sourcePath, targetPath, {recursive: true});

	return targetPath;
}

/**
 * Get all file tools as an array of tool definitions
 */
export function getFileTools(): ToolFunction[] {
	return [
		createToolFunction(
			read_file,
			'Read a file from the file system',
			{'filePath': 'Path to the file to read'},
			'File contents as a string'
		),
		createToolFunction(
			write_file,
			'Write content to a file',
			{'filePath': 'Path to write the file to', 'content': 'Content to write to the file'},
			'Success message with the path'
		),
	];
}

/**
 * Log LLM request data to a file in the output directory.
 *
 * @param providerName Name of the LLM provider (e.g., 'openai', 'claude')
 * @param requestData The request data to log
 * @param timestamp Optional timestamp (defaults to current time)
 * @returns Path to the log file
 */
export function log_llm_request(providerName: ModelProviderID, model: string, requestData: any, timestamp: Date = new Date()): string {
	try {
		// Create logs directory if needed
		const logsDir = get_output_dir('logs/llm');

		// Format timestamp for filename
		const formattedTime = timestamp.toISOString().replace(/[:.]/g, '-');
		const fileName = `${formattedTime}_${providerName}.json`;
		const filePath = path.join(logsDir, fileName);

		// Add timestamp to the logged data
		const logData = {
			timestamp: timestamp.toISOString(),
			provider: providerName,
			model,
			request: requestData
		};

		// Write the log file
		fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf8');

		return filePath;
	} catch (err) {
		console.error('Error logging LLM request:', err);
		return '';
	}
}

/**
 * Get all LLM request logs in chronological order.
 *
 * @returns Array of log file paths
 */
export function get_llm_logs(): string[] {
	try {
		const logsDir = get_output_dir('logs/llm');
		if (!fs.existsSync(logsDir)) {
			return [];
		}

		// Get all .json files and sort by name (which includes timestamp)
		const logFiles = fs.readdirSync(logsDir)
			.filter(file => file.endsWith('.json'))
			.sort();

		return logFiles.map(file => path.join(logsDir, file));
	} catch (err) {
		console.error('Error getting LLM logs:', err);
		return [];
	}
}
