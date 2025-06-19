/**
 * Tools for managing running functions
 */
import { createToolFunction, runningToolTracker } from '@just-every/ensemble';
import { sendStreamEvent } from './communication.js'; // Added import

/**
 * Get the status of a running function
 *
 * @param id Function ID
 * @returns The status of the function
 */
async function inspect_running_tool(runningToolId: string): Promise<string> {
    const tool = runningToolTracker.getRunningTool(runningToolId);
    if (!tool) {
        return `RunningTool with ID ${runningToolId} not found.`;
    }

    const duration = Date.now() - tool.startTime;
    let status = 'running';
    if (tool.completed) status = 'completed';
    else if (tool.failed) status = 'failed';
    else if (tool.timedOut) status = 'timed out';

    return `RunningTool ${tool.toolName} (ID: ${runningToolId})
Status: ${status}
Agent: ${tool.agentName}
Duration: ${Math.round(duration / 1000)}s
${tool.result ? `Result: ${tool.result}` : ''}
${tool.error ? `Error: ${tool.error}` : ''}`;
}

/**
 * Wait for a running function
 *
 * @param runningToolId Function ID
 * @param timeout The maximum time to wait for the function to finish, in seconds
 * @returns The final result (output or error) of the tool if it completes or fails within the timeout, a termination message if terminated, or a timeout message.
 */
const TOOL_HEARTBEAT_MS = 30_000; // Heartbeat every 30 seconds

