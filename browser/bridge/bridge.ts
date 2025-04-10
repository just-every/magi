/**
 * Browser utility functions for the MAGI system using Chrome Native Messaging.
 *
 * This module communicates with the MAGI Chrome extension to control the browser.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Writable, Readable } from 'stream';

// --- Types (Simplified) ---
interface SimplifiedElementInfo {
	id: number;
	description: string;
	selector: string;
	tagName: string;
}

interface ExtensionResponse {
	requestId: number;
	status: 'ok' | 'error';
	result?: any;
	error?: string;
	details?: string;
}

// --- Native Messaging Communication ---
// Simple implementation using process.stdin/stdout

const input = process.stdin as Readable;
const output = process.stdout as Writable;
let messageQueue: Buffer[] = [];
let currentMessageLength: number | null = null;
let requestIdCounter = 1;
const pendingRequests = new Map<number, (response: ExtensionResponse) => void>();

// Function to send a command to the extension
function sendCommand(command: string, params: any = {}): Promise<ExtensionResponse> {
	return new Promise((resolve, reject) => {
		const requestId = requestIdCounter++;
		const message = { requestId, command, params };
		const messageJson = JSON.stringify(message);
		const messageBuffer = Buffer.from(messageJson, 'utf8');
		const lengthBuffer = Buffer.alloc(4);
		lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

		// Store the resolver for when the response comes back
		pendingRequests.set(requestId, (response) => {
			if (response.status === 'ok') {
				resolve(response);
			} else {
				const error = new Error(response.error || 'Unknown extension error');
				(error as any).details = response.details; // Attach details if available
				reject(error);
			}
		});

		// Set a timeout for the request
		setTimeout(() => {
			if (pendingRequests.has(requestId)) {
				pendingRequests.delete(requestId);
				reject(new Error(`Request ${requestId} (${command}) timed out after 30 seconds.`));
			}
		}, 30000); // 30 second timeout

		try {
			// Write length prefix, then the message
			output.write(lengthBuffer);
			output.write(messageBuffer);
			console.error(`[SCRIPT->EXT] ID ${requestId}: ${command}`, params); // Log outgoing message to stderr
		} catch (error) {
			pendingRequests.delete(requestId);
			reject(new Error(`Failed to write to extension: ${error instanceof Error ? error.message : String(error)}`));
		}
	});
}

// Process incoming data from the extension
input.on('data', (chunk: Buffer) => {
	messageQueue.push(chunk);
	processMessageQueue();
});

input.on('end', () => {
	console.error('[SCRIPT] Native host input stream ended.');
	// Reject all pending requests
	pendingRequests.forEach((_, requestId) => {
		const rejector = pendingRequests.get(requestId);
		if(rejector) {
			// Need a way to call reject here - modifying structure slightly
			// This part is tricky without restructuring pendingRequests to store reject too
			console.error(`Request ${requestId} aborted due to stream end.`);
		}
	});
	pendingRequests.clear();
	process.exit(0);
});

input.on('error', (err) => {
	console.error('[SCRIPT] Native host input stream error:', err);
	process.exit(1);
});

function processMessageQueue() {
	while (true) {
		if (currentMessageLength === null) {
			// Need at least 4 bytes for the length prefix
			const combinedBuffer = Buffer.concat(messageQueue);
			if (combinedBuffer.length < 4) {
				// Not enough data for length yet
				messageQueue = [combinedBuffer]; // Keep the partial buffer
				break;
			}
			currentMessageLength = combinedBuffer.readUInt32LE(0);
			// Remove the length prefix from the queue
			messageQueue = [combinedBuffer.slice(4)];
		}

		// Now check if we have the full message
		const combinedBuffer = Buffer.concat(messageQueue);
		if (combinedBuffer.length < currentMessageLength) {
			// Not enough data for the message body yet
			messageQueue = [combinedBuffer]; // Keep the partial buffer
			break;
		}

		// We have a complete message
		const messageBuffer = combinedBuffer.slice(0, currentMessageLength);
		const remainingBuffer = combinedBuffer.slice(currentMessageLength);
		messageQueue = [remainingBuffer]; // Keep the rest for the next message
		currentMessageLength = null; // Reset for the next message length

		try {
			const messageJson = messageBuffer.toString('utf8');
			const response = JSON.parse(messageJson) as ExtensionResponse;
			console.error(`[EXT->SCRIPT] ID ${response.requestId} Status: ${response.status}`, response.result || response.error); // Log incoming to stderr

			const resolver = pendingRequests.get(response.requestId);
			if (resolver) {
				pendingRequests.delete(response.requestId);
				resolver(response); // Resolve or reject the promise
			} else {
				console.error(`[SCRIPT] Received response for unknown request ID: ${response.requestId}`);
			}
		} catch (error) {
			console.error('[SCRIPT] Error processing message from extension:', error);
			// Continue processing the queue if possible
		}
	}
}

// --- File Utilities (Keep or adapt as needed) ---
function get_output_dir(subdir: string): string {
	const baseDir = path.join(process.cwd(), 'output', subdir); // Or choose a different base path
	if (!fs.existsSync(baseDir)) {
		fs.mkdirSync(baseDir, { recursive: true });
	}
	return baseDir;
}

function write_unique_file(filePath: string, data: Buffer | string): string {
	let finalPath = filePath;
	let counter = 0;
	const parsedPath = path.parse(filePath);
	while (fs.existsSync(finalPath)) {
		counter++;
		finalPath = path.join(parsedPath.dir, `${parsedPath.name}_${counter}${parsedPath.ext}`);
	}
	fs.writeFileSync(finalPath, data);
	console.log(`File written to ${finalPath}`);
	return finalPath;
}


// --- Refactored Browser Control Functions ---

// No longer need getPage, browser, context, page state management here.
// The extension manages the active tab and its state.
// The element map (currentIdMap) is also managed by the extension per tab.

/**
 * Navigate the active tab to a URL.
 * @param url - URL to navigate to.
 * @returns Result message from the extension.
 */
