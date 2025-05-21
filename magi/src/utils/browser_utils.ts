/**
 * Browser utility functions for the MAGI system (WebSocket Client).
 *
 * This module communicates with the MAGI native messaging host bridge
 * running on the host machine via a WebSocket connection. It uses agent-specific
 * browser sessions to ensure each agent has its own tab.
 */

import { BROWSER_WIDTH, BROWSER_HEIGHT } from '../constants.js';
import {
    AgentInterface,
    ResponseInput,
    ToolFunction,
    ToolParameterMap,
} from '../types/shared-types.js'; // Keep if used by your framework
import { createToolFunction } from './tool_call.js'; // Keep if used by your framework
// Import BrowserAction type, session getter, and BrowserStatusPayload
import { getAgentBrowserSession, BrowserAction } from './browser_session.js'; // Assuming BrowserAction is exported from here
import type { BrowserStatusPayload } from './cdp/browser_helpers.js'; // Added import
import type { Agent } from './agent.js';
import { getCommunicationManager } from './communication.js';
import { addGrid } from './image_utils.js';

/**
 * Navigate the agent's browser tab to a URL via the extension bridge.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param url - URL to navigate to.
 * @returns Result message from the bridge/extension.
 */
export async function navigate(
    inject_agent_id: string,
    url: string | any
): Promise<string> {
    // Ensure url is a string
    if (typeof url !== 'string') {
        return `Error: URL must be a string, received ${typeof url}: ${String(url)}`;
    }

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
        // Ensure session is initialized before navigating
        await session.initialize();
        const result = await session.navigate(url);
        return result;
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error during navigation: ${error?.message || String(error)}`;
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
    code: string | any
): Promise<string> {
    // Ensure code is a string
    if (typeof code !== 'string') {
        return `Error: JavaScript code must be a string, received ${typeof code}: ${String(code)}`;
    }

    console.log(
        `[browser_utils] Requesting JavaScript evaluation: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`
    );
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before evaluating JS
        await session.initialize();
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
        // Ensure session is initialized before typing
        await session.initialize();
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
 * @param key - The single key to press (e.g., "Enter", "Tab", "ArrowDown").
 * @returns Result message from the bridge/extension or an error message string.
 */
export async function press_keys(
    inject_agent_id: string,
    keys: string // Expects a single key string
): Promise<string> {
    console.log(`[browser_utils] Requesting to press keys: ${keys}`);
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before pressing keys
        await session.initialize();
        // Pass the single key string to session.press
        const result = await session.press_keys(keys);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error pressing keys '${keys}': ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Waits for a given number of seconds. Useful for waiting for a page load to complete if incomplete data is shown.
 * @param inject_agent_id - The agent ID to use for the browser session (not used, but kept for interface consistency)
 * @param seconds - Number of seconds to wait (default: 3)
 * @returns A message indicating the wait is complete.
 */
export async function wait(
    inject_agent_id: string,
    seconds?: number
): Promise<string> {
    const waitSeconds =
        typeof seconds === 'number' && seconds > 0 ? seconds : 3;
    console.log(`[browser_utils] Waiting for ${waitSeconds} seconds...`);
    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    return `Waited for ${waitSeconds} second${waitSeconds === 1 ? '' : 's'}.`;
}

/**
 * Simulates scrolling the page in the agent's tab.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param method - How to scroll ('page_down', 'page_up', 'bottom', 'top', 'coordinates')
 * @param x - X coordinate to scroll to (only for 'coordinates' mode)
 * @param y - Y coordinate to scroll to (only for 'coordinates' mode)
 * @returns Result message or error string.
 */
export async function scroll_to(
    inject_agent_id: string,
    method: 'page_down' | 'page_up' | 'bottom' | 'top' | 'coordinates',
    x?: number,
    y?: number
): Promise<string> {
    const coordString =
        method === 'coordinates' &&
        typeof x === 'number' &&
        typeof y === 'number'
            ? ` to ${x},${y}`
            : '';
    console.log(
        `[browser_utils] Requesting to scroll (${method})${coordString}`
    );
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before scrolling
        await session.initialize();
        const result = await session.scroll_to(method, x, y);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error scrolling (${method})${coordString}: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates clicking at coordinates in the agent's tab.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param x X coordinate (CSS pixels, max BROWSER_WIDTH)
 * @param y Y coordinate (CSS pixels, max BROWSER_HEIGHT)
 * @returns Result message or error string.
 */
export async function move(
    inject_agent_id: string,
    x: number,
    y: number
): Promise<string> {
    console.log(`[browser_utils] Requesting to move cursor: ${{ x, y }}`);
    // Validate coordinates against expected viewport size
    if (x < 0 || y < 0 || x > BROWSER_WIDTH || y > BROWSER_HEIGHT) {
        return `Error: Invalid coordinates (${x}, ${y}) provided for move. The viewport size is ${BROWSER_WIDTH}x${BROWSER_HEIGHT} and coordinates must be within this range (0-${BROWSER_WIDTH} for x, 0-${BROWSER_HEIGHT} for y).`;
    }

    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before clicking
        await session.initialize();
        const result = await session.move(x, y);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error moving cursor to '${x},${y}': ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates clicking at coordinates in the agent's tab.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param button Optional mouse button ('left', 'middle', 'right')
 * @param event Optional mouse event ('click', 'mousedown', 'mouseup')
 * @param x X coordinate (CSS pixels, max BROWSER_WIDTH)
 * @param y Y coordinate (CSS pixels, max BROWSER_HEIGHT)
 * @returns Result message or error string.
 */
export async function click(
    inject_agent_id: string,
    button?: 'left' | 'middle' | 'right',
    event?: 'click' | 'mousedown' | 'mouseup',
    x?: number,
    y?: number
): Promise<string> {
    console.log(`[browser_utils] Requesting to click: ${{ button, event }}`);

    // Validate coordinates against expected viewport size
    if (
        (typeof x === 'number' && (x < 0 || x > BROWSER_WIDTH)) ||
        (typeof y === 'number' && (y > BROWSER_HEIGHT || y < 0))
    ) {
        return `Error: Invalid coordinates (${x}, ${y}) provided for move. The viewport size is ${BROWSER_WIDTH}x${BROWSER_HEIGHT} and coordinates must be within this range (0-${BROWSER_WIDTH} for x, 0-${BROWSER_HEIGHT} for y).`;
    }

    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before clicking
        await session.initialize();
        const result = await session.click(button, event, x, y);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error clicking: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates dragging from start to end coordinates in the agent's tab.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param startX Starting X coordinate (CSS pixels, max BROWSER_WIDTH)
 * @param startY Starting Y coordinate (CSS pixels, max BROWSER_HEIGHT)
 * @param endX Ending X coordinate (CSS pixels, max BROWSER_WIDTH)
 * @param endY Ending Y coordinate (CSS pixels, max BROWSER_HEIGHT)
 * @param button Optional mouse button ('left', 'middle', 'right')
 * @returns Result message or error string.
 */
export async function drag(
    inject_agent_id: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    button: 'left' | 'middle' | 'right' = 'left'
): Promise<string> {
    console.log(
        `[browser_utils] Requesting to drag: ${{ startX, startY, endX, endY, button }}`
    );
    // Validate coordinates against expected viewport size
    if (
        startX < 0 ||
        startY < 0 ||
        endX < 0 ||
        endY < 0 ||
        startX > BROWSER_WIDTH ||
        endX > BROWSER_WIDTH ||
        startY > BROWSER_HEIGHT ||
        endY > BROWSER_HEIGHT
    ) {
        return `Error: Invalid coordinates dragging from ${startX},${startY} to ${endX},${endY}. The viewport size is ${BROWSER_WIDTH}x${BROWSER_HEIGHT} and coordinates must be within this range (0-${BROWSER_WIDTH} for x, 0-${BROWSER_HEIGHT} for y).`;
    }

    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before dragging
        await session.initialize();
        const result = await session.drag(startX, startY, endX, endY, button);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error dragging from ${startX},${startY} to ${endX},${endY}: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Executes a sequence of browser actions provided as an array.
 * This function is intended to be called by an LLM agent to perform multiple browser
 * interactions in a single step, improving efficiency and reducing round trips.
 * Actions are executed sequentially, and execution stops immediately if any action fails.
 *
 * @param inject_agent_id - The agent ID identifying the target browser session.
 * @param actions - An array of BrowserAction objects. Each object defines a single browser
 * action and its parameters. See the `getBrowserVisionTools` description for available actions and format.
 * Example: [{action: "navigate", url: "https://example.com"}, {action: "click_at", x: 100, y: 200}]
 * @returns A JSON string containing:
 * - `status`: "success" or "error".
 * - `message`: A summary of execution (e.g., "Successfully executed 2 actions." or error details).
 * - `lastResult`: The result returned by the *last successfully executed* action in the sequence
 * (could be a string, a BrowserStatusPayload object, etc., depending on the last action).
 * This is null if no actions were provided or if the first action failed.
 */
export async function use_browser(
    inject_agent_id: string,
    actions: BrowserAction[] | string
): Promise<string> {
    if (typeof actions === 'string') {
        try {
            // Attempt to parse the string as JSON
            actions = JSON.parse(actions);
        } catch (error) {
            const errorMsg = `[browser_utils] Error: Invalid actions parameter: ${error?.message || String(error)}`;
            console.error(errorMsg);
            // Return a structured error JSON consistent with the expected return format
            return 'Error: Invalid actions parameter: not an array.';
        }
    }

    console.log(
        `[browser_utils] Requesting to perform use_browser for agent ${inject_agent_id}: ${JSON.stringify(actions).substring(0, 200)}${JSON.stringify(actions).length > 200 ? '...' : ''}`
    );

    // Basic validation: check if it's an array
    if (!Array.isArray(actions)) {
        const errorMsg =
            '[browser_utils] Error: Invalid actions parameter: not an array.';
        console.error(errorMsg);
        // Return a structured error JSON consistent with the expected return format
        return 'Error: Invalid actions parameter: not an array.';
    }

    if (actions.length === 0) {
        // Return success but indicate no actions were performed
        return 'No actions provided to perform.';
    }

    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before executing actions
        await session.initialize();
        // Call the session's useBrowser method, which handles sequential execution and errors
        const resultString = await session.useBrowser(actions);
        // useBrowser already returns a JSON string with status, message, and lastResult
        return resultString;
    } catch (error: any) {
        // Catch errors during session initialization or unexpected errors in useBrowser itself
        const errorMessage = `[browser_utils] Error executing actions sequence for agent ${inject_agent_id}: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        // Return a structured error JSON

        return `Error executing actions: ${error?.message || String(error)}`;
    }
}

