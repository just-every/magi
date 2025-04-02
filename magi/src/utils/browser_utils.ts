/**
 * Browser utility functions for the MAGI system.
 *
 * This module provides browser automation tools using Playwright,
 * including simplified HTML representation for LLM interaction.
 */

import {chromium, Browser, Page, BrowserType, BrowserContext, Locator, errors as PlaywrightErrors } from 'playwright'; // Import PlaywrightErrors
import path from 'path';
import { JSDOM } from 'jsdom';

import {ToolFunction} from '../types.js';
// import {processImage} from './image_utils.js';
import {createToolFunction} from './tool_call.js';
import {get_output_dir, write_unique_file} from './file_utils.js';

const ELEMENT_NODE = 1;

// Constants
const NAVIGATE_TIMEOUT = 15000;
const ACTION_TIMEOUT = 10000; // Default timeout for actions
const VIEWPORT_WIDTH = 1024; // Slightly wider viewport
const VIEWPORT_HEIGHT = 768;

// Browser instance for reuse
let browser: Browser | null = null;
let page: Page | null = null;
let context: BrowserContext | null = null;
const browserType: BrowserType = chromium;

// --- State for Simplified HTML ---
interface SimplifiedElementInfo {
	id: number;
	description: string;
	selector: string;
	tagName: string; // Store tag name for context
	// Optional: Add attributes if tools need more context
}
let currentIdMap = new Map<number, SimplifiedElementInfo>();


const LAUNCH_ARGS = [
	`--window-size=${VIEWPORT_WIDTH},${VIEWPORT_HEIGHT}`,
	'--disable-dev-shm-usage',
	'--no-sandbox',
	'--disable-setuid-sandbox',
	'--disable-gpu', // Often needed in headless environments
	'--disable-extensions',
	'--mute-audio'
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
					headless: true, // Consider false for debugging
					args: LAUNCH_ARGS
				});
				console.log('Browser launched successfully');
				browser.on('disconnected', () => {
					console.warn('Browser disconnected. Cleaning up...');
					browser = null;
					context = null;
					page = null;
					currentIdMap.clear();
				});
			} catch (launchError) {
				console.error('Failed to launch browser:', launchError);
				console.error(launchError instanceof Error ? launchError.stack : String(launchError));
				throw new Error(`Browser launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`);
			}
		}

		// Initialize context if it doesn't exist or is closed
		if (!context || context.pages().length === 0) { // Check if context might have been closed implicitly
			if (context) await context.close().catch(e => console.error('Error closing previous context:', e)); // Close previous if exists
			console.log('Creating browser context...');
			try {
				context = await browser.newContext({
					viewport: {width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT},
					userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36', // Updated UA
					acceptDownloads: false, // Disable downloads unless needed
					ignoreHTTPSErrors: true, // Be cautious with this in production
					javaScriptEnabled: true,
					// Consider locale, timezone, geolocation if needed
				});
				context.on('close', () => {
					console.warn('Browser context closed.');
					context = null;
					page = null; // Page is invalid if context closes
					currentIdMap.clear();
				});
				console.log('Browser context created successfully');
			} catch (contextError) {
				console.error('Failed to create browser context:', contextError);
				console.error(contextError instanceof Error ? contextError.stack : String(contextError));
				throw new Error(`Browser context creation failed: ${contextError instanceof Error ? contextError.message : String(contextError)}`);
			}
		}

		// Initialize page if it doesn't exist or is closed
		if (!page || page.isClosed()) {
			if (page && !page.isClosed()) await page.close().catch(e => console.error('Error closing previous page:', e)); // Close previous if exists and not closed
			console.log('Creating new page...');
			try {
				page = await context.newPage();

				// Set up default timeouts
				page.setDefaultTimeout(ACTION_TIMEOUT);
				page.setDefaultNavigationTimeout(NAVIGATE_TIMEOUT);

				page.on('close', () => {
					console.warn('Browser page closed.');
					page = null; // Reset page variable
					// Map likely invalid, but don't clear here, wait for navigation/refresh
				});
				page.on('crash', () => {
					console.error('Browser page crashed!');
					page = null;
					currentIdMap.clear(); // Map is definitely invalid
				});
				// Optional: Add listeners for dialogs, popups, etc. if needed
				// page.on('dialog', dialog => dialog.dismiss());

				console.log('Browser page created successfully');
			} catch (pageError) {
				console.error('Failed to create browser page:', pageError);
				console.error(pageError instanceof Error ? pageError.stack : String(pageError));
				throw new Error(`Browser page creation failed: ${pageError instanceof Error ? pageError.message : String(pageError)}`);
			}
		}

		return page;
	} catch (error) {
		console.error('Error initializing browser/page:', error);
		console.error(error instanceof Error ? error.stack : String(error));
		throw error;
	}
}

