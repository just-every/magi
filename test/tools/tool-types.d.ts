/**
 * TypeScript Declarations for Magi Tool Functions
 *
 * AUTOMATICALLY GENERATED FILE - DO NOT EDIT MANUALLY
 *
 * This file provides TypeScript type declarations for all helper functions available
 * in the Magi system. These are declared as ambient globals since they are
 * injected into the execution context at runtime by the tool executor.
 *
 * To regenerate this file, run: node test/get-helper-descriptions.js
 */

// These declarations represent functions that are injected at runtime
// by the tool executor, so they should be ambient globals
declare global {

/**
 * Advanced: Send raw Chrome DevTools Protocol (CDP) commands for low-level browser control. Returns: The response as a JSON string, or an error message if it fails.
 * @param method Full CDP method name, including domain (e.g. Emulation.setGeolocationOverride, Input.synthesizePinchGesture).
 * @param commandParamsJson? Optional JSON string of parameters matching the chosen CDP method.

Examples:
// Spoof geolocation to San Francisco with Emulation.setGeolocationOverride
'{"latitude":37.7749,"longitude":-122.4194,"accuracy":1}'

// Pinch gesture (zoom out) at page center with Input.synthesizePinchGesture
'{"x":400,"y":300,"scaleFactor":0.5,"relativeSpeed":800}'
 * @returns Promise<string>
 */
  function cdp_command(
    method: string,
    commandParamsJson?: string
): Promise<string>;


/**
 * Trigger a mouse click at current cursor position.
 * @param button? Which mouse button to click; defaults to "left".
 * @param event? What type of mouse event; defaults to "click". You can use click("left", "mousedown") move(x, y) click("left", "mouseup") to drag.
 * @param x? The x (horizontal) position to click at. If not provided, the current cursor position is used.
 * @param y? The y (vertical) position to click at. If not provided, the current cursor position is used.
 * @returns Promise<string>
 */
  function click(
    button?: 'left' | 'middle' | 'right',
    event?: 'click' | 'mousedown' | 'mouseup',
    x?: number,
    y?: number
): Promise<string>;


/**
 * Deletes a specific memory by its ID. Returns: A confirmation that the memory was deleted.
 * @param term Term type, either "short" or "long"
 * @param memoryId The ID of the memory to delete.
 * @returns Promise<string>
 */
  function delete_memory(
    term: 'short' | 'long',
    memoryId: number
): Promise<string>;


/**
 * Execute a shell command and get the output Returns: Command output and error if any
 * @param command The shell command to execute
 * @returns Promise<string>
 */
  function execute_command(
    command: string
): Promise<string>;


/**
 * Find information in your long term memory. Returns: The memories found in the search.
 * @param query A list of terms to search your long term memory for. The search will return all memories that match any of the terms.
 * @returns Promise<string>
 */
  function find_memory(
    query: string[]
): Promise<string>;


/**
 * Expands a summary. Returns: The original document for the given range of lines.
 * @param id The unique ID of the summary. If possible, limit lines to limit tokens returned. Results will be truncated to 1000 characters - for larger files, use file_path to write to the file system, then analyze.
 * @param line_start? Starting line to retrieve (0-based). Ignored if file_path is set.
 * @param line_end? Ending line to retrieve (0-based). Ignored if file_path is set.
 * @param file_path? Path to write the content to a file instead of returning it.
 * @returns Promise<string>
 */
  function get_summary_source(
    id: string,
    line_start?: number,
    line_end?: number,
    file_path?: string
): Promise<string>;


/**
 * Advanced: Execute arbitrary JavaScript in the page context to read or modify the DOM. Returns: Any final return statement (stringified), console.log messages or an error message on failure.
 * @param code JavaScript to run. Use `return` or `console.log` to emit results.

Examples:
// Get all titles from the page
'return Array.from(document.querySelectorAll('h1, h2, h3'));'

// Modify all textareas and log changes
'document.querySelectorAll('textarea').forEach(ta => { console.log('before', ta.value); ta.value = ta.value.toUpperCase(); console.log('after', ta.value);});'
 * @returns Promise<string>
 */
  function js_evaluate(
    code: string
): Promise<string>;


/**
 * List files and directories in the specified path Returns: List of files and directories
 * @param directory Directory path to list
 * @returns Promise<string>
 */
  function list_directory(
    directory: string
): Promise<string>;


/**
 * Move the mouse cursor to specific CSS-pixel coordinates within the viewport (1024x1536). Do this before clicking or to hover over elements. You will see the updated mouse position in the browser window which you can use to validate the position.
 * @param x The x (horizontal) position to move the mouse to.
 * @param y The y (vertical) position to move the mouse to.
 * @returns Promise<string>
 */
  function move(
    x: number,
    y: number
): Promise<string>;


/**
 * Navigate the active tab to a URL.
 * @param url Absolute destination URL (e.g. "https://example.com").
 * @returns Promise<string>
 */
  function navigate(
    url: string
): Promise<string>;


/**
 * Simulate pressing a key or key combination (supports Ctrl/Alt/Shift/Meta).
 * @param keys Key or combo to press. e.g. "Enter", "a", "Ctrl+C", "Shift+Tab".
 * @returns Promise<string>
 */
  function press_keys(
    keys: string
): Promise<string>;


/**
 * Read a file from the file system Returns: File contents as a string
 * @param file_path Path to the file to read. If possible, limit lines to avoid loading too many tokens.
 * @param line_start? Starting line to retrieve (0-based).
 * @param line_end? Ending line to retrieve (0-based).
 * @param max_chars? Maximum number of characters to return (default: 1000).
 * @returns Promise<string>
 */
  function read_file(
    file_path: string,
    line_start?: number,
    line_end?: number,
    max_chars?: number
): Promise<string>;


/**
 * Saves information to your short term or long term memory. Returns: If the memory was saved correctly and the ID it was given.
 * @param term Short term or long term memory. Short term memory is like your active memory. It will be included with every thought, but only a certain number of memories are stored. Long term memory must be retrieved with find_memory(). For short term, limit to a sentence or two. Each long term memory can be up to 2000 characters.
 * @param memory The memory to save.
 * @returns Promise<string>
 */
  function save_memory(
    term: 'short' | 'long',
    memory: string
): Promise<string>;


/**
 * Scroll the page up/down, to top/bottom, or to specific coordinates.
 * @param method Scroll action; use "coordinates" with x & y.
 * @param x? Horizontal CSS pixel position (ignored if not "coordinates")
 * @param y? Vertical CSS pixel position (required if method="coordinates")
 * @returns Promise<string>
 */
  function scroll_to(
    method: 'page_down' | 'page_up' | 'top' | 'bottom' | 'coordinates',
    x?: number,
    y?: number
): Promise<string>;


/**
 * Type text in the currently focused element. First use click() on the element to focus it.
 * @param text Use "\n" for new lines.
 * @returns Promise<string>
 */
  function type(
    text: string
): Promise<string>;


/**
 * Real-time web search using selected engine.
 * @param engine Search engine to use:
- anthropic: multi-step reasoning with source-grounded citations
- brave: fast, ad-free, privacy-focused search from independent index
- openai: integrated real-time search with context-aware responses
- google: grounded responses with real-time data from Google Search
 * @param query Google-style search query.
 * @param numResults How many results to return (default: 5)
 * @returns Promise<string>
 */
  function web_search(
    engine: 'anthropic' | 'brave' | 'openai' | 'google',
    query: string,
    numResults: number
): Promise<string>;


/**
 * Write content to a file Returns: Success message with the path
 * @param file_path Path to write the file to
 * @param content Content to write to the file
 * @returns Promise<string>
 */
  function write_file(
    file_path: string,
    content: string
): Promise<string>;


/**
 * Call an LLM with the specified text prompt
 * @param messages Either a string or array of message objects to send to the LLM. Include your full request here.
 * @param modelClass The type of agent to use for the call. 'reasoning_mini' is a good choice for non-specialized tasks. It's fast, cheap, and accurate.
 * @returns The LLM's response as a string
 */
  function quick_llm_call(
    messages: string | Array<{ type: 'message'; role: 'user' | 'system' | 'developer'; content: string }>,
    modelClass: 'reasoning_mini' | 'reasoning' | 'code' | 'writing' | 'summary' | 'vision' | 'search' | 'image_generation',
): Promise<string>;

/**
 * Generate a v4 uuid
 * @returns A random alphanumeric string in UUID format
 */
  function uuid(): Promise<string>;

/**
 * The ID of the current agent.
 */
export declare const agent_id: string;
}

// This empty export makes this file a module, preventing global namespace conflicts
export {};