/**
 * Sends an arbitrary debug command to the Chrome DevTools Protocol. Use with caution.
 *
 * @param inject_agent_id The agent ID to use for the browser session.
 * @param method The CDP method to call (e.g., 'Page.captureScreenshot', 'DOM.getDocument').
 * @param commandParamsJson Optional parameters for the CDP method, as a JSON string.
 * @returns Result of the command execution as a JSON string, or an error message string if parsing/execution fails.
 */
export async function cdp_command(
    inject_agent_id: string,
    method: string,
    commandParamsJson?: string
): Promise<string> {
    console.log(
        `[browser_utils] Executing debug command '${method}' for agent ${inject_agent_id} with params string: ${commandParamsJson}`
    );
    if (!method || typeof method !== 'string') {
        const errorMsg =
            "[browser_utils] Error: Valid method name string is required for 'cdp_command'.";
        console.error(errorMsg);
        return errorMsg; // Return simple error string
    }

    let commandParams: object | undefined;
    if (commandParamsJson) {
        try {
            commandParams = JSON.parse(commandParamsJson);
            // Ensure it's an object after parsing
            if (typeof commandParams !== 'object' || commandParams === null) {
                throw new Error('Parsed JSON is not an object.');
            }
        } catch (parseError: any) {
            const errorMsg = `[browser_utils] Error: Invalid JSON string provided for commandParamsJson: ${parseError?.message || String(parseError)}. JSON string was: ${commandParamsJson}`;
            console.error(errorMsg);
            return errorMsg; // Return simple error string
        }
    }

    try {
        // Get the browser session for this agent
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before sending debug command
        await session.initialize();

        // Execute the CDP command using the session's debugCommand method
        const result = await session.debugCommand(method, commandParams);

        // Format the result for return - always attempt to stringify
        try {
            // Stringify with indentation for better readability if logged
            const resultString = JSON.stringify(result, null, 2);
            return resultString;
        } catch (stringifyError: any) {
            console.error(
                `[browser_utils] Error stringifying result of debug command '${method}':`,
                stringifyError
            );
            // Fallback to simple string conversion if stringify fails
            return `[Stringified Error] Could not stringify result: ${String(result)}`;
        }
    } catch (error: any) {
        // Catch errors from session initialization or debugCommand execution
        const errorMessage = `[browser_utils] Error executing debug command '${method}': ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

// --- Tool Definitions ---

export function getBrowserTools(): ToolFunction[] {
    return [
        createToolFunction(navigate, 'Navigate the active tab to a URL.', {
            url: 'Absolute destination URL (e.g. "https://example.com").',
        }),
        createToolFunction(
            type,
            'Type text in the currently focused element. First use click() on the element to focus it.',
            {
                text: 'Use "\\n" for new lines.',
            }
        ),
        createToolFunction(
            press_keys,
            'Simulate pressing a key or key combination (supports Ctrl/Alt/Shift/Meta).',
            {
                keys: 'Key or combo to press. e.g. "Enter", "a", "Ctrl+C", "Shift+Tab".',
            }
        ),
        createToolFunction(
            wait,
            'Wait for a given number of seconds. Useful for waiting for a page load to complete if incomplete data is shown.',
            {
                seconds: {
                    type: 'number',
                    description:
                        'Number of seconds to wait. If not sure, wait 3 seconds is usually enough as additional time will have passed since the last action. You can always call wait again if needed.',
                    optional: true,
                },
            }
        ),
        createToolFunction(
            scroll_to,
            'Scroll the page up/down, to top/bottom, or to specific coordinates.',
            {
                method: {
                    type: 'string',
                    enum: [
                        'page_down',
                        'page_up',
                        'top',
                        'bottom',
                        'coordinates',
                    ],
                    description: 'Scroll action; use "coordinates" with x & y.',
                },
                x: {
                    type: 'number',
                    optional: true,
                    description:
                        'Horizontal CSS pixel position (ignored if not "coordinates")',
                },
                y: {
                    type: 'number',
                    optional: true,
                    description:
                        'Vertical CSS pixel position (required if method="coordinates")',
                },
            }
        ),
        createToolFunction(
            move,
            `Move the mouse cursor to specific CSS-pixel coordinates within the viewport (${BROWSER_WIDTH}x${BROWSER_HEIGHT}). Do this before clicking or to hover over elements. You will see the updated mouse position in the browser window which you can use to validate the position.`,
            {
                x: {
                    type: 'number',
                    minimum: 0,
                    maximum: BROWSER_WIDTH,
                    description:
                        'The x (horizontal) position to move the mouse to.',
                },
                y: {
                    type: 'number',
                    minimum: 0,
                    maximum: BROWSER_HEIGHT,
                    description:
                        'The y (vertical) position to move the mouse to.',
                },
            }
        ),
        createToolFunction(
            click,
            'Trigger a mouse click at current cursor position.',
            {
                button: {
                    type: 'string',
                    enum: ['left', 'middle', 'right'],
                    description:
                        'Which mouse button to click; defaults to "left".',
                    optional: true,
                },
                event: {
                    type: 'string',
                    enum: ['click', 'mousedown', 'mouseup'],
                    description:
                        'What type of mouse event; defaults to "click". You can use click("left", "mousedown") move(x, y) click("left", "mouseup") to drag.',
                    optional: true,
                },
                x: {
                    type: 'number',
                    minimum: 0,
                    maximum: BROWSER_WIDTH,
                    description:
                        'The x (horizontal) position to click at. If not provided, the current cursor position is used.',
                    optional: true,
                },
                y: {
                    type: 'number',
                    minimum: 0,
                    maximum: BROWSER_HEIGHT,
                    description:
                        'The y (vertical) position to click at. If not provided, the current cursor position is used.',
                    optional: true,
                },
            }
        ),
        /*createToolFunction(
            use_browser,
            `Perform one or more browser actions in a row:
navigate(url)
scroll_to(location, x, y)
click_at(x, y, button)
type(text)
press_keys(keys)
drag(startX, startY, endX, endY).

Actions are run in the provided order. If any action fails, the sequence stops, and an error is returned. This is useful for chaining interactions like navigating, typing, and clicking.

You should try to combine multiple actions into a single call to reduce round trips.
For example, if you needed to fill in a form you might perform;
1. use_browser('[{"action": "navigate", "url": "https://example.com"}]') - load the page and find the coordinates of the form fields
2. use_browser('[{"action": "click_at", "x": 100, "y": 200, "button": "left"}, {"action": "type", "text": "Hello World!"}, {"action": "press_keys", "keys": "Enter"}, {"action": "click_at", "x": 300, "y": 400}]') - click the first field, type in the text, press enter, and click the submit button.

If any action fails, you will see how far you got and can continue from there.`,
            {
                actions: {
                    description: `An **ordered list** of browser actions.  The executor will run them sequentially and stop on the first error.
**Viewport is fixed at ${BROWSER_WIDTH} × ${BROWSER_HEIGHT} CSS pixels** — all coordinates and scroll positions must respect that range.`,
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        oneOf: [
                            {
                                description:
                                    'Navigate the active tab to a URL.',
                                additionalProperties: false,
                                properties: {
                                    action: {
                                        type: 'string',
                                        enum: ['navigate'],
                                    },
                                    url: {
                                        type: 'string',
                                        description:
                                            'Absolute destination URL (e.g. "https://example.com").',
                                    },
                                },
                                required: ['action', 'url'],
                            },
                            {
                                description: 'Type text in focused element.',
                                additionalProperties: false,
                                properties: {
                                    action: { type: 'string', enum: ['type'] },
                                    text: {
                                        type: 'string',
                                        description: 'Use "\\n" for new lines.',
                                    },
                                },
                                required: ['action', 'text'],
                            },
                            {
                                description:
                                    'Press a single key (no modifiers).',
                                additionalProperties: false,
                                properties: {
                                    action: {
                                        type: 'string',
                                        enum: ['press_keys'],
                                    },
                                    keys: {
                                        type: 'string',
                                        description:
                                            "The key or combination to press (e.g., 'Enter', 'Ctrl+C')",
                                    },
                                },
                                required: ['action', 'keys'],
                            },
                            {
                                description:
                                    'Scroll the page.  Prefer "page_down" / "page_up" for exploration; ' +
                                    '"coordinates" is only for surgical jumps.',
                                additionalProperties: false,
                                properties: {
                                    action: {
                                        type: 'string',
                                        enum: ['scroll_to'],
                                    },
                                    location: {
                                        type: 'string',
                                        enum: [
                                            'page_down',
                                            'page_up',
                                            'bottom',
                                            'top',
                                            'coordinates',
                                        ],
                                        description:
                                            'Scrolling method.  When "coordinates" is chosen, x & y become required.',
                                    },
                                    x: {
                                        type: 'number',
                                        minimum: 0,
                                        maximum: BROWSER_WIDTH,
                                        optional: true,
                                        description:
                                            'Horizontal scroll target (CSS pixels). **Required when location="coordinates".**',
                                    },
                                    y: {
                                        type: 'number',
                                        minimum: 0,
                                        maximum: BROWSER_HEIGHT,
                                        optional: true,
                                        description:
                                            'Vertical scroll target (CSS pixels). **Required when location="coordinates".**',
                                    },
                                },
                                required: ['action', 'location'],
                            },

                            {
                                description: 'Click at viewport coordinates.',
                                additionalProperties: false,
                                properties: {
                                    action: {
                                        type: 'string',
                                        enum: ['click_at'],
                                    },
                                    x: {
                                        type: 'number',
                                        minimum: 0,
                                        maximum: BROWSER_WIDTH,
                                    },
                                    y: {
                                        type: 'number',
                                        minimum: 0,
                                        maximum: BROWSER_HEIGHT,
                                    },
                                    button: {
                                        type: 'string',
                                        enum: ['left', 'middle', 'right'],
                                        optional: true,
                                        description:
                                            'Defaults to **left** if omitted.',
                                    },
                                },
                                required: ['action', 'x', 'y'],
                            },
                            {
                                description:
                                    'Drag from (startX,startY) to (endX,endY).',
                                additionalProperties: false,
                                properties: {
                                    action: { type: 'string', enum: ['drag'] },
                                    startX: {
                                        type: 'number',
                                        minimum: 0,
                                        maximum: BROWSER_WIDTH,
                                    },
                                    startY: {
                                        type: 'number',
                                        minimum: 0,
                                        maximum: BROWSER_HEIGHT,
                                    },
                                    endX: {
                                        type: 'number',
                                        minimum: 0,
                                        maximum: BROWSER_WIDTH,
                                    },
                                    endY: {
                                        type: 'number',
                                        minimum: 0,
                                        maximum: BROWSER_HEIGHT,
                                    },
                                },
                                required: [
                                    'action',
                                    'startX',
                                    'startY',
                                    'endX',
                                    'endY',
                                ],
                            },
                        ],
                    },
                },
            },
            'Returns a JSON string containing: `status` ("success" or "error"), `message` (summary or error details), and `lastResult` (the output of the last successfully executed action, or null on error/no actions).'
        ),*/
        createToolFunction(
            js_evaluate,
            'Advanced: Execute arbitrary JavaScript in the page context to read or modify the DOM.',
            {
                code: {
                    type: 'string',
                    description: `JavaScript to run. Use \`return\` or \`console.log\` to emit results.

Examples:
// Get all titles from the page
'return Array.from(document.querySelectorAll('h1, h2, h3'));'

// Modify all textareas and log changes
'document.querySelectorAll('textarea').forEach(ta => { console.log('before', ta.value); ta.value = ta.value.toUpperCase(); console.log('after', ta.value);});'`,
                },
            },
            'Any final return statement (stringified), console.log messages or an error message on failure.'
        ),
        createToolFunction(
            cdp_command,
            'Advanced: Send raw Chrome DevTools Protocol (CDP) commands for low-level browser control.',
            {
                method: {
                    type: 'string',
                    description:
                        'Full CDP method name, including domain (e.g. Emulation.setGeolocationOverride, Input.synthesizePinchGesture).',
                },
                commandParamsJson: {
                    type: 'string',
                    description: `Optional JSON string of parameters matching the chosen CDP method.

Examples:
// Spoof geolocation to San Francisco with Emulation.setGeolocationOverride
'{"latitude":37.7749,"longitude":-122.4194,"accuracy":1}'

// Pinch gesture (zoom out) at page center with Input.synthesizePinchGesture
'{"x":400,"y":300,"scaleFactor":0.5,"relativeSpeed":800}'`,
                    optional: true,
                },
            },
            'The response as a JSON string, or an error message if it fails.'
        ),
    ];
}

