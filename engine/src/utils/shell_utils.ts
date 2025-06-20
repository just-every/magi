/**
 * Shell utility functions for the MAGI system.
 *
 * This module provides tools for shell command execution and system operations.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { ToolFunction, createToolFunction } from '@just-every/ensemble';

// Promisify exec for async/await usage
const execFileAsync = promisify(execFile);

/**
 * Execute a shell command and get the output
 *
 * @param command - The shell command to execute
 * @returns Command output and error if any
 */
export async function execute_command(rawCommand: string): Promise<string> {
    // Reject dangerous patterns (token-wise)
    // @todo add a more sophisticated parser to detect dangerous commands
    const killList = [/^\s*rm\s+-rf\s+/i, /^\s*shutdown\b/i, /\b:(){:|:&};:/]; // fork bomb
    if (killList.some(rx => rx.test(rawCommand))) {
        return JSON.stringify({
            ok: false,
            exitCode: -1,
            stdout: '',
            stderr: '',
            message: `Refused: dangerous command "${rawCommand}"`,
        });
    }

    try {
        const { stdout, stderr } = await execFileAsync(
            '/bin/bash',
            ['-c', rawCommand],
            { timeout: 300_000, maxBuffer: 1024 * 1024 }
        );
        return JSON.stringify({
            ok: true,
            exitCode: 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            message: 'ok',
        });
    } catch (err: any) {
        return JSON.stringify({
            ok: false,
            exitCode: err.code ?? -1,
            stdout: err.stdout?.trim() ?? '',
            stderr: err.stderr?.trim() ?? '',
            message: `Command failed: ${err.message ?? String(err)}`,
        });
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
            files.map(async file => {
                const fullPath = `${directory}/${file}`;
                try {
                    const stats = fs.statSync(fullPath);
                    return {
                        name: file,
                        path: fullPath,
                        isDirectory: stats.isDirectory(),
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                    };
                } catch (error) {
                    // If we can't stat a file, just return the name
                    return {
                        name: file,
                        path: fullPath,
                        isDirectory: false,
                        size: 0,
                        modified: new Date().toISOString(),
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
            { command: 'The shell command to execute' },
            'Command output and error if any'
        ),
        createToolFunction(
            list_directory,
            'List files and directories in the specified path',
            { directory: 'Directory path to list' },
            'List of files and directories'
        ),
    ];
}