export async function navigate(url: string): Promise<string> {
	console.log(`Requesting navigation to: ${url}`);
	try {
		const response = await sendCommand('navigate', { url });
		return String(response.result || 'Navigation command sent.');
	} catch (error: any) {
		console.error(`Error during navigate command: ${error.message}`);
		return `Error navigating: ${error.message}`;
	}
}

/**
 * Gets the simplified page content (text and element map size) from the extension
 * for the active tab. The actual map is stored in the extension.
 * @returns Simplified text representation of the page.
 */
export async function get_page_content(): Promise<string> {
	console.log('Requesting simplified page content...');
	try {
		const response = await sendCommand('get_page_content');
		if (response.result && typeof response.result.simplifiedText === 'string') {
			console.log(`Received simplified content (${response.result.simplifiedText.length} chars), map size: ${response.result.idMapSize}. Map stored in extension.`);
			return response.result.simplifiedText;
		} else {
			throw new Error('Invalid response format for get_page_content');
		}
	} catch (error: any) {
		console.error(`Error getting page content: ${error.message}`);
		return `Error getting simplified page content: ${error.message}. Interaction map may be unavailable.`;
	}
}

/**
 * Requests a screenshot of the active tab's viewport from the extension.
 * Saves the received image data to a file.
 * @param fileName - Optional filename.
 * @returns File path where screenshot was saved or error message.
 */
