/**
 * Utility for running CLI commands via node-pty with streaming output
 *
 * This module provides a reusable way to spawn processes using node-pty
 * and stream their output as StreamingEvent objects. It handles:
 * - Spawning a process with node-pty
 * - Stripping ANSI codes from output
 * - Line buffering and deduplication
 * - Tiered batching for optimized streaming
 * - Silence timeout detection
 * - Clean process termination
 */

import { v4 as uuidv4 } from 'uuid';
import pty from 'node-pty';
import stripAnsi from 'strip-ansi';
import {
    StreamingEvent,
    MessageEvent,
    ConsoleEvent,
    ErrorEvent,
} from '../types/shared-types.js';
import {
    DeltaBuffer,
    bufferDelta,
    flushBufferedDeltas,
} from '@just-every/ensemble/utils/delta_buffer';

// --- Global cleanup to ensure PTY processes exit cleanly even if the host process is killed ---
const activePtyProcesses = new Set<pty.IPty>();

// Map to track PTYs by messageId for kill() function
const ptyMap = new Map<string, pty.IPty>();

// Default exit command that can be overridden by individual PTY processes
const DEFAULT_EXIT_COMMAND = '/exit';

// Default string to detect input vs output
const DEFAULT_PROMPT_SEPARATOR = '--==--==--';

// Map to store custom exit commands for each PTY
const ptyExitCommands = new Map<pty.IPty, string>();

// Global pause state for all silence timeouts
let pausedState = false;

// Map to store silence timeout handlers and remaining time when paused
interface TimeoutInfo {
    timeoutId: NodeJS.Timeout | null;
    remainingTime: number;
    lastActivity: number;
    messageId: string;
}
const activeSilenceTimeouts = new Map<string, TimeoutInfo>();

/**
 * Register global exit hooks to ensure all PTY processes are terminated
 * when the Node.js process exits.
 */
function ensureGlobalExitHook() {
    // Avoid double‑registration
    if ((process as any).__ptyExitHookRegistered) return;
    (process as any).__ptyExitHookRegistered = true;

    const gracefulShutdown = () => {
        for (const instance of activePtyProcesses) {
            try {
                // Ask process to terminate gracefully
                const exitCmd =
                    ptyExitCommands.get(instance) || DEFAULT_EXIT_COMMAND;
                // Use multiple newline variations for better compatibility
                instance.write(`${exitCmd}\r\n`);
                setTimeout(() => instance.write('\r'), 50);
                setTimeout(() => instance.write('\n'), 100);
                setTimeout(() => instance.write('\x1b\r'), 150);
                setTimeout(() => instance.write('\x1b\n'), 200);
                setTimeout(() => instance.write('\x1b\n\r'), 250);
            } catch {
                /* ignore errors during shutdown */
            }
        }
    };

    // Run the hook for the most common termination events
    for (const sig of ['beforeExit', 'SIGINT', 'SIGTERM', 'SIGQUIT']) {
        process.on(sig, gracefulShutdown);
    }
}

// Ensure the hook is installed once when this module is loaded
ensureGlobalExitHook();

/**
 * Options for running a command through PTY.
 */
export interface PtyRunOptions {
    /** The initial prompt to send */
    prompt: string;
    /** Working directory for the command */
    cwd: string;
    /** Environment variables to pass to the command */
    env?: NodeJS.ProcessEnv;
    /** Timeout for detecting silence (no output) in milliseconds */
    silenceTimeoutMs?: number;
    /** Number of columns for the PTY */
    cols?: number;
    /** Number of rows for the PTY */
    rows?: number;
    /** Function to filter out noise lines from the output */
    noiseFilter?: (line: string, tokenCb?: (n: number) => void) => boolean;
    /** What text separates input from output? */
    promptSeparator?: string;
    /** Function to detect when the process can receive a prompt */
    readySignal?: (line: string) => boolean;
    /** Function to detect when the actual processing/output has started */
    startSignal?: (line: string) => boolean;
    /** Process all output */
    startImmediately?: boolean;
    /** Callback for token progress updates */
    onTokenProgress?: (n: number) => void;
    /** Tiered batching configuration for output */
    batch?: {
        tiers: { chars: number; timeout: number }[];
    };
    /** Optional message ID to use instead of generating a new one */
    messageId?: string;
    /** Optional callback for each processed line */
    onLine?: (line: string) => void;
    /** Optional line processor to clean/transform lines before they're added to output */
    lineProcessor?: (line: string) => string;
    /** What command should we use to exit (default: /exit) */
    exitCommand?: string;
    /** Array of exit codes to treat as successful (default: [0]) */
    successExitCodes?: number[];
    /** Newline sequence to append to write() commands (default: '\x1b\r') */
    newlineSequence?: string;
    /** Delay in ms before appending newline sequence (default: 10) */
    newlineDelay?: number;
}

