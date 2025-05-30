/**
 * Utility functions for summarizing task outputs and detecting failing tasks
 */
import fs from 'fs/promises'; // Use promises for async file operations
import path from 'path';
import crypto from 'crypto';
import { ResponseInput, ToolFunction } from '@just-every/ensemble';
import { Runner } from './runner.js';
import { createSummaryAgent } from '../magi_agents/common_agents/summary_agent.js';
import { get_output_dir } from './file_utils.js'; // Import get_output_dir
import { createToolFunction } from './tool_call.js';

const SUMMARIZE_AT_CHARS = 5000; // Below this length, we don't summarize
const SUMMARIZE_TRUNCATE_CHARS = 200000; // Below this length, we don't summarize

// Cache to avoid repeated summaries of the same content
const summaryCache = new Map<string, { summary: string; timestamp: number }>();
// Cache expiration time (1 hour)
const CACHE_EXPIRATION_MS = 60 * 60 * 1000;

// --- New constants for persistent summaries ---
const SUMMARIES_SUBDIR = 'summaries';
const HASH_MAP_FILENAME = 'summary_hash_map.json';
// --- End new constants ---

// Patterns that might indicate failing tasks
const FAILURE_PATTERNS = [
    /error|exception|failed|timeout|rejected|unable to|cannot|not found|invalid/gi,
    /retry.*attempt|retrying|trying again/gi,
    /no (?:such|valid) (?:file|directory|path|route)/gi,
    /unexpected|unknown|unhandled/gi,
];

// Maximum number of retries before flagging a potential issue
const MAX_RETRIES = 3;
// Minimum frequency of error messages to consider as a potential issue
const ERROR_FREQUENCY_THRESHOLD = 0.3;

// --- Helper functions for hash map ---
type SummaryHashMap = { [hash: string]: string }; // Map<documentHash, summaryId>

async function loadHashMap(file_path: string): Promise<SummaryHashMap> {
    try {
        const data = await fs.readFile(file_path, 'utf-8');
        return JSON.parse(data);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return empty map
            return {};
        }
        console.error(
            `Error loading summary hash map from ${file_path}:`,
            error
        );
        // In case of other errors, return empty map to avoid blocking
        return {};
    }
}

async function saveHashMap(
    file_path: string,
    map: SummaryHashMap
): Promise<void> {
    try {
        const data = JSON.stringify(map, null, 2);
        await fs.writeFile(file_path, data, 'utf-8');
    } catch (error) {
        console.error(`Error saving summary hash map to ${file_path}:`, error);
        // Log error but don't throw, as failing to save the map shouldn't stop the summary process
    }
}
// --- End helper functions ---

function truncate(
    text: string,
    length: number = SUMMARIZE_TRUNCATE_CHARS,
    separator: string = '\n\n...[truncated for summary]...\n\n'
): string {
    text = text.trim();
    if (text.length <= length) {
        return text;
    }
    return (
        text.substring(0, length * 0.3) +
        separator +
        text.substring(text.length - length * 0.7 + separator.length)
    );
}

