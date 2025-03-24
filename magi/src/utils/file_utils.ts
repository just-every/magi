/**
 * File utility functions for the MAGI system.
 */

import fs from 'fs';
import path from 'path';
import {exec} from 'child_process';
import {promisify} from 'util';
import {ToolFunction} from '../types.js';
import {createToolFunction} from './tool_call.js';

const execPromise = promisify(exec);

// Global directory path for this process
let processDirectory: string | null = null;

/**
 * Create or get the directory in /magi_output for the current process and a given subdirectory
 * The output dir is where MAGI can write to persistent, isolated storage. It can be accessed by the controller and future MAGI processes.
 *
 * @param subdirectory - The subdirectory to create or access
 * @returns The path to the created directory
 */
export function get_output_dir(subdirectory: string): string {
	if (!processDirectory) {
		// Create the working directory
		processDirectory = path.join('/magi_output', process.env.PROCESS_ID);
		console.log(`Output directory created: ${processDirectory}`);
	}
	const outputDirectory = path.join(processDirectory, subdirectory);
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
 * Mount the MAGI code directory for editing
 */
export function mount_magi_code() {
	// Mount the magi-system directory for editing
	mount_directory('/magi-system');
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
