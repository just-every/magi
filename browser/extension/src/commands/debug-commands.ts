/**
 * Debug command handlers for direct Chrome DevTools Protocol access.
 */

import { ResponseMessage, DebugCommandParams } from '../types';
import { agentTabs, updateAgentTabActivity } from '../state/state';
import {
    attachDebugger,
    detachDebugger,
    sendDebuggerCommand,
} from '../debugger/debugger-control';

/**
 * Sends an arbitrary debugger command to the Chrome DevTools Protocol
 * @param tabId The agent's tab identifier
 * @param params The method and optional command parameters to send
 * @returns Promise resolving to a response message containing the command result
 */
export async function debugCommandHandler(
    tabId: string,
    params: DebugCommandParams
): Promise<ResponseMessage> {
    console.log(
        `[debug-commands] Executing debug command "${params.method}" in tab ${tabId}`
    );

    if (!params.method || typeof params.method !== 'string') {
        return {
            status: 'error',
            error: 'Valid method name is required for debug_command.',
        };
    }

    if (!agentTabs[tabId]) {
        return {
            status: 'error',
            error: `No tab found for agent ${tabId}. Initialize a tab first.`,
        };
    }

    const chromeTabId = agentTabs[tabId].chromeTabId;
    updateAgentTabActivity(tabId);

    try {
        // Attach debugger to the tab
        await attachDebugger(chromeTabId);

        // Send the requested command
        const result = await sendDebuggerCommand(
            chromeTabId,
            params.method,
            params.commandParams
        );

        return {
            status: 'ok',
            result: result,
        };
    } catch (error) {
        console.error(
            `[debug-commands] Debug command failed for ${tabId}:`,
            error
        );
        return {
            status: 'error',
            error: `Debug command failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    } finally {
        try {
            // Detach debugger
            await detachDebugger(chromeTabId);
        } catch (detachError) {
            console.error(
                `[debug-commands] Error detaching debugger:`,
                detachError
            );
            // Don't throw here, already handled the main operation result
        }
    }
}