/**
 * Reset the browser session with a clean context and cookies
 */
async function reset_session(): Promise<string> {
	try {
		// Ensure cleanup happens even if some parts fail
		if (page && !page.isClosed()) {
			await page.close().catch(e => console.error('Error closing page during reset:', e));
		}
		page = null;

		if (context) {
			await context.close().catch(e => console.error('Error closing context during reset:', e));
		}
		context = null;
		currentIdMap.clear(); // Clear the map

		// Re-initialize (getPage will handle creation)
		await getPage();

		return 'Browser session reset successfully, new context created, interaction map cleared.';
	} catch (error: any) {
		console.error('Error resetting session:', error);
		// Attempt cleanup even on error
		page = null;
		context = null;
		currentIdMap.clear();
		return `Error resetting session: ${(error instanceof Error ? error.stack : String(error))}`;
	}
}

/**
 * Clean up browser resources
 */
async function cleanup() {
	try {
		console.log('Cleaning up browser resources...');
		currentIdMap.clear();

		// Close page first, then context, then browser
		if (page && !page.isClosed()) {
			await page.close().catch(e => console.error('Error closing page during cleanup:', e));
		}
		page = null;

		if (context) {
			await context.close().catch(e => console.error('Error closing context during cleanup:', e));
		}
		context = null;

		if (browser) {
			await browser.close().catch(e => console.error('Error closing browser during cleanup:', e));
		}
		browser = null;

		console.log('Browser resources cleaned up successfully');
	} catch (error) {
		console.error('Error during browser cleanup:', error);
	}
}

/**
 * Generates a CSS selector for a given DOM element, prioritizing stability.
 * NOTE: This is improved but generating universally unique and robust selectors
 * automatically for complex/dynamic pages is inherently challenging. Manual inspection
 * or dedicated libraries might be needed for extremely tricky cases. Does not handle Shadow DOM well.
 */
function generateSelector(element: Element): string {
	// Ensure access to CSS.escape via the element's document's window context
	// Provide a basic fallback just in case CSS.escape is unavailable (shouldn't happen with JSDOM)
	const escape = element.ownerDocument?.defaultView?.CSS?.escape ?? ((ident: string): string => {
		console.warn('CSS.escape not found, using basic fallback for selector generation.');
		// Very basic fallback, not fully compliant. Prefer CSS.escape.
		return ident.replace(/[^_a-zA-Z0-9-]/g, (match) => `\\${match.codePointAt(0)?.toString(16).padStart(6, '0') ?? ''} `); // Escape using unicode code point
		// Alternative simpler (less correct) fallback: return ident.replace(/[^_a-zA-Z0-9-]/g, (match) => `\\${match}`);
	});


	// 1. Prioritize stable custom attributes (as before)
	const stableAttrs = ['data-testid', 'data-cy', 'data-qa', 'data-test-id', 'data-test'];
	for (const attr of stableAttrs) {
		const value = element.getAttribute(attr);
		if (value) {
			// Escape the attribute value too, just in case it contains quotes or brackets
			return `[${attr}="${escape(value)}"]`;
		}
	}

	// 2. Use ID if unique and reasonably simple (as before, added escaping)
	if (element.id && !/^\d+$/.test(element.id) && !element.id.includes(' ')) {
		const escapedId = escape(element.id); // Escape the ID
		return `#${escapedId}`;
	}

	const tagName = element.tagName.toLowerCase();

	// 3. Use Name + TagName for form elements (as before, added escaping for value)
	const name = element.getAttribute('name');
	if (name && ['input', 'select', 'textarea', 'button', 'form'].includes(tagName)) {
		return `${tagName}[name="${escape(name)}"]`;
	}

	// 4. Use Role + Accessible Name (as before, added escaping for value)
	const role = element.getAttribute('role');
	const ariaLabel = element.getAttribute('aria-label');
	if (role && ariaLabel && ['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab', 'textbox'].includes(role)) {
		return `${tagName}[role="${role}"][aria-label="${escape(ariaLabel)}"]`;
	}
	if (role && ['button', 'link', 'navigation', 'main', 'region', 'search'].includes(role)) {
		return `${tagName}[role="${role}"]`;
	}

	// 5. Use TagName + Type for inputs (as before, added escaping for value)
	const type = element.getAttribute('type');
	if (tagName === 'input' && type) {
		return `input[type="${escape(type)}"]`;
	}

	// 6. Basic TagName + Class combination (MODIFIED)
	if (element.className && typeof element.className === 'string') {
		const classes = element.className.split(/\s+/)
			.filter(Boolean) // Remove empty strings resulting from multiple spaces
			.filter(cls => !/^\d+$/.test(cls)); // Avoid purely numeric classes which are invalid identifiers

		if (classes.length > 0) {
			// --- Apply CSS.escape to each class ---
			const escapedClasses = classes.map(cls => escape(cls));
			// ----------------------------------------
			return `${tagName}.${escapedClasses.join('.')}`;
		}
	}

	// 7. Fallback: Just use TagName (as before)
	return tagName;
}


