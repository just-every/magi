/**
 * Browser agent for the MAGI system.
 *
 * This agent specializes in web browsing, data extraction, and website interaction.
 */

import { Agent } from '../../utils/agent.js';
import {
    addBrowserStatus,
    getBrowserParams,
    processBrowserParams,
    getBrowserTools,
} from '../../utils/browser_utils.js';
import {
    MAGI_CONTEXT,
    COMMON_WARNINGS,
    SELF_SUFFICIENCY_TEXT,
    CUSTOM_TOOLS_TEXT,
} from '../constants.js';
import { getCommonTools } from '../../utils/index.js';

/**
 * Create the browser agent
 */
export function createBrowserAgent(): Agent {
    const person = process.env.YOUR_NAME || 'User';

    const agent = new Agent({
        name: 'BrowserAgent',
        description: 'Quickly reads and interacts with websites.',
        instructions: `${MAGI_CONTEXT}
---

Your role in MAGI is as a BrowserAgent with computer use & vision capabilities. You use screenshots of web pages to interact with websites, fill forms, and extract data. You can also execute JavaScript in the browser context. You are capable of performing complex web interactions and data extraction using your tools.

You operate in a shared browsing session with a human (${person}) overseeing your operation. This allows you to interact with websites together. You can access accounts ${person} is already logged into and perform actions for them.

Your vision capabilities include:
- Analyzing screenshots to understand webpage layouts
- Identifying UI elements based on their visual appearance
- Processing and describing images from webpages
- Performing OCR on text in images
- Interpreting charts, graphs, and other visual data
- Understanding the visual hierarchy and design of webpages

VISION APPROACH:
1. Navigate to webpages to capture visual content
2. Analyze the visual content to understand your environment
3. Identify element coordinates and properties
4. Interact or report on elements based on visual analysis

${COMMON_WARNINGS}

${CUSTOM_TOOLS_TEXT}

${SELF_SUFFICIENCY_TEXT}

IMPORTANT:
- Each agent gets its own browser tab
- Each browser session is shared with ${person}, so when loading URLs you are likely to be logged into the account you need
- The screenshot you receive will be the current state of the page
- Report errors clearly if you cannot access a website or element

COMPLETION:
- If you can mostly complete a task after a couple of attempts, that's fine. Just explain what you did and what you couldn't do.
- Your may need to modify your goals based on what you find while browsing. Your requester does not know what you will find, so be flexible and adapt to the situation.
- Return your final response without a tool call, to indicate your task is done.`,
        tools: [...getBrowserTools(), ...getCommonTools()],
        modelClass: 'vision',
        modelSettings: {
            sequential_tools: true,
        },
        onRequest: addBrowserStatus,
        params: getBrowserParams('BrowserAgent'),
        processParams: processBrowserParams,
    });

    return agent;
}
