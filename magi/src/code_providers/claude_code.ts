/**
 * Claude Code model provider for the MAGI system.
 *
 * This module uses claude-cli to run the Claude AI coding tool via its command-line interface.
 * It streams the output in real-time, cleans it, filters noise, yields text deltas using
 * a sliding window history for deduplication, skips initial prompt echo, filters the start signal,
 * includes a timeout only for complete silence, and extracts final metadata (cost, duration).
 * Timeout is treated as stream completion. Attempts to pass the prompt via command-line arguments.
 *
 * --- IMPORTANT ---
 * This provider relies on parsing the unstructured text output of the 'claude' CLI tool.
 * Functions like `isNoiseLine`, `isProcessingStartSignal`, and the metadata extraction
 * in `onExit` are based on observed patterns in the current CLI version.
 * Future updates to the 'claude' CLI tool may change its output format,
 * potentially breaking the filtering, start signal detection, or metadata parsing.
 * These sections may require updates if the CLI tool is upgraded.
 * Consider checking if newer versions of the CLI offer a structured output mode (e.g., JSON)
 * for improved robustness.
 * --- END IMPORTANT ---
 *
 * Changes:
 * - Added 'message_start' event emission.
 * - Implemented batching for 'message_delta' events using tiered thresholds.
 * - Applied fixes for TS2339 errors related to 'error.message' and 'ptyProcess.kill'.
 * - Added warnings about dependency on CLI output format.
 * - Made metadata regex slightly more flexible.
 */

import { v4 as uuidv4 } from 'uuid';
// Assuming '../types.js' defines these interfaces, adjust path if necessary
import {
    ModelProvider,
    StreamingEvent,
    ResponseInput,
    MessageEvent,
} from '../types/shared-types.js';
// Assuming cost tracking utility, adjust path if necessary
import { costTracker } from '../utils/cost_tracker.js';
// Assuming file/logging utilities, adjust path if necessary
import { get_working_dir, log_llm_request } from '../utils/file_utils.js';
import pty from 'node-pty';
// Import strip-ansi - Use dynamic import if your project uses ES Modules strictly
import stripAnsi from 'strip-ansi';
import type { Agent } from '../utils/agent.js';
// Example for strict ESM: const { default: stripAnsi } = await import('strip-ansi');

/**
 * Helper function to filter out known noise patterns from the interactive CLI output.
 *
 * **WARNING:** This function is highly dependent on the specific output format of the
 * current 'claude' CLI version. Changes to UI elements, status messages, prompts, etc.,
 * in future CLI versions may require this function to be updated.
 *
 * @param line - A single line of text (after ANSI stripping and trimming).
 * @returns True if the line is considered noise, false otherwise.
 */