async function wait_for_running_tool(
    runningToolId: string,
    timeout: number = 300,
    abort_signal?: AbortSignal
): Promise<string> {
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    let lastHeartbeatTime = Date.now();
    let finalResult = ''; // To store the final message

    // Create an AbortController if none provided
    const abortController = new AbortController();
    const effectiveAbortSignal = abort_signal || abortController.signal;

    // Register this wait operation as a running tool so it can be interrupted
    const waitToolId = `wait-tool-${runningToolId}-${Date.now()}`;
    const waitTool = runningToolTracker.addRunningTool(
        waitToolId,
        'wait_for_running_tool',
        'system',
        JSON.stringify({ runningToolId, timeout })
    );
    waitTool.abortController = abortController;

    // Send start event
    sendStreamEvent({
        type: 'tool_wait_start',
        runningToolId,
        timestamp: new Date().toISOString(),
        overseer_notification: true, // Let the overseer know we're deliberately waiting
    });

    // Initial check
    const initialTool = runningToolTracker.getRunningTool(runningToolId);
    if (!initialTool) {
        // Could have finished extremely quickly or never existed.
        return `Error: Running tool with ID ${runningToolId} not found or already finished before waiting began.`;
    }
    if (initialTool.completed || initialTool.failed) {
        // Already finished before we started waiting
        if (initialTool.completed) {
            return (
                initialTool.result ??
                `Tool ${runningToolId} completed (status checked before wait).`
            );
        } else if (initialTool.failed) {
            return (
                initialTool.error ??
                `Tool ${runningToolId} failed (status checked before wait).`
            );
        }
    }

    // Polling loop
    while (Date.now() - startTime < timeoutMs) {
        // Check if the operation was aborted
        if (effectiveAbortSignal.aborted) {
            const abortReason = (effectiveAbortSignal as any)?.reason
                ? ` Reason: ${(effectiveAbortSignal as any)?.reason}.`
                : '';
            finalResult = `Wait for running tool ${runningToolId} was aborted.${abortReason}`;
            // Send stream event indicating abort
            sendStreamEvent({
                type: 'tool_wait_complete',
                runningToolId,
                result: finalResult,
                finalStatus: 'aborted',
                timestamp: new Date().toISOString(),
            });
            break; // Exit loop
        }

        const tool = runningToolTracker.getRunningTool(runningToolId);

        if (!tool) {
            // Tool finished (completed or failed) and was removed from the tracker.
            finalResult = `Running tool with ID ${runningToolId} has finished execution. Check system messages for final status and output/error.`;
            break; // Exit loop
        }

        if (tool.completed) {
            finalResult =
                tool.result ??
                `Running tool ${runningToolId} completed. Check system messages for output.`;
            break; // Exit loop
        } else if (tool.failed) {
            finalResult =
                tool.error ??
                `Running tool ${runningToolId} failed. Check system messages for error details.`;
            break; // Exit loop
        } else {
            // Still running
            // Send heartbeat if needed
            if (Date.now() - lastHeartbeatTime > TOOL_HEARTBEAT_MS) {
                sendStreamEvent({
                    type: 'tool_waiting',
                    runningToolId,
                    elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
                    timestamp: new Date().toISOString(),
                });
                lastHeartbeatTime = Date.now();
            }
            // Still running, wait and check again
            try {
                await new Promise((resolve, reject) => {
                    if (abort_signal?.aborted) {
                        reject(new Error('Aborted before delay'));
                        return;
                    }
                    const timerId = setTimeout(resolve, 500);
                    abort_signal?.addEventListener(
                        'abort',
                        () => {
                            clearTimeout(timerId);
                            reject(new Error('Aborted during delay'));
                        },
                        { once: true }
                    );
                });
            } catch (_error) {
                if (abort_signal?.aborted) {
                    const abortReason2 = (abort_signal as any)?.reason
                        ? ` Reason: ${(abort_signal as any)?.reason}.`
                        : '';
                    finalResult = `Wait for running tool ${runningToolId} completed.${abortReason2}`;
                    // Send stream event
                    sendStreamEvent({
                        type: 'tool_wait_complete',
                        runningToolId,
                        result: finalResult,
                        finalStatus: 'aborted',
                        timestamp: new Date().toISOString(),
                    });
                    break; // Exit the switch
                }
                // Re-throw if it's not an abort error, though unlikely here
                // throw error;
            }
            continue; // Continue loop
        }
    }

    // If the loop finished due to timeout
    if (!finalResult) {
        const tool = runningToolTracker.getRunningTool(runningToolId);
        const finalStatus = tool
            ? `Still running after ${Math.round((Date.now() - tool.startTime) / 1000)}s`
            : 'Tool no longer found';
        finalResult = `Tool ${runningToolId} did not complete within the ${timeout} second timeout. It might still be running.\nLast known status: ${finalStatus}`;
    }

    // Send completion event
    sendStreamEvent({
        type: 'tool_wait_complete',
        runningToolId,
        result: finalResult,
        finalStatus: (() => {
            const tool = runningToolTracker.getRunningTool(runningToolId);
            if (!tool) return 'unknown';
            if (tool.completed) return 'completed';
            if (tool.failed) return 'failed';
            return 'running';
        })(),
        timestamp: new Date().toISOString(),
    });

    // Clean up: mark the wait tool as completed
    runningToolTracker.completeRunningTool(
        waitToolId,
        finalResult,
        null as any
    );

    return finalResult;
}

/**
 * Terminate a running function
 *
 * @param id RunningTool ID
 * @returns Success or failure message
 */
async function terminate_running_tool(runningToolId: string): Promise<string> {
    runningToolTracker.abortRunningTool(runningToolId);
    return `Sent abort signal to RunningTool with ID ${runningToolId}. The tool will terminate if it's still running.`;
}

/**
 * Get function management tools
 *
 * @returns Array of tool functions for function management
 */
export function getRunningToolTools() {
    return [
        createToolFunction(
            inspect_running_tool,
            "Show the current output of a running tool. Useful if a tool has been running for a while and you need to check it's progressing.",
            {
                id: 'The ID of the running tool get status for',
            }
        ),
        createToolFunction(
            wait_for_running_tool,
            'Wait for a tool to complete. Avoids you having to check the status of a tool repeatedly.',
            {
                runningToolId: 'The ID of the running tool to wait for',
                timeout: {
                    type: 'number',
                    description:
                        'The maximum time to wait for the tool to finish, in seconds. If the tool completes before this time, you will start again immediately. Defaults to 300 seconds (5 minutes).',
                    default: 300,
                },
            }
        ),
        createToolFunction(
            terminate_running_tool,
            'Terminate a tool running in the background',
            {
                runningToolId: 'The ID of the running tool to stop.',
            }
        ),
    ];
}
