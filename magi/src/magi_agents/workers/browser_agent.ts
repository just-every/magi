/**
 * Browser agent for the MAGI system.
 *
 * This agent specializes in web browsing, data extraction, and website interaction.
 */

import { Agent } from '../../utils/agent.js';
import { getFileTools } from '../../utils/file_utils.js';
import { getBrowserTools, navigate, getText } from '../../utils/browser_utils.js';
import { COMMON_WARNINGS, DOCKER_ENV_TEXT, SELF_SUFFICIENCY_TEXT, FILE_TOOLS_TEXT } from '../constants.js';

/**
 * Create the browser agent
 */
export function createBrowserAgent(): Agent {
  return new Agent({
    name: 'BrowserAgent',
    description: 'Controls a browser to interact with websites, fill forms, and extract data',
    instructions: `You are a specialized browser agent with the ability to interact with websites.

Your browsing capabilities include:
- Navigating to URLs
- Taking screenshots of webpages
- Extracting text and HTML content from webpages
- Interacting with elements (clicking, filling forms, hovering, etc.)
- Executing JavaScript in the browser context
- Retrieving and analyzing HTML/DOM elements

BROWSING APPROACH:
1. Navigate to the specified URL
2. Analyze the page structure to locate elements of interest
3. Interact with elements as needed (click, fill, hover, etc.)
4. Extract relevant information or take screenshots
5. Report findings and explain what you did

${COMMON_WARNINGS}

${DOCKER_ENV_TEXT}

${FILE_TOOLS_TEXT}

BROWSER TOOLS:
- navigate: Navigate to a URL
- screenshot: Take a screenshot of a webpage or element
- get_text: Extract text content from a webpage or element
- get_html: Extract HTML content from a webpage or element
- click: Click on an element
- hover: Hover over an element
- fill: Fill in a form field
- check: Check a checkbox or radio button
- evaluate: Execute JavaScript code in the browser context
- type: Type text using the keyboard
- press: Press specific keys on the keyboard
- wait: Wait for a specified amount of time
- wait_for_selector: Wait for an element to be visible on the page
- get_current_url: Get the current URL of the page
- reset_session: Reset the browser session with a clean context and cookies

${SELF_SUFFICIENCY_TEXT}

IMPORTANT:
- Wait for pages to load before interacting with them
- Handle potential issues like popups, cookie consent forms, and other obstacles
- Be patient with slow-loading websites and retry if necessary
- Prefer stable selectors (IDs, data attributes) over volatile ones (indices, text content)
- Report errors clearly if you cannot access a website or element

SPECIAL INSTRUCTION: For any web request, first navigate to the URL and then use get_text to read the page content. Then respond with a summary of what you found.`,
    tools: [
      ...getFileTools(),
      ...getBrowserTools()
    ],
    modelClass: 'standard'
  });
}

/**
 * Run the browser agent to extract content from a website
 * This implementation handles the direct execution path without relying on LLM tool calls
 */
export async function runBrowserDirectly(url: string): Promise<string> {
  console.log(`[BrowserAgent] Direct execution for URL: ${url}`);

  try {
    // Step 1: Navigate to the URL
    console.log(`[BrowserAgent] Navigating to ${url}`);
    const navigationResult = await navigate(url);

    if (!navigationResult.success) {
      return `Failed to navigate to ${url}: ${navigationResult.message}`;
    }

    console.log(`[BrowserAgent] Successfully navigated to ${url}, page title: "${navigationResult.title}"`);

    // Step 2: Extract text from the page
    console.log('[BrowserAgent] Extracting text from page');
    const textResult = await getText();

    if (!textResult.success || !textResult.text) {
      return `Successfully navigated to ${url} but failed to extract text: ${textResult.message}`;
    }

    // Format text for better readability
    const extractedText = textResult.text.trim();
    const textLength = extractedText.length;

    console.log(`[BrowserAgent] Successfully extracted ${textLength} characters of text`);

    // For Yahoo.com or news sites, look for headlines
    let headlines = '';
    if (url.includes('yahoo.com')) {
      console.log('[BrowserAgent] Extracting news headlines from Yahoo');
      // Look for headline patterns in the extracted text
      const lines = extractedText.split('\n');
      const headlineLines = lines.filter(line =>
        line.trim().length > 20 &&
        line.trim().length < 120 &&
        !line.includes('@') &&
        !line.includes('Sign in') &&
        !line.includes('Privacy') &&
        !line.includes('Terms')
      );

      // Get top headlines
      if (headlineLines.length > 0) {
        headlines = '\n\nTop headlines:\n' + headlineLines.slice(0, 10).map(h => `- ${h.trim()}`).join('\n');
      }
    }

    // Step 3: Return the full extracted content (truncated for readability)
    const maxContentLength = 2000; // Keep a longer sample for better context
    return `I visited ${url} (page title: "${navigationResult.title}") and extracted content from the page.

${extractedText.substring(0, maxContentLength)}${textLength > maxContentLength ? '...[content truncated]' : ''}${headlines}`;

  } catch (error) {
    console.error('[BrowserAgent] Error in direct execution:', error);
    return `Error browsing ${url}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