/**
 * Result of running a command through PTY.
 */
export interface PtyRunResult {
    /** AsyncGenerator yielding StreamingEvent objects */
    stream: AsyncGenerator<StreamingEvent, void, unknown>;
    /** Function to kill the PTY process */
    kill: () => void;
    /** Function to write to the PTY process */
    write: (data: string) => void;
}

/**
 * Default batching tiers based on Claude's current values.
 */
const DEFAULT_BATCH_TIERS = [
    { chars: 10000, timeout: 10 }, // Yield almost immediately for large chunks
    { chars: 2000, timeout: 100 }, // Yield quickly for medium chunks
    { chars: 100, timeout: 2000 }, // Standard timeout for smaller chunks
    { chars: 0, timeout: 4000 }, // Final fallback timeout if buffer has any content
];

/**
 * Run a command through PTY and stream its output as StreamingEvent objects.
 *
 * @param command - CLI command to execute
 * @param args - Arguments to pass to the command
 * @param options - Configuration options
 * @returns PtyRunResult with stream and kill function
 */
export function runPty(
    command: string,
    args: string[],
    options: PtyRunOptions
): PtyRunResult {
    const messageId = options.messageId ?? uuidv4();
    const cwd = options.cwd;
    const env = options.env || process.env;
    const cols = options.cols || 80;
    const rows = options.rows || 60;
    const silenceTimeoutMs = options.silenceTimeoutMs ?? 5000;
    console.log(
        `[runPty] Configured silence timeout: ${silenceTimeoutMs}ms for message ${messageId} (options.silenceTimeoutMs = ${options.silenceTimeoutMs})`
    );
    const batchTiers = options.batch?.tiers || DEFAULT_BATCH_TIERS;
    const noiseFilter = options.noiseFilter || (() => false);
    const promptSeparator = options.promptSeparator || DEFAULT_PROMPT_SEPARATOR;
    const prompt = options.prompt || 'This is a test';
    const readySignal = options.readySignal || null;
    const startSignal =
        options.startSignal ||
        ((line: string): boolean => {
            if (line.includes(promptSeparator)) return true;
            return false;
        });
    const onTokenProgress = options.onTokenProgress;
    const onLine = options.onLine;
    const lineProcessor = options.lineProcessor;
    const exitCommand = options.exitCommand || DEFAULT_EXIT_COMMAND;
    const successExitCodes = options.successExitCodes || [0, 1];
    const newlineSequence = options.newlineSequence || '\r';
    const newlineDelay = options.newlineDelay ?? 100;

    // Queue to pass events from PTY callbacks/timers to the generator loop
    // Moved outside the generator to be accessible to timeout handlers
    const eventQueue: StreamingEvent[] = [];

    // Flag to prevent onStart during write operations - moved outside generator for write() function access
    let writingInProgress = false;

    // Create an async generator to yield StreamingEvent objects
    const stream = (async function* () {
        let deltaPosition = 0;
        let lineBuffer = '';
        let ptyProcess: pty.IPty | null = null;
        let lastYieldedLine: string | null = null;
        let exitRequested = false;
        let ptyExited = false;
        let ptyError: Error | null = null;
        let processingReady = false;
        let processingStarted = options.startImmediately
            ? true
            : startSignal
              ? false
              : true; // Skip the "start signal" logic if not provided

        // --- Delta Batching Logic Variables (moved up for closure access) ---
        let deltaBuffer = '';
        let batchTimerId: NodeJS.Timeout | null = null;
        let currentBatchTimeoutValue: number | null = null;

        // --- Sliding Window History for Deduplication ---
        const historySize = 20; // Increased to catch more duplicates
        const recentHistory: string[] = [];
        const recentHistorySet = new Set<string>();
        const recentNormalizedSet = new Set<string>(); // For fuzzy deduplication

        // --- Console Output Buffering ---
        const consoleBuffers = new Map<string, DeltaBuffer>();

        // --- PTY Silence Timeout Variables ---
        let silenceTimeoutId: NodeJS.Timeout | null = null;

        const onReady = () => {
            if (!processingReady) {
                processingReady = true;
                console.log(
                    '[runPty] Processing ready. Starting prompt retry mechanism...',
                    prompt + `\n\n${promptSeparator}`
                );

                let retryCount = 0;
                const maxRetries = 4;

                // Send prompt initially after 2000ms
                setTimeout(() => {
                    if (!processingStarted) {
                        console.log(
                            '[runPty] Sending initial prompt (attempt 1/5)...'
                        );
                        write(prompt + `\n\n${promptSeparator}`);
                    }
                }, 2000);

                // Set up retry mechanism - check every 3000ms
                const retryInterval = setInterval(() => {
                    if (processingStarted) {
                        console.log(
                            '[runPty] Processing started detected, clearing retry mechanism.'
                        );
                        clearInterval(retryInterval);
                        return;
                    }

                    retryCount++;
                    if (retryCount <= maxRetries) {
                        console.log(
                            `[runPty] Processing not started after ${2000 + retryCount * 3000}ms, sending prompt retry (attempt ${retryCount + 1}/5)...`
                        );
                        write(prompt + `\n\n${promptSeparator}`);
                    } else {
                        console.warn(
                            `[runPty] Giving up after ${retryCount} retries (${2000 + retryCount * 3000}ms total). Processing may not start.`
                        );
                        clearInterval(retryInterval);
                    }
                }, 3000);
            }
        };

        const onStart = () => {
            if (!processingStarted && !writingInProgress) {
                processingStarted = true;
            }
        };

        /**
         * Request graceful exit by sending "{exitCommand}}".
         * If the PTY is still alive after 10s, hard-kill it.
         */
        const requestExit = () => {
            if (exitRequested || !ptyProcess) return; // only once
            exitRequested = true;
            console.log(
                `[runPty] Requesting graceful exit via ${exitCommand} for message ${messageId}`
            );
            try {
                // Try multiple newline variations for better compatibility
                ptyProcess.write(exitCommand);
                setTimeout(
                    () => ptyProcess.write(newlineSequence),
                    newlineDelay
                );
            } catch (e) {
                console.warn(
                    `[runPty] Error sending ${exitCommand} command:`,
                    e
                );
            }

            // Fallback: hard kill if the process is still alive after 10s
            setTimeout(() => {
                if (!ptyExited && ptyProcess) {
                    console.log(
                        `[runPty] Fallback kill after waiting 10s for graceful exit of message ${messageId}`
                    );
                    try {
                        ptyProcess.kill();
                    } catch (killErr) {
                        console.warn(
                            '[runPty] Error during fallback kill:',
                            killErr
                        );
                    }
                }
            }, 10000);
        };

        /**
         * Reset the silence timeout.
         * Called whenever data is received from the PTY process.
         */
        const resetSilenceTimeout = () => {
            if (silenceTimeoutId) clearTimeout(silenceTimeoutId);

            // Check if globally paused
            if (pausedState) {
                silenceTimeoutId = null;
                return;
            }

            const now = Date.now();

            // Update lastActivity in the tracking map
            const timeoutInfo = activeSilenceTimeouts.get(messageId);
            if (timeoutInfo) {
                timeoutInfo.lastActivity = now;
                timeoutInfo.remainingTime = silenceTimeoutMs;
            }
            silenceTimeoutId = setTimeout(() => {
                if (ptyExited) return; // Don't timeout if the PTY has already exited

                // Check the time since we set this timeout - if data was received recently, reset
                const timeSinceReset = Date.now() - now;
                if (timeSinceReset < silenceTimeoutMs - 100) {
                    // This timeout fired too early, something is wrong
                    console.warn(
                        `[runPty] Silence timeout fired early (after ${timeSinceReset}ms, expected ${silenceTimeoutMs}ms). Resetting.`
                    );
                    resetSilenceTimeout();
                    return;
                }

                // Don't timeout if we have buffered data waiting to be yielded
                if (deltaBuffer.length > 0 || lineBuffer.length > 0) {
                    console.log(
                        `[runPty] Silence timeout reached but data is buffered (delta: ${deltaBuffer.length}, line: ${lineBuffer.length}). Resetting timeout.`
                    );
                    resetSilenceTimeout();
                    return;
                }

                // Check if there are pending events in the queue
                if (eventQueue.length > 0) {
                    console.log(
                        `[runPty] Silence timeout reached but event queue has ${eventQueue.length} pending events. Resetting timeout.`
                    );
                    resetSilenceTimeout();
                    return;
                }

                // For long-running processes, be more lenient
                const isLongRunningCommand =
                    command === 'claude' && silenceTimeoutMs >= 30000;
                if (isLongRunningCommand) {
                    // Check if we've been actively processing recently
                    const info = activeSilenceTimeouts.get(messageId);
                    if (
                        info &&
                        Date.now() - info.lastActivity < silenceTimeoutMs
                    ) {
                        console.log(
                            `[runPty] Long-running command still active (last activity ${Date.now() - info.lastActivity}ms ago). Extending timeout.`
                        );
                        resetSilenceTimeout();
                        return;
                    }
                }

                console.error(
                    `[runPty] PTY process timed out after ${silenceTimeoutMs}ms of silence for message ${messageId}. Requesting graceful exit.`
                );
                console.error(
                    `[runPty] Timeout details: deltaBuffer.length=${deltaBuffer.length}, lineBuffer.length=${lineBuffer.length}, processingStarted=${processingStarted}, eventQueue.length=${eventQueue.length}`
                );

                ptyError = new Error(
                    `PTY process timed out after ${silenceTimeoutMs / 1000} seconds of silence (graceful exit requested).`
                );

                requestExit();
                activeSilenceTimeouts.delete(messageId);
            }, silenceTimeoutMs);

            // Track this timeout in our map - update lastActivity
            activeSilenceTimeouts.set(messageId, {
                timeoutId: silenceTimeoutId,
                remainingTime: silenceTimeoutMs,
                lastActivity: now,
                messageId: messageId,
            });
        };

        /**
         * Clears the batch timer and pushes the current deltaBuffer
         * content onto the eventQueue if the buffer is not empty.
         */
        const yieldBufferedDelta = () => {
            if (batchTimerId) {
                clearTimeout(batchTimerId);
                batchTimerId = null;
                currentBatchTimeoutValue = null;
            }
            if (deltaBuffer.length > 0) {
                console.log(
                    `[runPty] Yielding buffered delta (${deltaBuffer.length} chars) for message ${messageId}`
                );
                eventQueue.push({
                    type: 'message_delta',
                    content: deltaBuffer,
                    message_id: messageId,
                    order: deltaPosition++,
                } as MessageEvent);
                deltaBuffer = '';
            }
        };

        /**
         * Start or reset a batch timer based on current buffer size
         */
        const startBatchTimer = () => {
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
            for (const tier of batchTiers) {
                if (deltaBuffer.length >= tier.chars) {
                    applicableTimeout = tier.timeout;
                    break;
                }
            }

            if (applicableTimeout === null) {
                console.warn(
                    '[runPty] No applicable batch timeout found, using fallback.'
                );
                applicableTimeout =
                    batchTiers[batchTiers.length - 1]?.timeout ?? 4000;
            }

            // If a timer is already running with the same timeout, don't reset it
            if (batchTimerId) {
                if (currentBatchTimeoutValue === applicableTimeout) {
                    return;
                } else {
                    clearTimeout(batchTimerId);
                    batchTimerId = null;
                    currentBatchTimeoutValue = null;
                }
            }

            console.log(
                `[runPty] Setting batch timer for ${applicableTimeout}ms (buffer: ${deltaBuffer.length} chars) for message ${messageId}`
            );
            currentBatchTimeoutValue = applicableTimeout;
            batchTimerId = setTimeout(() => {
                console.log(
                    `[runPty] Batch timer (${applicableTimeout}ms) expired, yielding buffer for message ${messageId}.`
                );
                batchTimerId = null;
                currentBatchTimeoutValue = null;
                //deltaBuffer += '\n'; // Add newline to separate from next delta
                yieldBufferedDelta();
            }, applicableTimeout);
        };

        try {
            // Yield message_start event immediately
            console.log(`[runPty] Starting stream for message ${messageId}`);
            yield {
                type: 'message_start',
                content: '',
                message_id: messageId,
                order: deltaPosition++,
            } as MessageEvent;

            // Create a Promise to manage PTY process completion/failure
            const completionPromise = new Promise<void>(resolve => {
                try {
                    console.log(
                        `[runPty] Spawning PTY: ${command} ${args.map(a => (a.length > 50 ? a.substring(0, 50) + '...' : a)).join(' ')}`
                    );

                    ptyProcess = pty.spawn(command, args, {
                        name: 'xterm-color',
                        cols,
                        rows,
                        cwd,
                        env,
                    });

                    activePtyProcesses.add(ptyProcess);
                    // Store in the map for proper kill() lookup
                    if (ptyProcess) {
                        ptyMap.set(messageId, ptyProcess);
                        // Store custom exit command for this PTY
                        ptyExitCommands.set(ptyProcess, exitCommand);
                    }

                    resetSilenceTimeout();

                    // Handle data from the PTY process
                    ptyProcess.onData((data: string) => {
                        try {
                            // Reset silence timeout immediately when any data is received
                            resetSilenceTimeout();

                            // Buffer raw console output and emit coalesced chunks
                            for (const ev of bufferDelta<StreamingEvent>(
                                consoleBuffers,
                                messageId,
                                data,
                                (content): StreamingEvent =>
                                    ({
                                        type: 'console',
                                        data: content,
                                        timestamp: new Date().toISOString(),
                                        message_id: messageId,
                                        agent: undefined, // Required base StreamEvent property
                                    }) as ConsoleEvent
                            )) {
                                eventQueue.push(ev);
                            }

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
                                resetSilenceTimeout();

                                const trimmedLine = line.trim();
                                if (!trimmedLine.length) continue;

                                // Special handling for Claude's summary separator
                                if (trimmedLine === '------') {
                                    // Immediately flush buffer on Claude's cost summary separator
                                    yieldBufferedDelta();
                                }

                                // Invoke onLine callback if provided
                                if (onLine) {
                                    onLine(line);
                                }

                                // --- Skip until ready signal logic ---
                                if (!processingReady) {
                                    if (!readySignal) {
                                        // Ready immediately once we have data
                                        onReady();
                                    } else if (readySignal(trimmedLine)) {
                                        console.log(
                                            `[runPty] Processing ready detected for message ${messageId}.`
                                        );
                                        onReady();
                                    } else {
                                        continue;
                                    }
                                }

                                // --- Skip until start signal logic ---
                                if (!processingStarted && startSignal) {
                                    if (startSignal(trimmedLine)) {
                                        console.log(
                                            `[runPty] Processing started detected for message ${messageId}.`
                                        );
                                        onStart();
                                    }
                                    // Always skip processing this line even if we start (so we don't put the start characters in the output)
                                    continue;
                                }

                                // Process line only if processing has started
                                if (
                                    !noiseFilter(trimmedLine, onTokenProgress)
                                ) {
                                    // Check for [complete] signal to initiate graceful exit sequence
                                    // Handle both plain [complete] and variations like "✦ [complete]"
                                    if (
                                        trimmedLine === '[complete]' ||
                                        trimmedLine.endsWith('[complete]')
                                    ) {
                                        console.log(
                                            `[runPty] Early completion signal "[complete]" detected for message ${messageId}. Requesting graceful exit.`
                                        );
                                        requestExit();
                                        continue;
                                    }

                                    let shouldBuffer = true;

                                    // --- Deduplication Logic ---
                                    // Avoid exact consecutive duplicates
                                    if (line === lastYieldedLine) {
                                        shouldBuffer = false;
                                    }

                                    // Normalize line for fuzzy comparison
                                    const normalizedLine = line
                                        .replace(/\s+/g, ' ') // Collapse whitespace
                                        .trim()
                                        .toLowerCase();

                                    // Skip if exact match in recent history
                                    if (
                                        shouldBuffer &&
                                        recentHistorySet.has(line)
                                    ) {
                                        shouldBuffer = false;
                                    }

                                    // Skip if normalized version matches (handles wrapped lines)
                                    if (
                                        shouldBuffer &&
                                        normalizedLine.length > 10 && // Only for meaningful lines
                                        recentNormalizedSet.has(normalizedLine)
                                    ) {
                                        shouldBuffer = false;
                                    }

                                    // Check if this line is a substring of a recent line or vice versa
                                    // This handles cases where content is output in parts
                                    if (
                                        shouldBuffer &&
                                        normalizedLine.length > 20
                                    ) {
                                        for (const recentNorm of recentNormalizedSet) {
                                            if (recentNorm.length > 20) {
                                                // Check if one contains a significant portion of the other
                                                if (
                                                    normalizedLine.includes(
                                                        recentNorm
                                                    ) ||
                                                    recentNorm.includes(
                                                        normalizedLine
                                                    )
                                                ) {
                                                    // Only skip if they're very similar in length
                                                    const lengthRatio =
                                                        Math.min(
                                                            normalizedLine.length,
                                                            recentNorm.length
                                                        ) /
                                                        Math.max(
                                                            normalizedLine.length,
                                                            recentNorm.length
                                                        );
                                                    if (lengthRatio > 0.8) {
                                                        shouldBuffer = false;
                                                        break;
                                                    }
                                                }

                                                // Also check if lines start the same way (handles truncated duplicates)
                                                // This catches cases like "Shell: /app/projects..." appearing multiple times
                                                const minLen = Math.min(
                                                    normalizedLine.length,
                                                    recentNorm.length,
                                                    30
                                                );
                                                if (
                                                    minLen > 15 &&
                                                    normalizedLine.substring(
                                                        0,
                                                        minLen
                                                    ) ===
                                                        recentNorm.substring(
                                                            0,
                                                            minLen
                                                        )
                                                ) {
                                                    shouldBuffer = false;
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    if (shouldBuffer) {
                                        // Apply line processor if provided
                                        const processedLine = lineProcessor
                                            ? lineProcessor(line)
                                            : line;

                                        // Append valid, non-duplicate content to the batch buffer
                                        deltaBuffer += processedLine + '\n';
                                        // Update last yielded line for next dedupe check
                                        lastYieldedLine = processedLine;

                                        // --- Update Sliding Window History ---
                                        recentHistory.push(line);
                                        recentHistorySet.add(line);
                                        if (normalizedLine.length > 10) {
                                            recentNormalizedSet.add(
                                                normalizedLine
                                            );
                                        }

                                        // Maintain history size
                                        if (
                                            recentHistory.length > historySize
                                        ) {
                                            const oldestLine =
                                                recentHistory.shift()!;
                                            recentHistorySet.delete(oldestLine);

                                            // Also remove from normalized set
                                            const oldestNormalized = oldestLine
                                                .replace(/\s+/g, ' ')
                                                .trim()
                                                .toLowerCase();
                                            recentNormalizedSet.delete(
                                                oldestNormalized
                                            );
                                        }

                                        // Start or adjust batch timer
                                        startBatchTimer();
                                    }
                                }
                            }
                        } catch (processingError: any) {
                            console.error(
                                '[runPty] Error processing PTY data:',
                                processingError
                            );
                            ptyError = new Error(
                                `Error processing PTY data: ${processingError.message}`
                            );
                            ptyExited = true;
                            if (silenceTimeoutId)
                                clearTimeout(silenceTimeoutId);
                            if (batchTimerId) {
                                clearTimeout(batchTimerId);
                                batchTimerId = null;
                                currentBatchTimeoutValue = null;
                            }
                            if (ptyProcess) {
                                try {
                                    requestExit();
                                } catch (e) {
                                    console.warn(
                                        '[runPty] Error during kill on data processing error',
                                        e
                                    );
                                }
                            }
                            resolve();
                        }
                    });

                    // Handle PTY process exit
                    ptyProcess.onExit(({ exitCode, signal }) => {
                        console.log(
                            `[runPty] PTY process exited with code ${exitCode}${
                                signal ? ` (signal ${signal})` : ''
                            } for message ${messageId}.`
                        );

                        // Log more details about the exit
                        if (signal) {
                            console.log(
                                `[runPty] Process terminated by signal: ${signal}`
                            );
                            // SIGHUP has signal number 1
                            if (signal === 1) {
                                console.warn(
                                    '[runPty] SIGHUP (signal 1) detected - likely io_uring PTY bug. Ensure UV_USE_IO_URING=0 is set.'
                                );
                            }
                        }
                        ptyExited = true;
                        activePtyProcesses.delete(ptyProcess);
                        // Clean up the ptyMap and exit command map
                        ptyMap.delete(messageId);
                        ptyExitCommands.delete(ptyProcess);
                        // Clean up timeout tracking
                        activeSilenceTimeouts.delete(messageId);

                        if (silenceTimeoutId) clearTimeout(silenceTimeoutId);

                        // Process any remaining data left in the line buffer
                        try {
                            const finalTrimmedLine = lineBuffer.trim();

                            // Invoke onLine callback if provided and line isn't empty
                            if (onLine && finalTrimmedLine) {
                                onLine(finalTrimmedLine);
                            }

                            if (
                                processingStarted &&
                                finalTrimmedLine &&
                                !noiseFilter(finalTrimmedLine, onTokenProgress)
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
                                    // Add final part to buffer
                                    deltaBuffer += finalTrimmedLine;
                                }
                            }
                        } catch (finalProcessingError: any) {
                            console.error(
                                '[runPty] Error processing final PTY buffer:',
                                finalProcessingError
                            );
                        }

                        // Yield any remaining buffered content
                        yieldBufferedDelta();

                        // Flush any remaining buffered console output
                        for (const ev of flushBufferedDeltas<StreamingEvent>(
                            consoleBuffers,
                            (id, content): StreamingEvent =>
                                ({
                                    type: 'console',
                                    data: content,
                                    timestamp: new Date().toISOString(),
                                    message_id: id,
                                    agent: undefined, // Required base StreamEvent property
                                }) as ConsoleEvent
                        )) {
                            eventQueue.push(ev);
                        }

                        // Resolve or reject the completion promise based on outcome
                        if (ptyError) {
                            resolve(); // Resolve, let generator handle ptyError flag
                        } else if (successExitCodes.includes(exitCode)) {
                            console.log(
                                `[runPty] PTY process exited with acceptable code ${exitCode} for message ${messageId}`
                            );
                            resolve(); // Success
                        } else {
                            // PTY exited with non-zero code without a prior error flag set
                            const errorMsg = `PTY process failed with exit code ${exitCode}${
                                signal ? ` (signal ${signal})` : ''
                            }.`;
                            console.error(`[runPty] ${errorMsg}`);
                            ptyError = new Error(errorMsg);
                            resolve(); // Resolve, let generator handle ptyError flag instead of rejecting
                        }
                    });
                } catch (spawnError: any) {
                    console.error(
                        '[runPty] Error spawning PTY process:',
                        spawnError
                    );
                    ptyError = spawnError;
                    ptyExited = true;
                    // Clean up timeout tracking
                    activeSilenceTimeouts.delete(messageId);
                    if (silenceTimeoutId) clearTimeout(silenceTimeoutId);
                    if (batchTimerId) {
                        clearTimeout(batchTimerId);
                        batchTimerId = null;
                        currentBatchTimeoutValue = null;
                    }
                    resolve(); // Resolve, let generator handle ptyError flag instead of rejecting
                }
            });

            // Main Generator Loop: Process event queue and wait for completion
            while (!ptyExited || eventQueue.length > 0) {
                // Yield all events currently in the queue
                while (eventQueue.length > 0) {
                    const event = eventQueue.shift()!;
                    yield event;
                }
                // If the process hasn't exited yet, pause briefly to avoid busy-waiting
                if (!ptyExited) {
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            // Wait for the completionPromise to settle
            await completionPromise;

            // Determine final state
            if (ptyError && !String(ptyError).includes('timed out')) {
                throw ptyError;
            }
        } catch (error: unknown) {
            console.error(
                '[runPty] Error during PTY streaming execution:',
                error
            );
            const errorMessage = String(error);

            yield {
                type: 'error',
                error: `PTY stream error: ${errorMessage}`,
                agent: undefined, // Required base StreamEvent property
            } as ErrorEvent;
        } finally {
            if (silenceTimeoutId) clearTimeout(silenceTimeoutId);
            if (batchTimerId) {
                clearTimeout(batchTimerId);
                batchTimerId = null;
                currentBatchTimeoutValue = null;
            }

            console.log(
                `[runPty] Finishing stream processing for message ${messageId}.`
            );

            // Final safeguard: if the PTY is still alive and we never asked for /exit, do it now
            if (ptyProcess && !exitRequested) {
                requestExit();
            }
        }
    })();

    /**
     * Kill function to terminate the PTY process.
     */
    const kill = () => {
        console.log(`[runPty] Kill requested for message ${messageId}`);

        // Use the ptyMap to find the process, rather than comparing PIDs and UIDs
        const ptyProcess = ptyMap.get(messageId);

        if (ptyProcess) {
            try {
                // Try multiple newline variations for better compatibility
                ptyProcess.write(exitCommand);
                setTimeout(
                    () => ptyProcess.write(newlineSequence),
                    newlineDelay
                );
                setTimeout(() => {
                    if (activePtyProcesses.has(ptyProcess)) {
                        try {
                            ptyProcess.kill();
                            activePtyProcesses.delete(ptyProcess);
                            ptyMap.delete(messageId);
                            ptyExitCommands.delete(ptyProcess);
                            // Clean up timeout tracking
                            activeSilenceTimeouts.delete(messageId);
                        } catch (e) {
                            console.warn('[runPty] Error during kill:', e);
                        }
                    }
                }, 10000);
            } catch (e) {
                console.warn('[runPty] Error during kill:', e);
            }
        }
    };

    /**
     * Write function to send data to the PTY process.
     * Automatically appends the configured newline sequence after a small delay.
     * Temporarily disables onStart() during the write operation to prevent
     * processingStarted from being set until after the newline sequence.
     */
    const write = (data: string) => {
        const ptyProcess = ptyMap.get(messageId);
        if (ptyProcess) {
            try {
                // Disable onStart() during write operation
                writingInProgress = true;

                ptyProcess.write(data);

                setTimeout(() => {
                    try {
                        // Re-enable onStart() just before sending newline
                        writingInProgress = false;
                        ptyProcess.write(newlineSequence);
                    } catch (e) {
                        console.warn(
                            '[runPty] Error during delayed newline write:',
                            e
                        );
                        writingInProgress = false; // Ensure flag is reset on error
                    }
                }, newlineDelay);
            } catch (e) {
                console.warn('[runPty] Error during write:', e);
                writingInProgress = false; // Ensure flag is reset on error
            }
        } else {
            console.warn(
                `[runPty] No PTY process found for message ${messageId}`
            );
        }
    };

    return { stream, kill, write };
}

/**
 * Pause all silence timeouts globally
 */
export function pauseAllSilenceTimeouts(): void {
    if (pausedState) {
        console.log('[runPty] Already in paused state, skipping pause');
        return;
    }

    pausedState = true;
    const now = Date.now();

    console.log(
        `[runPty] Pausing all silence timeouts (${activeSilenceTimeouts.size} active)`
    );

    for (const [messageId, info] of activeSilenceTimeouts) {
        if (info.timeoutId) {
            clearTimeout(info.timeoutId);
            info.timeoutId = null;
            // Calculate remaining time
            const elapsed = now - info.lastActivity;
            info.remainingTime = Math.max(0, info.remainingTime - elapsed);
            console.log(
                `[runPty] Paused timeout for message ${messageId}, elapsed: ${elapsed}ms, remaining: ${info.remainingTime}ms`
            );
        } else {
            console.log(
                `[runPty] Timeout for message ${messageId} was already cleared`
            );
        }
    }
}

/**
 * Resume all silence timeouts globally
 */
export function resumeAllSilenceTimeouts(): void {
    if (!pausedState) {
        console.log('[runPty] Not in paused state, skipping resume');
        return;
    }

    pausedState = false;
    const now = Date.now();

    console.log(
        `[runPty] Resuming all silence timeouts (${activeSilenceTimeouts.size} active)`
    );

    for (const [messageId, info] of activeSilenceTimeouts) {
        if (!info.timeoutId && info.remainingTime > 0) {
            info.lastActivity = now;
            info.timeoutId = setTimeout(() => {
                console.error(
                    `[runPty] PTY process timed out after pause/resume for message ${messageId}`
                );
                // Find the PTY process and request exit
                const ptyProcess = ptyMap.get(messageId);
                if (ptyProcess) {
                    try {
                        const exitCommand =
                            ptyExitCommands.get(ptyProcess) ||
                            DEFAULT_EXIT_COMMAND;
                        // Use the same newline variations as requestExit for consistency
                        ptyProcess.write(exitCommand);
                        setTimeout(() => ptyProcess.write('\r'), 100);
                    } catch (e) {
                        console.warn('[runPty] Error sending exit command:', e);
                    }
                }
                activeSilenceTimeouts.delete(messageId);
            }, info.remainingTime);
            console.log(
                `[runPty] Resumed timeout for message ${messageId}, will timeout in ${info.remainingTime}ms`
            );
        } else if (info.timeoutId) {
            console.log(
                `[runPty] Timeout for message ${messageId} already has an active timer`
            );
        } else if (info.remainingTime <= 0) {
            console.log(
                `[runPty] Timeout for message ${messageId} has no remaining time, removing`
            );
            activeSilenceTimeouts.delete(messageId);
        }
    }
}

/**
 * Send a command to all active PTY processes
 * Used for pausing/resuming code providers
 */
export function sendToAllPtyProcesses(command: string): void {
    console.log(
        `[runPty] Sending command to ${activePtyProcesses.size} active PTY processes: ${JSON.stringify(command)}`
    );

    // Check if this is a pause or resume command
    if (command === '\x1b\x1b') {
        // Pause command - pause all timeouts globally
        pauseAllSilenceTimeouts();
    } else if (command.startsWith('Please continue')) {
        // Resume command - resume all timeouts globally
        resumeAllSilenceTimeouts();
    }

    for (const ptyProcess of activePtyProcesses) {
        try {
            ptyProcess.write(command);
            if (command[0] !== '\x1b\x1b') {
                setTimeout(() => ptyProcess.write('\r'), 100);
            }
        } catch (e) {
            console.warn('[runPty] Error sending command to PTY process:', e);
        }
    }
}

/**
 * Send a command to a specific PTY process by messageId
 * Used for pausing/resuming individual code providers
 */
export function sendToPtyProcess(messageId: string, command: string): void {
    const ptyProcess = ptyMap.get(messageId);
    if (!ptyProcess) {
        console.warn(`[runPty] No PTY process found for message ${messageId}`);
        return;
    }

    console.log(
        `[runPty] Sending command to PTY process for message ${messageId}: ${JSON.stringify(command)}`
    );

    // Check if this is a pause or resume command
    if (command === '\x1b\x1b') {
        // Pause command - pause all timeouts globally
        pauseAllSilenceTimeouts();
    } else if (command.startsWith('Please continue')) {
        // Resume command - resume all timeouts globally
        resumeAllSilenceTimeouts();
    }

    try {
        ptyProcess.write(command);
        if (command[0] !== '\x1b\x1b') {
            setTimeout(() => ptyProcess.write('\r'), 100);
        }
    } catch (e) {
        console.warn('[runPty] Error sending command to PTY process:', e);
    }
}