function isNoiseLine(line: string): boolean {
    if (!line) return true; // Skip empty lines

    // --- Filtering based on observed output ---
    // NOTE: These patterns might break with future CLI updates.

    // UI Borders/Elements
    if (line.startsWith('╭') || line.startsWith('│') || line.startsWith('╰'))
        return true;
    if (line.startsWith('>')) return true; // Skip prompt lines like "> Tips for getting started:"
    if (line.includes('? for shortcuts')) return true;
    if (line.includes('Bypassing Permissions')) return true;
    if (line.includes('Auto-update failed')) return true;
    if (line.includes('Try claude doctor')) return true;
    if (line.includes('@anthropic-ai/claude-code')) return true;
    if (line.includes('Press Ctrl-C again to exit')) return true;

    // Dynamic Status/Progress Lines (specific patterns)
    // Matches dynamic status lines like "* Action... (Xs · esc to interrupt)" or "* Action... (Xs · details · esc to interrupt)"
    if (/^\s*\p{S}\s*\w+…\s*\(\d+s(?:\s*·\s*.+?)?\s*·\s*esc to interrupt\)$/u.test(line))
        return true;
    // Note: Thinking/Task/Call/Bash/Read lines are handled by isProcessingStartSignal or history dedupe
    if (line === '⎿  Running…') return true; // Specific running message
    if (line.match(/^⎿\s*Read \d+ lines \(ctrl\+r to expand\)$/)) return true; // Matches "Read N lines..." status

    // Known Initial/Setup Messages & Prompt Echo Sections
    if (line.startsWith('✻ Welcome to')) return true;
    if (line.startsWith('/help for help')) return true;
    if (line.startsWith('cwd:')) return true;
    if (line.startsWith('✔ Found')) return true;
    if (line.startsWith('✔ Loaded')) return true;
    if (line.startsWith('Try "')) return true;
    if (line === 'Tips for getting started:') return true; // Specific prompt line
    if (line.match(/^\d+\. Run \/init to create/)) return true; // Specific prompt line
    if (line.match(/^\d+\. Use Claude to help/)) return true; // Specific prompt line
    if (line.match(/^\d+\. Be as specific as you would/)) return true; // Specific prompt line
    // Prompt section headers
    if (line === 'ENVIRONMENT INFO:') return true;
    if (line === 'IMPORTANT WARNINGS:') return true;
    if (line === 'LANGUAGE CHOICE:') return true;
    if (line === 'OUTPUT:') return true;
    if (line.startsWith('Magi thoughts:')) return true; // Filter internal monologue from prompt
    if (line.startsWith('James said:')) return true; // Filter user input from prompt

    // Cost/Summary lines - Filter them during streaming, parse at the end
    // NOTE: Metadata parsing happens separately in onExit. This just prevents yielding them as content.
    if (line.match(/^Total cost:/)) return true;
    if (line.match(/^Total duration \(API\):/)) return true;
    if (line.match(/^Total duration \(wall\):/)) return true;
    if (line.match(/^Total code changes:/)) return true;
    if (line === '------') return true;

    // Filter specific error messages seen in output if desired
    if (line.includes('command not found')) return true;
    if (line.includes('No such file or directory')) return true;
    if (line === '⎿  Error') return true; // Specific error status

    // If none of the noise patterns matched, it's considered useful content
    return false;
}

/**
 * Checks if a line indicates the start of the actual processing/response phase,
 * after the initial prompt echo or setup messages.
 *
 * **WARNING:** This function relies on specific "start signals" observed in the
 * current 'claude' CLI output. If these signals change in future versions,
 * the logic for skipping the initial prompt echo might fail.
 *
 * @param line - A single line of text (after ANSI stripping and trimming).
 * @returns True if the line signals processing start, false otherwise.
 */
function isProcessingStartSignal(line: string): boolean {
    // NOTE: These patterns might break with future CLI updates.
    // Add patterns that reliably appear only *after* the initial prompt/setup output
    if (/^\s*\p{S}\s*\w+…/u.test(line)) return true;
    if (
        line.startsWith('● ') ||
        line.startsWith('╭') ||
        line.startsWith('│') ||
        line.startsWith('╰')
    )
        return true; // Lines starting with ● often indicate actions/tasks
    if (line.startsWith('Task(')) return true; // Task descriptions
    // Add other potential start signals based on observation
    // if (line.startsWith('Okay, let me')) return true;
    return false;
}

/**
 * Implements the ModelProvider interface for interacting with the Claude Code CLI tool.
 * Streams responses in real-time, batching deltas.
 */