/**
 * Defines parameters typically used when initializing a browser agent.
 */
export function getBrowserParams(agentName: string): ToolParameterMap {
    return {
        url: {
            type: 'string',
            description: `The initial URL the ${agentName} should navigate to upon starting. Can be omitted to start on 'about:blank'.`,
            optional: true, // Make URL optional
        },
        task: {
            type: 'string',
            description: `A clear description of the primary task the ${agentName} should accomplish. Be specific about the objective but generally allow the agent to determine the steps.`,
        },
        context: {
            type: 'string',
            description:
                'Provide background information relevant to the task. This could include the overall project goal, previous steps taken, constraints, or user preferences. A few sentences to a paragraph is helpful.',
            optional: true,
        },
        goal: {
            type: 'string',
            description:
                'Define the final desired outcome or deliverable of the task. Focus on the end result, not the process. A single, concise sentence is ideal.',
            optional: true,
        },
        intelligence: {
            type: 'string',
            description: `Select the appropriate intelligence level for the ${agentName} based on task complexity. 'standard' is default. 'high' enables more complex reasoning but may be slower. 'low' uses smaller models, faster but less capable.`,
            enum: ['low', 'standard', 'high'],
            optional: true,
        },
    };
}

/**
 * Processes the initial parameters for a browser agent, sets up its browser session,
 * and formats the initial prompt.
 *
 * @param agent - The agent instance.
 * @param params - The parameters provided for agent initialization.
 * @returns An object containing the initial prompt and intelligence setting.
 */
