/**
 * Browser utility functions for the MAGI system (WebSocket Client).
 *
 * This module communicates with the MAGI native messaging host bridge
 * running on the host machine via a WebSocket connection. It uses agent-specific
 * browser sessions to ensure each agent has its own tab.
 */

// No longer used since global session state was removed
import TurndownService from 'turndown'; // For HTML to Markdown conversion
import {
    AgentInterface,
    ResponseInput,
    ToolFunction,
    ToolParameterMap,
} from '../types/shared-types.js'; // Keep if used by your framework
import { createToolFunction } from './tool_call.js'; // Keep if used by your framework
import { getAgentBrowserSession } from './browser_session.js';
import type { Agent } from './agent.js';
import { getCommunicationManager } from './communication.js';

// Instantiate Turndown service
const turndownService = new TurndownService();

// --- Exported Browser Control Functions ---
// These maintain the existing API but use the new agent-specific sessions

/**
 * Lists all open browser tabs across all windows
 * @param inject_agent_id - The agent ID to use for the browser session
 * @returns JSON string with tab information
 */
export async function list_browser_tabs(
    inject_agent_id: string
): Promise<string> {
    console.log('[browser_utils] Requesting list of all open tabs...');
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        return await session.listOpenTabs();
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error listing open tabs: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Focuses on a specific browser tab by its Chrome tab ID
 * This only focuses the tab in the UI; it does not change which tab the agent controls
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param chromeTabId The Chrome tab ID to focus
 * @returns Result message
 */
export async function focusTab(
    inject_agent_id: string,
    chromeTabId: number
): Promise<string> {
    if (typeof chromeTabId !== 'number' || chromeTabId <= 0) {
        const errorMsg = `[browser_utils] Error: Invalid Chrome tab ID (${chromeTabId}).`;
        console.error(errorMsg);
        return Promise.resolve(errorMsg);
    }
    console.log(`[browser_utils] Requesting to focus on tab ${chromeTabId}...`);
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        return await session.focusTab(chromeTabId);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error focusing tab ${chromeTabId}: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Navigate the agent's browser tab to a URL via the extension bridge.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param url - URL to navigate to.
 * @returns Result message from the bridge/extension.
 */
export async function navigate(
    inject_agent_id: string,
    url: string,
    takeFocus?: false
): Promise<string> {
    // Validate URL: if it's just a domain name, add https:// prefix
    if (
        url &&
        !url.match(/^(https?:\/\/|file:\/\/|about:|chrome:|\/)/i) &&
        url.includes('.')
    ) {
        url = `https://${url}`;
        console.log(`[browser_utils] URL validated and prefix added: ${url}`);
    }

    // Validate final URL
    let isValidUrl = false;
    try {
        // Check if URL is valid using the URL constructor
        new URL(url);
        isValidUrl = true;
    } catch (e) {
        // URL constructor will throw if the URL is invalid
        isValidUrl = false;
    }

    // Also validate URLs that might not be handled by URL constructor (like chrome://, file://, etc.)
    if (!isValidUrl) {
        if (url.match(/^(about:|chrome:|file:\/\/)/i)) {
            isValidUrl = true;
        } else if (url.startsWith('/')) {
            // Relative URLs are valid
            isValidUrl = true;
        }
    }

    if (!isValidUrl) {
        const errorMessage = `[browser_utils] Invalid URL: ${url}`;
        console.error(errorMessage);
        return errorMessage;
    }

    console.log(`[browser_utils] Requesting navigation to: ${url}`);
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        const result = await session.navigate(url, takeFocus);
        return result;
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error during navigation: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Gets the page content from the agent's tab in the specified format.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param type - The desired format: 'interact', 'markdown', or 'html'.
 * @returns The page content in the requested format or an error message string.
 */
export async function get_page_content(
    inject_agent_id: string,
    type: 'interact' | 'markdown' | 'html'
): Promise<string> {
    console.log(`[browser_utils] Requesting page content as type: ${type}...`);
    try {
        const session = getAgentBrowserSession(inject_agent_id);

        if (type === 'interact') {
            // Get interactive elements map + landmarks
            const interactiveContent =
                await session.get_page_content('interactive');
            return interactiveContent;
        } else if (type === 'html') {
            // Get cleaned body HTML
            const htmlContent = await session.get_page_content('html');
            return htmlContent;
        } else if (type === 'markdown') {
            // Get full HTML first, then convert
            const htmlContent = await session.get_page_content('html'); // We always request html from backend for markdown
            if (htmlContent.startsWith('[browser_utils] Error:')) {
                return htmlContent; // Propagate error
            }
            // Convert HTML to Markdown using TurndownService
            const markdownContent = turndownService.turndown(htmlContent);
            return markdownContent;
        } else {
            // Should not happen due to TypeScript types, but handle defensively
            return `[browser_utils] Error: Invalid content type requested: ${type}`;
        }
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error getting page content (type: ${type}): ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return `${errorMessage}. Content may be unavailable.`; // Return error message string
    }
}

/**
 * Gets the current URL of the agent's tab via the extension bridge.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @returns The current URL string or an error message string.
 */
export async function get_page_url(inject_agent_id: string): Promise<string> {
    console.log('[browser_utils] Requesting current page URL...');
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        const url = await session.get_page_url();
        return String(url); // Ensure it's a string
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error getting page URL: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Executes JavaScript code in the agent's tab's context via the extension bridge.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param code - JavaScript code to execute.
 * @returns Stringified result of the executed code or an error message string.
 */
export async function js_evaluate(
    inject_agent_id: string,
    code: string
): Promise<string> {
    console.log(
        `[browser_utils] Requesting JavaScript evaluation: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`
    );
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        const result = await session.js_evaluate(code);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error evaluating JavaScript: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates typing text into the focused element in the agent's tab via the extension bridge.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param text - Text to type.
 * @returns Result message from the bridge/extension or an error message string.
 */
export async function type(
    inject_agent_id: string,
    text: string
): Promise<string> {
    console.log(`[browser_utils] Requesting to type text: ${text}`);
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        const result = await session.type(text);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error typing text: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates pressing special keys in the agent's tab via the extension bridge.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param keys - Keys to press (e.g., "Enter", "Tab", "ArrowDown").
 * @returns Result message from the bridge/extension or an error message string.
 */
export async function press_keys(
    inject_agent_id: string,
    keys: string[]
): Promise<string> {
    console.log(`[browser_utils] Requesting to press keys: ${keys.join(', ')}`);
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        const result = await session.press(keys.join(', '));
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error pressing keys '${keys}': ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates scrolling to coords
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param x - X coordinate to scroll to
 * @param y - Y coordinate to scroll to
 */
export async function scroll_to(
    inject_agent_id: string,
    mode: 'page_down' | 'page_up' | 'bottom' | 'top' | 'coordinates',
    x?: number,
    y?: number
): Promise<string> {
    console.log(
        `[browser_utils] Requesting to scroll (${mode}) to: ${{ x, y }}`
    );
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        const result = await session.scroll_to(mode, x, y);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error scrolling (${mode}) to '${{ x, y }}': ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates clicking at coords with specified button
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param x X coordinate
 * @param y Y coordinate
 * @param button Optional mouse button to use ('left', 'middle', 'right', 'back', 'forward')
 */
export async function click_at(
    inject_agent_id: string,
    x: number,
    y: number,
    button?: 'left' | 'middle' | 'right' | 'back' | 'forward'
): Promise<string> {
    console.log(`[browser_utils] Requesting to click at: ${{ x, y, button }}`);
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        const result = await session.click_at(x, y, button);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error clicking at '${{ x, y }}': ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Switches which tab the agent controls for future operations
 * When type is 'id', also focuses the tab in the UI
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param type - Type of tab operation to perform
 * @param tabId - ID of the tab to switch to (for 'id' operation)
 * @returns Result message from the bridge/extension or an error message string.
 */
export async function change_tab(
    inject_agent_id: string,
    type: 'active' | 'new' | 'id',
    tabId?: string
): Promise<string> {
    console.log(`[browser_utils] Requesting tab switch to ${type}...`);

    // Validate parameters
    if (type === 'id' && (typeof tabId !== 'string' || !tabId)) {
        const errorMsg = `[browser_utils] Error: Invalid tabId (${tabId}) provided for tab switch operation.`;
        console.error(errorMsg);
        return Promise.resolve(errorMsg);
    }

    try {
        const session = getAgentBrowserSession(inject_agent_id);

        // Handle normal tab switching - this will also focus the tab when type='id'
        const result = await session.switchTab(type, tabId || '');
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error switching tab: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

// --- Element Interaction Functions ---

/** Helper to call the versatile interact_element command */
async function interactElement(
    inject_agent_id: string,
    elementId: number,
    action:
        | 'click'
        | 'fill'
        | 'check'
        | 'hover'
        | 'focus'
        | 'scroll'
        | 'select_option',
    value?: string, // Used for fill, select_option
    checked?: boolean // Used for check
): Promise<string> {
    if (typeof elementId !== 'number' || elementId <= 0) {
        const errorMsg = `[browser_utils] Error: Invalid elementId (${elementId}) provided for action '${action}'.`;
        console.error(errorMsg);
        return Promise.resolve(errorMsg); // Return error string directly
    }
    console.log(
        `[browser_utils] Requesting action '${action}' on element ID ${elementId}...`
    );
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        const result = await session.interactElement(
            elementId,
            action,
            value,
            checked
        );
        return String(result); // Return success/status message from background script
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error performing action '${action}' on element ID ${elementId}: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

export async function element_click(
    inject_agent_id: string,
    elementId: number
): Promise<string> {
    const result = await interactElement(inject_agent_id, elementId, 'click');
    // Add recommendation here as the result string comes from background.js now
    if (
        !result.startsWith('[browser_utils] Error:') &&
        !result.toLowerCase().includes('error')
    ) {
        return result + ' IMPORTANT: Page state might have changed.';
    }
    return result;
}

export async function element_value(
    inject_agent_id: string,
    elementId: number,
    value: string
): Promise<string> {
    if (value === undefined || value === null) {
        return "[browser_utils] Error: 'value' parameter must be provided for 'element_value'.";
    }
    return interactElement(inject_agent_id, elementId, 'fill', value);
}

export async function element_check(
    inject_agent_id: string,
    elementId: number,
    checked: boolean
): Promise<string> {
    if (checked === undefined || checked === null) {
        return "[browser_utils] Error: 'checked' parameter (true/false) must be provided for 'element_check'.";
    }
    return interactElement(
        inject_agent_id,
        elementId,
        'check',
        undefined,
        checked
    );
}

export async function element_hover(
    inject_agent_id: string,
    elementId: number
): Promise<string> {
    const result = await interactElement(inject_agent_id, elementId, 'hover');
    if (
        !result.startsWith('[browser_utils] Error:') &&
        !result.toLowerCase().includes('error')
    ) {
        return result + ' Tooltips or menus might now be visible.';
    }
    return result;
}

export async function element_focus(
    inject_agent_id: string,
    elementId: number
): Promise<string> {
    const result = await interactElement(inject_agent_id, elementId, 'focus');
    if (
        !result.startsWith('[browser_utils] Error:') &&
        !result.toLowerCase().includes('error')
    ) {
        return (
            result +
            " Subsequent 'press' or 'type' actions may target this element."
        );
    }
    return result;
}

export async function element_scroll(
    inject_agent_id: string,
    elementId: number
): Promise<string> {
    return interactElement(inject_agent_id, elementId, 'scroll');
}

export async function element_select(
    inject_agent_id: string,
    elementId: number,
    value: string
): Promise<string> {
    if (value === undefined || value === null) {
        return "[browser_utils] Error: 'value' parameter (option value, text, or label) must be provided for 'element_select'.";
    }
    const result = await interactElement(
        inject_agent_id,
        elementId,
        'select_option',
        value
    );
    if (
        !result.startsWith('[browser_utils] Error:') &&
        !result.toLowerCase().includes('error')
    ) {
        return result + ' IMPORTANT: Page state might have changed.';
    }
    return result;
}

// Close the tab browser session when done
export async function close_tab(inject_agent_id: string): Promise<string> {
    console.log(
        `[browser_utils] Requesting to close session for tab: ${inject_agent_id}`
    );

    try {
        const session = getAgentBrowserSession(inject_agent_id);
        const result = await session.closeSession();
        return result;
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error closing session for tab ${inject_agent_id}: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage;
    }
}

/**
 * Get all browser tools as an array of tool definitions
 */
export function getCommonBrowserTools(): ToolFunction[] {
    return [
        // --- Navigation and Page Context ---
        createToolFunction(
            navigate,
            'Navigate to a URL.',
            {
                url: { type: 'string', description: 'URL to navigate to' },
                takeFocus: {
                    type: 'boolean',
                    description:
                        'Have this tab take focus in the live browser. This should rarely be used unless explicitly requested as you have a shared browser session with the computer operator and this may interrupt their usage. Default: false',
                    optional: true,
                },
            },
            'Status message including new page title.'
        ),

        createToolFunction(
            type,
            'Type text using the keyboard. Will type into the currently focused element.',
            { text: { type: 'string', description: 'Text to type' } }
        ),
        createToolFunction(
            press_keys,
            'Simulate pressing a specific key or key combination. Affects focused element.',
            {
                keys: {
                    type: 'array',
                    description:
                        'List of keys to press in order (e.g., ["Enter", "Tab", "ArrowDown", "Control+C"])',
                },
            }
        ),

        // --- Tab Management ---
        createToolFunction(
            list_browser_tabs,
            'List all open browser tabs across all windows. Returns information about all tabs including their tabId, title, and URL.'
        ),
        createToolFunction(
            change_tab,
            'Each browser agent operates in its own tab. This function changes which tab the agent is in for future operations.',
            {
                destination: {
                    type: 'string',
                    description:
                        'What tab operation to perform\n' +
                        'new: create and switch to a new tab for future operations\n' +
                        'id: switch to an existing tab by its ID (also focuses it in the UI)',
                    enum: ['new', 'id'],
                },
                tabId: {
                    type: 'string',
                    description:
                        'The ID of the tab to switch to. Required when destination is "id".',
                    optional: true,
                },
            }
        ),
    ];
}

/**
 * Get all browser tools as an array of tool definitions
 */
export function getBrowserDebugTools(): ToolFunction[] {
    return [
        createToolFunction(
            js_evaluate,
            'Advanced: Execute arbitrary JavaScript code in the current page.',
            {
                code: {
                    type: 'string',
                    description: 'JavaScript code to execute',
                },
            },
            'Result of the executed code, JSON stringified.'
        ),
        createToolFunction(
            debug_command,
            'Advanced: Send an arbitrary Chrome DevTools Protocol command to the browser',
            {
                method: {
                    type: 'string',
                    description:
                        "The CDP method to call (e.g., 'DOM.querySelectorAll', 'Page.handleJavaScriptDialog')",
                },
                commandParamsJson: {
                    type: 'string',
                    description:
                        'Optional parameters for the CDP method, provided as a valid JSON string. Example: \'{"nodeId": 123, "selector": ".my-class"}\'',
                    optional: true,
                },
            }
        ),
    ];
}
/**
 * Get all browser tools as an array of tool definitions
 */
export function getBrowserTools(): ToolFunction[] {
    return [
        createToolFunction(
            get_page_content,
            'Get content of the current page in a specified format. Updates the internal map for ID-based interactions when type is "interact". IMPORTANT: Call this AFTER navigation or actions that significantly change the page (clicks, submits).',
            {
                type: {
                    type: 'string',
                    description:
                        'Format for the page content:\n' +
                        "'interact': Simplified text with interactive elements ([ID] description) and landmarks (## Landmark ##).\n" +
                        "'markdown': Page content converted to Markdown format.\n" +
                        "'html': Cleaned HTML content of the page body (scripts removed, etc.).",
                    enum: ['interact', 'markdown', 'html'],
                },
            },
            'Page content in the requested format (interactive elements, markdown, or cleaned HTML).'
        ),
        createToolFunction(
            element_click,
            'Click on an element identified by its numeric ID',
            {
                elementId: {
                    type: 'number',
                    description:
                        'The numeric ID of the element (e.g., 3 for [3])',
                },
            }
        ),
        createToolFunction(
            element_value,
            'Fill in a form field identified by its numeric ID',
            {
                elementId: {
                    type: 'number',
                    description:
                        'The numeric ID of the element (e.g., 3 for [3])',
                },
                value: {
                    type: 'string',
                    description: 'Text to enter into the field',
                },
            }
        ),
        createToolFunction(
            element_check,
            'Check or uncheck a checkbox or radio button identified by its numeric ID',
            {
                elementId: {
                    type: 'number',
                    description:
                        'The numeric ID of the element (e.g., 3 for [3])',
                },
                checked: {
                    type: 'boolean',
                    description: 'true to check, false to uncheck',
                },
            }
        ),
        createToolFunction(
            element_hover,
            'Hover over an element identified by its numeric ID',
            {
                elementId: {
                    type: 'number',
                    description:
                        'The numeric ID of the element (e.g., 3 for [3])',
                },
            }
        ),
        createToolFunction(
            element_focus,
            'Focus on an element identified by its numeric ID',
            {
                elementId: {
                    type: 'number',
                    description:
                        'The numeric ID of the element (e.g., 3 for [3])',
                },
            }
        ),
        createToolFunction(
            element_scroll,
            'Scroll an element into view identified by its numeric ID',
            {
                elementId: {
                    type: 'number',
                    description:
                        'The numeric ID of the element (e.g., 3 for [3])',
                },
            }
        ),
        createToolFunction(
            element_select,
            'Pick an option from a dropdown identified by its numeric ID',
            {
                elementId: {
                    type: 'number',
                    description:
                        'The numeric ID of the <select> element (e.g., 3 for [3])',
                },
                value: {
                    type: 'string',
                    description:
                        'Value, text content, or label of the option to select',
                },
            }
        ),
        createToolFunction(
            close_tab,
            'Close the current browser tab. Use this when you are completely done browsing.'
        ),

        /*createToolFunction(
      focusTab,
      'Focus on a specific browser tab by its Chrome tab ID. This brings the tab to the foreground without changing which tab the agent controls.',
      {
        'chromeTabId': { type: 'number', description: 'The Chrome tabId to focus (from list_browser_tabs)' }
      },
      'Status message indicating success or failure.'
    ),*/
    ];
}

/**
 * Sends an arbitrary debug command to the Chrome DevTools Protocol
 * @param method The CDP method to call (e.g., 'Page.captureScreenshot', 'DOM.getDocument')
 * @param commandParams Optional parameters for the CDP method
 * @param commandParamsJson Optional parameters for the CDP method, as a JSON string.
 * @returns Result of the command execution as a string
 */
export async function debug_command(
    inject_agent_id: string,
    method: string,
    commandParamsJson?: string
): Promise<string> {
    console.log(
        `[browser_utils] Executing debug command '${method}' with params string: ${commandParamsJson}`
    );
    if (!method || typeof method !== 'string') {
        const errorMsg =
            "[browser_utils] Error: Valid method name is required for 'debug_command'.";
        console.error(errorMsg);
        return Promise.resolve(errorMsg);
    }

    let commandParams: object | undefined;
    if (commandParamsJson) {
        try {
            commandParams = JSON.parse(commandParamsJson);
            if (typeof commandParams !== 'object' || commandParams === null) {
                throw new Error('Parsed JSON is not an object.');
            }
        } catch (parseError: any) {
            const errorMsg = `[browser_utils] Error: Invalid JSON string provided for commandParamsJson: ${parseError?.message || String(parseError)}. JSON string was: ${commandParamsJson}`;
            console.error(errorMsg);
            return Promise.resolve(errorMsg);
        }
    }

    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Pass the parsed object (or undefined) to the session method
        const result = await session.debugCommand(method, commandParams);
        return result;
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error executing debug command '${method}': ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Get all browser tools as an array of tool definitions
 */
export function getBrowserVisionTools(): ToolFunction[] {
    return [
        createToolFunction(scroll_to, 'Scroll the current tab.', {
            mode: {
                type: 'string',
                description:
                    "How to scroll the page. Use coordinates to go to a specific location. Prefer using page_down over coordinates so you don't miss anything.",
                enum: ['page_down', 'page_up', 'bottom', 'top', 'coordinates'],
            },
            x: {
                type: 'number',
                description:
                    'X coordinate to scroll to. Only used when mode=coordinates',
                optional: true,
            },
            y: {
                type: 'number',
                description:
                    'Y coordinate to scroll to. Only used when mode=coordinates',
                optional: true,
            },
        }),
        createToolFunction(
            click_at,
            'Click at specific coordinates on the current page.',
            {
                x: { type: 'number', description: 'X coordinate to click at' },
                y: { type: 'number', description: 'Y coordinate to click at' },
                button: {
                    type: 'string',
                    description: 'Mouse button to use for the click',
                    enum: ['left', 'middle', 'right', 'back', 'forward'],
                    optional: true,
                },
            }
        ),
    ];
}

export function getBrowserParams(agentName: string): ToolParameterMap {
    return {
        url: {
            type: 'string',
            description: `What URL should this ${agentName} start at?`,
        },
        task: {
            type: 'string',
            description: `What should this ${agentName} work on? Generally you should leave the way the task is performed up to the agent unless the agent previously failed. Agents are expected to work mostly autonomously.`,
        },
        context: {
            type: 'string',
            description: `What else might this ${agentName} need to know? Explain why you are asking for this - summarize the task you were given or the project you are working on. Please make it comprehensive. A couple of paragraphs is ideal.`,
            optional: true,
        },
        goal: {
            type: 'string',
            description: `This is the final goal/output or result you expect from the task. Try to focus on the overall goal and allow this ${agentName} to make it's own decisions on how to get there. One sentence is ideal.`,
            optional: true,
        },
        intelligence: {
            type: 'string',
            description: `What level of intelligence do you recommend for this ${agentName}?
      - low: (under 90 IQ) Mini model used.
      - standard: (90 - 110 IQ)
      - high: (110+ IQ) Reasoning used.`,
            enum: ['low', 'standard', 'high'],
            optional: true,
        },
    };
}

export async function processBrowserParams(
    agent: AgentInterface,
    params: Record<string, any>
): Promise<{ prompt: string; intelligence?: 'low' | 'standard' | 'high' }> {
    console.log('*** processBrowserParams ***', params);
    // Setup agent-specific browser tools
    await setupAgentBrowserTools(agent, params.url);

    const prompts: string[] = [];
    if (params.url) {
        prompts.push(
            `Your browser tab has been opened and navigated to ${params.url}`
        );
    }
    if (params.task) {
        prompts.push(`**Task:** ${params.task}`);
    }
    if (params.context) {
        prompts.push(`**Context:** ${params.context}`);
    }
    if (params.goal) {
        prompts.push(`**Your Goal:** ${params.goal}`);
    }

    // Return the standard parameter object expected by runAgentTool
    return {
        prompt: prompts.join('\n\n'),
        intelligence: params.intelligence,
    };
}

function getAgentTabId(agent: AgentInterface): string {
    // Use the agent ID as the tab ID for this agent
    let tabId = agent.agent_id;
    if (
        agent.parent &&
        (agent.parent.name === 'BrowserAgent' ||
            agent.parent.name === 'BrowserCodeAgent' ||
            agent.parent.name === 'BrowserVisionAgent') &&
        agent.parent.agent_id
    ) {
        tabId = agent.parent.agent_id; // Use the parent agent ID if available
    }
    return tabId;
}

// Helper to set up tab-specific browser sessions
export async function setupAgentBrowserTools(
    agent: AgentInterface,
    startUrl?: string
): Promise<void> {
    // Use the agent ID as the tab ID for this agent
    const tabId = getAgentTabId(agent);
    const session = getAgentBrowserSession(tabId, startUrl);
    await session.initialize();
    console.log(`[browser_utils] Setting up browser tools for tab: ${tabId}`);
}

async function addScreenshot(
    agent: Agent,
    messages: ResponseInput
): Promise<[Agent, ResponseInput]> {
    try {
        console.log(
            `[browser_utils] Taking automatic screenshot for ${agent.name}`
        );
        const tStart = Date.now();

        // Get the browser session associated with this agent
        const tabId = getAgentTabId(agent);
        const session = getAgentBrowserSession(tabId);

        // Take a screenshot with core tabs included
        const payload = await session.screenshot('viewport', {
            includeCoreTabs: true,
        });
        console.log(
            `[browser_utils] Screenshot capture took ${Date.now() - tStart}ms`
        );

        if (payload) {
            // Build browser status section
            const browserSection = `### Browser status
URL: ${payload.url || 'Unknown'}
Viewport: ${payload.view?.w || 0} × ${payload.view?.h || 0} CSS px Full page: ${payload.full?.w || 0} × ${payload.full?.h || 0} CSS px`;

            // Build tabs section
            let tabsSection = '';
            if (
                payload.coreTabs &&
                Array.isArray(payload.coreTabs) &&
                payload.coreTabs.length > 0
            ) {
                const importantTabs = payload.coreTabs;

                tabsSection = `\n\n### Important tabs (${importantTabs.length})`;

                // Format each tab with status indicators
                const tabsList = importantTabs
                    .map((tab: any) => {
                        const indicators = [];
                        if (tab.active) indicators.push('active');
                        if (tab.pinned) indicators.push('pinned');
                        if (tab.isMagiGroup) indicators.push('magi opened');

                        const status =
                            indicators.length > 0
                                ? ` (${indicators.join(' · ')})`
                                : '';
                        return `• Tab ${tab.id}${status} — "${tab.title}"  \n  ${tab.url}`;
                    })
                    .join('\n');

                tabsSection += `\n${tabsList}`;
            }

            // Build elements section with interactive elements sorted by score
            let elementsSection = '';
            if (payload.elementMap && Array.isArray(payload.elementMap)) {
                // Copy and sort elements by score and visibility
                const sortedElements = [...payload.elementMap];
                sortedElements.sort((a, b) => {
                    // Primary sort: offscreen (in viewport first)
                    if (!!a.offscreen !== !!b.offscreen) {
                        return a.offscreen ? 1 : -1;
                    }
                    // Secondary sort: score (descending)
                    if ((b.score || 0) !== (a.score || 0)) {
                        return (b.score || 0) - (a.score || 0);
                    }
                    // Tertiary sort: y-position (top elements first)
                    return a.y - b.y;
                });

                // Limit to reasonable display size
                const MAX_ELEMENTS_TO_SHOW = 40;
                const elementsToShow = sortedElements.slice(0, MAX_ELEMENTS_TO_SHOW);
                const inViewportCount = elementsToShow.filter(el => !el.offscreen).length;
                const totalInViewport = sortedElements.filter(el => !el.offscreen).length;

                elementsSection = `\n\n### Interactive elements (${inViewportCount} visible of ${totalInViewport} in viewport, ${sortedElements.length} total)
| id | role | type | label | extras | position | vis |
|----|------|------|-------|--------|----------|-----|`;

                elementsToShow.forEach((el: any) => {
                    // Format the label - trim and limit length
                    const label = el.label
                        ? el.label.length > 25
                            ? `"${el.label.substring(0, 22)}..."`
                            : `"${el.label}"`
                        : '';

                    // Format extras (href, type, etc.)
                    let extras = '';
                    if (el.href) {
                        extras = el.href.length > 20 ? el.href.substring(0, 17) + '...' : el.href;
                    } else if (el.type) {
                        extras = `type=${el.type}`;
                    }

                    // Format position as center point for easier clicking
                    const position = `${el.cx},${el.cy}`;

                    // Visibility indicator
                    const visibility = el.offscreen ? '▼' : '✓';

                    // Create table row
                    elementsSection += `\n| ${el.id || '?'} | ${el.role || '?'} | ${el.tag || '?'} | ${label} | ${extras} | ${position} | ${visibility} |`;
                });

                elementsSection += `\n\n*(✓ = visible now, ▼ = requires scrolling, coordinates are element centers)*`;
            }

            // Send screenshot data to visualization
            let screenshotSection = '';
            if (payload.screenshot) {
                screenshotSection = `\n\n### Browser screenshot
${payload.screenshot}`;
                const comm = getCommunicationManager();
                comm.send({
                    agent: agent.export(),
                    type: 'screenshot',
                    data: payload.screenshot,
                    timestamp: new Date().toISOString(),
                    url: payload.url,
                    viewport: {
                        x: 0,
                        y: 0,
                        width: payload.view?.w ?? 0,
                        height: payload.view?.h ?? 0,
                    },
                });
            }

            // Push the combined message
            messages.push({
                role: 'developer',
                content: `${browserSection}${tabsSection}${elementsSection}${screenshotSection}`,
            });
        }
        console.log(
            `[browser_utils] Total addScreenshot processing took ${Date.now() - tStart}ms`
        );
    } catch (error) {
        console.error(
            `[browser_utils] Error in addScreenshot for ${agent.name}:`,
            error
        );
    }

    // Return the agent and messages unchanged
    return [agent, messages];
}

/**
 * Adds current browser status information to the messages, including:
 * 1. A screenshot of the current page
 * 2. A list of important tabs (active, magi group, or pinned)
 * 3. A simplified summary of the current page structure
 *
 * @param agent The agent to use for browser operations
 * @param messages The messages array to append status to
 * @returns Promise resolving to tuple of agent and updated messages
 */
export async function addBrowserStatus(
    agent: Agent,
    messages: ResponseInput
): Promise<[Agent, ResponseInput]> {
    // Single round-trip to get both the screenshot and the core tabs
    return await addScreenshot(agent, messages);
}
