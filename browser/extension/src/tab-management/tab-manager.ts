/**
 * Tab management functions for the MAGI browser extension.
 */

import {
    agentTabs,
    registerAgentTab,
    removeAgentTab,
    getInactiveAgentTabs,
    updateAgentTabActivity,
} from '../state/state';
import { attachDebugger } from '../debugger/debugger-control';
import {
    TAB_INACTIVITY_TIMEOUT,
    NAVIGATION_TIMEOUT_MS,
    TAB_GROUP_COLLAPSED,
} from '../config/config';
import { ensureMagiTabGroup } from '../utils/tab-group-utils';
import { ResponseMessage } from '../types';

/**
 * Gets or creates a Chrome tab for an agent session
 * @param agentTabId The unique agent identifier
 * @returns Promise resolving to a tab info object
 */
export async function getAgentTab(
    agentTabId: string,
    startUrl?: string
): Promise<{
    chromeTabId: number;
    isNew: boolean;
}> {
    console.log(`[tab-manager] Getting tab for agent: ${agentTabId}`);

    // If we already have a tab for this agent, check if it still exists
    if (agentTabs[agentTabId]) {
        try {
            const tab = await chrome.tabs.get(
                agentTabs[agentTabId].chromeTabId
            );
            if (tab && !tab.discarded) {
                console.log(
                    `[tab-manager] Using existing tab ${tab.id} for agent ${agentTabId}`
                );
                updateAgentTabActivity(agentTabId);
                return { chromeTabId: tab.id!, isNew: false };
            }
        } catch (error) {
            console.warn(
                `[tab-manager] Tab for agent ${agentTabId} no longer exists, creating new tab.`
            );
            // Tab doesn't exist anymore, we'll create a new one
        }
    }

    // Get the currently focused window
    let windowToUse = await chrome.windows.getLastFocused();

    // If no window is focused (e.g., Chrome just started or all windows minimized),
    // get any existing window or create a new one as fallback
    if (!windowToUse || !windowToUse.id || windowToUse.state === 'minimized') {
        // Try to get any existing window
        const existingWindows = await chrome.windows.getAll({
            windowTypes: ['normal'],
        });
        if (existingWindows.length > 0) {
            // Use the first available normal window
            windowToUse = existingWindows[0];
            console.log(
                `[tab-manager] No focused window, using existing window: ${windowToUse.id}`
            );
        } else {
            // No windows available, create a new one
            windowToUse = await chrome.windows.create({ focused: true });
            console.log(
                `[tab-manager] No windows available, created new window: ${windowToUse.id}`
            );
        }
    }

    // Create a new tab in the focused window
    console.log(
        `[tab-manager] Creating new tab for agent ${agentTabId} in window ${windowToUse.id}`
    );
    const createOptions: chrome.tabs.CreateProperties = {
        windowId: windowToUse.id,
        url: startUrl || 'about:blank',
        active: false,
    };

    const newTab = await chrome.tabs.create(createOptions);

    // Add to magi tab group only if it's not the main Magi UI
    let groupId: number | undefined;
    try {
        const tabUrl = startUrl || 'about:blank';
        if (!tabUrl.startsWith('http://localhost:3010')) {
            // Only group non-Magi UI tabs
            groupId = await ensureMagiTabGroup(newTab.id!);

            if (groupId !== -1) {
                console.log(`[tab-manager] Tab added to group: ${groupId}`);

                // Set collapsed state
                if (TAB_GROUP_COLLAPSED) {
                    await chrome.tabGroups.update(groupId, {
                        collapsed: TAB_GROUP_COLLAPSED,
                    });
                }
            }
        } else {
            console.log(`[tab-manager] Not grouping Magi UI tab: ${tabUrl}`);
        }
    } catch (error) {
        console.error('[tab-manager] Error managing tab group:', error);
        // Continue without group if group API fails
    }

    // Register the new tab
    registerAgentTab(agentTabId, newTab.id!, groupId);

    // Automatically attach the debugger to the new tab
    try {
        await attachDebugger(newTab.id!);
        console.log(
            `[tab-manager] Debugger attached to new tab ${newTab.id!} for agent ${agentTabId}`
        );
    } catch (error) {
        // Log error but don't block tab creation if debugger attachment fails
        console.warn(
            `[tab-manager] Failed to attach debugger to new tab ${newTab.id!}:`,
            error
        );
    }

    return { chromeTabId: newTab.id!, isNew: true };
}

/**
 * Closes inactive agent tabs to conserve resources
 */