export async function processBrowserParams(
    agent: AgentInterface,
    params: Record<string, any>
): Promise<{ prompt: string; intelligence?: 'low' | 'standard' | 'high' }> {
    console.log('[browser_utils] Processing browser params:', params);
    // Setup agent-specific browser tools and initialize session
    // Pass startUrl only if provided in params
    try {
        await setupAgentBrowserTools(agent, params.url);
    } catch (setupError: any) {
        // If setup fails, report error clearly in the initial prompt
        console.error(
            `[browser_utils] Browser setup failed for agent ${agent.agent_id}: ${setupError.message}`
        );
        return {
            prompt: `**CRITICAL ERROR:** Failed to initialize browser session: ${setupError.message}\n\nPlease report this issue. Cannot proceed with the task.`,
            intelligence: params.intelligence || 'standard', // Keep intelligence level if provided
        };
    }

    const prompts: string[] = [];
    // Confirmation message depends on whether a start URL was actually used
    if (params.url) {
        prompts.push(
            `Your browser tab is ready and has been navigated to: ${params.url}`
        );
    } else {
        prompts.push("Your browser tab is ready (currently on 'about:blank').");
    }
    prompts.push('You are now ready to begin the assigned task.');

    if (params.task) {
        prompts.push(`\n**Your Task:**\n${params.task}`);
    }
    if (params.context) {
        prompts.push(`\n**Background Context:**\n${params.context}`);
    }
    if (params.goal) {
        prompts.push(`\n**Final Goal:**\n${params.goal}`);
    }

    // Return the standard parameter object expected by runAgentTool
    return {
        prompt: prompts.join('\n'), // Use single newline for better readability in chat
        intelligence: params.intelligence,
    };
}

