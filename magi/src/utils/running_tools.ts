/**
 * Tools for managing running functions
 */
import { createToolFunction } from './tool_call.js';
import { runningToolTracker } from './running_tool_tracker.js';
import { sendStreamEvent } from './communication.js'; // Added import

/**
 * Get the status of a running function
 *
 * @param id Function ID
 * @returns The status of the function
 */
async function inspect_running_tool(runningToolId: string): Promise<string> {
    return runningToolTracker.getStatus(runningToolId);
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
    timeout: number = 300
): Promise<string> {
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    let lastHeartbeatTime = Date.now();
    let finalResult = ''; // To store the final message

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
    if (initialTool.status !== 'running') {
        // Already finished before we started waiting
        switch (initialTool.status) {
            case 'completed':
                return (
                    initialTool.output ??
                    `Tool ${runningToolId} completed (status checked before wait).`
                );
            case 'failed':
                return (
                    initialTool.error ??
                    `Tool ${runningToolId} failed (status checked before wait).`
                );
            case 'terminated':
                return `Tool ${runningToolId} was terminated (status checked before wait).`;
            default:
                return `Tool ${runningToolId} has unexpected status '${initialTool.status}' before waiting began.`;
        }
    }

    // Polling loop
    while (Date.now() - startTime < timeoutMs) {
        const tool = runningToolTracker.getRunningTool(runningToolId);

        if (!tool) {
            // Tool finished (completed or failed) and was removed from the tracker.
            finalResult = `Running tool with ID ${runningToolId} has finished execution. Check system messages for final status and output/error.`;
            break; // Exit loop
        }

        switch (tool.status) {
            case 'completed':
                finalResult =
                    tool.output ??
                    `Running tool ${runningToolId} completed. Check system messages for output.`;
                break; // Exit loop
            case 'failed':
                finalResult =
                    tool.error ??
                    `Running tool ${runningToolId} failed. Check system messages for error details.`;
                break; // Exit loop
            case 'terminated':
                finalResult = `Running tool ${runningToolId} was terminated.`;
                break; // Exit loop
            case 'running':
                // Send heartbeat if needed
                if (Date.now() - lastHeartbeatTime > TOOL_HEARTBEAT_MS) {
                    sendStreamEvent({
                        type: 'tool_waiting',
                        runningToolId,
                        elapsedSeconds: Math.round(
                            (Date.now() - startTime) / 1000
                        ),
                        timestamp: new Date().toISOString(),
                    });
                    lastHeartbeatTime = Date.now();
                }
                // Still running, wait and check again
                await new Promise(resolve => setTimeout(resolve, 500)); // Poll every 500ms
                continue; // Continue loop
            default:
                // Should not happen with defined statuses
                console.error(
                    `Unexpected status '${tool.status}' for tool ${runningToolId}`
                );
                finalResult = `Error: Encountered unexpected status '${tool.status}' for tool ${runningToolId}.`;
                break; // Exit loop
        }
        // If we reached here, the status was not 'running', so break the loop
        break;
    }

    // If the loop finished due to timeout
    if (!finalResult) {
        const finalStatus = runningToolTracker.getStatus(runningToolId); // Get last known status for context
        finalResult = `Tool ${runningToolId} did not complete within the ${timeout} second timeout. It might still be running.\nLast known status:\n${finalStatus}`;
    }

    // Send completion event
    sendStreamEvent({
        type: 'tool_wait_complete',
        runningToolId,
        result: finalResult,
        finalStatus:
            runningToolTracker.getRunningTool(runningToolId)?.status ??
            'unknown',
        timestamp: new Date().toISOString(),
    });

    return finalResult;
}

/**
 * Terminate a running function
 *
 * @param id RunningTool ID
 * @returns Success or failure message
 */
async function terminate_running_tool(runningToolId: string): Promise<string> {
    const success =
        await runningToolTracker.terminateRunningTool(runningToolId);
    if (success) {
        return `RunningTool with ID ${runningToolId} was successfully terminated.`;
    } else {
        return `Could not terminate RunningTool with ID ${runningToolId}. It may not exist or is not in a running state.`;
    }
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
                id: 'The ID of the running tool to wait for',
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
