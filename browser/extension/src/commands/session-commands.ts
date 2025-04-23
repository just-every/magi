/**
 * Session management command handlers.
 */

import { ResponseMessage, SwitchTabParams } from '../types';
import {
    agentTabs,
    updateAgentTabActivity,
    registerAgentTab,
    getAgentTabIdByChromeTabId,
} from '../state/state';
import { closeAgentSession } from '../tab-management/tab-manager';
import { clearElementMap } from '../storage/element-storage';
import { ensureMagiTabGroup } from '../utils/tab-group-utils';

/**
 * Switches between tabs, creates a new tab, or focuses on an existing tab
 * @param tabId The agent's current tab identifier
 * @param params Switch tab parameters
 * @returns Promise resolving to a response message
 */
export async function switchTabHandler(
    tabId: string,
    params: SwitchTabParams
): Promise<ResponseMessage> {
    console.log(
        `[session-commands] Switching/focusing tab type: ${params.type}`
    );

    try {
        if (params.type === 'active') {
            // Get the active tab
            const activeTabs = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            });
            if (activeTabs.length === 0) {
                return {
                    status: 'error',
                    error: 'No active tab found in current window.',
                };
            }

            const activeTab = activeTabs[0];
            if (!activeTab.id) {
                return {
                    status: 'error',
                    error: 'Active tab has no ID.',
                };
            }

            // Check if this tab is already associated with an agent
            const existingAgentId = getAgentTabIdByChromeTabId(activeTab.id);
            if (existingAgentId) {
                return {
                    status: 'error',
                    error: `Active tab is already associated with agent ${existingAgentId}.`,
                };
            }

            // Associate this tab with the agent
            registerAgentTab(tabId, activeTab.id);
            await clearElementMap(tabId); // Clear element map for the new tab

            return {
                status: 'ok',
                result: {
                    tabId: activeTab.id,
                    message: `Successfully switched to active tab (${activeTab.id}) for agent ${tabId}.`,
                },
            };
        } else if (params.type === 'new') {
            // Get the currently focused window
            let windowToUse = await chrome.windows.getLastFocused();

            // If no window is focused (e.g., Chrome just started or all windows minimized),
            // get any existing window or create a new one as fallback
            if (
                !windowToUse ||
                !windowToUse.id ||
                windowToUse.state === 'minimized'
            ) {
                // Try to get any existing window
                const existingWindows = await chrome.windows.getAll({
                    windowTypes: ['normal'],
                });
                if (existingWindows.length > 0) {
                    // Use the first available normal window
                    windowToUse = existingWindows[0];
                    console.log(
                        `[session-commands] No focused window, using existing window: ${windowToUse.id}`
                    );
                } else {
                    // No windows available, create a new one
                    windowToUse = await chrome.windows.create({
                        focused: true,
                    });
                    console.log(
                        `[session-commands] No windows available, created new window: ${windowToUse.id}`
                    );
                }
            }

            // Create a new tab in the focused window
            const newTab = await chrome.tabs.create({
                windowId: windowToUse.id,
                url: 'about:blank',
                active: true, // Make tab active in its window
            });

            if (!newTab.id) {
                return {
                    status: 'error',
                    error: 'Failed to create new tab.',
                };
            }

            // Register the new tab
            registerAgentTab(tabId, newTab.id);
            await clearElementMap(tabId); // Clear element map for the new tab

            // Add the tab to the magi tab group only if it's not the main Magi UI
            // This check is for future-proofing in case an agent ever navigates to the Magi UI
            if (!'about:blank'.startsWith('http://localhost:3010')) {
                await ensureMagiTabGroup(newTab.id);
            }

            return {
                status: 'ok',
                result: {
                    tabId: newTab.id,
                    message: `Successfully created new tab (${newTab.id}) for agent ${tabId}.`,
                },
            };
        } else if (params.type === 'id') {
            if (!params.tabId) {
                return {
                    status: 'error',
                    error: 'Tab ID is required for tab type "id".',
                };
            }

            // Look up tab by chrome tab ID
            const targetTabId = Number(params.tabId);
            if (isNaN(targetTabId)) {
                return {
                    status: 'error',
                    error: `Invalid tab ID: ${params.tabId}`,
                };
            }

            try {
                const tab = await chrome.tabs.get(targetTabId);
                if (!tab.id) {
                    return {
                        status: 'error',
                        error: `Tab ${targetTabId} not found or has no ID.`,
                    };
                }

                // Check if this tab is already associated with another agent
                const existingAgentId = getAgentTabIdByChromeTabId(tab.id);
                if (existingAgentId && existingAgentId !== tabId) {
                    return {
                        status: 'error',
                        error: `Tab ${targetTabId} is already associated with agent ${existingAgentId}.`,
                    };
                }

                // Associate this tab with the agent
                registerAgentTab(tabId, tab.id);
                await clearElementMap(tabId); // Clear element map for the new tab

                // Focus the tab if it exists
                if (tab.windowId) {
                    await chrome.windows.update(tab.windowId, {
                        focused: true,
                    });
                }
                await chrome.tabs.update(tab.id, { active: true });

                return {
                    status: 'ok',
                    result: {
                        tabId: tab.id,
                        message: `Successfully switched to and focused tab (${tab.id}) for agent ${tabId}.`,
                    },
                };
            } catch (error) {
                return {
                    status: 'error',
                    error: `Tab ${targetTabId} not found: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        } else if (params.type === 'focus') {
            // This handles the functionality previously in focusTabHandler
            if (!params.tabId) {
                return {
                    status: 'error',
                    error: 'Tab ID is required for tab type "focus".',
                };
            }

            const chromeTabId = Number(params.tabId);
            if (isNaN(chromeTabId)) {
                return {
                    status: 'error',
                    error: `Invalid tab ID: ${params.tabId}`,
                };
            }

            try {
                // Get tab info
                const tab = await chrome.tabs.get(chromeTabId);

                // Activate the window containing the tab
                if (tab.windowId) {
                    await chrome.windows.update(tab.windowId, {
                        focused: true,
                    });
                }

                // Focus the tab itself
                await chrome.tabs.update(chromeTabId, { active: true });

                return {
                    status: 'ok',
                    result: {
                        tabId: chromeTabId,
                        title: tab.title || 'Untitled',
                        url: tab.url || '',
                        message: `Successfully focused tab ${chromeTabId}: ${tab.title || tab.url || 'Untitled'}.`,
                    },
                };
            } catch (error) {
                return {
                    status: 'error',
                    error: `Failed to focus tab ${chromeTabId}: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        } else {
            return {
                status: 'error',
                error: `Unsupported tab type: ${params.type}. Supported types are: 'active', 'new', 'id', or 'focus'.`,
            };
        }
    } catch (error) {
        console.error(
            `[session-commands] Failed to switch tab for ${tabId}:`,
            error
        );
        return {
            status: 'error',
            error: `Failed to switch tab: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Closes an agent's tab and cleans up resources
 * @param tabId The agent's tab identifier
 * @returns Promise resolving to a response message
 */
export async function closeAgentSessionHandler(
    tabId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: Record<string, never>
): Promise<ResponseMessage> {
    console.log(`[session-commands] Closing agent session for ${tabId}`);

    try {
        if (!agentTabs[tabId]) {
            return {
                status: 'ok',
                result: `No active session found for ${tabId}.`,
            };
        }

        updateAgentTabActivity(tabId);

        // Close the tab and clean up
        const result = await closeAgentSession(tabId);
        return result;
    } catch (error) {
        console.error(
            `[session-commands] Error closing session for ${tabId}:`,
            error
        );
        return {
            status: 'error',
            error: `Failed to close session: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