export async function createSummary(
    document: string,
    context: string
): Promise<string> {
    if (document.length <= SUMMARIZE_AT_CHARS) {
        return document;
    }

    // --- Persistent Summary Logic ---
    const summariesDir = get_output_dir(SUMMARIES_SUBDIR); // Ensures directory exists
    const hashMapPath = path.join(summariesDir, HASH_MAP_FILENAME);
    const documentHash = crypto
        .createHash('sha256')
        .update(document)
        .digest('hex');
    const hashMap = await loadHashMap(hashMapPath);

    if (hashMap[documentHash]) {
        const summaryId = hashMap[documentHash];
        const summaryFilePath = path.join(
            summariesDir,
            `summary-${summaryId}.txt`
        );
        const originalFilePath = path.join(
            summariesDir,
            `original-${summaryId}.txt`
        );

        try {
            // Read existing summary and original document
            const [existingSummary, originalDoc] = await Promise.all([
                fs.readFile(summaryFilePath, 'utf-8'),
                fs.readFile(originalFilePath, 'utf-8'),
            ]);

            const originalLines = originalDoc.split('\n').length;
            const summaryLines = existingSummary.split('\n').length;
            const originalChars = originalDoc.length;
            const summaryChars = existingSummary.length;
            const metadata = `\n\nSummarized large output to avoid excessive tokens (${originalLines} -> ${summaryLines} lines, ${originalChars} -> ${summaryChars} chars) [Write to file with write_source(${summaryId}, file_path) or read with read_source(${summaryId}, line_start, line_end)]`;

            console.log(
                `Retrieved summary from cache for hash: ${documentHash.substring(0, 8)}...`
            );
            return existingSummary.trim() + metadata;
        } catch (error) {
            console.error(
                `Error reading cached summary files for ID ${summaryId}:`,
                error
            );
            // If reading fails, proceed to generate a new summary, removing the broken entry
            delete hashMap[documentHash];
            await saveHashMap(hashMapPath, hashMap); // Save map without the broken entry
        }
    }
    // --- End Persistent Summary Check ---

    // Document not found in persistent cache, generate new summary
    const originalDocumentForSave = document; // Keep original before truncation
    const originalLines = originalDocumentForSave.split('\n').length;

    // Truncate if it's too long
    document = truncate(document);

    // Create agent to summarize the document
    const agent = createSummaryAgent(context);

    // Generate the summary
    const summary = await Runner.runStreamedWithTools(agent, document, [], {}, [
        'cost_update',
    ]);
    const trimmedSummary = summary.trim();
    const summaryLines = trimmedSummary.split('\n').length;

    // --- Save new summary and update hash map ---
    const newSummaryId = crypto.randomUUID();
    const summaryFilePath = path.join(
        summariesDir,
        `summary-${newSummaryId}.txt`
    );
    const originalFilePath = path.join(
        summariesDir,
        `original-${newSummaryId}.txt`
    );

    try {
        await Promise.all([
            fs.writeFile(summaryFilePath, trimmedSummary, 'utf-8'),
            fs.writeFile(originalFilePath, originalDocumentForSave, 'utf-8'),
        ]);

        // Update and save the hash map
        hashMap[documentHash] = newSummaryId;
        await saveHashMap(hashMapPath, hashMap);
        console.log(
            `Saved new summary with ID: ${newSummaryId} for hash: ${documentHash.substring(0, 8)}...`
        );
    } catch (error) {
        console.error(
            `Error saving new summary files for ID ${newSummaryId}:`,
            error
        );
        // Log error but proceed, returning the summary without the metadata link if saving failed
        return trimmedSummary;
    }
    // --- End Save Logic ---

    const originalChars = originalDocumentForSave.length;
    const summaryChars = trimmedSummary.length;
    const metadata = `\n\nSummarized large output to avoid excessive tokens (${originalLines} -> ${summaryLines} lines, ${originalChars} -> ${summaryChars} chars) [Write to file with write_source(${newSummaryId}, file_path) or read with read_source(${newSummaryId}, line_start, line_end)]`;
    return trimmedSummary + metadata;
}

/**
 * Retrieves the original document content associated with a summary ID.
 * Can optionally return a specific range of lines.
 *
 * @param summary_id The unique ID of the summary.
 * @param line_start Optional. The starting line number (0-based).
 * @param line_end Optional. The ending line number (0-based).
 * @returns The requested content of the original document or an error message.
 */
export async function read_source(
    summary_id: string,
    line_start?: number,
    line_end?: number
): Promise<string> {
    const summariesDir = get_output_dir(SUMMARIES_SUBDIR);
    const originalFilePath = path.join(
        summariesDir,
        `original-${summary_id}.txt`
    );

    try {
        let content = await fs.readFile(originalFilePath, 'utf-8');

        if (line_start !== undefined && line_end !== undefined) {
            const lines = content.split('\n');
            // Ensure start/end are within bounds
            const start = Math.max(0, line_start);
            const end = Math.min(lines.length, line_end + 1);

            if (start >= end || start >= lines.length) {
                return `Error: Invalid line range requested (${line_start}-${line_end}) for document with ${lines.length} lines.`;
            }
            content = lines.slice(start, end).join('\n');
        }

        return content;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return `Error: Original document for summary ID '${summary_id}' not found at ${originalFilePath}.`;
        }
        console.error(
            `Error reading original summary source for ID ${summary_id}:`,
            error
        );
        return `Error: Could not retrieve original document for summary ID '${summary_id}'.`;
    }
}

