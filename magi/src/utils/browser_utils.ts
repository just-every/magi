/**
 * Browser utility functions for the MAGI system (WebSocket Client).
 *
 * This module communicates with the MAGI native messaging host bridge
 * running on the host machine via a WebSocket connection. It uses agent-specific
 * browser sessions to ensure each agent has its own tab.
 */

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

/**
 * Navigate the agent's browser tab to a URL via the extension bridge.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param url - URL to navigate to.
 * @returns Result message from the bridge/extension.
 */
export async function navigate(
    inject_agent_id: string,
    url: string
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
    code: string
): Promise<string> {
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
    key: string // Expects a single key string
): Promise<string> {
    console.log(`[browser_utils] Requesting to press key: ${key}`);
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before pressing keys
        await session.initialize();
        // Pass the single key string to session.press
        const result = await session.press(key);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error pressing key '${key}': ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates scrolling the page in the agent's tab.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param mode - How to scroll ('page_down', 'page_up', 'bottom', 'top', 'coordinates')
 * @param x - X coordinate to scroll to (only for 'coordinates' mode)
 * @param y - Y coordinate to scroll to (only for 'coordinates' mode)
 * @returns Result message or error string.
 */
export async function scroll_to(
    inject_agent_id: string,
    mode: 'page_down' | 'page_up' | 'bottom' | 'top' | 'coordinates',
    x?: number,
    y?: number
): Promise<string> {
    const coordString =
        mode === 'coordinates' && typeof x === 'number' && typeof y === 'number'
            ? ` to ${x},${y}`
            : '';
    console.log(`[browser_utils] Requesting to scroll (${mode})${coordString}`);
    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before scrolling
        await session.initialize();
        const result = await session.scroll_to(mode, x, y);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error scrolling (${mode})${coordString}: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates clicking at coordinates in the agent's tab.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param x X coordinate (CSS pixels, max 1024)
 * @param y Y coordinate (CSS pixels, max 768)
 * @param button Optional mouse button ('left', 'middle', 'right')
 * @returns Result message or error string.
 */
export async function click_at(
    inject_agent_id: string,
    x: number,
    y: number,
    button?: 'left' | 'middle' | 'right'
): Promise<string> {
    console.log(`[browser_utils] Requesting to click at: ${{ x, y, button }}`);
    // Validate coordinates against expected viewport size
    if (x < 0 || y < 0 || x > 1024 || y > 768) {
        return `Error: Invalid coordinates (${x}, ${y}) provided for click_at. The viewport size is 1024x768 and coordinates must be within this range (0-1024 for x, 0-768 for y).`;
    }

    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before clicking
        await session.initialize();
        const result = await session.click_at(x, y, button);
        return String(result);
    } catch (error: any) {
        const errorMessage = `[browser_utils] Error clicking at '${x},${y}': ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        return errorMessage; // Return error message string
    }
}

/**
 * Simulates dragging from start to end coordinates in the agent's tab.
 *
 * @param inject_agent_id - The agent ID to use for the browser session
 * @param startX Starting X coordinate (CSS pixels, max 1024)
 * @param startY Starting Y coordinate (CSS pixels, max 768)
 * @param endX Ending X coordinate (CSS pixels, max 1024)
 * @param endY Ending Y coordinate (CSS pixels, max 768)
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
        startX > 1024 ||
        endX > 1024 ||
        startY > 768 ||
        endY > 768
    ) {
        return `Error: Invalid coordinates dragging from ${startX},${startY} to ${endX},${endY}. The viewport size is 1024x768 and coordinates must be within this range (0-1024 for x, 0-768 for y).`;
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
 * Executes a sequence of browser actions provided as a JSON string.
 * This function is intended to be called by an LLM agent to perform multiple browser
 * interactions in a single step, improving efficiency and reducing round trips.
 * Actions are executed sequentially, and execution stops immediately if any action fails.
 *
 * @param inject_agent_id - The agent ID identifying the target browser session.
 * @param actionsJson - A JSON string representing an array of action objects. Each object
 * defines a single browser action and its parameters.
 * See the `getBrowserVisionTools` description for available actions and format.
 * Example: '[{"action": "navigate", "url": "https://example.com"}, {"action": "click_at", "x": 100, "y": 200}]'
 * @returns A JSON string containing:
 * - `status`: "success" or "error".
 * - `message`: A summary of execution (e.g., "Successfully executed 2 actions." or error details).
 * - `lastResult`: The result returned by the *last successfully executed* action in the sequence
 * (could be a string, a BrowserStatusPayload object, etc., depending on the last action).
 * This is null if no actions were provided or if the first action failed.
 */
export async function execute(
    inject_agent_id: string,
    actionsJson: string
): Promise<string> {
    console.log(
        `[browser_utils] Requesting to execute actions for agent ${inject_agent_id}: ${actionsJson.substring(0, 200)}${actionsJson.length > 200 ? '...' : ''}`
    );

    let actions: BrowserAction[];
    try {
        actions = JSON.parse(actionsJson);
        // Basic validation: check if it's an array and not empty
        if (!Array.isArray(actions)) {
            throw new Error('Parsed JSON is not an array.');
        }
        // Optional: Add deeper validation for each action object structure if needed
        // e.g., check for 'action' property, validate parameters per action type
    } catch (parseError: any) {
        const errorMsg = `[browser_utils] Error: Invalid JSON string provided for actionsJson: ${parseError?.message || String(parseError)}. JSON string was: ${actionsJson}`;
        console.error(errorMsg);
        // Return a structured error JSON consistent with the expected return format
        return JSON.stringify({
            status: 'error',
            message: `Invalid JSON for actions: ${parseError?.message || String(parseError)}`,
            lastResult: null,
        });
    }

    if (actions.length === 0) {
        // Return success but indicate no actions were performed
        return JSON.stringify({
            status: 'success',
            message: 'No actions provided to execute.',
            lastResult: null,
        });
    }

    try {
        const session = getAgentBrowserSession(inject_agent_id);
        // Ensure session is initialized before executing actions
        await session.initialize();
        // Call the session's executeActions method, which handles sequential execution and errors
        const resultString = await session.executeActions(actions);
        // executeActions already returns a JSON string with status, message, and lastResult
        return resultString;
    } catch (error: any) {
        // Catch errors during session initialization or unexpected errors in executeActions itself
        const errorMessage = `[browser_utils] Error executing actions sequence for agent ${inject_agent_id}: ${error?.message || String(error)}`;
        console.error(errorMessage, error?.details || '');
        // Return a structured error JSON
        return JSON.stringify({
            status: 'error',
            message: `Error executing actions: ${error?.message || String(error)}`,
            lastResult: null, // Indicate no successful result
        });
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
export async function debug_command(
    inject_agent_id: string,
    method: string,
    commandParamsJson?: string
): Promise<string> {
    console.log(
        `[browser_utils] Executing debug command '${method}' for agent ${inject_agent_id} with params string: ${commandParamsJson}`
    );
    if (!method || typeof method !== 'string') {
        const errorMsg =
            "[browser_utils] Error: Valid method name string is required for 'debug_command'.";
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

/**
 * Get common browser tools (navigation, typing, key presses).
 * These are fundamental actions for basic web interaction.
 */
export function getCommonBrowserTools(): ToolFunction[] {
    return [
        createToolFunction(
            navigate,
            'Navigate the current browser tab to a specified URL.',
            {
                url: {
                    type: 'string',
                    description:
                        'The absolute URL to navigate to (e.g., "https://example.com").',
                },
            },
            'Returns a status message indicating success or failure of the navigation attempt.'
        ),
        createToolFunction(
            type,
            'Simulate typing text using the keyboard into the currently focused element. This function correctly handles newline characters (\\n) by simulating an Enter key press.',
            {
                text: {
                    type: 'string',
                    description: 'The text to type. Use "\\n" for newlines.',
                },
            },
            'Returns a status message indicating success or failure.'
        ),
        createToolFunction(
            press_keys,
            'Simulate pressing a single specific keyboard key (e.g., Enter, Tab, ArrowDown, Escape). This action affects the currently focused element on the page.',
            {
                key: {
                    type: 'string',
                    description:
                        'The single key to press. Common values include "Enter", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Delete". For regular characters, use the character itself (e.g., "a", "A", "5"). Modifier keys (Ctrl, Shift, Alt, Meta) are not directly supported by this simplified function; use the `execute` tool with `debugCommand` and `Input.dispatchKeyEvent` for complex key combinations.',
                },
            },
            'Returns a status message indicating success or failure.'
        ),
    ];
}

/**
 * Get browser vision tools (scrolling, clicking, dragging, executing sequences).
 * These tools are typically used by multimodal agents that can "see" the page layout.
 * Coordinates are based on a standard 1024x768 CSS pixel viewport.
 */
export function getBrowserVisionTools(): ToolFunction[] {
    return [
        createToolFunction(
            scroll_to,
            'Scroll the current browser tab view. Use "page_down" or "page_up" for general scrolling, "top" or "bottom" to reach page ends, or "coordinates" for specific positioning.',
            {
                mode: {
                    type: 'string',
                    description:
                        'The scrolling method. "page_down" is generally preferred over "coordinates" for exploration to avoid missing content.',
                    enum: [
                        'page_down',
                        'page_up',
                        'bottom',
                        'top',
                        'coordinates',
                    ],
                },
                x: {
                    type: 'number',
                    description:
                        'The target horizontal scroll coordinate (CSS pixel value). Required and only used when mode="coordinates". Must be between 0 and 1024.',
                    optional: true, // Optional overall, but required for 'coordinates' mode
                },
                y: {
                    type: 'number',
                    description:
                        'The target vertical scroll coordinate (CSS pixel value). Required and only used when mode="coordinates". Must be between 0 and 768.',
                    optional: true, // Optional overall, but required for 'coordinates' mode
                },
            },
            'Returns a status message indicating success or failure of the scroll operation.'
        ),
        createToolFunction(
            click_at,
            'Simulate a mouse click at specific coordinates (CSS pixels) within the current page viewport. The viewport is assumed to be 1024x768 pixels.',
            {
                x: {
                    type: 'number',
                    description:
                        'The horizontal coordinate (X-axis) to click at (must be between 0 and 1024).',
                },
                y: {
                    type: 'number',
                    description:
                        'The vertical coordinate (Y-axis) to click at (must be between 0 and 768).',
                },
                button: {
                    type: 'string',
                    description:
                        'The mouse button to simulate for the click. Defaults to "left".',
                    enum: ['left', 'middle', 'right'],
                    optional: true,
                },
            },
            'Returns a status message indicating success or failure of the click.'
        ),
        createToolFunction(
            drag,
            'Simulate a mouse drag operation from a starting coordinate to an ending coordinate (CSS pixels) within the viewport (1024x768).',
            {
                startX: {
                    type: 'number',
                    description:
                        'The horizontal coordinate (X-axis) where the drag starts (0-1024).',
                },
                startY: {
                    type: 'number',
                    description:
                        'The vertical coordinate (Y-axis) where the drag starts (0-768).',
                },
                endX: {
                    type: 'number',
                    description:
                        'The horizontal coordinate (X-axis) where the drag ends (0-1024).',
                },
                endY: {
                    type: 'number',
                    description:
                        'The vertical coordinate (Y-axis) where the drag ends (0-768).',
                },
                button: {
                    type: 'string',
                    description:
                        'The mouse button to hold down during the drag. Defaults to "left".',
                    enum: ['left', 'middle', 'right'],
                    optional: true,
                },
            },
            'Returns a status message indicating success or failure of the drag operation.'
        ),
        createToolFunction(
            execute,
            'Execute a sequence of browser actions efficiently in a single tool call. Actions run in the provided order. If any action fails, the sequence stops, and an error is returned. This is useful for chaining interactions like navigating, typing, and clicking.',
            {
                actionsJson: {
                    type: 'string',
                    description: `A **JSON string** representing an **array** of action objects. Each object in the array MUST have an 'action' property specifying the action name, and any required parameters for that action.

Available actions and their parameters:
- \`{"action": "navigate", "url": "string"}\`
- \`{"action": "type", "text": "string"}\` (handles \\n)
- \`{"action": "press", "key": "string"}\` (e.g., "Enter", "Tab")
- \`{"action": "scroll_to", "mode": "string", "x"?: number, "y"?: number}\` (mode: 'page_down', 'page_up', 'bottom', 'top', 'coordinates')
- \`{"action": "click_at", "x": number, "y": number, "button"?: "string"}\` (button: 'left', 'middle', 'right')
- \`{"action": "drag", "startX": number, "startY": number, "endX": number, "endY": number, "button"?: "string"}\`
- \`{"action": "js_evaluate", "code": "string"}\`
- \`{"action": "get_page_url"}\` (no parameters)
- \`{"action": "get_page_content", "type": "string"}\` (type: 'html', 'markdown', 'interactive' - currently only 'html' fully supported)
- \`{"action": "browserStatus", "type"?: "string", "includeCoreTabs"?: boolean}\` (type: 'viewport' or 'fullpage' - currently only 'viewport')
- \`{"action": "debugCommand", "method": "string", "commandParams"?: object}\` (Advanced CDP command)

**Example JSON String:**
\`'[{"action": "navigate", "url": "https://google.com"}, {"action": "type", "text": "large language models\\n"}, {"action": "click_at", "x": 500, "y": 400}]'\`
Make sure the JSON string is valid and properly escaped if necessary within the parent JSON tool call.`,
                },
            },
            'Returns a JSON string containing: `status` ("success" or "error"), `message` (summary or error details), and `lastResult` (the output of the last successfully executed action, or null on error/no actions).'
        ),
    ];
}