export async function screenshot(fileName?: string): Promise<string> {
	const targetDesc = 'viewport'; // Element screenshots not implemented in this version
	console.log(`Requesting screenshot of ${targetDesc}`);

	try {
		const response = await sendCommand('screenshot');
		if (!response.result?.imageDataUrl) {
			throw new Error('No image data received from extension.');
		}

		// Convert data URL to buffer
		const base64Data = response.result.imageDataUrl.replace(/^data:image\/jpeg;base64,/, "");
		const imageBuffer = Buffer.from(base64Data, 'base64');

		// Generate filename
		const timestamp = Date.now();
		// Cannot get URL easily from script side now, simplify filename
		const defaultFilename = `${timestamp}_viewport_screenshot.jpg`;
		const fileSavePath = path.join(get_output_dir('screenshots'), fileName || defaultFilename);

		// Save the buffer
		const savedPath = write_unique_file(fileSavePath, imageBuffer);
		return `Screenshot saved to ${savedPath}`;

	} catch (error: any) {
		console.error(`Error taking screenshot: ${error.message}`);
		return `Error taking screenshot of ${targetDesc}: ${error.message}`;
	}
}

/**
 * Requests the extension to execute JavaScript in the active tab's context.
 * @param code - JavaScript code to execute.
 * @returns Stringified result of the executed code or error message.
 */
export async function js_evaluate(code: string): Promise<string> {
	console.log(`Requesting JavaScript evaluation: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`);
	try {
		const response = await sendCommand('js_evaluate', { code });
		return String(response.result ?? 'JavaScript executed.'); // Result should already be stringified by extension
	} catch (error: any) {
		console.error(`Error evaluating JavaScript: ${error.message}`);
		return `Error evaluating JavaScript: ${error.message}`;
	}
}

/**
 * Requests the extension to type text using the debugger API (simulates keyboard input).
 * @param text - Text to type.
 * @returns Result message from the extension.
 */
export async function type(text: string): Promise<string> {
	console.log(`Requesting to type text: ${text}`);
	try {
		const response = await sendCommand('type', { text });
		return String(response.result || `Type command sent for: ${text}`);
	} catch (error: any) {
		console.error(`Error typing text: ${error.message}`);
		return `Error typing text: ${error.message}`;
	}
}

/**
 * Requests the extension to press specific keys using the debugger API.
 * Note: Key mapping in the extension is basic and needs expansion for complex keys/modifiers.
 * @param keys - Keys to press (e.g., "Enter", "Tab", "ArrowDown").
 * @returns Result message from the extension.
 */
export async function press(keys: string): Promise<string> {
	console.log(`Requesting to press keys: ${keys}`);
	try {
		const response = await sendCommand('press', { keys });
		return String(response.result || `Press command sent for: ${keys}`);
	} catch (error: any) {
		console.error(`Error pressing keys ${keys}: ${error.message}`);
		return `Error pressing keys ${keys}: ${error.message}`;
	}
}

/**
 * Requests the extension to clear its state (element map) for the active tab
 * and detach the debugger if attached.
 * @returns Result message from the extension.
 */
export async function reset_session(): Promise<string> {
	console.log('Requesting session reset for active tab...');
	try {
		const response = await sendCommand('reset_session');
		return String(response.result || 'Session reset command sent.');
	} catch (error: any) {
		console.error(`Error resetting session: ${error.message}`);
		return `Error resetting session: ${error.message}`;
	}
}

// --- Helper for Interaction Tools (Click, Fill, Select) ---
// These tools now need to get the selector from the extension first
async function getElementSelector(elementId: number): Promise<string> {
	console.log(`Requesting info for element ID: ${elementId}`);
	const response = await sendCommand('get_element_info', { elementId });
	if (!response.result?.selector) {
		throw new Error(`Could not get selector for element ID ${elementId}. Element info: ${JSON.stringify(response.result)}`);
	}
	console.log(`Got selector for ID ${elementId}: ${response.result.selector}`);
	return response.result.selector;
}

// --- Example Interaction Tools (Require Adaptation) ---
// These need to be adapted to use js_evaluate with the retrieved selector

/**
 * Clicks an element identified by its simplified ID.
 * (Implementation uses js_evaluate)
 * @param elementId - Numerical ID of the element.
 */