/**
 * Write to file the original document content associated with a summary ID.
 *
 * @param summary_id The unique ID of the summary.
 * @param file_path Optional. Path to write the content to a file.
 * @returns Confirmation or an error message.
 */
export async function write_source(
    summary_id: string,
    file_path: string
): Promise<string> {
    const summariesDir = get_output_dir(SUMMARIES_SUBDIR);
    const originalFilePath = path.join(
        summariesDir,
        `original-${summary_id}.txt`
    );

    try {
        const content = await fs.readFile(originalFilePath, 'utf-8');
        if (!file_path) {
            return 'Error: file_path is required.';
        }
        try {
            // Create directory if it doesn't exist
            const directory = path.dirname(file_path);
            await fs.mkdir(directory, { recursive: true });

            // Write the content to the file
            await fs.writeFile(file_path, content, 'utf-8');
            console.log(`Summary written to file: ${file_path}`);
            return `Successfully wrote ${content.length} chars to file: ${file_path}\n\nStart of content:\n\n${content.substring(0, 400)}...`;
        } catch (writeError) {
            console.error(
                `Error writing summary to file ${file_path}:`,
                writeError
            );
            return `Error: Could not write summary to file ${file_path}.`;
        }
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return `Error: Original document for summary ID '${summary_id}' not found at ${originalFilePath}.`;
        }
        console.error(
            `Error reading original summary source for ID ${summary_id}:`,
            error
        );
        return `Error: Could not retrieve original document for summary ID '${summary_id}'.`;
    }
}

/**
 * Summarize task output and detect potential issues
 *
 * @param taskId The ID of the task
 * @param output The full output of the task
 * @param history The conversation history of the task
 * @returns An object containing the summary and potential issues
 */
export async function summarizeTaskOutput(
    taskId: string,
    output: string | undefined,
    history: ResponseInput | undefined
): Promise<{
    summary: string;
    potentialIssues: string | null;
    isLikelyFailing: boolean;
}> {
    if (!output && (!history || history.length === 0)) {
        return {
            summary: 'No task output or history available to summarize.',
            potentialIssues: null,
            isLikelyFailing: false,
        };
    }

    // Generate a cache key based on output and history length
    const historyLength = history ? history.length : 0;
    const cacheKey = `${taskId}-${output?.length ?? 0}-${historyLength}`;

    // Check cache first
    const cachedSummary = summaryCache.get(cacheKey);
    if (
        cachedSummary &&
        Date.now() - cachedSummary.timestamp < CACHE_EXPIRATION_MS
    ) {
        // Add failure detection to cached summary
        const { isLikelyFailing, potentialIssues } = detectPotentialIssues(
            output,
            history
        );
        return {
            summary: cachedSummary.summary,
            potentialIssues,
            isLikelyFailing,
        };
    }

    // Create content to summarize
    let contentToSummarize = '';

    // Add conversation history if available
    if (history && history.length > 0) {
        // Convert history to a readable format for summarization
        contentToSummarize +=
            'Task History:\n' + formatHistoryForSummary(history);
    }

    // Add output if available
    if (output) {
        if (contentToSummarize.length > 0) {
            contentToSummarize += '\n\n';
        }
        contentToSummarize += 'Task Output:\n' + output;
    }

    try {
        // Generate the summary
        const summary = await createSummary(
            contentToSummarize,
            "The following is the output and history of a task performed by an AI agent in an autonomous system. Your summary will be used to understand the task's progress and results. Focus on core actions taken, the current status and any issues stopping current progress."
        );

        // Add to cache
        summaryCache.set(cacheKey, {
            summary: summary.trim(),
            timestamp: Date.now(),
        });

        // Detect potential issues
        const { isLikelyFailing, potentialIssues } = detectPotentialIssues(
            output,
            history
        );

        return {
            summary: summary.trim(),
            potentialIssues,
            isLikelyFailing,
        };
    } catch (error) {
        console.error(`Error generating task summary for ${taskId}:`, error);
        return {
            summary:
                'Error generating summary. The task is running but summary generation failed.',
            potentialIssues: `Summary generation error: ${error}`,
            isLikelyFailing: false,
        };
    }
}

