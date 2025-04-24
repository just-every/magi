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
 * Get the current focus information
 */
export function getFocus(): OverseerFocus {
    return { ...currentFocus };
}

/**
 * Clear the current focus
 */
export function clearFocus(): void {
    currentFocus = { kind: 'none', lastUpdated: Date.now() };
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
export async function screenshotTab(
    tabId: string,
    opts = { includeCoreTabs: false }
): Promise<{
    screenshot: string;
    url: string;
    view: any;
    full?: any;
    coreTabs?: any[];
}> {
    console.log(`[focus_utils] Taking screenshot of tab: ${tabId}`);
    try {
        const session = getAgentBrowserSession(tabId);
        const result = await session.browserStatus(
            'viewport',
            opts.includeCoreTabs
        );
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

export function setBrowserTabFocus(tabId: string): string {
    if (!tabId) {
        return 'Error: Invalid tab ID provided';
    }

    currentFocus = {
        kind: 'browser_tab',
        tabId,
        lastUpdated: Date.now(),
    };

    return `Focus set to browser tab ${tabId}`;
}

/**
 * Set focus to a specific agent
 * @param agentId MAGI agent ID to focus on
 * @returns Status message
 */
export function setAgentFocus(agentId: string): string {
    if (!agentId) {
        return 'Error: Invalid agent ID provided';
    }

    currentFocus = {
        kind: 'agent',
        agentId,
        lastUpdated: Date.now(),
    };

    return `Focus set to agent ${agentId}`;
}

/**
 * Set focus to a specific process/task
 * @param processId Task/process ID to focus on
 * @returns Status message
 */
export function setProcessFocus(processId: string): string {
    if (!processId) {
        return 'Error: Invalid process ID provided';
    }

    currentFocus = {
        kind: 'process',
        processId,
        lastUpdated: Date.now(),
    };

    return `Focus set to process ${processId}`;
}

/**
 * Build a status block for the current focus
 * @param overseer Overseer agent instance
 * @returns Markdown-formatted status block or empty string if no focus
 */
export async function buildFocusStatusBlock(): Promise<string> {
    const focus = getFocus();

    // No focus set
    if (focus.kind === 'none') {
        return '';
    }

    // Check if focus is stale (more than 1 hour old)
    const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
    if (Date.now() - focus.lastUpdated > STALE_THRESHOLD_MS) {
        clearFocus();
        return '';
    }

    try {
        // Handle browser tab focus
        if (focus.kind === 'browser_tab' && focus.tabId) {
            const result = await screenshotTab(focus.tabId, {
                includeCoreTabs: false,
            });

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
            setBrowserTabFocus,
            'Set Overseer focus to a specific browser tab. Each thought will include a screenshot of this tab.',
            {
                tabId: {
                    type: 'string',
                    description:
                        'Chrome tab ID to focus on (obtain from list_browser_tabs)',
                },
            }
        ),
        createToolFunction(
            setAgentFocus,
            'Set Overseer focus to a specific agent. Each thought will include the most recent logs from this agent.',
            {
                agentId: {
                    type: 'string',
                    description: 'MAGI agent ID to focus on',
                },
            }
        ),
        createToolFunction(
            setProcessFocus,
            'Set Overseer focus to a specific process/task. Each thought will include the most recent logs from this process.',
            {
                processId: {
                    type: 'string',
                    description: 'Process/task ID to focus on',
                },
            }
        ),
        createToolFunction(clearFocus, 'Clear the current Overseer focus', {}),
        createToolFunction(
            getFocus,
            'Get information about the current Overseer focus',
            {},
            'Current focus information as JSON object'
        ),
    ];
}