/**
 * Checks if an element is likely interactive based on tag name or ARIA role.
 */
function isInteractive(element: Element): boolean {
	const tagName = element.tagName.toUpperCase();
	if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
		return false;
	}
	const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION']; // Added OPTION
	if (interactiveTags.includes(tagName)) {
		// Exclude non-interactive input types unless they have event handlers (hard to check here)
		const type = element.getAttribute('type')?.toLowerCase();
		if (tagName === 'INPUT' && (type === 'hidden' || type === 'reset' /* often handled by form */)) {
			return false;
		}
		return true;
	}

	const role = element.getAttribute('role');
	if (role && ['button', 'link', 'checkbox', 'radio', 'switch', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'textbox', 'searchbox', 'slider', 'spinbutton', 'combobox', 'listbox', 'option'].includes(role)) {
		return true;
	}

	// Consider contentEditable?
	// if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false') return true;

	return false;
}

/**
 * Identifies structural landmark elements.
 */
function isLandmark(element: Element): boolean {
	const tagName = element.tagName.toUpperCase();
	const role = element.getAttribute('role');

	if (['HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE', 'FORM', 'SECTION', 'ARTICLE'].includes(tagName)) return true;
	if (role && ['banner', 'contentinfo', 'navigation', 'main', 'complementary', 'form', 'region', 'search'].includes(role)) return true;

	return false;
}

/**
 * Extracts key textual content or labels for description, trying multiple sources.
 */
function getElementDescription(element: Element, document: Document): string {
	const tagName = element.tagName.toLowerCase();
	let description = '';

	// 1. Explicit Label (for form elements)
	if (element.id && ['input', 'select', 'textarea'].includes(tagName)) {
		const label = document.querySelector(`label[for="${element.id}"]`);
		if (label?.textContent) {
			description += `Label:"${label.textContent.trim()}" `;
		}
	}

	// 2. ARIA Label/LabelledBy (preferred)
	const ariaLabel = element.getAttribute('aria-label');
	if (ariaLabel) {
		description += `aria-label:"${ariaLabel.trim()}" `;
	} else {
		const labelledBy = element.getAttribute('aria-labelledby');
		if (labelledBy) {
			const labelElement = document.getElementById(labelledBy);
			if (labelElement?.textContent) {
				description += `aria-labelledby:"${labelElement.textContent.trim()}" `;
			}
		}
	}

	description += `${tagName}`;

	// 3. Key Attributes
	const type = element.getAttribute('type');
	const name = element.getAttribute('name');
	const placeholder = element.getAttribute('placeholder');
	const role = element.getAttribute('role');
	const title = element.getAttribute('title');
	let value = element.getAttribute('value');

	if (type === 'password') value = null; // Don't include password value

	if (role) description += ` (role=${role})`;
	if (type && tagName === 'input') description += ` (type=${type})`;
	if (name) description += ` (name=${name})`;
	if (placeholder) description += ` (placeholder="${placeholder.substring(0, 50)}${placeholder.length > 50 ? '...' : ''}")`;
	if (title) description += ` (title="${title.substring(0, 50)}${title.length > 50 ? '...' : ''}")`;


	// 4. Visible Text Content (if not already described by labels)
	if (!description.includes('Label:"') && !description.includes('aria-')) {
		let textContent = element.textContent?.replace(/\s+/g, ' ').trim();
		// Special handling for select options - show selected option text
		if (tagName === 'select' && element instanceof HTMLSelectElement) {
			const selectedOption = element.options[element.selectedIndex];
			if(selectedOption?.textContent) {
				textContent = `Selected: "${selectedOption.textContent.trim()}"`;
			}
		}

		if (textContent) {
			description += ` "${textContent.substring(0, 80)}${textContent.length > 80 ? '...' : ''}"`; // Limit length
		} else if (tagName === 'input' && (type === 'submit' || type === 'button') && value) {
			description += ` "${value}"`; // Button text might be in value attribute
		} else if ((tagName === 'img' || (tagName === 'input' && type === 'image')) && element.getAttribute('alt')) {
			description += ` (alt="${element.getAttribute('alt')}")`; // Add alt text for images/image inputs
		}
	}

	// Add disabled state if applicable
	if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
		description += ' [Disabled]';
	}

	return description.replace(/\s+/g, ' ').trim();
}

