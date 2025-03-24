/**
 * Browser utility functions for the MAGI system.
 *
 * This module provides browser automation tools using Playwright.
 */

import {chromium, Browser, Page, BrowserType, BrowserContext} from 'playwright';
// import fs from 'fs';
import path from 'path';
import {ToolFunction} from '../types.js';
// import os from 'os';
import {processImage} from './image_utils.js';
import {createToolFunction} from './tool_call.js';
import {get_output_dir, write_file} from './file_utils.js';

// Constants
const NAVIGATE_TIMEOUT = 15000;
const ACTION_TIMEOUT = 10000;
const VIEWPORT_WIDTH = 768;
const VIEWPORT_HEIGHT = 600;

// Browser instance for reuse
let browser: Browser | null = null;
let page: Page | null = null;
let context: BrowserContext | null = null;
const browserType: BrowserType = chromium;

const LAUNCH_ARGS = [
	`--window-size=${VIEWPORT_WIDTH},${VIEWPORT_HEIGHT}`,
	'--disable-dev-shm-usage',  // Avoid memory issues in Docker
	'--no-sandbox',             // Required in some containerized environments
	'--disable-setuid-sandbox'  // Required in some containerized environments
];

/**
 * Initialize the browser if not already initialized
 *
 * @returns The active page
 */
export async function getPage(): Promise<Page> {
	try {
		// Initialize browser if it doesn't exist
		if (!browser) {
			console.log('Initializing browser...');
			try {
				browser = await browserType.launch({
					headless: true,
					args: LAUNCH_ARGS
				});
				console.log('Browser launched successfully');
			} catch (launchError) {
				console.error('Failed to launch browser:', launchError);
				console.error(launchError instanceof Error ? launchError.stack : String(launchError));
				throw new Error(`Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`);
			}
		}

		// Initialize context if it doesn't exist
		if (!context) {
			console.log('Creating browser context...');
			try {
				context = await browser.newContext({
					viewport: {width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT},
					userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
				});
				console.log('Browser context created successfully');
			} catch (contextError) {
				console.error('Failed to create browser context:', contextError);
				console.error(contextError instanceof Error ? contextError.stack : String(contextError));
				throw new Error(`Browser context creation failed: ${contextError instanceof Error ? contextError.message : String(contextError)}`);
			}
		}

		// Initialize page if it doesn't exist
		if (!page) {
			console.log('Creating new page...');
			try {
				page = await context.newPage();

				// Set up default timeouts
				page.setDefaultTimeout(ACTION_TIMEOUT);
				page.setDefaultNavigationTimeout(NAVIGATE_TIMEOUT);
				console.log('Browser page created successfully');
			} catch (pageError) {
				console.error('Failed to create browser page:', pageError);
				console.error(pageError instanceof Error ? pageError.stack : String(pageError));
				throw new Error(`Browser page creation failed: ${pageError instanceof Error ? pageError.message : String(pageError)}`);
			}
		}

		return page;
	} catch (error) {
		console.error('Error initializing browser:', error);
		console.error(error instanceof Error ? error.stack : String(error));
		throw error;
	}
}

/**
 * Reset the browser session with a clean context and cookies
 */
async function reset_session(): Promise<string> {
	try {
		if (page) {
			await page.close();
			page = null;
		}

		if (context) {
			await context.close();
			context = null;
		}

		// Create a new context and page
		context = await browser!.newContext({
			viewport: {width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT},
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
		});

		page = await context.newPage();
		page.setDefaultTimeout(ACTION_TIMEOUT);
		page.setDefaultNavigationTimeout(NAVIGATE_TIMEOUT);

		return 'Browser session reset successfully';
	} catch (error: any) {
		console.error('Error resetting session:', error);
		return `Error resetting session: ${error?.message || String(error)}`;
	}
}

/**
 * Clean up browser resources
 */
async function cleanup() {
	try {
		console.log('Cleaning up browser resources...');

		if (page) {
			await page.close().catch(e => console.error('Error closing page:', e));
			page = null;
		}

		if (context) {
			await context.close().catch(e => console.error('Error closing context:', e));
			context = null;
		}

		if (browser) {
			await browser.close().catch(e => console.error('Error closing browser:', e));
			browser = null;
		}

		console.log('Browser resources cleaned up successfully');
	} catch (error) {
		console.error('Error during browser cleanup:', error);
	}
}

/**
 * Navigate to a URL
 *
 * @param url - URL to navigate to
 * @param waitUntil - Navigation wait condition ('commit', 'domcontentloaded', 'load')
 * @returns Result message with page title
 */
