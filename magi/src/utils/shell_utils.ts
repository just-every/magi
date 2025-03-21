/**
 * Shell utility functions for the MAGI system.
 *
 * This module provides tools for shell command execution and system operations.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import {ToolFunction} from '../types.js';
import {createToolFunction} from './tool_call.js';

// Promisify exec for async/await usage
const execAsync = promisify(exec);

/**
 * Execute a shell command and get the output
 *
 * @param command - The shell command to execute
 * @returns Command output and error if any
 */
export async function execute_command(command: string): Promise<string> {
  try {
    // Check for potentially dangerous commands
    const dangerousCommands = [
      'rm -rf', 'mkfs', 'dd', 'sudo', 'su', 'chmod 777'
    ];

    for (const dangerous of dangerousCommands) {
      if (command.includes(dangerous)) {
        return `Potentially dangerous command detected: "${dangerous}". Command execution aborted.`;
      }
    }

    // Execute the command
    const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 });

    const output = stdout.trim();
    return output || `Command executed: ${command} (no output)`;
  } catch (error: any) {
    console.error(`Error executing command "${command}":`, error);
    return `Error executing command: ${error?.message || String(error)}${error?.stderr ? '\nStderr: ' + error.stderr : ''}`;
  }
}

/**
 * List files and directories in the specified path
 *
 * @param directory - Directory path to list
 * @returns List of files and directories
 */
export async function list_directory(directory: string): Promise<string> {
  try {
    // Read the directory
    const files = fs.readdirSync(directory);

    // Get file stats for each entry
    const filesWithInfo = await Promise.all(
      files.map(async (file) => {
        const fullPath = `${directory}/${file}`;
        try {
          const stats = fs.statSync(fullPath);
          return {
            name: file,
            path: fullPath,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        } catch (error) {
          // If we can't stat a file, just return the name
          return {
            name: file,
            path: fullPath,
            isDirectory: false,
            size: 0,
            modified: new Date().toISOString()
          };
        }
      })
    );

    return JSON.stringify(filesWithInfo);
  } catch (error: any) {
    console.error(`Error listing directory ${directory}:`, error);
    return `Error listing directory: ${error?.message || String(error)}`;
  }
}

/**
 * Get all shell tools as an array of tool definitions
 */
export function getShellTools(): ToolFunction[] {
  return [
    createToolFunction(
      execute_command,
      'Execute a shell command and get the output',
      {'command': 'The shell command to execute'},
      'Command output and error if any'
    ),
    createToolFunction(
      list_directory,
      'List files and directories in the specified path',
      {'directory': 'Directory path to list'},
      'List of files and directories'
    ),
  ];
}