/**
 * Processes HTML content to generate a simplified text representation for the LLM
 * and an internal map linking numerical IDs to CSS selectors for interaction.
 * Filters hidden elements and includes landmarks for context.
 * @param htmlContent Raw HTML string of the current page.
 * @returns Object containing simplified text and the ID-to-selector map.
 */
function processHtmlForLlm(htmlContent: string): { simplifiedText: string; idMap: Map<number, SimplifiedElementInfo> } {
	const dom = new JSDOM(htmlContent);
	const document = dom.window.document;
	const body = document.body;

	const simplifiedLines: string[] = [];
	const newIdMap = new Map<number, SimplifiedElementInfo>();
	let currentId = 1;
	const processedElements = new Set<Element>(); // Avoid processing nested elements multiple times

	function processNode(element: Element) {
		if (processedElements.has(element) || element.nodeType !== ELEMENT_NODE) {
			return;
		}
		processedElements.add(element);

		// --- Visibility / Relevance Filtering ---
		// 1. Skip script, style, head, meta, etc.
		if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED'].includes(element.tagName)) {
			return;
		}
		// 2. Skip elements explicitly hidden via ARIA
		if (element.getAttribute('aria-hidden') === 'true') {
			return;
		}
		// 3. Basic style attribute check (limited effectiveness)
		const styleAttr = element.getAttribute('style');
		if (styleAttr && (styleAttr.includes('display: none') || styleAttr.includes('visibility: hidden'))) {
			// Check if a parent is also hidden this way, if so, skip
			// Note: This doesn't catch CSS class based hiding. Playwright's isVisible is better.
			return;
		}
		// 4. Skip hidden inputs unless specifically needed (they don't get IDs here)
		if (element.tagName === 'INPUT' && element.getAttribute('type')?.toLowerCase() === 'hidden') {
			return;
		}

		// --- Element Processing ---
		const interactive = isInteractive(element);
		const landmark = isLandmark(element);
		const description = getElementDescription(element, document);

		// Add Landmark context marker
		if (landmark && !interactive /* Avoid duplicating interactive landmarks */) {
			simplifiedLines.push(`\n## Landmark: ${description} ##`);
		}

		// Add Interactive Element
		if (interactive) {
			const selector = generateSelector(element);
			newIdMap.set(currentId, {
				id: currentId,
				description: description,
				selector: selector,
				tagName: element.tagName.toLowerCase(),
			});
			simplifiedLines.push(`[${currentId}] ${description}`);
			currentId++;
		} else if (!landmark && element.tagName.match(/^H[1-6]$/)) {
			// Add Headings for context (if not already part of a landmark description)
			const headerText = element.textContent?.trim();
			if (headerText) {
				simplifiedLines.push(`\n### ${headerText} ###`);
			}
		}
		// Consider adding short paragraphs <p> if they contain important non-interactive context?

		// --- Recursively Process Children ---
		// Only recurse if not interactive to avoid duplicating children included in description
		// Or if it's a structural element like form, section, div
		if (!interactive || ['FORM', 'SECTION', 'DIV', 'MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'HEADER', 'FOOTER'].includes(element.tagName)) {
			element.childNodes.forEach(child => {
				if (child.nodeType === ELEMENT_NODE) {
					processNode(child as Element);
				}
			});
		}

		// Close Landmark context marker
		if (landmark && !interactive) {
			simplifiedLines.push(`## End Landmark: ${description.split(' ')[0]} ##\n`);
		}
	}

	// Start processing from body
	if (body) {
		processNode(body);
	}

	// Post-processing: Clean up excessive newlines
	const simplifiedText = simplifiedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

	return { simplifiedText, idMap: newIdMap };
}

/**
 * Gets the current page's HTML, processes it into a simplified format for LLM context,
 * and updates the internal mapping for ID-based interaction tools.
 * Filters out hidden elements and includes structural landmarks.
 * @returns Simplified text representation of the page's interactive elements and structure.
 */