export async function navigate(
	url: string,
	waitUntil: 'commit' | 'domcontentloaded' | 'load' = 'commit'
): Promise<string> {
	console.log(`Navigating to URL: ${url} (waitUntil: ${waitUntil})`);

	try {
		// Make sure we have an active page
		console.log('Getting browser page...');
		const activePage = await getPage();
		console.log('Browser page acquired, proceeding with navigation');

		// Try to navigate to the URL
		console.log(`Starting navigation to ${url} with waitUntil: ${waitUntil}`);
		const response = await activePage.goto(url, {
			waitUntil,
			timeout: NAVIGATE_TIMEOUT
		});

		// Check if navigation succeeded
		if (!response) {
			console.error(`Navigation to ${url} failed with no response`);
			return `Failed to navigate to ${url}: No response`;
		}

		// Get status code and content type
		const status = response.status();
		const contentType = response.headers()['content-type'] || 'unknown';
		console.log(`Navigation successful - Status: ${status}, Content-Type: ${contentType}`);

		// Get page title
		try {
			const title = await activePage.title();
			console.log(`Page title: "${title}"`);
			return `Successfully navigated to ${url} (status: ${status}, title: "${title}")`;
		} catch (titleError) {
			console.error('Error getting page title:', titleError);
			return `Successfully navigated to ${url} (status: ${status}) but could not get title`;
		}
	} catch (error: any) {
		console.error(`Error navigating to ${url}:`, error);
		console.error(error instanceof Error ? error.stack : String(error));
		return `Error navigating to ${url}: ${error?.message || String(error)}`;
	}
}

/**
 * Take a screenshot of the page or element
 *
 * @param selector - Optional CSS selector to screenshot a specific element
 * @param fullPage - Whether to take a full page screenshot
 * @param fileName - The filename to save the screenshot as (optional)
 * @returns Base64 encoded screenshot data or file path
 */
