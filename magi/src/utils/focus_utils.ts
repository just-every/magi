/**
 * Focus utilities for the Overseer agent.
 *
 * Allows the Overseer to focus on a specific browser tab, agent, or process
 * and receive updates about it in each thought cycle.
 */

import { createToolFunction } from './tool_call.js';
import { ToolFunction } from '../types/shared-types.js';
import { getHistory } from './history.js';
import { processTracker } from './process_tracker.js';
import { getAgentBrowserSession } from './browser_session.js';
import type { BrowserStatusPayload } from './cdp/browser_helpers.js';

export type FocusKind = 'none' | 'browser_tab' | 'agent' | 'process';

export interface OverseerFocus {
    kind: FocusKind;
    tabId?: string; // chromium tab id
    agentId?: string; // MAGI agent id
    processId?: string; // task / process id
    lastUpdated: number; // millis – guards against stale focus
}

// In-memory singleton for the current focus
let currentFocus: OverseerFocus = { kind: 'none', lastUpdated: Date.now() };

/**
 * Clear the current focus
 * @returns Confirmation message
 */
function clear_focus(): string {
    currentFocus = { kind: 'none', lastUpdated: Date.now() };
    return 'Overseer focus cleared.';
}

/**
 * Get the current focus information
 * @returns Current focus object
 */
export function get_focus(): string {
    return JSON.stringify({ ...currentFocus });
}

/**
 * Set focus to a specific browser tab
 * @param tabId Chrome tab ID to focus on
 * @returns Status message
 */
/**
 * Take a screenshot of a specific browser tab
 *
 * @param tabId The tab ID to screenshot
 * @param opts Options for screenshot
 * @returns Screenshot data with URL, viewport info and base64 image
 */
export async function screenshotTab(tabId: string): Promise<{
    screenshot: string;
    url: string;
    view: any;
    full?: any;
    coreTabs?: any[];
}> {
    console.log(`[focus_utils] Taking screenshot of tab: ${tabId}`);
    try {
        const session = getAgentBrowserSession(tabId);
        const result = await session.browserStatus();
        if (!result) {
            throw new Error('No result from browser session');
        }
        if ('error' in result) {
            throw new Error(`Browser error: ${result.error}`);
        }
        return result as BrowserStatusPayload;
    } catch (error: any) {
        console.error(
            `[focus_utils] Error taking screenshot of tab ${tabId}:`,
            error
        );
        throw error;
    }
}

/**
 * Set focus to a specific browser tab
 * @param tabId Chrome tab ID to focus on
 * @returns Status message
 */
export function setBrowserTabFocus(tabId: string): string {
    return set_focus('browser_tab', tabId);
}

/**
 * Set focus to a specific agent
 * @param agentId MAGI agent ID to focus on
 * @returns Status message
 */
export function set_agent_focus(agentId: string): string {
    return set_focus('agent', agentId);
}

/**
 * Set focus to a specific process/task
 * @param processId Task/process ID to focus on
 * @returns Status message
 */
export function set_process_focus(processId: string): string {
    return set_focus('process', processId);
}

/**
 * Set focus to a specific resource type
 * @param type Type of focus ('browser_tab', 'agent', or 'process')
 * @param id ID of the resource to focus on
 * @returns Status message
 */
export function set_focus(type: string, id: string): string {
    if (!id) {
        return 'Error: Invalid ID provided';
    }

    if (!['browser_tab', 'agent', 'process'].includes(type)) {
        return `Error: Invalid focus type '${type}'. Must be one of: browser_tab, agent, process`;
    }

    currentFocus = {
        kind: type as FocusKind,
        lastUpdated: Date.now(),
    };

    // Set the appropriate ID field based on the type
    if (type === 'browser_tab') {
        currentFocus.tabId = id;
        return `Focus set to browser tab ${id}`;
    } else if (type === 'agent') {
        currentFocus.agentId = id;
        return `Focus set to agent ${id}`;
    } else if (type === 'process') {
        currentFocus.processId = id;
        return `Focus set to process ${id}`;
    }

    return 'Error: Focus could not be set';
}

/**
 * Build a status block for the current focus
 * @param overseer Overseer agent instance
 * @returns Markdown-formatted status block or empty string if no focus
 */