/**
 * Determines the appropriate tab ID for a given agent, prioritizing the parent
 * if it's a browser-type agent to maintain a single tab per browser agent hierarchy.
 *
 * @param agent - The agent interface.
 * @returns The tab ID string to use for the browser session.
 */
function getAgentTabId(agent: AgentInterface): string {
    // Use the agent ID as the default tab ID
    return agent.agent_id;
}

/**
 * Initializes the browser session for a given agent, ensuring the corresponding
 * Chrome tab is ready and CDP connection is established.
 *
 * @param agent - The agent interface.
 * @param startUrl - Optional URL to navigate to if the tab is newly created.
 * @throws If session initialization fails.
 */
export async function setupAgentBrowserTools(
    agent: AgentInterface,
    startUrl?: string
): Promise<void> {
    const tabId = getAgentTabId(agent);
    console.log(
        `[browser_utils] Setting up browser tools for tab: ${tabId} ${startUrl ? `with start URL: ${startUrl}` : '(no start URL)'}`
    );
    try {
        const session = getAgentBrowserSession(tabId, startUrl);
        // Ensure the session is initialized (connects to CDP, creates/attaches to tab)
        // This is idempotent, safe to call multiple times.
        await session.initialize();
        console.log(
            `[browser_utils] Browser session initialized successfully for tab: ${tabId}`
        );
    } catch (error: any) {
        console.error(
            `[browser_utils] Failed to initialize browser session for tab ${tabId}:`,
            error
        );
        // Re-throw the error to be handled by the caller (e.g., processBrowserParams)
        throw new Error(
            `Failed to set up browser tools for agent ${agent.agent_id}: ${error.message}`
        );
    }
}

