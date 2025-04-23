/**
 * Tab management command handlers.
 */

import { ResponseMessage } from '../types';
import { getAgentTab } from '../tab-management/tab-manager';

/**
 * Initializes an agent tab session
 * @param tabId The agent's tab identifier
 * @returns Promise resolving to a response message
 */
export async function getAgentTabHandler(
    tabId: string,
    params: { startUrl?: string }
): Promise<ResponseMessage> {
    console.log(`[tab-commands] Initializing agent tab for ${tabId}`);

    try {
        // Get or create a Chrome tab for this agent
        const { chromeTabId, isNew } = await getAgentTab(
            tabId,
            params.startUrl
        );

        return {
            status: 'ok',
            result: {
                tabId: chromeTabId,
                isNew,
                message: `${isNew ? 'Created new' : 'Using existing'} tab (${chromeTabId}) for agent session ${tabId}.`,
            },
        };
    } catch (error) {
        console.error(
            `[tab-commands] Failed to initialize agent tab for ${tabId}:`,
            error
        );
        return {
            status: 'error',
            error: `Failed to initialize agent tab: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Lists all open browser tabs with extended information
 * @returns Promise resolving to a response message with list of tabs
 */
export async function listOpenTabsHandler(
    _tabId: string,
    _params: Record<string, never>
): Promise<ResponseMessage> {
    console.log(`[tab-commands] Listing all open tabs`);

    try {
        // Get all open tabs in all windows
        const tabs = await chrome.tabs.query({});

        // Get tab groups for reference
        const groups = await chrome.tabGroups.query({});
        const groupMap = new Map(groups.map(group => [group.id, group]));

        // Format tab data for response with enhanced information
        const tabList = tabs.map(tab => {
            // Get group info if tab is in a group
            let groupInfo = null;
            if (
                tab.groupId &&
                tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE &&
                groupMap.has(tab.groupId)
            ) {
                const group = groupMap.get(tab.groupId)!;
                groupInfo = {
                    id: group.id,
                    title: group.title || '',
                    color: group.color || '',
                };
            }

            return {
                id: tab.id,
                title: tab.title || 'Untitled',
                url: tab.url || '',
                active: tab.active,
                pinned: tab.pinned || false,
                windowId: tab.windowId,
                favIconUrl: tab.favIconUrl || '',
                groupId:
                    tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
                        ? tab.groupId
                        : null,
                group: groupInfo,
                isMagiGroup: groupInfo?.title === 'magi',
            };
        });

        return {
            status: 'ok',
            result: {
                tabs: tabList,
                count: tabList.length,
                message: `Found ${tabList.length} open tabs.`,
            },
        };
    } catch (error) {
        console.error(`[tab-commands] Failed to list open tabs:`, error);
        return {
            status: 'error',
            error: `Failed to list open tabs: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Focuses on a specific browser tab
 * @param tabId The agent's tab identifier
 * @param params Parameters including the Chrome tab ID to focus
 * @returns Promise resolving to a response message
 */
export async function focusTabHandler(
    _tabId: string,
    params: { chromeTabId: number }
): Promise<ResponseMessage> {
    const { chromeTabId } = params;
    console.log(`[tab-commands] Focusing tab ${chromeTabId}`);

    try {
        // Get tab info
        const tab = await chrome.tabs.get(chromeTabId);

        // Activate the window containing the tab
        if (tab.windowId) {
            await chrome.windows.update(tab.windowId, { focused: true });
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
        console.error(
            `[tab-commands] Failed to focus tab ${chromeTabId}:`,
            error
        );
        return {
            status: 'error',
            error: `Failed to focus tab: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

// Note: "focus_tab" functionality is also available through switchTabHandler with the 'focus' type option,
// but we maintain focusTabHandler for backward compatibility
