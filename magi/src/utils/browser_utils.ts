/**
 * Browser utility functions for the MAGI system (WebSocket Client).
 *
 * This module communicates with the MAGI native messaging host bridge
 * running on the host machine via a WebSocket connection. It uses agent-specific
 * browser sessions to ensure each agent has its own tab.
 */

import { v4 as uuidv4 } from 'uuid'; // For generating unique request IDs
import { AgentInterface } from '../types.js'; // Keep if used by your framework
import { createToolFunction } from './tool_call.js'; // Keep if used by your framework
import { getAgentBrowserSession } from './browser_session.js';
import { ToolFunction } from '../types.js'; // Import ToolFunction for the return type

// Map of agent agent_id to agent browser session
const agentSessionMap = new Map<string, any>();

// Helper to get the tab ID from the current context
// This is needed because the tool functions don't have access to agent context directly
let currentTabId: string | null = null;

/**
 * Set the current tab ID for browser operations
 * This should be called before using browser tools
 * @param tabId - The tab ID to use for browser operations
 */
export function setCurrentAgentId(tabId: string | null) {
  currentTabId = tabId;
}

/**
 * Get the current tab ID for browser operations
 * @returns The current tab ID, or generates a default one if not set
 */
function getCurrentTabId(): string {
  if (!currentTabId) {
    // Generate a default tab ID if none is set
    // This is a fallback but should generally not happen
    const defaultId = `default-tab-${uuidv4().substring(0, 8)}`;
    console.warn(`[browser_utils] No tab ID set, using default: ${defaultId}`);
    currentTabId = defaultId;
  }
  return currentTabId;
}

/**
 * Get or create a browser session for the current tab
 * @returns An AgentBrowserSession instance for the current tab
 */
function getOrCreateTabSession() {
  const tabId = getCurrentTabId();

  if (!agentSessionMap.has(tabId)) {
    console.log(`[browser_utils] Creating new browser session for tab: ${tabId}`);
    const session = getAgentBrowserSession(tabId);
    agentSessionMap.set(tabId, session);
  }

  return agentSessionMap.get(tabId);
}

// --- Exported Browser Control Functions ---
// These maintain the existing API but use the new agent-specific sessions

/**
 * Navigate the agent's browser tab to a URL via the extension bridge.
 *
 * @param url - URL to navigate to.
 * @returns Result message from the bridge/extension.
 */
export async function navigate(url: string, takeFocus?: false): Promise<string> {
  console.log(`[browser_utils] Requesting navigation to: ${url}`);
  try {
    const session = getOrCreateTabSession();
    await session.initialize(); // Ensure session is initialized
    const result = await session.navigate(url, takeFocus);
    return result + ' Recommend calling get_page_content() to refresh the view.';
  } catch (error: any) {
    const errorMessage = `[browser_utils] Error during navigation: ${error?.message || String(error)}`;
    console.error(errorMessage, error?.details || '');
    return errorMessage; // Return error message string
  }
}

/**
 * Gets the simplified page content (text representation) from the agent's tab
 * via the extension bridge.
 *
 * @returns Simplified text representation of the page or an error message string.
 */
export async function get_page_content(allContent?: boolean): Promise<string> {
  console.log('[browser_utils] Requesting simplified page content...');
  try {
    const session = getOrCreateTabSession();
    await session.initialize(); // Ensure session is initialized
    const simplifiedText = await session.get_page_content(allContent);
    return simplifiedText;
  } catch (error: any) {
    const errorMessage = `[browser_utils] Error getting simplified page content: ${error?.message || String(error)}`;
    console.error(errorMessage, error?.details || '');
    return `${errorMessage}. Interaction map may be unavailable.`; // Return error message string
  }
}

/**
 * Gets the current URL of the agent's tab via the extension bridge.
 *
 * @returns The current URL string or an error message string.
 */
export async function get_page_url(): Promise<string> {
  console.log('[browser_utils] Requesting current page URL...');
  try {
    const session = getOrCreateTabSession();
    await session.initialize(); // Ensure session is initialized
    const url = await session.get_page_url();
    return String(url); // Ensure it's a string
  } catch (error: any) {
    const errorMessage = `[browser_utils] Error getting page URL: ${error?.message || String(error)}`;
    console.error(errorMessage, error?.details || '');
    return errorMessage; // Return error message string
  }
}

/**
 * Takes a screenshot of the agent's tab's viewport via the extension bridge.
 *
 * @param fileName - Optional filename suggestion (bridge might modify it).
 * @returns The path where the screenshot was saved or an error message string.
 */