/**
 * Get advanced/debug browser tools.
 * These tools provide lower-level access and should be used with caution.
 */
export function getBrowserDebugTools(): ToolFunction[] {
    return [
        createToolFunction(
            js_evaluate,
            'Advanced: Execute arbitrary JavaScript code directly within the context of the current page. Returns the result of the execution.',
            {
                code: {
                    type: 'string',
                    description:
                        'The JavaScript code string to execute. Example: "document.title" or "return document.querySelectorAll(\'.item\').length".',
                },
            },
            'Returns the result of the JavaScript execution, converted to a string. Errors during execution will be returned as an error message string.'
        ),
        createToolFunction(
            debug_command,
            'Advanced: Send a raw Chrome DevTools Protocol (CDP) command directly to the browser tab. This allows for fine-grained control but requires knowledge of the CDP specification.',
            {
                method: {
                    type: 'string',
                    description:
                        "The full CDP method name including the domain (e.g., 'Page.navigate', 'DOM.querySelector', 'Input.dispatchKeyEvent'). Refer to the Chrome DevTools Protocol documentation for available methods.",
                },
                commandParamsJson: {
                    type: 'string',
                    description:
                        'Optional: A JSON string representing the parameters object for the CDP method. The structure must match the requirements of the specified CDP method. Example for Page.navigate: \'{"url": "https://example.com"}\'. Example for Input.dispatchKeyEvent: \'{"type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13}\'.',
                    optional: true,
                },
            },
            'Returns the raw result object from the CDP command, serialized as a JSON string. If the command fails or parameters are invalid, an error message string is returned.'
        ),
    ];
}