export async function clickElement(elementId: number): Promise<string> {
	console.log(`Requesting click on element ID: ${elementId}`);
	try {
		const selector = await getElementSelector(elementId);
		// Escape selector for use within JavaScript string literal
		const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
		const code = `
            const el = document.querySelector('${escapedSelector}');
            if (el) {
                el.click();
                'Clicked element with selector: ${escapedSelector}';
            } else {
                'Element not found with selector: ${escapedSelector}';
            }
        `;
		return await js_evaluate(code);
	} catch (error: any) {
		console.error(`Error clicking element ID ${elementId}: ${error.message}`);
		return `Error clicking element ID ${elementId}: ${error.message}`;
	}
}

/**
 * Fills a form field identified by its simplified ID.
 * (Implementation uses js_evaluate)
 * @param elementId - Numerical ID of the element.
 * @param value - Text value to fill.
 */
export async function fillField(elementId: number, value: string): Promise<string> {
	console.log(`Requesting fill element ID: ${elementId} with value: ${value}`);
	try {
		const selector = await getElementSelector(elementId);
		const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
		const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
		// Focus, set value, and dispatch input/change events for reactivity
		const code = `
            const el = document.querySelector('${escapedSelector}');
            if (el) {
                el.focus();
                el.value = '${escapedValue}';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                'Filled element with selector: ${escapedSelector}';
            } else {
                'Element not found with selector: ${escapedSelector}';
            }
        `;
		return await js_evaluate(code);
	} catch (error: any) {
		console.error(`Error filling element ID ${elementId}: ${error.message}`);
		return `Error filling element ID ${elementId}: ${error.message}`;
	}
}

// Add selectOption, etc. adapting the js_evaluate approach similarly

// --- Main Execution / Example Usage ---
async function main() {
	console.error('[SCRIPT] Native messaging host script started.'); // Log start to stderr

	try {
		console.log("--- Starting Browser Automation via Extension ---");

		const resetMsg = await reset_session();
		console.log("Session Reset:", resetMsg);

		const navMsg = await navigate("https://www.google.com/search?q=chrome+native+messaging");
		console.log("Navigation:", navMsg);

		// Allow time for page load before getting content
		await new Promise(resolve => setTimeout(resolve, 3000));

		const content = await get_page_content();
		console.log("\n--- Simplified Page Content ---");
		console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
		console.log("-------------------------------\n");

		const screenshotPath = await screenshot("google_search_results.jpg");
		console.log("Screenshot:", screenshotPath);

		// Example: Find the search input (assuming it gets ID 1 - check content output)
		// This requires inspecting the output of get_page_content to find the correct ID
		// Let's assume the search bar is ID 1 for this example
		const searchInputId = 1; // *** Replace with actual ID from content output ***
		try {
			const fillMsg = await fillField(searchInputId, "Playwright alternative");
			console.log("Fill Field:", fillMsg);

			// Press Enter (assuming Enter key works)
			const pressMsg = await press("Enter");
			console.log("Press Enter:", pressMsg);

			await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for results

			const contentAfterSearch = await get_page_content();
			console.log("\n--- Content After Search ---");
			console.log(contentAfterSearch.substring(0, 500) + (contentAfterSearch.length > 500 ? '...' : ''));
			console.log("----------------------------\n");

			const screenshotAfterPath = await screenshot("google_search_results_after.jpg");
			console.log("Screenshot After:", screenshotAfterPath);

		} catch (interactionError: any) {
			console.warn(`Could not complete interaction example (maybe element ID ${searchInputId} was wrong?): ${interactionError.message}`);
		}


		console.log("\n--- Automation Example Finished ---");

	} catch (error: any) {
		console.error("An error occurred during the main execution:", error.message, error.details || error.stack);
	} finally {
		// Signal the extension we might be done? Not strictly necessary with stdio.
		console.error("[SCRIPT] Script execution finished. Exiting.");
		// Ensure buffers are flushed before exiting
		await new Promise(resolve => process.stdout.write('', resolve));
		await new Promise(resolve => process.stderr.write('', resolve));
		process.exit(0); // Exit cleanly
	}
}

// Run the main function if this script is executed directly
if (require.main === module) {
	main();
}