export async function screenshot(
	selector?: string,
	fullPage: boolean = false,
	fileName?: string
): Promise<string> {
	console.log(`Taking screenshot with selector: ${selector || 'none'}, fullPage: ${fullPage}`);

	try {
		const activePage = await getPage();
		const timestamp = Date.now();
		const urlPart = (await activePage.url()).replace(/:\/\//g, '_').replace(/[/.]/g, '_').substring(0, 50);
		const filename = `${timestamp}_${urlPart}${fullPage ? '_full' : ''}${selector ? '_' + selector.replace(/[^a-z0-9]/gi, '_').substring(0, 30) : ''}.jpg`;

		const fileSavePath = path.join(get_output_dir('screenshots'), fileName || filename);

		let screenshotBuffer: Buffer;

		if (selector) {
			// Take screenshot of a specific element
			const element = await activePage.$(selector);
			if (!element) {
				return `Element not found: ${selector}`;
			}
			screenshotBuffer = await element.screenshot();
		} else {
			// Take screenshot of the page
			screenshotBuffer = await activePage.screenshot({fullPage});
		}

		try {
			// Process the image (compress and resize if needed)
			const processedImage = await processImage(screenshotBuffer);

			// Save the image to a file
			write_file(fileSavePath, processedImage);

			return `Screenshot saved to ${fileSavePath}`;
		} catch (processingError) {
			console.error('Error processing screenshot image:', processingError);

			// Save the original unprocessed screenshot as a fallback
			write_file(fileSavePath, screenshotBuffer);

			return `Screenshot saved to ${fileSavePath} (unprocessed due to processing error)`;
		}
	} catch (error: any) {
		console.error('Error taking screenshot:', error);
		return `Error taking screenshot: ${error?.message || String(error)}`;
	}
}

/**
 * Get text content from the page or element
 *
 * @param selector - Optional CSS selector to get text from a specific element
 * @param hasText - Optional text content that the element must contain
 * @returns Text content
 */
export async function get_page_text(
	selector?: string,
	hasText?: string
): Promise<string> {
	console.log(`Getting text with selector: ${selector || 'none (entire page)'}${hasText ? `, matching text: "${hasText}"` : ''}`);

	try {
		console.log('Getting browser page for text extraction...');
		const activePage = await getPage();
		console.log('Browser page acquired, proceeding with text extraction');

		let extractedText: string;

		if (selector) {
			// Get text from a specific element with optional hasText filter
			try {
				console.log(`Locating element with selector: ${selector}`);

				if (hasText) {
					console.log(`Looking for text that contains: "${hasText}"`);
					// Use page.evaluate to handle multiple elements
					extractedText = await activePage.evaluate(
						({selector, hasText}) => {
							const elements = Array.from(document.querySelectorAll(selector));
							const matchingElements = elements.filter(el =>
								el.textContent && el.textContent.includes(hasText)
							);

							if (matchingElements.length === 0) {
								return `No elements found matching selector "${selector}" with text "${hasText}"`;
							}

							// Join text content from all matching elements
							return matchingElements.map(el => el.textContent?.trim()).join('\n');
						},
						{selector, hasText}
					);
				} else {
					// Use page.evaluate to handle multiple elements
					extractedText = await activePage.evaluate(
						(selector) => {
							const elements = Array.from(document.querySelectorAll(selector));

							if (elements.length === 0) {
								return `No elements found matching selector "${selector}"`;
							}

							// Join text content from all matching elements
							return elements.map(el => el.textContent?.trim()).join('\n');
						},
						selector
					);
				}

				// Check if the result is an error message
				if (extractedText.startsWith('No elements found')) {
					return extractedText;
				}

				console.log(`Successfully extracted text from element(s) (${extractedText.length} characters)`);
			} catch (selectorError) {
				console.error(`Error getting text from selector "${selector}":`, selectorError);
				console.error(selectorError instanceof Error ? selectorError.stack : String(selectorError));
				return `Error getting text from selector "${selector}": ${selectorError instanceof Error ? selectorError.message : String(selectorError)}`;

			}
		} else {
			// Get text from the whole page
			try {
				console.log('Extracting text from entire page body');

				// Use evaluate for more reliable text extraction
				extractedText = await activePage.evaluate(() => {
					// Get all visible text nodes - better than just innerText which can miss some content
					const bodyText = document.body.textContent || '';
					return bodyText;
				});

				// Clean up the text - remove excess whitespace and normalize line breaks
				extractedText = extractedText
					.replace(/\s+/g, ' ')
					.replace(/\n+/g, '\n')
					.trim();

				console.log(`Successfully extracted text from entire page (${extractedText.length} characters)`);
			} catch (bodyError) {
				console.error('Error getting text from page body:', bodyError);
				console.error(bodyError instanceof Error ? bodyError.stack : String(bodyError));

				// Fallback to innerText if evaluate fails
				try {
					console.log('Trying fallback text extraction with innerText');
					extractedText = await activePage.innerText('body');
					console.log(`Successfully extracted text with fallback method (${extractedText.length} characters)`);
				} catch (fallbackError) {
					console.error('Fallback text extraction failed:', fallbackError);
					return `Error getting text from page body: ${bodyError instanceof Error ? bodyError.message : String(bodyError)}`;

				}
			}
		}

		return extractedText;
	} catch (error: any) {
		console.error('Error getting text:', error);
		console.error(error instanceof Error ? error.stack : String(error));
		return `Error getting text: ${error?.message || String(error)}`;

	}
}

/**
 * Get HTML content from the page or element
 *
 * @param selector - Optional CSS selector to get HTML from a specific element
 * @param hasText - Optional text content that the element must contain
 * @returns HTML content
 */
export async function get_page_HTML(
	selector?: string,
	hasText?: string
): Promise<string> {
	console.log(`Getting HTML with selector: ${selector || 'none (entire page)'}`);

	try {
		const activePage = await getPage();

		let extractedHTML: string;
		if (selector) {
			// Get HTML from a specific element with optional hasText filter
			if (hasText) {
				// Use page.evaluate to handle multiple elements
				extractedHTML = await activePage.evaluate(
					({selector, hasText}) => {
						const elements = Array.from(document.querySelectorAll(selector));
						const matchingElements = elements.filter(el =>
							el.textContent && el.textContent.includes(hasText)
						);

						if (matchingElements.length === 0) {
							return `No elements found matching selector "${selector}" with text "${hasText}"`;
						}

						// Join HTML from all matching elements
						return matchingElements.map(el => el.outerHTML).join('\n');
					},
					{selector, hasText}
				);
			} else {
				// Use page.evaluate to handle multiple elements
				extractedHTML = await activePage.evaluate(
					(selector) => {
						const elements = Array.from(document.querySelectorAll(selector));

						if (elements.length === 0) {
							return `No elements found matching selector "${selector}"`;
						}

						// Join HTML from all matching elements
						return elements.map(el => el.outerHTML).join('\n');
					},
					selector
				);
			}

			// Check if the result is an error message
			if (extractedHTML.startsWith('No elements found')) {
				return extractedHTML;
			}
		} else {
			// Get HTML from the whole page
			extractedHTML = await activePage.innerHTML('body');
		}

		return extractedHTML;
	} catch (error: any) {
		console.error('Error getting HTML:', error);
		return `Error getting HTML: ${error?.message || String(error)}`;
	}
}

/**
 * Click on an element
 *
 * @param selector - CSS selector for the element to click
 * @param hasText - Optional text content that the element must contain
 * @returns Result message
 */
export async function click(
	selector: string,
	hasText?: string
): Promise<string> {
	console.log(`Clicking on selector: ${selector}${hasText ? ` with text: ${hasText}` : ''}`);

	try {
		const activePage = await getPage();

		if (hasText) {
			// Find and click the first matching element with the given text
			const clicked = await activePage.evaluate(
				({selector, hasText}) => {
					const elements = Array.from(document.querySelectorAll(selector));
					const matchingElement = elements.find(el =>
						el.textContent && el.textContent.includes(hasText)
					);

					if (!matchingElement) {
						return `No elements found matching selector "${selector}" with text "${hasText}"`;
					}

					// Simulate click using HTMLElement click method
					(matchingElement as HTMLElement).click();
					return true;
				},
				{selector, hasText}
			);

			if (clicked !== true) {
				return clicked as string; // Error message
			}
		} else {
			// Without hasText, we can use the first element
			await activePage.click(selector, {timeout: ACTION_TIMEOUT});
		}

		return `Clicked element: ${selector}${hasText ? ` with text: ${hasText}` : ''}`;
	} catch (error: any) {
		console.error(`Error clicking on ${selector}:`, error);
		return `Error clicking on ${selector}: ${error?.message || String(error)}`;
	}
}

/**
 * Hover over an element
 *
 * @param selector - CSS selector for the element to hover over
 * @param hasText - Optional text content that the element must contain
 * @returns Result message
 */
export async function hover(
	selector: string,
	hasText?: string
): Promise<string> {
	console.log(`Hovering over selector: ${selector}${hasText ? ` with text: ${hasText}` : ''}`);

	try {
		const activePage = await getPage();

		if (hasText) {
			// First find the specific element with the text
			const elementHandle = await activePage.evaluate(
				({selector, hasText}) => {
					const elements = Array.from(document.querySelectorAll(selector));
					const index = elements.findIndex(el =>
						el.textContent && el.textContent.includes(hasText)
					);

					if (index === -1) {
						return null; // Not found
					}

					return index; // Return the index of the element
				},
				{selector, hasText}
			);

			if (elementHandle === null) {
				return `No elements found matching selector "${selector}" with text "${hasText}"`;
			}

			// Use the nth element that matches the selector
			await activePage.hover(`${selector}:nth-of-type(${elementHandle + 1})`, {timeout: ACTION_TIMEOUT});
		} else {
			// Without hasText, we can use the first element
			await activePage.hover(selector, {timeout: ACTION_TIMEOUT});
		}

		return `Hovered over element: ${selector}${hasText ? ` with text: ${hasText}` : ''}`;
	} catch (error: any) {
		console.error(`Error hovering over ${selector}:`, error);
		return `Error hovering over ${selector}: ${error?.message || String(error)}`;
	}
}

/**
 * Fill a form field
 *
 * @param selector - CSS selector for the input field
 * @param value - Value to fill in
 * @param hasText - Optional text content that the element must contain
 * @returns Result message
 */
export async function fill(
	selector: string,
	value: string,
	hasText?: string
): Promise<string> {
	console.log(`Filling selector: ${selector} with value: ${value}`);

	try {
		const activePage = await getPage();

		if (hasText) {
			// First find the specific element with the text
			const elementFound = await activePage.evaluate(
				({selector, hasText}) => {
					const elements = Array.from(document.querySelectorAll(selector));
					const matchingElement = elements.find(el =>
						el.textContent && el.textContent.includes(hasText)
					);

					if (!matchingElement) {
						return false; // Not found
					}

					return true; // Found an element
				},
				{selector, hasText}
			);

			if (!elementFound) {
				return `No elements found matching selector "${selector}" with text "${hasText}"`;
			}

			// Now use page methods to interact with the found element - this implementation is safer for inputs
			// We'll use the combination of selector + hasText in a more specific selector
			const escapedText = hasText.replace(/'/g, "\\'");
			const specificSelector = `${selector}:has-text("${escapedText}")`;
			await activePage.fill(specificSelector, value, {timeout: ACTION_TIMEOUT});
		} else {
			// Without hasText, we can use the first matching element
			await activePage.fill(selector, value, {timeout: ACTION_TIMEOUT});
		}

		return `Filled input ${selector} with value`;
	} catch (error: any) {
		console.error(`Error filling ${selector}:`, error);
		return `Error filling ${selector}: ${error?.message || String(error)}`;
	}
}

/**
 * Check a checkbox or radio button
 *
 * @param selector - CSS selector for the checkbox or radio button
 * @param hasText - Optional text content that the element must contain
 * @returns Result message
 */
export async function check(
	selector: string,
	hasText?: string
): Promise<string> {
	console.log(`Checking selector: ${selector}`);

	try {
		const activePage = await getPage();

		if (hasText) {
			// First find the specific element with the text
			const elementHandle = await activePage.evaluate(
				({selector, hasText}) => {
					const elements = Array.from(document.querySelectorAll(selector));
					const index = elements.findIndex(el =>
						el.textContent && el.textContent.includes(hasText)
					);

					if (index === -1) {
						return null; // Not found
					}

					return index; // Return the index of the element
				},
				{selector, hasText}
			);

			if (elementHandle === null) {
				return `No elements found matching selector "${selector}" with text "${hasText}"`;
			}

			// Use the nth element that matches the selector
			await activePage.check(`${selector}:nth-of-type(${elementHandle + 1})`, {timeout: ACTION_TIMEOUT});
		} else {
			// Without hasText, we can use the first element
			await activePage.check(selector, {timeout: ACTION_TIMEOUT});
		}

		return `Checked element: ${selector}`;
	} catch (error: any) {
		console.error(`Error checking ${selector}:`, error);
		return `Error checking ${selector}: ${error?.message || String(error)}`;
	}
}

/**
 * Execute JavaScript in the browser context
 *
 * @param code - JavaScript code to execute
 * @returns Result of the executed code
 */
export async function evaluate(code: string): Promise<string> {
	console.log(`Evaluating JavaScript: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`);

	try {
		const activePage = await getPage();
		const result = await activePage.evaluate(code);

		return JSON.stringify(result);
	} catch (error: any) {
		console.error('Error evaluating JavaScript:', error);
		return `Error evaluating JavaScript: ${error?.message || String(error)}`;
	}
}

/**
 * Execute JavaScript in the browser context (alias for evaluate)
 * Allows the LLM to call a more intuitively named function
 *
 * @param code - JavaScript code to execute
 * @returns Result of the executed code
 */
export async function js_evaluate(code: string): Promise<string> {
	return evaluate(code);
}

/**
 * Type text using the keyboard
 *
 * @param text - Text to type
 * @returns Result message
 */
export async function type(text: string): Promise<string> {
	console.log(`Typing text: ${text}`);

	try {
		const activePage = await getPage();
		await activePage.keyboard.type(text);

		return `Typed text: ${text}`;
	} catch (error: any) {
		console.error('Error typing text:', error);
		return `Error typing text: ${error?.message || String(error)}`;
	}
}

/**
 * Press specific keys on the keyboard
 *
 * @param keys - Keys to press (e.g., "Enter", "ArrowDown", etc.)
 * @returns Result message
 */
export async function press(keys: string): Promise<string> {
	console.log(`Pressing keys: ${keys}`);

	try {
		const activePage = await getPage();
		await activePage.keyboard.press(keys);

		return `Pressed keys: ${keys}`;
	} catch (error: any) {
		console.error(`Error pressing keys: ${keys}`, error);
		return `Error pressing keys: ${keys}: ${error?.message || String(error)}`;
	}
}

/**
 * Wait for a specified amount of time
 *
 * @param milliseconds - Time to wait in milliseconds
 * @returns Result message
 */
export async function wait(milliseconds: number): Promise<string> {
	console.log(`Waiting for ${milliseconds}ms`);

	try {
		const activePage = await getPage();
		await activePage.waitForTimeout(milliseconds);

		return `Waited for ${milliseconds}ms`;
	} catch (error: any) {
		console.error(`Error waiting for ${milliseconds}ms:`, error);
		return `Error waiting: ${error?.message || String(error)}`;
	}
}

/**
 * Wait for a selector to be visible
 *
 * @param selector - CSS selector to wait for
 * @param timeout - Maximum time to wait in milliseconds
 * @returns Result message
 */
export async function wait_for_selector(
	selector: string,
	timeout: number = ACTION_TIMEOUT
): Promise<string> {
	console.log(`Waiting for selector: ${selector} (timeout: ${timeout}ms)`);

	try {
		const activePage = await getPage();
		await activePage.waitForSelector(selector, {timeout});

		return `Element ${selector} is now visible`;
	} catch (error: any) {
		console.error(`Error waiting for selector ${selector}:`, error);
		return `Error waiting for selector ${selector}: ${error?.message || String(error)}`;
	}
}

/**
 * Get the current URL of the page
 *
 * @returns The current URL
 */
export async function get_page_url(): Promise<string> {
	try {
		const activePage = await getPage();
		const url = activePage.url();

		return url;
	} catch (error: any) {
		console.error('Error getting current URL:', error);
		return `Error getting current URL: ${error?.message || String(error)}`;
	}
}


/**
 * Get all browser tools as an array of tool definitions
 */
export function getBrowserTools(): ToolFunction[] {
	return [
		createToolFunction(
			navigate,
			'Navigate to a URL',
			{
				'url': 'URL to navigate to', 'waitUntil': 'can be one of:\n' +
					"    - \"commit\" (recommended): when network response is received and the document started loading (very fast - recommended when you don't need all content to load)\n" +
					'    - "domcontentloaded": when the `DOMContentLoaded` event is fired\n' +
					'    - "load": when the `load` event is fired (not recommended - may timeout)'
			},
			'the page title'
		),
		createToolFunction(
			screenshot,
			'Take a screenshot of the page or element',
			{
				'selector': 'Optional CSS selector to screenshot a specific element',
				'fullPage': 'Whether to take a full page screenshot',
				'fileName': 'Optional file path to save the screenshot'
			},
			'a Base64 encoded screenshot data or file path'
		),
		createToolFunction(
			get_page_text,
			'Get text content from the page or element',
			{
				'selector': 'Optional CSS selector to get text from a specific element',
				'hasText': 'Optional text content that the element must contain'
			}
		),
		createToolFunction(
			get_page_HTML,
			'Get HTML content from the page or element',
			{
				'selector': 'Optional CSS selector to get HTML from a specific element',
				'hasText': 'Optional text content that the element must contain'
			}
		),
		createToolFunction(
			get_page_url,
			'Get the current URL of the page'
		),
		createToolFunction(
			click,
			'Click on an element',
			{
				'selector': 'CSS selector for the element to click',
				'hasText': 'Optional text content that the element must contain'
			}
		),
		createToolFunction(
			hover,
			'Hover over an element',
			{
				'selector': 'CSS selector for the element to hover over',
				'hasText': 'Optional text content that the element must contain'
			}
		),
		createToolFunction(
			fill,
			'Fill a form field',
			{
				'selector': 'CSS selector for the input field',
				'value': 'Value to fill in',
				'hasText': 'Optional text content that the element must contain'
			}
		),
		createToolFunction(
			check,
			'Check a checkbox or radio button',
			{
				'selector': 'CSS selector for the checkbox or radio button',
				'hasText': 'Optional text content that the element must contain'
			},
		),
		createToolFunction(
			evaluate,
			'Execute JavaScript code in the browser context',
			{'code': 'JavaScript code to execute'},
			'result of the executed code'
		),
		createToolFunction(
			js_evaluate,
			'Execute JavaScript code in the browser context',
			{'code': 'JavaScript code to execute'},
			'result of the executed code'
		),
		createToolFunction(
			type,
			'Type text using the keyboard',
			{'text': 'Text to type'}
		),
		createToolFunction(
			press,
			'Press specific keys on the keyboard',
			{'keys': 'Keys to press (e.g., "Enter", "ArrowDown", etc.)'}
		),
		createToolFunction(
			wait,
			'Wait for a specified amount of time',
			{'milliseconds': 'Time to wait in milliseconds'}
		),
		createToolFunction(
			wait_for_selector,
			'Wait for a selector to be visible',
			{'selector': 'CSS selector to wait for', 'timeout': 'Maximum time to wait in milliseconds'}
		),
		createToolFunction(
			reset_session,
			'Reset the browser session with a clean context and cookies'
		),
	];
}

// Handle cleanup on process exit
process.on('exit', () => {
	if (browser) {
		browser.close().catch(console.error);
	}
});

// Handle other termination signals
process.on('SIGINT', async () => {
	await cleanup();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	await cleanup();
	process.exit(0);
});

process.on('uncaughtException', async (error) => {
	console.error('Uncaught exception:', error);
	await cleanup();
});