export async function buildFocusStatusBlock(): Promise<string> {
    const focus = { ...currentFocus };

    // No focus set
    if (focus.kind === 'none') {
        return '';
    }

    // Check if focus is stale (more than 1 hour old)
    const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
    if (Date.now() - focus.lastUpdated > STALE_THRESHOLD_MS) {
        clear_focus();
        return '';
    }

    try {
        // Handle browser tab focus
        if (focus.kind === 'browser_tab' && focus.tabId) {
            const result = await screenshotTab(focus.tabId);

            if (!result || !result.screenshot) {
                return `### Overseer focus (browser tab ${focus.tabId})\n\nUnable to get screenshot. Tab may be closed or inaccessible.`;
            }

            return `### Overseer focus (browser tab ${focus.tabId})\n\nURL: ${result.url || 'Unknown'}\nViewport: ${result.view?.w || 0} × ${result.view?.h || 0} CSS px\n\n![Screenshot](${result.screenshot})`;
        }

        // Handle agent focus
        if (focus.kind === 'agent' && focus.agentId) {
            const MAX_CHARS = 1000;
            // Get all history and filter for this agent (since getHistoryEntries doesn't exist)
            const allHistory = getHistory();
            // Extract content from history related to this agent
            let content = '';

            // Simple approach: just get the last entries up to MAX_CHARS
            // In a real implementation, you'd filter by agent ID more precisely
            for (let i = allHistory.length - 1; i >= 0; i--) {
                const entry = allHistory[i];
                let text = '';

                if ('content' in entry && typeof entry.content === 'string') {
                    text = entry.content;
                } else if (
                    'output' in entry &&
                    typeof entry.output === 'string'
                ) {
                    text = entry.output;
                } else if (
                    'arguments' in entry &&
                    typeof entry.arguments === 'string'
                ) {
                    text = entry.arguments;
                }

                // Check if this entry belongs to the agent we're looking for
                if (text.includes(focus.agentId)) {
                    // Prepend new content (we're going backwards through entries)
                    content = text + '\n\n' + content;

                    // Limit length
                    if (content.length > MAX_CHARS) {
                        content = content.substring(content.length - MAX_CHARS);
                        break;
                    }
                }
            }

            if (!content) {
                return `### Overseer focus (agent ${focus.agentId})\n\nNo recent activity found for this agent.`;
            }

            return `### Overseer focus (agent ${focus.agentId})\n\n\`\`\`\n${content.trim()}\n\`\`\``;
        }

        // Handle process focus
        if (focus.kind === 'process' && focus.processId) {
            const MAX_CHARS = 1000;
            const process = processTracker.getProcess(focus.processId);

            if (!process || !process.output) {
                return `### Overseer focus (process ${focus.processId})\n\nNo log found for this process.`;
            }

            // Limit log to MAX_CHARS
            const log = process.output;
            const limitedLog =
                log.length > MAX_CHARS
                    ? log.substring(log.length - MAX_CHARS)
                    : log;

            return `### Overseer focus (process ${focus.processId})\n\n\`\`\`\n${limitedLog.trim()}\n\`\`\``;
        }
    } catch (error) {
        console.error('[focus_utils] Error building focus block:', error);
        return `### Overseer focus (${focus.kind})\n\nError retrieving focus data: ${error.message || String(error)}`;
    }

    return '';
}

/**
 * Get focus management tools for Overseer
 */
export function getFocusTools(): ToolFunction[] {
    return [
        createToolFunction(
            set_focus,
            'Set Overseer focus to a specific resource. Each thought will include updates for this resource.',
            {
                type: {
                    type: 'string',
                    description:
                        'Type of focus: "browser_tab", "agent", or "process"',
                    enum: ['browser_tab', 'agent', 'process'],
                },
                id: {
                    type: 'string',
                    description:
                        'ID of the resource to focus on (tab ID, agent ID, or process ID)',
                },
            }
        ),
        createToolFunction(clear_focus, 'Clear the current Overseer focus'),
        createToolFunction(
            get_focus,
            'Get information about the current Overseer focus'
        ),
    ];
}