export async function get_page_content(): Promise<string> {
	console.log('Getting and processing page content for simplified view...');
	try {
		const activePage = await getPage();
		// Ensure page is somewhat stable before getting content
		await activePage.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => console.warn('waitForLoadState timed out, proceeding anyway.'));

		const htmlContent = await activePage.content();

		// Process the HTML
		const { simplifiedText, idMap } = processHtmlForLlm(htmlContent);

		// Update the global map
		currentIdMap = idMap;
		console.log(`Generated simplified content (${simplifiedText.length} chars) and updated interaction map with ${currentIdMap.size} elements.`);

		// Return the text for the LLM
		return simplifiedText;

	} catch (error: any) {
		console.error('Error getting/processing simplified page content:', error);
		// Clear map on error as it's likely invalid
		currentIdMap.clear();
		return `Error getting simplified page content: ${error?.message || String(error)}. Interaction map cleared.`;
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
	waitUntil: 'commit' | 'domcontentloaded' | 'load' = 'commit' // 'commit' is often faster, 'domcontentloaded' safer
): Promise<string> {
	console.log(`Navigating to URL: ${url} (waitUntil: ${waitUntil})`);
	let activePage: Page;
	try {
		activePage = await getPage();
	} catch (pageError) {
		return `Failed to get browser page for navigation: ${pageError instanceof Error ? pageError.message : String(pageError)}`;
	}

	// Clear map immediately before navigation attempt
	currentIdMap.clear();
	console.log('Cleared interaction map before navigation.');

	try {
		const response = await activePage.goto(url, {
			waitUntil,
			timeout: NAVIGATE_TIMEOUT
		});

		if (!response) {
			return `Failed to navigate to ${url}: No response received (check URL, network). Map cleared.`;
		}

		const status = response.status();
		console.log(`Navigation response status: ${status}`);
		if (status >= 400) {
			return `Navigation failed with status ${status} for ${url}. Map cleared.`;
		}

		const pageTitle = await activePage.title().catch(() => 'Could not get title');
		console.log(`Page title: "${pageTitle}"`);

		// Recommend refresh explicitly
		return `Successfully navigated to ${url} (status: ${status}, title: "${pageTitle}").`;

	} catch (error: any) {
		console.error(`Error navigating to ${url}:`, error);
		// Map is already cleared
		if (error instanceof PlaywrightErrors.TimeoutError) {
			return `Error navigating to ${url}: Navigation timed out after ${NAVIGATE_TIMEOUT}ms. The page might be partially loaded or unresponsive. Map cleared.`;
		}
		return `Error navigating to ${url}: ${error?.message || String(error)}. Map cleared.`;
	}
}


/**
 * Take a screenshot of the page or a specific element identified by its simplified ID.
 *
 * @param elementId - Numerical ID of the element (from get_simplified_page_content) to screenshot. If omitted or 0, screenshots the current viewport or full page. Default: 0 (viewport).
 * @param fullPage - If elementId is NOT provided, whether to take a full page screenshot. Ignored if elementId is provided. Default: false.
 * @param fileName - Optional filename to save the screenshot as.
 * @returns File path where screenshot was saved or error message.
 */