/**
 * Format history for summarization
 *
 * @param history The conversation history
 * @returns Formatted history as a string
 */
export function formatHistoryForSummary(history: ResponseInput): string {
    // Group related messages (especially tool calls with their outputs)
    const formattedItems: string[] = [];
    const processedIds = new Set<string>();

    for (let i = 0; i < history.length; i++) {
        const item = history[i];

        // Skip if already processed (part of a call-result pair)
        if (
            'type' in item &&
            item.type === 'function_call_output' &&
            'call_id' in item &&
            processedIds.has(item.call_id)
        ) {
            continue;
        }

        // Format differently based on message type
        if ('role' in item && 'content' in item) {
            const content =
                typeof item.content === 'string'
                    ? item.content
                    : JSON.stringify(item.content);

            // Detect if this is likely a command
            if (
                item.role === 'user' &&
                (content.toLowerCase().includes('command:') ||
                    content.toLowerCase().startsWith('do ') ||
                    content.toLowerCase().startsWith('please ') ||
                    content.toLowerCase().startsWith('can you '))
            ) {
                formattedItems.push(
                    `COMMAND (${item.role}):\n${truncate(content, SUMMARIZE_TRUNCATE_CHARS / 10)}`
                );
            }
            // Detect if this contains an error
            else if (
                content.toLowerCase().includes('error:') ||
                content.toLowerCase().includes('failed')
            ) {
                formattedItems.push(
                    `ERROR (${item.role}):\n${truncate(content, SUMMARIZE_TRUNCATE_CHARS / 10)}`
                );
            }
            // Regular role-based message
            else {
                formattedItems.push(
                    `${item.role.toUpperCase()}:\n${truncate(content, SUMMARIZE_TRUNCATE_CHARS / 10)}`
                );
            }
        }
        // Handle tool calls and try to pair them with their results
        else if (
            'type' in item &&
            item.type === 'function_call' &&
            'call_id' in item
        ) {
            const callId = item.call_id;
            processedIds.add(callId);

            // Format the tool call
            let formattedCall = `TOOL CALL: ${item.name}(${truncate(item.arguments, SUMMARIZE_TRUNCATE_CHARS / 10)})`;

            // Look ahead for the matching result
            let resultItem = null;
            for (let j = i + 1; j < history.length; j++) {
                const potentialResult = history[j];
                if (
                    'type' in potentialResult &&
                    potentialResult.type === 'function_call_output' &&
                    'call_id' in potentialResult &&
                    potentialResult.call_id === callId
                ) {
                    resultItem = potentialResult;
                    break;
                }
            }

            // If we found a matching result, combine them
            if (resultItem) {
                processedIds.add(callId); // Mark the result as processed
                formattedCall += `\nTOOL RESULT: ${truncate(resultItem.output, SUMMARIZE_TRUNCATE_CHARS / 10)}`;
            }

            formattedItems.push(formattedCall);
        }
        // Handle orphaned tool results (shouldn't happen with proper pairing, but just in case)
        else if (
            'type' in item &&
            item.type === 'function_call_output' &&
            'call_id' in item
        ) {
            formattedItems.push(
                `TOOL RESULT (${item.name}):\n${truncate(item.output, SUMMARIZE_TRUNCATE_CHARS / 10)}`
            );
        }
        // Fallback for any other message types
        else {
            formattedItems.push(`OTHER: ${JSON.stringify(item)}`);
        }
    }

    return formattedItems.join('\n\n');
}

/**
 * Detect potential issues in task output and history
 *
 * @param output The task output
 * @param history The task history
 * @returns Object with isLikelyFailing flag and potentialIssues message
 */
