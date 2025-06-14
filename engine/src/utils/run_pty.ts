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

// Map to store custom exit commands for each PTY
const ptyExitCommands = new Map<pty.IPty, string>();

// Map to store silence timeout handlers and remaining time when paused
interface TimeoutInfo {
    timeoutId: NodeJS.Timeout | null;
    remainingTime: number;
    lastActivity: number;
    messageId: string;
}
const activeSilenceTimeouts = new Map<string, TimeoutInfo>();
let pausedState = false;

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
    /** Function to detect when the actual processing/output has started */
    startSignal?: (line: string) => boolean;
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
    /** Whether to emit a message_complete event (default: true) */
    emitComplete?: boolean;
    /** What command should we use to exit (default: /exit) */
    exitCommand?: string;
    /** Array of exit codes to treat as successful (default: [0]) */
    successExitCodes?: number[];
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
    const silenceTimeoutMs = options.silenceTimeoutMs || 5000;
    const batchTiers = options.batch?.tiers || DEFAULT_BATCH_TIERS;
    const noiseFilter = options.noiseFilter || (() => false);
    const startSignal = options.startSignal;
    const onTokenProgress = options.onTokenProgress;
    const onLine = options.onLine;
    const emitComplete =
        options.emitComplete !== undefined ? options.emitComplete : true;
    const exitCommand = options.exitCommand || DEFAULT_EXIT_COMMAND;
    const successExitCodes = options.successExitCodes || [0];

    // Create an async generator to yield StreamingEvent objects
    const stream = (async function* () {
        let deltaPosition = 0;
        let lineBuffer = '';
        let ptyProcess: pty.IPty | null = null;
        let lastYieldedLine: string | null = null;
        let exitRequested = false;
        let ptyExited = false;
        let ptyError: Error | null = null;
        let processingStarted = startSignal ? false : true; // Skip the "start signal" logic if not provided
        
        // --- Delta Batching Logic Variables (moved up for closure access) ---
        let deltaBuffer = '';
        let batchTimerId: NodeJS.Timeout | null = null;
        let currentBatchTimeoutValue: number | null = null;

        // --- Sliding Window History for Deduplication ---
        const historySize = 10;
        const recentHistory: string[] = [];
        const recentHistorySet = new Set<string>();

        // --- Console Output Buffering ---
        const consoleBuffers = new Map<string, DeltaBuffer>();

        // Queue to pass events from PTY callbacks/timers to the generator loop
        const eventQueue: StreamingEvent[] = [];

        // --- PTY Silence Timeout Variables ---
        let silenceTimeoutId: NodeJS.Timeout | null = null;

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
                ptyProcess.write(`${exitCommand}\r\n`);
                setTimeout(() => ptyProcess.write('\r'), 50);
                setTimeout(() => ptyProcess.write('\n'), 100);
                setTimeout(() => ptyProcess.write('\x1b\r'), 150);
                setTimeout(() => ptyProcess.write('\x1b\n'), 200);
                setTimeout(() => ptyProcess.write('\x1b\n\r'), 250);
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

            // Don't start a new timeout if we're paused
            if (pausedState) {
                silenceTimeoutId = null;
                return;
            }

            const now = Date.now();
            silenceTimeoutId = setTimeout(() => {
                if (ptyExited) return; // Don't timeout if the PTY has already exited
                
                // Don't timeout if we have buffered data waiting to be yielded
                if (deltaBuffer.length > 0 || lineBuffer.length > 0) {
                    console.log(
                        `[runPty] Silence timeout reached but data is buffered (delta: ${deltaBuffer.length}, line: ${lineBuffer.length}). Resetting timeout.`
                    );
                    resetSilenceTimeout();
                    return;
                }

                console.error(
                    `[runPty] PTY process timed out after ${silenceTimeoutMs}ms of silence for message ${messageId}. Requesting graceful exit.`
                );
                console.error(
                    `[runPty] Timeout details: deltaBuffer.length=${deltaBuffer.length}, lineBuffer.length=${lineBuffer.length}, processingStarted=${processingStarted}`
                );

                ptyError = new Error(
                    `PTY process timed out after ${silenceTimeoutMs / 1000} seconds of silence (graceful exit requested).`
                );

                requestExit();
                activeSilenceTimeouts.delete(messageId);
            }, silenceTimeoutMs);

            // Track this timeout in our map
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
            
            // Reset silence timeout when setting batch timer
            resetSilenceTimeout();

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
                deltaBuffer += '\n'; // Add newline to separate from next delta
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
            const completionPromise = new Promise<void>((resolve, reject) => {
                try {
                    console.log(
                        `[runPty] Spawning PTY: ${command} ${args.map(a => (a.length > 50 ? a.substring(0, 50) + '...' : a)).join(' ')}`
                    );
                    
                    // Log environment for debugging
                    console.log(`[runPty] UV_USE_IO_URING=${env.UV_USE_IO_URING || 'not set'}`);

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
                                // Also reset silence timeout when console events are emitted
                                resetSilenceTimeout();
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
                                const trimmedLine = line.trim();

                                // Special handling for Claude's summary separator
                                if (trimmedLine === '------') {
                                    // Immediately flush buffer on Claude's cost summary separator
                                    yieldBufferedDelta();
                                }

                                // Invoke onLine callback if provided
                                if (onLine) {
                                    onLine(trimmedLine);
                                    // Reset silence timeout when we process a line via onLine
                                    resetSilenceTimeout();
                                }

                                // Check for [complete] signal to initiate graceful exit sequence
                                if (
                                    processingStarted &&
                                    !noiseFilter(
                                        trimmedLine,
                                        onTokenProgress
                                    ) &&
                                    trimmedLine === '[complete]'
                                ) {
                                    console.log(
                                        `[runPty] Early completion signal "[complete]" detected for message ${messageId}. Requesting graceful exit.`
                                    );
                                    requestExit();
                                    continue;
                                }

                                // --- Skip until start signal logic ---
                                if (!processingStarted && startSignal) {
                                    if (
                                        !noiseFilter(
                                            trimmedLine,
                                            onTokenProgress
                                        )
                                    ) {
                                        if (startSignal(trimmedLine)) {
                                            processingStarted = true;
                                            console.log(
                                                `[runPty] Processing started detected for message ${messageId}.`
                                            );
                                        } else {
                                            // Still in echo phase, skip this line
                                            continue;
                                        }
                                    } else {
                                        // Skip noise lines before processing starts
                                        continue;
                                    }
                                }

                                // Process line only if processing has started
                                if (
                                    processingStarted &&
                                    !noiseFilter(trimmedLine, onTokenProgress)
                                ) {
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

                                    if (shouldBuffer) {
                                        // Add newline back for structure within the buffer
                                        const contentChunk = trimmedLine + '\n';
                                        // Append valid, non-duplicate content to the batch buffer
                                        deltaBuffer += contentChunk;
                                        // Update last yielded line for next dedupe check
                                        lastYieldedLine = trimmedLine;
                                        
                                        // Reset silence timeout when buffering content
                                        resetSilenceTimeout();

                                        // --- Update Sliding Window History ---
                                        recentHistory.push(trimmedLine);
                                        recentHistorySet.add(trimmedLine);
                                        // Maintain history size
                                        if (
                                            recentHistory.length > historySize
                                        ) {
                                            const oldestLine =
                                                recentHistory.shift()!;
                                            recentHistorySet.delete(oldestLine);
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
                            console.log(`[runPty] Process terminated by signal: ${signal}`);
                            // SIGHUP has signal number 1
                            if (signal === 1) {
                                console.warn(`[runPty] SIGHUP (signal 1) detected - likely io_uring PTY bug. Ensure UV_USE_IO_URING=0 is set.`);
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
                            console.log(`[runPty] PTY process exited with acceptable code ${exitCode} for message ${messageId}`);
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
            } else if (emitComplete) {
                // Process finished (either successfully or via timeout), emit complete if desired
                yield {
                    type: 'message_complete',
                    message_id: messageId,
                    content: '', // This will be filled by the caller if needed
                    order: deltaPosition++,
                } as MessageEvent;
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
                ptyProcess.write(`${exitCommand}\r\n`);
                setTimeout(() => ptyProcess.write('\r'), 50);
                setTimeout(() => ptyProcess.write('\n'), 100);
                setTimeout(() => ptyProcess.write('\x1b\r'), 150);
                setTimeout(() => ptyProcess.write('\x1b\n'), 200);
                setTimeout(() => ptyProcess.write('\x1b\n\r'), 250);
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
     */
    const write = (data: string) => {
        const ptyProcess = ptyMap.get(messageId);
        if (ptyProcess) {
            try {
                ptyProcess.write(data);
            } catch (e) {
                console.warn('[runPty] Error during write:', e);
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
 * Pause all active silence timeouts
 */
function pauseAllSilenceTimeouts(): void {
    pausedState = true;
    const now = Date.now();

    for (const [messageId, info] of activeSilenceTimeouts) {
        if (info.timeoutId) {
            clearTimeout(info.timeoutId);
            info.timeoutId = null;
            // Calculate remaining time
            const elapsed = now - info.lastActivity;
            info.remainingTime = Math.max(0, info.remainingTime - elapsed);
            console.log(
                `[runPty] Paused silence timeout for message ${messageId}, remaining time: ${info.remainingTime}ms`
            );
        }
    }
}

/**
 * Resume all paused silence timeouts
 */
function resumeAllSilenceTimeouts(): void {
    pausedState = false;
    const now = Date.now();

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
                        ptyProcess.write(`${exitCommand}\r\n`);
                        setTimeout(() => ptyProcess.write('\r'), 50);
                        setTimeout(() => ptyProcess.write('\n'), 100);
                        setTimeout(() => ptyProcess.write('\x1b\r'), 150);
                        setTimeout(() => ptyProcess.write('\x1b\n'), 200);
                        setTimeout(() => ptyProcess.write('\x1b\n\r'), 250);
                    } catch (e) {
                        console.warn('[runPty] Error sending exit command:', e);
                    }
                }
                activeSilenceTimeouts.delete(messageId);
            }, info.remainingTime);
            console.log(
                `[runPty] Resumed silence timeout for message ${messageId}, will timeout in ${info.remainingTime}ms`
            );
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
        // Pause command - also pause timeouts
        pauseAllSilenceTimeouts();
    } else if (command.startsWith('Please continue')) {
        // Resume command - also resume timeouts
        resumeAllSilenceTimeouts();
    }

    for (const ptyProcess of activePtyProcesses) {
        try {
            ptyProcess.write(command);
        } catch (e) {
            console.warn('[runPty] Error sending command to PTY process:', e);
        }
    }
}