export async function screenshot(
	elementId: number = 0,
	fullPage: boolean = false,
	fileName?: string
): Promise<string> {
	// Determine target description for logging and filename
	const targetDesc = (elementId > 0) ? `element ID [${elementId}]` : (fullPage ? 'full page' : 'viewport');
	console.log(`Taking screenshot of ${targetDesc}`);

	let activePage: Page;
	try {
		activePage = await getPage();
	} catch (pageError: any) {
		return `Error getting page for screenshot: ${pageError?.message || String(pageError)}`;
	}

	let elementInfo: SimplifiedElementInfo | undefined;
	let targetLocator: Locator | Page = activePage;
	let targetSelector: string | undefined; // Store the selector if using ID

	// If an element ID is provided, find its selector
	if (elementId > 0) {
		if (currentIdMap.size === 0) {
			return 'Error taking element screenshot: Interaction map is empty. Call get_simplified_page_content() first.';
		}
		elementInfo = currentIdMap.get(elementId);
		if (!elementInfo) {
			return `Error taking element screenshot: Element ID [${elementId}] not found in map (max ID: ${currentIdMap.size}). Map may be stale; call get_simplified_page_content().`;
		}
		targetSelector = elementInfo.selector;
		console.log(`Targeting element [${elementId}]: ${elementInfo.description} using selector: ${targetSelector}`);
		targetLocator = activePage.locator(targetSelector).first(); // Target the specific element

		try {
			// Wait briefly for the element to be stable/visible before screenshot
			await targetLocator.waitFor({ state: 'visible', timeout: 3000 });
		} catch (waitError: any) {
			console.warn(`Screenshot target element ID [${elementId}] (selector "${targetSelector}") not visible/found quickly.`);
			// Don't return immediately, Playwright might still find it, but log the warning.
			// Let the actual screenshot call fail if it's truly not there.
			// return `Element ID [${elementId}] not found or not visible for screenshot: ${waitError?.message || String(waitError)}`;
		}
	}

	try {
		// Generate filename components
		const timestamp = Date.now();
		const urlPart = activePage.url().replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
		const elementPart = elementInfo ? `_id${elementId}` : (fullPage ? '_full' : '_viewport');
		const defaultFilename = `${timestamp}_${urlPart}${elementPart}.jpg`;
		const fileSavePath = path.join(get_output_dir('screenshots'), fileName || defaultFilename);

		// Always get the buffer from Playwright, then save manually
		const screenshotBuffer = await targetLocator.screenshot({
			// path: undefined, // Let Playwright return the buffer
			fullPage: targetLocator === activePage ? fullPage : false, // fullPage only applies to page screenshots
			type: 'jpeg',
			quality: 80,
			timeout: ACTION_TIMEOUT // Add timeout for the screenshot operation itself
		});

		if (!screenshotBuffer) {
			// Should not happen if path is undefined, but good to check
			throw new Error('Screenshot buffer was unexpectedly empty.');
		}

		// Save the buffer using your function
		write_unique_file(fileSavePath, screenshotBuffer); // Using your specified function

		return `Screenshot saved to ${fileSavePath}`;

	} catch (error: any) {
		console.error(`Error taking screenshot of ${targetDesc}:`, error);
		const selectorForError = targetSelector || 'page'; // Use selector if available for error message context
		if (error instanceof PlaywrightErrors.TimeoutError) {
			return `Error taking screenshot: Action timed out. Element "${selectorForError}" might not be ready or visible.`;
		}
		if (error.message?.includes('Target closed') || error.message?.includes('Page closed')) {
			return 'Error taking screenshot: The browser page or context was closed. Please reset the session or navigate again.';
		}
		return `Error taking screenshot of ${targetDesc}: ${error?.message || String(error)}`;
	}
}

/**
 * Execute JavaScript in the browser context
 *
 * @param code - JavaScript code to execute
 * @returns Result of the executed code
 */
export async function js_evaluate(code: string): Promise<string> {
	console.log(`Evaluating JavaScript: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`);

	try {
		const activePage = await getPage();
		const result = await activePage.evaluate(code);

		// Attempt to stringify, handle potential circular references or errors
		try {
			return JSON.stringify(result);
		} catch (stringifyError) {
			console.warn('Could not stringify evaluate result:', stringifyError);
			return String(result); // Fallback to simple string conversion
		}
	} catch (error: any) {
		console.error('Error evaluating JavaScript:', error);
		return `Error evaluating JavaScript: ${error?.message || String(error)}`;
	}
}

/**
 * Type text using the keyboard (applies to focused element)
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
 * @param keys - Keys to press (e.g., "Enter", "ArrowDown", "Tab", "Shift+Tab", etc.)
 * See Playwright docs for key syntax.
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
 * Perform an interaction on an element identified by its simplified ID.
 * Supported actions: "click", "fill", "check", "hover", "focus", "scroll", "select_option".
 * Call get_simplified_page_content() first/after page changes.
 *
 * @param elementId - The numerical ID of the element from simplified content.
 * @param action - The type of interaction: "click", "fill", "check", "hover", "focus", "scroll", "select_option".
 * @param value - The value for "fill" (text to type) or "select_option" (option value, label, or text). Ignored otherwise.
 * @param checked - The boolean state for "check" action (true=check, false=uncheck). Ignored otherwise.
 * @returns Result message
 */
