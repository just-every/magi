/**
 * Tools for managing running functions
 */
import { createToolFunction } from './tool_call.js';
import { runningToolTracker } from './running_tool_tracker.js';

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
        return `Could not terminate function with ID ${runningToolId}. It may not exist or is not in a running state.`;
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
                id: 'The function ID to get status for',
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
