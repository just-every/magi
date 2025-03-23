/**
 * File utility functions for the MAGI system.
 */

import fs from 'fs';
import path from 'path';
import {ToolFunction} from '../types.js';
import {createToolFunction} from './tool_call.js';

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
		)
	];
}