export async function interact_element_by_id(
	elementId: number,
	action: 'click' | 'fill' | 'check' | 'hover' | 'focus' | 'scroll' | 'select_option',
	value?: string, // Used for fill, select_option
	checked?: boolean // Used for check
): Promise<string> {
	console.log(`Attempting action '${action}' on element ID [${elementId}]`);

	if (currentIdMap.size === 0) return 'Error: Interaction map is empty. Call get_simplified_page_content() first.';
	const elementInfo = currentIdMap.get(elementId);
	if (!elementInfo) return `Error: Element ID [${elementId}] not found in map (max ID: ${currentIdMap.size}). Map may be stale; call get_simplified_page_content().`;

	// Use correct function name in log messages
	console.log(`Action '${action}' on element [${elementId}]: ${elementInfo.description} using selector: ${elementInfo.selector}`);
	try {
		const activePage = await getPage(); // Ensure getPage() returns the active Playwright Page
		const locator = activePage.locator(elementInfo.selector);

		switch (action) {
			case 'click':
				await locator.click({ timeout: ACTION_TIMEOUT });
				// Recommend refresh after click
				return `Clicked element [${elementId}]: ${elementInfo.description}. IMPORTANT: Page state might have changed. Consider calling get_simplified_page_content() if further actions depend on the new state.`;

			case 'fill':
				if (value === undefined || value === null) {
					return `Error: 'value' parameter must be provided for 'fill' action on element ID [${elementId}].`;
				}
				// Add specific check for select elements which should use 'select_option'
				if (elementInfo.tagName === 'select') {
					console.warn(`Attempting to 'fill' a <select> element ID [${elementId}]. Use action 'select_option' instead.`);
					return `Error: Use action 'select_option' to choose an option for <select> element ID [${elementId}], not 'fill'.`;
				}
				if (!['input', 'textarea'].includes(elementInfo.tagName) && !elementInfo.description.includes('role=textbox')) {
					console.warn(`Attempting to 'fill' potentially non-fillable element ID [${elementId}]: ${elementInfo.description}`);
				}
				await locator.fill(value, { timeout: ACTION_TIMEOUT });
				return `Filled element [${elementId}] (${elementInfo.description})`;

			case 'check':
				if (checked === undefined || checked === null) {
					return `Error: 'checked' parameter (true/false) must be provided for 'check' action on element ID [${elementId}].`;
				}
				if (elementInfo.tagName !== 'input' && !elementInfo.description.includes('role=checkbox') && !elementInfo.description.includes('role=radio')) {
					console.warn(`Attempting to 'check' potentially non-checkable element ID [${elementId}]: ${elementInfo.description}`);
				}
				await locator.setChecked(checked, { timeout: ACTION_TIMEOUT });
				return `${checked ? 'Checked' : 'Unchecked'} element [${elementId}]: ${elementInfo.description}`;

			case 'hover':
				await locator.hover({ timeout: ACTION_TIMEOUT });
				return `Hovered over element [${elementId}]: ${elementInfo.description}. Menus or tooltips might now be visible. Consider calling get_simplified_page_content() if needed.`;

			case 'focus':
				await locator.focus({ timeout: ACTION_TIMEOUT });
				return `Focused element [${elementId}]: ${elementInfo.description}. Subsequent 'press' or 'type' actions will target this element.`; // Assuming 'type' might be added back or handled differently

			case 'scroll':
				await locator.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT });
				return `Scrolled element [${elementId}] (${elementInfo.description}) into view.`;

			case 'select_option':
				if (value === undefined || value === null) {
					return `Error: 'value' parameter (option value, text, or label) must be provided for 'select_option' action on element ID [${elementId}].`;
				}
				if (elementInfo.tagName !== 'select') {
					console.warn(`Attempting 'select_option' on non-<select> element ID [${elementId}]: ${elementInfo.description}`);
					// Proceed anyway, Playwright might handle custom dropdowns via roles, but warn
				}
				await locator.selectOption(value, { timeout: ACTION_TIMEOUT });
				// Recommend refresh as selection might change other parts of the page
				return `Selected option matching "${value}" for element [${elementId}] (${elementInfo.description}). IMPORTANT: Page state might have changed. Consider calling get_simplified_page_content().`;

			default:
				// This case should be unreachable with TypeScript checking the action type
				return `Error: Unknown action type '${action}' requested for element ID [${elementId}].`;
		}
	} catch (error: any) {
		// Use the existing helper, potentially tailoring message slightly
		// Ensure handleInteractionError exists and works as expected
		const baseError = handleInteractionError(error, elementId, elementInfo);
		return baseError.replace('Action timed out', `Action '${action}' timed out`).replace('could not be interacted with', `could not perform '${action}'`);
	}
}

