/**
 * Window management command handlers.
 */

import { ResponseMessage } from '../types';

/**
 * Opens the controller UI in the currently focused window or reuses an existing tab
 * @param tabId The agent's tab identifier (not used for window creation)
 * @param params Parameters containing the URL to open
 * @returns Promise resolving to a response message
 */
export async function openControllerUiHandler(
    _tabId: string,
    params: { url: string }
): Promise<ResponseMessage> {
    const { url } = params;
    console.log(
        `[window-commands] Received open_controller_ui command for URL: ${url}`
    );

    try {
        // 1. First check if we already have a tab with this URL
        // Create a properly formatted URL pattern that works across different URL schemes
        let urlPattern = url;

        // Handle different URL schemes properly
        if (url.startsWith('http://') || url.startsWith('https://')) {
            // For HTTP/HTTPS URLs, we need to follow Chrome's match pattern syntax
            // First strip query params and hash fragments
            const base = url.replace(/([?#].*)?$/, '');
            // Ensure there's a trailing slash before adding the wildcard
            const withSlash = base.endsWith('/') ? base : `${base}/`;
            urlPattern = `${withSlash}*`;
        } else if (url.startsWith('file://')) {
            // For file URLs, ensure we have a wildcard at the end
            if (!url.endsWith('*')) {
                urlPattern = `${url}*`;
            }
        } else if (url.startsWith('chrome://')) {
            // Chrome URLs need to be matched exactly, but handle possible trailing slashes
            urlPattern = url.endsWith('/') ? `${url}*` : url;
        }

        console.log(
            `[window-commands] Using URL pattern for matching: ${urlPattern}`
        );
        const existingTabs = await chrome.tabs.query({ url: urlPattern });

        if (existingTabs.length > 0) {
            // Found existing tab with this URL, just focus it
            const existingTab = existingTabs[0];
            await chrome.tabs.update(existingTab.id!, { active: true });
            await chrome.windows.update(existingTab.windowId, {
                focused: true,
            });

            // Magi UI controller stays ungrouped (always)

            console.log(
                `[window-commands] Focused existing tab with URL: ${url}`
            );
            return {
                status: 'ok',
                result: {
                    tabId: existingTab.id,
                    windowId: existingTab.windowId,
                    message: `Focused existing tab with URL: ${url}`,
                },
            };
        }

        // 2. No existing tab, get the currently focused window
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
                    `[window-commands] No focused window, using existing window: ${windowToUse.id}`
                );
            } else {
                // No windows available, create a new one
                windowToUse = await chrome.windows.create({ focused: true });
                console.log(
                    `[window-commands] No windows available, created new window: ${windowToUse.id}`
                );
            }
        }

        // 3. Create a new tab in the focused window
        const newTab = await chrome.tabs.create({
            windowId: windowToUse.id,
            url: url,
            active: true, // Make tab active in its window
        });

        // 4. Magi UI controller stays ungrouped (always)

        console.log(
            `[window-commands] Created new tab in current window for URL: ${url}`
        );
        return {
            status: 'ok',
            result: {
                tabId: newTab.id,
                windowId: windowToUse.id,
                message: `Created new tab in current window for URL: ${url}`,
            },
        };
    } catch (error) {
        console.error(
            `[window-commands] Error handling open_controller_ui:`,
            error
        );
        return {
            status: 'error',
            error: `Failed to open/focus controller UI: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