export class ClaudeCodeProvider implements ModelProvider {
    /**
     * Generates a response by executing the Claude Code CLI tool and streaming its output.
     *
     * @param model - Identifier for the model being used (e.g., 'claude-code-cli-streaming').
     * @param messages - An array of message objects representing the conversation history or prompt.
     * @returns An AsyncGenerator yielding StreamingEvent objects (message_start, message_delta, message_complete, error).
     */
    async *createResponseStream(
        model: string, // e.g., 'claude-code-cli-streaming'
        messages: ResponseInput,
        agent: Agent
    ): AsyncGenerator<StreamingEvent> {
        const messageId = uuidv4();
        let deltaPosition = 0; // Order for events (start, delta)
        let lineBuffer = ''; // Buffer for handling partial lines across data chunks
        let accumulatedCleanOutput = ''; // For potential final cost parsing
        let finalContent = ''; // Accumulate *actual yielded content* for message_complete
        let ptyProcess: pty.IPty | null = null; // Hold reference for potential kill
        let lastYieldedLine: string | null = null; // Track last *yielded* non-noise line for dedupe

        // --- Sliding Window History for Deduplication ---
        const historySize = 10; // Number of recent lines to remember
        const recentHistory: string[] = []; // Stores lines in order
        const recentHistorySet = new Set<string>(); // Stores lines for fast lookup
        // --- End History ---

        // --- Final Metadata Variables ---
        let finalCost: number | null = null;
        let finalApiDuration: string | null = null;
        let finalWallDuration: string | null = null;
        // --- End Metadata ---

        // --- Delta Batching Logic Variables ---
        // Tiered thresholds: Check buffer size against 'chars' and use corresponding 'timeout'.
        // Order matters: Check from highest char count downwards.
        const batchTimeoutThresholds = [
            { chars: 10000, timeout: 10 }, // Yield almost immediately for large chunks
            { chars: 2000, timeout: 100 }, // Yield quickly for medium chunks
            { chars: 100, timeout: 2000 }, // Standard timeout for smaller chunks
            { chars: 0, timeout: 4000 }, // Final fallback timeout if buffer has any content
        ];
        let deltaBuffer = ''; // Buffer for accumulating delta content
        let batchTimerId: NodeJS.Timeout | null = null; // Timer for batch timeout
        let currentBatchTimeoutValue: number | null = null; // Store the timeout value currently set
        // --- End Batching Logic ---

        // Queue to pass events from PTY callbacks/timers to the generator loop
        const eventQueue: StreamingEvent[] = [];
        let ptyExited = false;
        let ptyError: Error | null = null; // Flag to store error from timeout or processing
        let processingStarted = false; // Flag to skip prompt echo

        // --- PTY Silence Timeout Variables ---
        const silenceTimeoutDuration = 5000; // 5 seconds silence timeout for the PTY process itself
        let silenceTimeoutId: NodeJS.Timeout | null = null;
        // --- End Silence Timeout ---

        // --- Helper Functions for Batching/Yielding ---

        /**
         * Clears the batch timer (if active) and pushes the current deltaBuffer
         * content onto the eventQueue if the buffer is not empty. Clears the buffer afterwards.
         */
        const yieldBufferedDelta = () => {
            if (batchTimerId) {
                clearTimeout(batchTimerId); // Clear any pending batch timer
                batchTimerId = null;
                currentBatchTimeoutValue = null;
            }
            if (deltaBuffer.length > 0) {
                console.log(
                    `[ClaudeCodeProvider] Yielding buffered delta (${deltaBuffer.length} chars) for message ${messageId}`
                );
                eventQueue.push({
                    type: 'message_delta',
                    content: deltaBuffer,
                    message_id: messageId,
                    order: deltaPosition++, // Increment order for each delta event
                });
                finalContent += deltaBuffer; // Accumulate yielded content for the final message
                deltaBuffer = ''; // Clear the buffer
            }
        };

        /**
         * Determines the appropriate batch timeout based on the current deltaBuffer size
         * using the tiered batchTimeoutThresholds. Clears any existing timer and sets
         * a new one if necessary or if the applicable timeout duration changes.
         */
        const startBatchTimer = () => {
            // If buffer is empty, ensure no timer is running
            if (deltaBuffer.length === 0) {
                if (batchTimerId) {
                    clearTimeout(batchTimerId);
                    batchTimerId = null;
                    currentBatchTimeoutValue = null;
                }
                return;
            }

            let applicableTimeout: number | null = null;

            // Find the shortest applicable timeout based on current buffer size
            // Iterate thresholds from largest char count to smallest
            for (const threshold of batchTimeoutThresholds) {
                if (deltaBuffer.length >= threshold.chars) {
                    applicableTimeout = threshold.timeout;
                    break; // Use the timeout for the highest char threshold met
                }
            }

            // Fallback if no threshold matched (shouldn't happen with chars: 0)
            if (applicableTimeout === null) {
                console.warn(
                    '[ClaudeCodeProvider] No applicable batch timeout found, using fallback.'
                );
                // Use the timeout from the last threshold (chars: 0) or a default
                applicableTimeout =
                    batchTimeoutThresholds[batchTimeoutThresholds.length - 1]
                        ?.timeout ?? 4000;
            }

            // If a timer is already running, only replace it if the new timeout is DIFFERENT
            // (This prevents resetting the timer unnecessarily if the buffer grows but stays within the same tier)
            if (batchTimerId) {
                if (currentBatchTimeoutValue === applicableTimeout) {
                    // Timer already running with the correct timeout for the current tier, do nothing
                    return;
                } else {
                    // Applicable timeout tier has changed, clear the old timer
                    clearTimeout(batchTimerId);
                    batchTimerId = null;
                    currentBatchTimeoutValue = null;
                }
            }

            // Set the new timer if none is running or if the applicable timeout changed
            console.log(
                `[ClaudeCodeProvider] Setting batch timer for ${applicableTimeout}ms (buffer: ${deltaBuffer.length} chars) for message ${messageId}`
            );
            currentBatchTimeoutValue = applicableTimeout; // Store the timeout value being set
            batchTimerId = setTimeout(() => {
                console.log(
                    `[ClaudeCodeProvider] Batch timer (${applicableTimeout}ms) expired, yielding buffer for message ${messageId}.`
                );
                batchTimerId = null; // Mark timer as expired before yielding
                currentBatchTimeoutValue = null;
                deltaBuffer += '\n'; // Add newline to separate from next delta
                yieldBufferedDelta();
            }, applicableTimeout);
        };
        // --- End Helper Functions ---

        try {
            // --- Yield message_start event immediately ---
            console.log(
                `[ClaudeCodeProvider] Starting stream for message ${messageId}`
            );
            yield {
                type: 'message_start',
                content: '', // Content is empty for start event
                message_id: messageId,
                order: deltaPosition++, // Use first order position for start
            };
            // --- END message_start ---

            // 1. Construct the prompt string from input messages.
            const prompt = messages
                .map(msg => {
                    let textContent = '';
                    if ('content' in msg) {
                        // Check if 'content' property exists
                        if (typeof msg.content === 'string') {
                            textContent = msg.content;
                        } else if (Array.isArray(msg.content)) {
                            // Handle structured content (e.g., multimodal)
                            textContent = msg.content
                                .filter(part => part.type === 'input_text') // Assuming 'input_text' type exists
                                .map(
                                    part =>
                                        (
                                            part as {
                                                type: 'input_text';
                                                text: string;
                                            }
                                        ).text
                                ) // Type assertion
                                .join('\n');
                        }
                    }
                    // You might want to handle other message roles or types here
                    return textContent;
                })
                .filter(Boolean)
                .join('\n\n'); // Join non-empty parts with double newline

            if (!prompt) {
                throw new Error(
                    'Cannot run Claude CLI: Constructed prompt is empty.'
                );
            }

            // 2. Get working directory and log request.
            const workingDir = get_working_dir(); // Assumes this function exists and returns string | undefined
            const cwd = workingDir || process.cwd();
            console.log(
                `[ClaudeCodeProvider] Executing streaming Claude CLI for model '${model}' in dir '${cwd}'...`
            );
            log_llm_request(agent.agent_id, 'anthropic', model, {
                // Assumes this function exists
                prompt:
                    prompt.substring(0, 100) +
                    (prompt.length > 100 ? '...' : ''), // Log truncated prompt
                working_directory: cwd,
            });

            // 3. Set up a Promise to manage PTY process completion/failure.
            const completionPromise = new Promise<void>((resolve, reject) => {
                // --- Silence Timeout Implementation: Reset Function ---
                const resetSilenceTimeout = () => {
                    if (silenceTimeoutId) clearTimeout(silenceTimeoutId); // Clear existing timer
                    silenceTimeoutId = setTimeout(() => {
                        if (ptyExited) return; // Don't timeout if already exited cleanly
                        console.error(
                            `[ClaudeCodeProvider] PTY process timed out after ${silenceTimeoutDuration}ms of silence for message ${messageId}.`
                        );
                        ptyError = new Error(
                            `Claude CLI process timed out after ${silenceTimeoutDuration / 1000} seconds of silence.`
                        );
                        ptyExited = true; // Mark as exited due to timeout
                        if (
                            ptyProcess &&
                            typeof ptyProcess.kill === 'function'
                        ) {
                            try {
                                console.log(
                                    '[ClaudeCodeProvider] Attempting to kill PTY process due to silence timeout...'
                                );
                                ptyProcess.kill(); // Attempt to kill the stalled process
                            } catch (e) {
                                console.warn(
                                    '[ClaudeCodeProvider] Error killing timed out process',
                                    e
                                );
                            }
                        }
                        // Resolve the promise even on timeout; the generator loop will handle ptyError
                        resolve();
                    }, silenceTimeoutDuration);
                };
                // --- End Silence Timeout ---

                // Spawn the PTY Process inside the promise setup to handle immediate errors
                try {
                    const command = 'claude'; // Command to execute
                    const args = [
                        '--dangerously-skip-permissions', // Example argument
                        prompt, // Pass the actual prompt string as an argument
                        // Add other necessary CLI arguments here
                    ];

                    console.log(
                        `[ClaudeCodeProvider] Spawning PTY: ${command} ${args.map(a => (a.length > 50 ? a.substring(0, 50) + '...' : a)).join(' ')}`
                    );
                    ptyProcess = pty.spawn(command, args, {
                        name: 'xterm-color', // Terminal type
                        cols: 80, // Terminal columns
                        rows: 30, // Terminal rows
                        cwd: cwd, // Working directory
                        env: process.env, // Inherit environment variables
                    });

                    resetSilenceTimeout(); // Start the silence timer initially

                    // --- PTY Data Handler ---
                    ptyProcess.onData((data: string) => {
                        try {
                            resetSilenceTimeout(); // Reset silence timer on ANY data received

                            const rawChunk = data.toString();
                            // Strip ANSI escape codes for cleaner processing
                            const strippedChunk = stripAnsi(rawChunk);
                            // Append to line buffer to handle multi-chunk lines
                            lineBuffer += strippedChunk;
                            const lines = lineBuffer.split('\n');
                            // Keep the last part (potentially incomplete line) in the buffer
                            lineBuffer = lines.pop() || '';

                            // Process each complete line
                            for (const line of lines) {
                                const trimmedLine = line.trim();
                                // Accumulate all cleaned output for potential metadata parsing later
                                accumulatedCleanOutput += line + '\n';

                                // --- Skip Prompt Echo Logic ---
                                if (!processingStarted) {
                                    // WARNING: Relies on isNoiseLine and isProcessingStartSignal
                                    if (!isNoiseLine(trimmedLine)) {
                                        if (
                                            isProcessingStartSignal(trimmedLine)
                                        ) {
                                            processingStarted = true;
                                            console.log(
                                                `[ClaudeCodeProvider] Processing started detected for message ${messageId}.`
                                            );
                                            // Don't skip the start signal itself if it's not noise; let main logic handle it.
                                        } else {
                                            // Still in prompt echo phase, skip this line
                                            continue;
                                        }
                                    } else {
                                        // Skip general noise lines before processing starts
                                        continue;
                                    }
                                }
                                // --- End Skip Prompt Echo Logic ---

                                // Process line only if processing has started
                                // WARNING: Relies on isNoiseLine
                                if (!isNoiseLine(trimmedLine)) {
                                    let shouldBuffer = true;

                                    // --- Deduplication Logic ---
                                    // Avoid exact consecutive duplicates
                                    if (trimmedLine === lastYieldedLine) {
                                        shouldBuffer = false;
                                    }
                                    // Avoid recent duplicates using the sliding window history
                                    if (
                                        shouldBuffer &&
                                        recentHistorySet.has(trimmedLine)
                                    ) {
                                        shouldBuffer = false;
                                    }
                                    // --- End Deduplication Logic ---

                                    if (shouldBuffer) {
                                        // Add newline back for structure within the buffer
                                        const contentChunk = trimmedLine + '\n';
                                        // Append valid, non-duplicate content to the batch buffer
                                        deltaBuffer += contentChunk;
                                        // Update last yielded line *candidate* for next dedupe check
                                        lastYieldedLine = trimmedLine;

                                        // --- Update Sliding Window History ---
                                        recentHistory.push(trimmedLine);
                                        recentHistorySet.add(trimmedLine);
                                        // Maintain history size
                                        if (
                                            recentHistory.length > historySize
                                        ) {
                                            const oldestLine =
                                                recentHistory.shift()!; // Remove oldest
                                            recentHistorySet.delete(oldestLine); // Remove from set
                                        }
                                        // --- End Update History ---

                                        // --- Check Batching Conditions ---
                                        // Always call startBatchTimer to potentially adjust the timeout
                                        // based on the new buffer size according to the tiered thresholds.
                                        startBatchTimer();
                                        // --- End Check Batching Conditions ---
                                    }
                                }
                            } // End for loop over lines
                        } catch (processingError: any) {
                            console.error(
                                '[ClaudeCodeProvider] Error processing PTY data:',
                                processingError
                            );
                            ptyError = new Error(
                                `Error processing PTY data: ${processingError.message}`
                            );
                            ptyExited = true; // Mark as exited due to error
                            if (silenceTimeoutId)
                                clearTimeout(silenceTimeoutId);
                            if (batchTimerId) {
                                // Clear batch timer on error
                                clearTimeout(batchTimerId);
                                batchTimerId = null;
                                currentBatchTimeoutValue = null;
                            }
                            if (
                                ptyProcess &&
                                typeof ptyProcess.kill === 'function'
                            ) {
                                try {
                                    ptyProcess.kill();
                                } catch (e) {
                                    console.warn(
                                        '[ClaudeCodeProvider] Error killing process on data error',
                                        e
                                    );
                                }
                            }
                            resolve(); // Resolve promise on processing error to allow generator loop to finish
                        }
                    }); // End onData

                    // --- PTY Exit Handler ---
                    ptyProcess.onExit(({ exitCode, signal }) => {
                        console.log(
                            `[ClaudeCodeProvider] PTY process exited with code ${exitCode}${signal ? ` (signal ${signal})` : ''} for message ${messageId}.`
                        );
                        ptyExited = true; // Mark as exited
                        if (silenceTimeoutId) clearTimeout(silenceTimeoutId); // Clear Silence Timer

                        // Process any remaining data left in the line buffer
                        try {
                            const finalTrimmedLine = lineBuffer.trim();
                            // Add final part to accumulated output for metadata parsing
                            accumulatedCleanOutput += lineBuffer;

                            // Process final line for buffering if needed (apply same logic)
                            // WARNING: Relies on isNoiseLine
                            if (
                                processingStarted &&
                                finalTrimmedLine &&
                                !isNoiseLine(finalTrimmedLine)
                            ) {
                                let shouldBufferFinal = true;
                                if (finalTrimmedLine === lastYieldedLine)
                                    shouldBufferFinal = false;
                                if (
                                    shouldBufferFinal &&
                                    recentHistorySet.has(finalTrimmedLine)
                                )
                                    shouldBufferFinal = false;

                                if (shouldBufferFinal) {
                                    // Add final part to buffer, don't add newline as it wasn't from split('\n')
                                    deltaBuffer += finalTrimmedLine;
                                }
                            }
                        } catch (finalProcessingError: any) {
                            console.error(
                                '[ClaudeCodeProvider] Error processing final PTY buffer:',
                                finalProcessingError
                            );
                            // Continue execution even if final processing fails
                        }

                        // --- IMPORTANT: Yield any remaining buffered content ---
                        // This ensures the last bits of text are sent before the 'complete' event.
                        // It also clears any potentially running batch timer.
                        yieldBufferedDelta();

                        // --- Extract final metadata (cost, duration) ---
                        // WARNING: These regex patterns rely on the specific wording and format
                        // of the summary lines in the current 'claude' CLI output.
                        // Future CLI updates might break this parsing.
                        try {
                            // Use accumulatedCleanOutput which contains the full stripped stream
                            // Regex made slightly more flexible with \s* around colon.
                            const costMatch = accumulatedCleanOutput.match(
                                /Total cost\s*:\s*\$([\d.]+)/m
                            );
                            const apiDurationMatch =
                                accumulatedCleanOutput.match(
                                    /Total duration \(API\)\s*:\s*([\d.]+s?)/m
                                );
                            const wallDurationMatch =
                                accumulatedCleanOutput.match(
                                    /Total duration \(wall\)\s*:\s*([\d.]+s?)/m
                                );

                            if (apiDurationMatch && apiDurationMatch[1]) {
                                finalApiDuration = apiDurationMatch[1]; // Store parsed duration
                                console.log(
                                    `[ClaudeCodeProvider] Extracted API duration: ${finalApiDuration}`
                                );
                            }
                            if (wallDurationMatch && wallDurationMatch[1]) {
                                finalWallDuration = wallDurationMatch[1]; // Store parsed duration
                                console.log(
                                    `[ClaudeCodeProvider] Extracted wall duration: ${finalWallDuration}`
                                );
                            }

                            // Estimate tokens - we don't know the exact tokenization, but this is a vague estimate
                            const input_tokens = Math.ceil(
                                (prompt?.length || 0) / 4
                            );
                            const output_tokens = Math.ceil(
                                finalContent.length / 4
                            );

                            //. See if we can extract the cost from the output
                            let cost = 0;
                            if (costMatch && costMatch[1]) {
                                cost = parseFloat(costMatch[1]);
                                if (isNaN(cost)) {
                                    cost = 0;
                                }
                            }

                            finalCost = cost; // Store parsed cost
                            console.log(
                                `[ClaudeCodeProvider] Extracted cost from stream: $${cost.toFixed(6)}`
                            );
                            costTracker.addUsage({
                                model,
                                cost,
                                input_tokens,
                                output_tokens,
                                metadata: {
                                    api_duration:
                                        parseFloat(finalApiDuration || '0') ||
                                        0,
                                    wall_duration:
                                        parseFloat(finalWallDuration || '0') ||
                                        0,
                                },
                            }); // Log usage
                        } catch (metadataParseError: any) {
                            // Log if parsing fails, but don't block completion
                            console.warn(
                                `[ClaudeCodeProvider] Failed to parse metadata from accumulated output: ${metadataParseError.message}`
                            );
                        }
                        // --- End Metadata Extraction ---

                        // Resolve or reject the completion promise based on outcome
                        if (ptyError) {
                            // If an error (like timeout) occurred before exit
                            resolve(); // Resolve, let generator handle ptyError flag
                        } else if (exitCode === 0) {
                            resolve(); // Success
                        } else {
                            // PTY exited with non-zero code without a prior error flag set
                            const errorMsg = `Claude CLI process failed with exit code ${exitCode}${signal ? ` (signal ${signal})` : ''}.`;
                            console.error(`[ClaudeCodeProvider] ${errorMsg}`);
                            ptyError = new Error(errorMsg); // Set the error flag
                            reject(ptyError); // Reject promise for non-zero exit
                        }
                    }); // End onExit
                } catch (spawnError: any) {
                    // Handle errors during the initial PTY spawn
                    console.error(
                        '[ClaudeCodeProvider] Error spawning PTY process:',
                        spawnError
                    );
                    ptyError = spawnError; // Set error flag
                    ptyExited = true; // Mark as exited
                    if (silenceTimeoutId) clearTimeout(silenceTimeoutId);
                    if (batchTimerId) {
                        // Clear batch timer on spawn error
                        clearTimeout(batchTimerId);
                        batchTimerId = null;
                        currentBatchTimeoutValue = null;
                    }
                    reject(spawnError); // Reject promise immediately for spawn error
                }
            }); // End completionPromise

            // 4. Main Generator Loop: Process event queue and wait for completion
            // Continue as long as the process might still be running OR there are events in the queue
            while (!ptyExited || eventQueue.length > 0) {
                // Yield all events currently in the queue
                while (eventQueue.length > 0) {
                    const event = eventQueue.shift()!;
                    yield event; // Yield message_start or message_delta
                }
                // If the process hasn't exited yet, pause briefly to avoid busy-waiting
                if (!ptyExited) {
                    await new Promise(r => setTimeout(r, 50)); // Short sleep (e.g., 50ms)
                }
            }

            // 5. Wait for the completionPromise to settle (resolves/rejects based on PTY exit/error)
            await completionPromise;

            // 6. Determine final state AFTER awaiting the promise and checking ptyError
            // Use String(ptyError) for safer check against potential non-Error objects
            if (ptyError && !String(ptyError).includes('timed out')) {
                // If an error occurred (and it wasn't just a silence timeout), throw it
                // This covers spawn errors and non-zero exit codes.
                throw ptyError;
            } else {
                // Process finished (either successfully or via timeout)

                // Construct metadata object for the complete event
                const metadata: Record<string, any> = {};
                if (finalCost !== null) metadata.cost = finalCost;
                if (finalApiDuration !== null)
                    metadata.apiDuration = finalApiDuration;
                if (finalWallDuration !== null)
                    metadata.wallDuration = finalWallDuration;

                console.log(
                    `[ClaudeCodeProvider] **FINAL OUTPUT** for message ${messageId}:`,
                    finalContent
                );

                // Create the final 'message_complete' event
                const completeEvent: MessageEvent & {
                    metadata?: Record<string, any>;
                } = {
                    type: 'message_complete',
                    message_id: messageId,
                    content: finalContent, // Use the content accumulated via yieldBufferedDelta
                };

                yield completeEvent; // Yield the final complete event

                // Log final status
                if (ptyError) {
                    // Log timeout occurrence if relevant
                    console.log(
                        `[ClaudeCodeProvider] Stream finished after silence timeout for message ${messageId}.`
                    );
                } else {
                    console.log(
                        `[ClaudeCodeProvider] Stream completed successfully for message ${messageId}.`
                    );
                }
            }
        } catch (error: unknown) {
            // Catch any synchronous errors or re-thrown errors
            // 7. Handle errors (spawn, non-zero exit, processing, etc.)
            console.error(
                '[ClaudeCodeProvider] Error during Claude Code streaming execution:',
                error
            );
            // Simplify error message extraction for safety with 'unknown' type
            const errorMessage = String(error);

            // Yield an error event
            yield {
                type: 'error',
                error: `Claude code provider stream error: ${errorMessage}`,
            };
        } finally {
            // 8. Final Cleanup: Ensure timers are cleared and resources released
            if (silenceTimeoutId) clearTimeout(silenceTimeoutId);
            if (batchTimerId) {
                // Ensure batch timer is cleared
                clearTimeout(batchTimerId);
                batchTimerId = null;
                currentBatchTimeoutValue = null;
            }

            console.log(
                `[ClaudeCodeProvider] Finishing stream processing for message ${messageId}.`
            );

            // Nullify the reference, previous logic should handle termination/errors
            ptyProcess = null;
        }
    }
}

// Export a singleton instance of the provider (or adjust as needed for your project structure)
export const claudeCodeProvider = new ClaudeCodeProvider();
