/**
 * Command processor for handling native host requests.
 */

import { CommandParamMap, CommandHandler, ResponseMessage } from '../types'; // Removed unused XYCoordinates
import {
    getAgentTabHandler,
    listOpenTabsHandler,
    focusTabHandler,
} from './tab-commands'; // <-- Keep this uncommented
import { navigateHandler, getUrlHandler } from './navigation-commands'; // <-- Uncommented
import { getPageContentHandler } from './content-commands'; // <-- Uncommented
import { screenshotHandler } from './screenshot-commands'; // <-- Uncommented
import { jsEvaluateHandler, typeHandler, pressHandler } from './input-commands'; // <-- Uncommented
import {
    interactElementHandler,
    scrollToHandler,
    clickAtHandler,
    dragHandler,
} from './interaction-commands'; // <-- Added scrollToHandler, clickAtHandler, dragHandler
import { switchTabHandler, closeAgentSessionHandler } from './session-commands'; // <-- Uncommented
import { openControllerUiHandler } from './window-commands'; // <-- New import for window commands
import { debugCommandHandler } from './debug-commands'; // <-- Added for direct debugger command access

// Map of command name to handler function
const commandHandlers: {
    [K in keyof CommandParamMap]?: CommandHandler<K>; // Make optional for partial testing
} = {
    initialize_agent: getAgentTabHandler, // <-- Keep this uncommented
    list_open_tabs: listOpenTabsHandler, // Get all open browser tabs
    focus_tab: focusTabHandler, // Focus on a specific tab (original implementation)
    navigate: navigateHandler, // <-- Uncommented
    get_page_content: getPageContentHandler, // <-- Uncommented
    get_url: getUrlHandler, // <-- Uncommented
    screenshot: screenshotHandler, // <-- Uncommented
    js_evaluate: jsEvaluateHandler, // <-- Uncommented
    type: typeHandler, // <-- Uncommented
    press: pressHandler, // <-- Uncommented
    interact_element: interactElementHandler, // <-- Uncommented
    switch_tab: switchTabHandler, // <-- Uncommented
    close_agent_session: closeAgentSessionHandler, // <-- Uncommented
    open_controller_ui: openControllerUiHandler, // <-- Add new handler for opening controller UI
    scroll_to: scrollToHandler, // <-- Added handler
    click_at: clickAtHandler, // <-- Added handler
    drag: dragHandler, // <-- Added new drag handler
    debug_command: debugCommandHandler, // <-- Added handler for direct debugger access
};

/**
 * Processes a command from the native host
 * @param command The command name
 * @param tabId The agent tab ID
 * @param params The command parameters
 * @returns Promise resolving to response message
 */
export async function processCommand(
    command: string,
    tabId: string,
    params: Record<string, unknown>
): Promise<ResponseMessage> {
    console.log(`[command-processor] Processing command: ${command}`);

    // Check if command is supported
    const handler = commandHandlers[command as keyof typeof commandHandlers];
    if (!handler) {
        console.warn(
            `[command-processor] Command handler for ${command} is not available or commented out.`
        );
        return {
            status: 'error',
            error: `Unsupported command or handler unavailable: ${command}`,
        };
    }

    try {
        // Force type with a more specific CommandHandler typecasting
        // This is less type-safe but works around TypeScript's limitations with complex union types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await (handler as CommandHandler<keyof CommandParamMap>)(
            tabId,
            params as any
        );
    } catch (error) {
        console.error(
            `[command-processor] Error processing command ${command}:`,
            error
        );
        return {
            status: 'error',
            error: `Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
            details: error instanceof Error ? error.stack : undefined,
        };
    }
}