// Assuming handleInteractionError exists and is defined similar to the original code
function handleInteractionError(error: any, elementId: number, elementInfo?: SimplifiedElementInfo): string {
	const description = elementInfo ? `(${elementInfo.description})` : '';
	const selector = elementInfo ? `with selector "${elementInfo.selector}"` : '';

	if (error instanceof PlaywrightErrors.TimeoutError) {
		console.error(`Timeout error interacting with element ID [${elementId}] ${selector}:`, error.message);
		return `Error: Action timed out for element ID [${elementId}] ${description}. The element might be hidden, disabled, or the page state has changed. Try calling get_simplified_page_content() again.`;
	}
	if (error.message && (
		error.message.includes('element is not attached') ||
		error.message.includes('element is detached') ||
		error.message.includes('expected to be stable') ||
		error.message.includes('expected to be visible') ||
		error.message.includes('expected to be enabled') ||
		error.message.includes('waiting for selector') // Generic selector failure
	)) {
		console.error(`Stale element or visibility error interacting with ID [${elementId}] ${selector}:`, error.message);
		return `Error: Element ID [${elementId}] ${description} could not be interacted with (it might be hidden, disabled, removed, or changed). The page state may be stale. Try calling get_simplified_page_content() again.`;
	}

	console.error(`Error interacting with element ID [${elementId}] ${selector}:`, error);
	return `Error interacting with element ID [${elementId}] ${description}: ${error?.message || String(error)}. Consider calling get_simplified_page_content().`;
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
				'waitUntil': { type: 'string', description: 'When to consider navigation complete (e.g., "commit", "domcontentloaded"). Default: "commit".', optional: true}
			},
			'Status message including page title.'
		),
		createToolFunction(
			get_page_content,
			'Get simplified text content of the current page, including interactive elements ([ID] description format) and structural landmarks (## Landmark ##). Updates the internal map for ID-based interactions. IMPORTANT: Call this AFTER navigation or actions that significantly change the page (clicks, submits).',
			{},
			'Simplified text representation of the page, optimized for information extraction and interaction.'
		),
		createToolFunction(
			interact_element_by_id,
			'Perform an interaction on an element identified by its ID from get_simplified_page_content(). Handles clicks, filling fields, checking boxes, hovering, focusing, scrolling, and selecting dropdown options. If this fails (e.g., "stale", "timeout"), call get_simplified_page_content() again before retrying.',
			{
				'elementId': { type: 'number', description: 'The numerical ID of the element (e.g., 3 for [3])' },
				'action': {
					type: 'string',
					description: 'The type of interaction: "click", "fill", "check", "hover", "focus", "scroll", "select_option"'
				},
				'value': {
					type: 'string',
					description: 'Required for "fill" (text to enter) and "select_option" (option value, text, or label). Ignored otherwise.',
					optional: true // Optional overall, but required for specific actions
				},
				'checked': {
					type: 'boolean',
					description: 'Required for "check" action (true to check, false to uncheck). Ignored otherwise.',
					optional: true // Optional overall, but required for 'check'
				}
			},
			'Status message indicating success or failure. May recommend calling get_simplified_page_content() if page state changed.'
		),
		createToolFunction(
			press,
			'Simulate pressing a specific key or key combination (e.g., "Enter", "ArrowDown", "Control+C"). Affects focused element.',
			{'keys': { type: 'string', description: 'Key(s) to press (see Playwright docs)'}}
		),
		createToolFunction(
			screenshot,
			'Take a screenshot of the current viewport, full page, or a specific element identified by its ID.',
			{
				'elementId': {
					type: 'number',
					description: 'Optional numerical ID of the element (from get_simplified_page_content) to screenshot. If omitted, screenshots the page.',
					optional: true
				},
				'fullPage': {
					type: 'boolean',
					description: 'If elementId is NOT provided, screenshot the full scrollable page. Default: false.',
					optional: true
				},
				'fileName': {
					type: 'string',
					description: 'Optional filename.',
					optional: true
				}
			},
			'File path where the screenshot was saved.'
		),
		createToolFunction(
			get_page_url,
			'Get the current URL of the page.'
		),
		createToolFunction(
			js_evaluate,
			'ADVANCED: Execute arbitrary JavaScript code in the page context. Use only when necessary and with caution.',
			{'code': { type: 'string', description: 'JavaScript code to execute'}},
			'Result of the executed code, JSON stringified.'
		),
		createToolFunction(
			reset_session,
			'Completely reset the browser session: close all pages, clear cookies/storage, create a new context, and clear the interaction map.'
		),
	];
}


// --- Process Lifecycle Management ---
// (Ensure proper cleanup on exit/errors)

// Handle cleanup on process exit
process.on('exit', cleanup); // Use cleanup directly

// Handle other termination signals
process.on('SIGINT', async () => { // Ctrl+C
	console.log('Received SIGINT. Cleaning up...');
	await cleanup();
	process.exit(0);
});

process.on('SIGTERM', async () => { // Termination signal
	console.log('Received SIGTERM. Cleaning up...');
	await cleanup();
	process.exit(0);
});

process.on('uncaughtException', async (error, origin) => {
	console.error(`Uncaught exception at: ${origin}`, error);
	await cleanup();
	process.exit(1); // Exit after cleanup on fatal error
});

process.on('unhandledRejection', async (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
	// Decide if this is fatal - cleanup and exit?
	// await cleanup();
	// process.exit(1);
});