export async function screenshot(
    type: 'viewport' | 'page' | 'element',
    elementId: number,
    ): Promise<string> {
  if (type === 'element' && (typeof elementId !== 'number' || elementId <= 0)) {
    const errorMsg = `[browser_utils] Error: Invalid elementId (${elementId}) provided for screenshot '${type}'.`;
    console.error(errorMsg);
    return Promise.resolve(errorMsg); // Return error string directly
  }
  console.log(`[browser_utils] Requesting ${type} ${elementId} screenshot...`);
  try {
    const session = getOrCreateTabSession();
    await session.initialize(); // Ensure session is initialized
    return await session.screenshot(type, elementId);
  } catch (error: any) {
    const errorMessage = `[browser_utils] Error taking ${type} ${elementId} screenshot: ${error?.message || String(error)}`;
    console.error(errorMessage, error?.details || '');
    return errorMessage; // Return error message string
  }
}

/**
 * Executes JavaScript code in the agent's tab's context via the extension bridge.
 *
 * @param code - JavaScript code to execute.
 * @returns Stringified result of the executed code or an error message string.
 */
export async function js_evaluate(code: string): Promise<string> {
  console.log(`[browser_utils] Requesting JavaScript evaluation: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`);
  try {
    const session = getOrCreateTabSession();
    await session.initialize(); // Ensure session is initialized
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
 * @param text - Text to type.
 * @returns Result message from the bridge/extension or an error message string.
 */
export async function type(text: string): Promise<string> {
  console.log(`[browser_utils] Requesting to type text: ${text}`);
  try {
    const session = getOrCreateTabSession();
    await session.initialize(); // Ensure session is initialized
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
 * @param keys - Keys to press (e.g., "Enter", "Tab", "ArrowDown").
 * @returns Result message from the bridge/extension or an error message string.
 */
export async function press(keys: string): Promise<string> {
  console.log(`[browser_utils] Requesting to press keys: ${keys}`);
  try {
    const session = getOrCreateTabSession();
    await session.initialize(); // Ensure session is initialized
    const result = await session.press(keys);
    return String(result);
  } catch (error: any) {
    const errorMessage = `[browser_utils] Error pressing keys '${keys}': ${error?.message || String(error)}`;
    console.error(errorMessage, error?.details || '');
    return errorMessage; // Return error message string
  }
}

/**
 * Resets the extension's interaction map for the agent's tab via the bridge.
 *
 * @returns Result message from the bridge/extension or an error message string.
 */
export async function switch_tab(
    type: 'active' | 'new' | 'id',
    tabId: string,
): Promise<string> {
  console.log('[browser_utils] Requesting session tab change...');
  if (type === 'id' && (typeof tabId !== 'string' || !tabId)) {
    const errorMsg = `[browser_utils] Error: Invalid tabId (${tabId}) provided for tabs switch '${type}'.`;
    console.error(errorMsg);
    return Promise.resolve(errorMsg); // Return error string directly
  }
  try {
    const session = getOrCreateTabSession();
    await session.initialize(); // Ensure session is initialized
    const result = await session.switchTab(type, tabId);
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
  elementId: number,
  action: 'click' | 'fill' | 'check' | 'hover' | 'focus' | 'scroll' | 'select_option',
  value?: string, // Used for fill, select_option
  checked?: boolean // Used for check
): Promise<string> {
  if (typeof elementId !== 'number' || elementId <= 0) {
    const errorMsg = `[browser_utils] Error: Invalid elementId (${elementId}) provided for action '${action}'.`;
    console.error(errorMsg);
    return Promise.resolve(errorMsg); // Return error string directly
  }
  console.log(`[browser_utils] Requesting action '${action}' on element ID ${elementId}...`);
  try {
    const session = getOrCreateTabSession();
    await session.initialize(); // Ensure session is initialized
    const result = await session.interactElement(elementId, action, value, checked);
    return String(result); // Return success/status message from background script
  } catch (error: any) {
    const errorMessage = `[browser_utils] Error performing action '${action}' on element ID ${elementId}: ${error?.message || String(error)}`;
    console.error(errorMessage, error?.details || '');
    return errorMessage; // Return error message string
  }
}


export async function clickElement(elementId: number): Promise<string> {
  const result = await interactElement(elementId, 'click');
  // Add recommendation here as the result string comes from background.js now
  if (!result.startsWith('[browser_utils] Error:') && !result.toLowerCase().includes('error')) {
    return result + ' IMPORTANT: Page state might have changed. Consider calling get_page_content().';
  }
  return result;
}

export async function fillField(elementId: number, value: string): Promise<string> {
  if (value === undefined || value === null) {
    return "[browser_utils] Error: 'value' parameter must be provided for 'fillField'.";
  }
  return interactElement(elementId, 'fill', value);
}

export async function checkElement(elementId: number, checked: boolean): Promise<string> {
  if (checked === undefined || checked === null) {
    return "[browser_utils] Error: 'checked' parameter (true/false) must be provided for 'checkElement'.";
  }
  return interactElement(elementId, 'check', undefined, checked);
}

export async function hoverElement(elementId: number): Promise<string> {
  const result = await interactElement(elementId, 'hover');
  if (!result.startsWith('[browser_utils] Error:') && !result.toLowerCase().includes('error')) {
    return result + ' Tooltips or menus might now be visible. Consider calling get_page_content().';
  }
  return result;
}

export async function focusElement(elementId: number): Promise<string> {
  const result = await interactElement(elementId, 'focus');
  if (!result.startsWith('[browser_utils] Error:') && !result.toLowerCase().includes('error')) {
    return result + " Subsequent 'press' or 'type' actions may target this element.";
  }
  return result;
}

export async function scrollElement(elementId: number): Promise<string> {
  return interactElement(elementId, 'scroll');
}

export async function selectOption(elementId: number, value: string): Promise<string> {
  if (value === undefined || value === null) {
    return "[browser_utils] Error: 'value' parameter (option value, text, or label) must be provided for 'selectOption'.";
  }
  const result = await interactElement(elementId, 'select_option', value);
  if (!result.startsWith('[browser_utils] Error:') && !result.toLowerCase().includes('error')) {
    return result + ' IMPORTANT: Page state might have changed. Consider calling get_page_content().';
  }
  return result;
}

// Close the tab browser session when done
export async function closeAgentSession(): Promise<string> {
  const tabId = getCurrentTabId();
  console.log(`[browser_utils] Requesting to close session for tab: ${tabId}`);

  if (!agentSessionMap.has(tabId)) {
    return `[browser_utils] No session found for tab: ${tabId}`;
  }

  try {
    const session = agentSessionMap.get(tabId);
    const result = await session.closeSession();
    // Remove from the map
    agentSessionMap.delete(tabId);
    return result;
  } catch (error: any) {
    const errorMessage = `[browser_utils] Error closing session for tab ${tabId}: ${error?.message || String(error)}`;
    console.error(errorMessage, error?.details || '');
    // Still remove from map even if close fails
    agentSessionMap.delete(tabId);
    return errorMessage;
  }
}

/**
 * Get all browser tools as an array of tool definitions
 */
export function getBrowserTools(): ToolFunction[] {
  return [
    // --- Navigation and Page Context ---
    createToolFunction(
      navigate,
      'Navigate to a URL. IMPORTANT: Always call get_page_content() AFTER navigation completes successfully to get the structure of the new page before interacting.',
      {
        'url': { type: 'string', description: 'URL to navigate to' },
        'takeFocus': { type: 'boolean', description: 'Have this tab take focus in the live browser. This should rarely be used unless explicitly requested as you have a shared browser session with the computer operator and this may interrupt their usage. Default: false', optional: true },
      },
      'Status message including page title.'
    ),
    createToolFunction(
      get_page_content,
      'Get simplified text content of the current page, including interactive elements ([ID] description format) and structural landmarks (## Landmark ##). Updates the internal map for ID-based interactions. IMPORTANT: Call this AFTER navigation or actions that significantly change the page (clicks, submits).',
      {
        'allContent': { type: 'boolean', description: 'Should the full text content be returned? If not, only visible interactive elements will be included. Default: false', optional: true },
      },
      'Simplified text representation of the page, optimized for information extraction and interaction.'
    ),
    createToolFunction(
      get_page_url,
      'Get the current URL of the page.'
    ),
    createToolFunction(
      clickElement,
      'Click on an element identified by its numeric ID from get_page_content(). IMPORTANT: Call get_page_content() again after clicking if page state changes.',
      {'elementId': { type: 'number', description: 'The numeric ID of the element (e.g., 3 for [3])'}},
      'Status message indicating success or failure.'
    ),
    createToolFunction(
      fillField,
      'Fill in a form field identified by its numeric ID from get_page_content().',
      {
        'elementId': { type: 'number', description: 'The numeric ID of the element (e.g., 3 for [3])'},
        'value': { type: 'string', description: 'Text to enter into the field'}
      },
      'Status message indicating success or failure.'
    ),
    createToolFunction(
      checkElement,
      'Check or uncheck a checkbox or radio button identified by its numeric ID from get_page_content().',
      {
        'elementId': { type: 'number', description: 'The numeric ID of the element (e.g., 3 for [3])'},
        'checked': { type: 'boolean', description: 'true to check, false to uncheck'}
      },
      'Status message indicating success or failure.'
    ),
    createToolFunction(
      hoverElement,
      'Hover over an element identified by its numeric ID from get_page_content().',
      {'elementId': { type: 'number', description: 'The numeric ID of the element (e.g., 3 for [3])'}},
      'Status message indicating success or failure.'
    ),
    createToolFunction(
      focusElement,
      'Focus on an element identified by its numeric ID from get_page_content().',
      {'elementId': { type: 'number', description: 'The numeric ID of the element (e.g., 3 for [3])'}},
      'Status message indicating success or failure.'
    ),
    createToolFunction(
      scrollElement,
      'Scroll an element into view identified by its numeric ID from get_page_content().',
      {'elementId': { type: 'number', description: 'The numeric ID of the element (e.g., 3 for [3])'}},
      'Status message indicating success or failure.'
    ),
    createToolFunction(
        selectOption,
        'Pick an option from a dropdown identified by its numeric ID from get_page_content().',
        {
          'elementId': { type: 'number', description: 'The numeric ID of the <select> element (e.g., 3 for [3])'},
          'value': { type: 'string', description: 'Value, text content, or label of the option to select'}
        },
        'Status message indicating success or failure.'
    ),
    createToolFunction(
      press,
      'Simulate pressing a specific key or key combination (e.g., "Enter", "ArrowDown", "Control+C"). Affects focused element.',
      {'keys': { type: 'string', description: 'Key(s) to press (e.g., "Enter", "Tab", "ArrowDown")'}},
      'Status message indicating success or failure.'
    ),
    createToolFunction(
      type,
      'Type text using the keyboard. Will type into the currently focused element.',
      {'text': { type: 'string', description: 'Text to type'}},
      'Status message indicating success or failure.'
    ),
    createToolFunction(
      screenshot,
      'Take a screenshot of the current viewport, full page, or a specific element identified by its ID.',
      {
        'type': {
          type: 'string',
          description: 'What to take a screenshot of\n' +
              'viewport: the visible part of the page' +
              'page: the full scrollable page' +
              'element: a specific element identified by its ID',
          enum: ['viewport', 'page', 'element'],
        },
        'elementId': {
          type: 'number',
          description: 'Optional numeric ID of the element (from get_page_content) to screenshot. Only used if type is "element".',
          optional: true
        },
      },
      'The path where the screenshot was saved.'
    ),
    createToolFunction(
      js_evaluate,
      'ADVANCED: Execute arbitrary JavaScript code in the page context. Use only when necessary and with caution.',
      {'code': { type: 'string', description: 'JavaScript code to execute'}},
      'Result of the executed code, JSON stringified.'
    ),
    createToolFunction(
      switch_tab,
      'Each browser agent operates in it\'s own tab. This function switches between them for future operations.',
      {
        'destination': {
          type: 'string',
          description: 'What tab to switch to\n' +
              'active: the currently active tab (shared with the operator of this computer)' +
              'new: open a new tab for future operations' +
              'id: switch to an existing tab by their ID',
          enum: ['active', 'new', 'id'],
        },
        'tabId': {
          type: 'string',
          description: 'The ID of the tab to switch to. Only used if destination is "id".',
          optional: true
        },
      },
      'Status message indicating success or failure.'
    ),
    createToolFunction(
      closeAgentSession,
      'Close the browser tab for this agent session. Use this when you are completely done browsing.',
      {},
      'Status message indicating success or failure.'
    ),
  ];
}

// Helper to set up tab-specific browser sessions
export function setupAgentBrowserTools(agent: AgentInterface): void {
  // Use the agent ID as the tab ID for this agent
  const tabId = agent.agent_id;
  console.log(`[browser_utils] Setting up browser tools for tab: ${tabId}`);

  // Set up a hook to update the current tab ID before tool calls
  const originalOnToolCall = agent.onToolCall;
  agent.onToolCall = async (toolCall) => {
    // Set the current tab ID before executing the tool
    setCurrentAgentId(tabId);

    // Call the original onToolCall handler if it exists
    if (originalOnToolCall) {
      await originalOnToolCall(toolCall);
    }
  };

  // Clean up when the agent is done
  // This would need to be called explicitly or integrated with agent lifecycle
}
