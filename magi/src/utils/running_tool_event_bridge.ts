/**
 * Bridge between RunningToolTracker events and history
 *
 * This module creates a bridge between the long-running tools that complete/fail
 * and the chat history, ensuring tool results appear in conversations without
 * requiring explicit status check tools.
 */

import { runningToolTracker, RunningTool } from './running_tool_tracker.js';
import { addSystemMessage } from './history.js';

// Maximum output length before truncation with a message
const MAX_OUTPUT_LENGTH = 10000;

/**
 * Truncate very long outputs to a reasonable size
 */
function truncateOutput(output: string): string {
    if (output.length <= MAX_OUTPUT_LENGTH) {
        return output;
    }

    return output.substring(0, MAX_OUTPUT_LENGTH) +
        `\n\n... [Output truncated, total length: ${output.length} characters]`;
}

/**
 * Initialize the running tool event bridge
 *
 * This sets up event listeners on the runningToolTracker to convert
 * complete/fail events into system messages in the history
 */
export function initRunningToolEventBridge() {
    // Handle successful tool completion
    runningToolTracker.onComplete((id: string, tool: RunningTool) => {
        const output = tool.output ?? '';

        // Add a system message with the result
        addSystemMessage(
            `Tool ${tool.name} completed with result: ${truncateOutput(output)}`,
            `Tool ${tool.name} (id: ${id}) completed`
        );

        console.log(`[RunningToolBridge] Added completion message for tool ${tool.name} (${id}) to history`);
    });

    // Handle tool failures
    runningToolTracker.onFail((id: string, tool: RunningTool) => {
        const errorMessage = tool.error ?? 'Unknown error';

        // Add a system message with the error
        addSystemMessage(
            `Tool ${tool.name} failed with error: ${errorMessage}`,
            `Tool ${tool.name} (id: ${id}) failed`
        );

        console.log(`[RunningToolBridge] Added error message for tool ${tool.name} (${id}) to history`);
    });

    console.log('[RunningToolBridge] Running tool event bridge initialized');
}