/**
 * Captures the current browser state (screenshot, URL, elements) for the agent's tab
 * and adds it as a message to the agent's context. Also sends status via comms manager.
 * Handles errors during status capture gracefully.
 *
 * @param agent - The agent instance.
 * @param messages - The current array of messages to append to.
 * @returns A promise resolving to the agent and the updated messages array.
 */
export async function addBrowserStatus(
    agent: Agent,
    messages: ResponseInput
): Promise<[Agent, ResponseInput]> {
    const tStart = Date.now();
    const tabId = getAgentTabId(agent);
    console.log(
        `[browser_utils] Capturing browser status/screenshot for agent ${agent.name} (tab: ${tabId})`
    );

    let payload: BrowserStatusPayload | null = null; // Initialize payload as null
    let statusError: string | null = null; // Store potential error message

    try {
        // Get the browser session associated with this agent
        const session = getAgentBrowserSession(tabId);
        // Ensure session is initialized before getting status
        await session.initialize();

        // Get browser status (includes screenshot)
        const payloadOrError = await session.browserStatus(); // Returns payload or { error: string }

        // Check if an error object was returned
        if (
            typeof payloadOrError === 'object' &&
            payloadOrError !== null &&
            'error' in payloadOrError
        ) {
            statusError = payloadOrError.error; // Store the error message
            console.error(
                `[browser_utils] Error getting browser status for tab ${tabId}: ${statusError}`
            );
        } else {
            // Type assertion is safe here
            payload = payloadOrError as BrowserStatusPayload;
            console.log(
                `[browser_utils] Browser status/screenshot capture took ${Date.now() - tStart}ms for tab ${tabId}`
            );
        }
    } catch (error: any) {
        // Catch errors from session initialization or other unexpected issues
        statusError = `An unexpected error occurred while retrieving browser status: ${error.message || String(error)}`;
        console.error(
            `[browser_utils] Unexpected error in addBrowserStatus for agent ${agent.name} (tab: ${tabId}):`,
            error
        );
    }

    // --- Construct the message content ---
    let messageContent = '';

    if (statusError) {
        // If there was an error, report it clearly
        messageContent = `### Browser Status Error\nFailed to retrieve browser status: ${statusError}`;
    } else if (payload) {
        // If successful, build the detailed status message
        const browserSection = `### Browser status
URL: ${payload.url || 'Unknown'}
Viewport: ${payload.view?.w || 0} × ${payload.view?.h || 0} px
Full page: ${payload.full?.w || 0} × ${payload.full?.h || 0} px
Cursor position: ${payload.cursor?.x || 0} × ${payload.cursor?.y || 0} px`;

        // Build elements section
        let elementsSection = '';
        if (payload.elementMap && Array.isArray(payload.elementMap)) {
            // Limit and format
            const MAX_ELEMENTS_TO_SHOW = 50; // Keep limit
            const elementsToShow = [...payload.elementMap].slice(
                0,
                MAX_ELEMENTS_TO_SHOW
            );

            elementsSection = `

### Interactive elements
Type, center position (x,y) and key details of the first ${elementsToShow.length} interactive DOM nodes found on the page.
`;

            elementsToShow.forEach(el => {
                // Use inferred type InteractiveElement

                // Format the info object concisely
                const infoParts: string[] = [];
                if (el.info.text)
                    infoParts.push(
                        `text: "${el.info.text.substring(0, 50)}${el.info.text.length > 50 ? '...' : ''}"`
                    );
                if (el.info.label)
                    infoParts.push(
                        `label: "${el.info.label.substring(0, 50)}${el.info.label.length > 50 ? '...' : ''}"`
                    );
                if (el.info.name) infoParts.push(`name: ${el.info.name}`);
                if (el.info.value)
                    infoParts.push(
                        `value: "${el.info.value.substring(0, 50)}${el.info.value.length > 50 ? '...' : ''}"`
                    );
                if (el.info.href)
                    infoParts.push(
                        `href: ${el.info.href.substring(0, 200)}${el.info.href.length > 200 ? '...' : ''}`
                    );
                if (el.info.inputType)
                    infoParts.push(`input_type: ${el.info.inputType}`);
                if (el.info.role) infoParts.push(`role: ${el.info.role}`);
                // Add class sparingly if other fields are empty? Maybe not needed for brevity.
                if (el.info.class && infoParts.length < 2)
                    infoParts.push(
                        `class: ${el.info.class.substring(0, 30)}...`
                    );

                const infoString = infoParts.slice(0, 3).join(', '); // Show max 3 key info parts

                const cx = Math.round(el.x + el.w / 2);
                const cy = Math.round(el.y + el.h / 2);
                const position = `{x:${cx},y:${cy}}`;

                elementsSection += `\n${el.type} ${position} ${infoString}`;
            });
        }

        const baseScreenshot = payload.screenshot || '';

        // Add grid overlay using the addGrid function
        const screenshotWithGrid = await addGrid(
            baseScreenshot,
            payload.devicePixelRatio
        );

        // Add crosshairs to key elements to help with click targeting
        /*const screenshotWithCrosshairs = await addCrosshairs(
            screenshotWithGrid,
            elementMap,
            devicePixelRatio,
            10 // Display crosshairs for the top 10 elements
        );*/

        // Add screenshot directly to context message
        const screenshotSection = payload.screenshot
            ? `\n\n### Browser screenshot
Below is a screenshot of your current browser tab. The screenshot is a capture of the current viewport. You can scroll to see the rest of the page.

A grid has been overlaid on the screenshot to help you position your cursor. There are minor grid lines every 100px (dashed) and major lines every 200px (solid). The grid does not show on the real web page.

Your mouse is at {x: ${payload.cursor?.x || 0}, y: ${payload.cursor?.y || 0}} and is shown on the screenshot as a large cursor. Use move(x, y) to refine your position if you move to the wrong spot or click the wrong element.

${screenshotWithGrid}`
            : '';

        // Combine sections for the message content
        messageContent = `${browserSection}${elementsSection}${screenshotSection}`;

        // Send detailed status via communication manager if successful
        const comm = getCommunicationManager();
        comm.send({
            agent: agent.export(),
            type: 'screenshot',
            data: baseScreenshot, // Include screenshot here too if needed by visualizer
            timestamp: new Date().toISOString(),
            url: payload.url,
            viewport: {
                x: 0,
                y: 0,
                width: payload.view.w,
                height: payload.view.h,
            },
            cursor: payload.cursor,
        });
    } else {
        // Fallback if payload is null and no error was caught (shouldn't happen often)
        messageContent =
            '### Browser Status Error\nCould not retrieve browser status (payload was null).';
    }

    // Push the constructed message to the messages array
    messages.push({
        type: 'message',
        role: 'developer', // Role indicating system-provided information
        content: messageContent,
    });

    console.log(
        `[browser_utils] Total addBrowserStatus processing took ${Date.now() - tStart}ms for tab ${tabId}`
    );

    // Return the agent and the modified messages array
    return [agent, messages];
}