// --- Agent Setup and Status ---

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
    let tabId = agent.agent_id;
    // Check if parent exists, has an ID, and is one of the browser agent types
    if (
        agent.parent?.agent_id && // Ensure parent and parent.agent_id exist
        (agent.parent.name === 'BrowserAgent' ||
            agent.parent.name === 'BrowserCodeAgent' ||
            agent.parent.name === 'BrowserVisionAgent')
    ) {
        // Use the parent agent ID if it's a browser agent, ensuring consistency
        tabId = agent.parent.agent_id;
        console.log(
            `[browser_utils] Using parent agent ID (${tabId}) for browser session for agent ${agent.agent_id} (${agent.name}).`
        );
    } else {
        console.log(
            `[browser_utils] Using own agent ID (${tabId}) for browser session for agent ${agent.agent_id} (${agent.name}).`
        );
    }
    return tabId;
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
async function addScreenshot(
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
        const payloadOrError = await session.browserStatus('viewport'); // Returns payload or { error: string }

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
            `[browser_utils] Unexpected error in addScreenshot for agent ${agent.name} (tab: ${tabId}):`,
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
Viewport: ${payload.view?.w || 0} × ${payload.view?.h || 0} CSS px | Full page: ${payload.full?.w || 0} × ${payload.full?.h || 0} CSS px`;

        // Build tabs section (placeholder, as coreTabs isn't fully implemented yet)
        let tabsSection = '';
        if (
            payload.coreTabs &&
            Array.isArray(payload.coreTabs) &&
            payload.coreTabs.length > 0
        ) {
            tabsSection =
                '\n\n### Important tabs (Note: Data may be placeholder)';
            // ... (tab formatting logic) ...
        }

        // Build elements section
        let elementsSection = '';
        if (payload.elementMap && Array.isArray(payload.elementMap)) {
            // Sort elements
            const sortedElements = [...payload.elementMap].sort(
                (a, b) =>
                    !!a.offscreen !== !!b.offscreen
                        ? a.offscreen
                            ? 1
                            : -1 // Onscreen first
                        : (b.score || 0) - (a.score || 0) || // Then by score desc
                          (a.y || 0) - (b.y || 0) // Then by y-coord asc
            );

            // Limit and format
            const MAX_ELEMENTS_TO_SHOW = 40;
            const elementsToShow = sortedElements.slice(
                0,
                MAX_ELEMENTS_TO_SHOW
            );
            const inViewportCount = elementsToShow.filter(
                el => !el.offscreen
            ).length;
            const totalInViewport = sortedElements.filter(
                el => !el.offscreen
            ).length;
            const hiddenShownCount = elementsToShow.length - inViewportCount;

            elementsSection = `\n\n### Interactive elements (${inViewportCount} visible + ${hiddenShownCount} hidden shown of ${totalInViewport} in viewport, ${sortedElements.length} total)`;
            elementsSection +=
                '\n| id | role | type | label | extras | position | vis | score |';
            elementsSection +=
                '\n|----|------|------|-------|--------|----------|-----|-------|';

            elementsToShow.forEach((el: any) => {
                const label = el.label
                    ? `"${el.label.replace(/\s+/g, ' ').trim().substring(0, 22)}${el.label.length > 25 ? '...' : ''}"`
                    : '';
                let extras = '';
                if (el.href)
                    extras =
                        el.href.length > 20
                            ? el.href.substring(0, 17) + '...'
                            : el.href;
                else if (el.placeholder)
                    extras = `placeholder="${el.placeholder.substring(0, 15)}${el.placeholder.length > 15 ? '...' : ''}"`;
                else if (el.value)
                    extras = `value="${el.value.substring(0, 15)}${el.value.length > 15 ? '...' : ''}"`;
                else if (el.type) extras = `type=${el.type}`;
                const posX = typeof el.cx === 'number' ? Math.round(el.cx) : 0;
                const posY = typeof el.cy === 'number' ? Math.round(el.cy) : 0;
                const position = `${posX},${posY}`;
                const visibility = el.offscreen ? '▼' : '✓';
                const score =
                    typeof el.score === 'number' ? el.score.toFixed(1) : '-';
                elementsSection += `\n| ${el.id || '?'} | ${el.role || '?'} | ${el.tag || '?'} | ${label} | ${extras} | ${position} | ${visibility} | ${score} |`;
            });
            elementsSection +=
                '\n\n*(✓ = visible now, ▼ = requires scrolling, coords = element center [x,y], score = importance)*';
        }

        // Add screenshot directly to context message
        const screenshotSection = payload.screenshot
            ? `\n\n### Browser screenshot\n${payload.screenshot}`
            : '';

        // Combine sections for the message content
        messageContent = `${browserSection}${tabsSection}${elementsSection}${screenshotSection}`;

        // Send detailed status via communication manager if successful
        const comm = getCommunicationManager();
        comm.send({
            agent: agent.export(),
            type: 'screenshot',
            data: payload.screenshot, // Include screenshot here too if needed by visualizer
            timestamp: new Date().toISOString(),
            url: payload.url,
            viewport: {
                x: 0,
                y: 0,
                width: payload.view.w,
                height: payload.view.h,
            },
        });
    } else {
        // Fallback if payload is null and no error was caught (shouldn't happen often)
        messageContent =
            '### Browser Status Error\nCould not retrieve browser status (payload was null).';
    }

    // Push the constructed message to the messages array
    messages.push({
        role: 'developer', // Role indicating system-provided information
        content: messageContent,
    });

    console.log(
        `[browser_utils] Total addScreenshot processing took ${Date.now() - tStart}ms for tab ${tabId}`
    );

    // Return the agent and the modified messages array
    return [agent, messages];
}

/**
 * Adds current browser status information (screenshot, URL, elements) to the agent's
 * message context. This is typically called before requesting the agent's next action.
 *
 * @param agent The agent instance.
 * @param messages The current array of messages for the agent's context.
 * @returns Promise resolving to a tuple of the agent and the updated messages array.
 */
export async function addBrowserStatus(
    agent: Agent,
    messages: ResponseInput
): Promise<[Agent, ResponseInput]> {
    // Delegate directly to addScreenshot, which now handles status fetching and message formatting.
    return await addScreenshot(agent, messages);
}
