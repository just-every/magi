/**
 * Navigation-related command handlers.
 */

import { NavigateParams, ResponseMessage } from '../types';
import { agentTabs, updateAgentTabActivity } from '../state/state';
import { waitForTabComplete } from '../tab-management/tab-manager';
import { clearElementMap } from '../storage/element-storage';

/**
 * Navigates a tab to a URL
 * @param tabId The agent's tab identifier
 * @param params The navigation parameters
 * @returns Promise resolving to a response message
 */
export async function navigateHandler(
    tabId: string,
    params: NavigateParams
): Promise<ResponseMessage> {
    console.log(
        `[navigation-commands] Navigating tab ${tabId} to URL: ${params.url}`
    );

    if (!params.url) {
        return {
            status: 'error',
            error: 'URL is required for navigation.',
        };
    }

    if (!agentTabs[tabId]) {
        return {
            status: 'error',
            error: `No tab found for agent ${tabId}. Initialize a tab first.`,
        };
    }

    try {
        const chromeTabId = agentTabs[tabId].chromeTabId;
        updateAgentTabActivity(tabId);

        // Clear the element map since we're navigating to a new page
        await clearElementMap(tabId);

        // Set active if requested (but default to keeping background)
        if (params.takeFocus) {
            await chrome.tabs.update(chromeTabId, { active: true });
        }

        // Navigate to the URL
        await chrome.tabs.update(chromeTabId, { url: params.url });

        // Wait for navigation to complete
        return await waitForTabComplete(chromeTabId, params.url);
    } catch (error) {
        console.error(
            `[navigation-commands] Navigation failed for ${tabId}:`,
            error
        );
        return {
            status: 'error',
            error: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Gets the current URL of a tab
 * @param tabId The agent's tab identifier
 * @returns Promise resolving to a response message with the URL
 */
export async function getUrlHandler(
    tabId: string,
    _params: Record<string, never>
): Promise<ResponseMessage> {
    console.log(`[navigation-commands] Getting URL for tab ${tabId}`);

    if (!agentTabs[tabId]) {
        return {
            status: 'error',
            error: `No tab found for agent ${tabId}. Initialize a tab first.`,
        };
    }

    try {
        const chromeTabId = agentTabs[tabId].chromeTabId;
        updateAgentTabActivity(tabId);

        const tab = await chrome.tabs.get(chromeTabId);

        return {
            status: 'ok',
            result: tab.url || '',
        };
    } catch (error) {
        console.error(
            `[navigation-commands] Failed to get URL for ${tabId}:`,
            error
        );
        return {
            status: 'error',
            error: `Failed to get URL: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