function detectPotentialIssues(
    output: string | undefined,
    history: ResponseInput | undefined
): { isLikelyFailing: boolean; potentialIssues: string | null } {
    if (!output && (!history || history.length === 0)) {
        return { isLikelyFailing: false, potentialIssues: null };
    }

    let errorCount = 0;
    let contentLength = 0;
    let retryCount = 0;
    const issues = [];

    // Check the output
    if (output) {
        contentLength += output.length;

        // Count pattern matches in output
        FAILURE_PATTERNS.forEach(pattern => {
            const matches = output.match(pattern);
            if (matches) {
                errorCount += matches.length;
            }
        });

        // Count retry attempts in output
        const retryMatches = output.match(
            /retry.*attempt|retrying|trying again/gi
        );
        if (retryMatches) {
            retryCount += retryMatches.length;
        }
    }

    // Check the history
    if (history && history.length > 0) {
        // Look for error messages and retry patterns in function call outputs
        for (const item of history) {
            if ('type' in item && item.type === 'function_call_output') {
                contentLength += item.output.length;

                // Check for error patterns
                FAILURE_PATTERNS.forEach(pattern => {
                    const matches = item.output.match(pattern);
                    if (matches) {
                        errorCount += matches.length;
                    }
                });

                // Check for retry patterns
                const retryMatches = item.output.match(
                    /retry.*attempt|retrying|trying again/gi
                );
                if (retryMatches) {
                    retryCount += retryMatches.length;
                }
            }
        }

        // Check for repeated similar tool calls which might indicate the task is stuck
        const toolCalls = history.filter(
            item => 'type' in item && item.type === 'function_call'
        );
        if (toolCalls.length > 5) {
            // Count similar consecutive tool calls
            const toolCallNames = toolCalls.map(call =>
                'name' in call ? call.name : ''
            );

            let repeatedCallsCount = 0;
            for (let i = 1; i < toolCallNames.length; i++) {
                if (toolCallNames[i] === toolCallNames[i - 1]) {
                    repeatedCallsCount++;
                }
            }

            // If more than 3 consecutive identical tool calls, it might be stuck
            if (repeatedCallsCount > 3) {
                issues.push(
                    'Task may be stuck in a loop, repeatedly calling the same tools without making progress.'
                );
            }
        }
    }

    // Calculate error frequency (errors per character)
    const errorFrequency = contentLength > 0 ? errorCount / contentLength : 0;

    // Determine if the task is likely failing
    const isLikelyFailing =
        retryCount > MAX_RETRIES || errorFrequency > ERROR_FREQUENCY_THRESHOLD;

    // Build potential issues message
    if (isLikelyFailing) {
        if (retryCount > MAX_RETRIES) {
            issues.push(
                `Task has attempted to retry ${retryCount} times, which exceeds the maximum of ${MAX_RETRIES}.`
            );
        }

        if (errorFrequency > ERROR_FREQUENCY_THRESHOLD) {
            issues.push(
                `Task output contains a high frequency of error messages (${(errorFrequency * 100).toFixed(2)}%).`
            );
        }
    }

    return {
        isLikelyFailing,
        potentialIssues: issues.length > 0 ? issues.join(' ') : null,
    };
}

/**
 * Get all summary tools as an array of tool definitions
 */
export function getSummaryTools(): ToolFunction[] {
    return [
        createToolFunction(
            read_source,
            'Read the original (not summarized) document to a file. If possible, limit lines to limit tokens returned. Results will be truncated to 1000 characters - for larger files, use write_source.',
            {
                summary_id: {
                    type: 'string',
                    description: 'The unique ID of the summary.',
                },
                line_start: {
                    type: 'number',
                    description:
                        'Starting line to retrieve (0-based). Ignored if file_path is set.',
                    optional: true,
                },
                line_end: {
                    type: 'number',
                    description:
                        'Ending line to retrieve (0-based). Ignored if file_path is set.',
                    optional: true,
                },
            }
        ),
        createToolFunction(
            write_source,
            'Write the original (not summarized) document to a file.',
            {
                summary_id: {
                    type: 'string',
                    description: 'The unique ID of the summary.',
                },
                file_path: {
                    type: 'string',
                    description:
                        'Relative or absolute path to write the document to.',
                    optional: true,
                },
            }
        ),
    ];
}