export async function closeInactiveTabs(): Promise<void> {
    const inactiveAgentTabs = getInactiveAgentTabs(TAB_INACTIVITY_TIMEOUT);

    if (inactiveAgentTabs.length === 0) {
        return;
    }

    console.log(
        `[tab-manager] Closing ${inactiveAgentTabs.length} inactive tabs...`
    );

    for (const agentTabId of inactiveAgentTabs) {
        try {
            if (!agentTabs[agentTabId]) {
                console.log(
                    `[tab-manager] Agent tab ${agentTabId} already removed from tracking, skipping.`
                );
                continue;
            }

            const chromeTabId = agentTabs[agentTabId].chromeTabId;

            // First check if the tab still exists
            try {
                await chrome.tabs.get(chromeTabId);
            } catch (tabError) {
                // Tab doesn't exist anymore, just remove from tracking
                console.log(
                    `[tab-manager] Tab ${chromeTabId} for agent ${agentTabId} no longer exists, cleaning up tracking.`
                );
                removeAgentTab(agentTabId);
                continue;
            }

            // Tab exists, try to close it
            await chrome.tabs.remove(chromeTabId);
            console.log(
                `[tab-manager] Closed inactive tab ${chromeTabId} for agent ${agentTabId}`
            );

            // Remove from our tracking
            removeAgentTab(agentTabId);
        } catch (error) {
            console.error(
                `[tab-manager] Error closing inactive tab for agent ${agentTabId}:`,
                error
            );

            // Clean up tracking regardless of error to prevent repeated attempts
            if (agentTabs[agentTabId]) {
                console.log(
                    `[tab-manager] Removing agent ${agentTabId} from tracking despite close error.`
                );
                removeAgentTab(agentTabId);
            }
        }
    }
}

/**
 * Waits for a tab's navigation to complete with timeout
 * @param chromeTabId The Chrome tab ID
 * @param url The URL being navigated to (for logging)
 * @returns Promise that resolves when navigation is complete
 */
export function waitForTabComplete(
    chromeTabId: number,
    url: string
): Promise<ResponseMessage> {
    return new Promise(resolve => {
        // Timeout for navigation
        const navigationTimeout = setTimeout(() => {
            console.warn(
                `[tab-manager] Navigation timeout after ${NAVIGATION_TIMEOUT_MS}ms for tab ${chromeTabId} to ${url}`
            );
            resolve({
                status: 'ok',
                result: `Navigation may not have completed within ${NAVIGATION_TIMEOUT_MS}ms, but proceeding.`,
            });
        }, NAVIGATION_TIMEOUT_MS);

        // Listen for the tab to complete loading
        const checkTabStatus = () => {
            chrome.tabs.get(chromeTabId, tab => {
                if (chrome.runtime.lastError) {
                    clearTimeout(navigationTimeout);
                    resolve({
                        status: 'error',
                        error: `Tab ${chromeTabId} no longer exists.`,
                    });
                    return;
                }

                if (tab.status === 'complete') {
                    clearTimeout(navigationTimeout);
                    console.log(
                        `[tab-manager] Tab ${chromeTabId} navigation complete. URL: ${tab.url}`
                    );
                    resolve({
                        status: 'ok',
                        result: `Successfully navigated to ${tab.title || tab.url}.`,
                    });
                    return;
                }

                // Keep checking until timeout
                setTimeout(checkTabStatus, 100);
            });
        };

        // Start checking
        checkTabStatus();
    });
}

/**
 * Closes an agent's tab and cleans up resources
 * @param agentTabId The agent tab ID
 * @returns Promise resolving to response message
 */
export async function closeAgentSession(
    agentTabId: string
): Promise<ResponseMessage> {
    console.log(`[tab-manager] Closing agent session for ${agentTabId}`);

    if (!agentTabs[agentTabId]) {
        return {
            status: 'ok',
            result: `No active session found for ${agentTabId}.`,
        };
    }

    try {
        const chromeTabId = agentTabs[agentTabId].chromeTabId;

        // First check if the tab still exists
        try {
            await chrome.tabs.get(chromeTabId);
        } catch (tabError) {
            // Tab doesn't exist anymore, just remove from tracking
            console.log(
                `[tab-manager] Tab ${chromeTabId} for agent ${agentTabId} no longer exists, cleaning up tracking.`
            );
            removeAgentTab(agentTabId);
            return {
                status: 'ok',
                result: `Tab already closed for ${agentTabId}, cleaned up tracking.`,
            };
        }

        // Close the tab
        await chrome.tabs.remove(chromeTabId);

        // Remove from our tracking
        removeAgentTab(agentTabId);

        return {
            status: 'ok',
            result: `Successfully closed session for ${agentTabId}.`,
        };
    } catch (error) {
        console.error(
            `[tab-manager] Error closing session for ${agentTabId}:`,
            error
        );

        // Clean up tracking regardless of error
        if (agentTabs[agentTabId]) {
            console.log(
                `[tab-manager] Removing agent ${agentTabId} from tracking despite close error.`
            );
            removeAgentTab(agentTabId);
        }

        return {
            status: 'error',
            error: `Failed to close session: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
