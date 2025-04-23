/**
 * File utility functions for the MAGI system.
 */

import fs from 'fs';
import path from 'path';
import { ResponseInput, ToolFunction } from '../types/shared-types.js';
import { createToolFunction } from './tool_call.js';
import { ModelProviderID } from '../model_providers/model_data.js';
// Child process utilities are used via dynamic imports in functions below

// Global directory path for this process
let processDirectory: string | null = null;
let testMode = false;

export function set_file_test_mode(mode: boolean): void {
    testMode = mode;
}

/**
 * Create or get the directory in /magi_output for the current process and a given subdirectory
 * The output dir is where MAGI can write to persistent, isolated storage. It can be accessed by the controller and future MAGI processes.
 *
 * @param subdirectory - The subdirectory to create or access
 * @returns The path to the created directory
 */
export function get_output_dir(subdirectory?: string): string {
    if (!processDirectory) {
        // Use a relative path for test mode, absolute path otherwise
        const baseOutputDir = testMode ? './test_output' : '/magi_output';
        // Ensure the base directory exists in test mode
        if (testMode && !fs.existsSync(baseOutputDir)) {
            fs.mkdirSync(baseOutputDir, { recursive: true });
        }
        processDirectory = path.join(
            baseOutputDir,
            process.env.PROCESS_ID || 'test-process'
        );
        console.log(`Output directory determined: ${processDirectory}`);
    }
    const outputDirectory = subdirectory
        ? path.join(processDirectory, subdirectory)
        : processDirectory;
    // Ensure the specific output directory exists
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, { recursive: true });
        console.log(`Created directory: ${outputDirectory}`);
    }
    return outputDirectory;
}

/**
 * Convince function to get the working output directory
 * The working directory is where MAGI works with existing code bases
 *
 * @returns The path to the working directory
 */
export function get_working_dir(): string {
    return get_output_dir('working');
}

/**
 * Move to the working directory for this process and create it if it doesn't exist
 */
export function move_to_working_dir(working?: string): void {
    process.chdir(get_output_dir(working || 'working'));
}

/**
 * Get a list of all git projects
 *
 * @returns Object mapping repository names to full paths
 */
export function get_git_repositories(): Record<string, string> {
    const gitDir = get_output_dir('projects');
    const result: Record<string, string> = {};

    try {
        if (fs.existsSync(gitDir)) {
            const repos = fs.readdirSync(gitDir);
            for (const repo of repos) {
                const fullPath = path.join(gitDir, repo);
                // Verify it's a directory and contains a .git folder
                if (
                    fs.statSync(fullPath).isDirectory() &&
                    fs.existsSync(path.join(fullPath, '.git'))
                ) {
                    result[repo] = fullPath;
                }
            }
        }
    } catch (error) {
        console.error(`Error reading git repositories: ${error}`);
    }

    return result;
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
export function write_file(
    filePath: string,
    content: string | ArrayBuffer
): string {
    try {
        // Ensure the directory exists
        const directory = path.dirname(filePath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
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
export function write_unique_file(
    filePath: string,
    content: string | ArrayBuffer
): string {
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
            uniqueFilePath = path.join(
                directory,
                `${baseName} (${counter})${extension}`
            );
            counter++;
            unique_info = 'File already exists, updated filename. ';
        }

        // Call the original write_file function with the determined unique path
        // This reuses the directory creation and writing logic.
        return unique_info + write_file(uniqueFilePath, content);
    } catch (error) {
        // Catch potential errors from fs.existsSync or the write_file call
        const err = error instanceof Error ? error : new Error(String(error));
        // Provide more specific context for the error source
        throw new Error(
            `Error in write_unique_file attempting path ${filePath}: ${err.message}`
        );
    }
}

/**
 * Commit changes to a git repository
 *
 * @param repoName - Name of the git repository
 * @param message - Commit message
 * @returns Success message
 */
export async function commit_git_changes(
    repoName: string,
    message: string
): Promise<string> {
    const gitRepos = get_git_repositories();

    if (!gitRepos[repoName]) {
        throw new Error(
            `Git repository '${repoName}' not found. Available repositories: ${Object.keys(gitRepos).join(', ')}`
        );
    }

    const repoPath = gitRepos[repoName];

    try {
        // Check if there are any changes to commit
        const { execSync } = await import('child_process');
        const status = execSync(`git -C "${repoPath}" status --porcelain`)
            .toString()
            .trim();

        if (!status) {
            return `No changes to commit in repository '${repoName}'`;
        }

        // Add all changes
        execSync(`git -C "${repoPath}" add -A`);

        // Commit changes
        execSync(`git -C "${repoPath}" commit -m "${message}"`);

        // Get the current branch
        const branch = execSync(
            `git -C "${repoPath}" rev-parse --abbrev-ref HEAD`
        )
            .toString()
            .trim();

        return `Changes committed to repository '${repoName}' on branch '${branch}'`;
    } catch (error) {
        console.error(
            `Error committing changes to repository '${repoName}': ${error}`
        );
        throw error;
    }
}

export function addFileStatus(messages: ResponseInput): ResponseInput {
    // Add system status to the messages
    let content = `You are currently running in the ${process.cwd()} directory.`;

    const gitRepos = get_git_repositories();
    const projects = Object.values(gitRepos);
    if (projects.length > 0) {
        content += `\n\nYou have access to the following projects (and git repositories):\n- ${projects.join('\n- ')}`;
    }

    messages.push({
        role: 'developer',
        content,
    });

    return messages;
}

/**
 * Get all file tools as an array of tool definitions
 */
export function getFileTools(): ToolFunction[] {
    return [
        createToolFunction(
            read_file,
            'Read a file from the file system',
            { filePath: 'Path to the file to read' },
            'File contents as a string'
        ),
        createToolFunction(
            write_file,
            'Write content to a file',
            {
                filePath: 'Path to write the file to',
                content: 'Content to write to the file',
            },
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
export function log_llm_request(
    providerName: ModelProviderID,
    model: string,
    requestData: any,
    timestamp: Date = new Date()
): string {
    try {
        if (testMode) {
            console.log(
                `[${providerName} - ${timestamp.toISOString().substring(11, 19)}]`
            );
            console.dir(
                {
                    model,
                    request: requestData,
                },
                { depth: 10, colors: true }
            );
            return '';
        }

        // Create logs directory if needed
        const logsDir = get_output_dir('logs/llm');

        // Format timestamp for filename
        const formattedTime = timestamp.toISOString().replaceAll(/[:.]/g, '-');
        const fileName = `${formattedTime}_${providerName}.json`;
        const filePath = path.join(logsDir, fileName);

        // Add timestamp to the logged data
        const logData = {
            timestamp: timestamp.toISOString(),
            provider: providerName,
            model,
            request: requestData,
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
        const logFiles = fs
            .readdirSync(logsDir)
            .filter(file => file.endsWith('.json'))
            .sort();

        return logFiles.map(file => path.join(logsDir, file));
    } catch (err) {
        console.error('Error getting LLM logs:', err);
        return [];
    }
}
