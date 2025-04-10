/**
 * Command processor for handling native host requests.
 */

import { CommandParamMap, CommandHandler, ResponseMessage } from '../types';
import { getAgentTabHandler } from './tab-commands'; // <-- Keep this uncommented
import { navigateHandler, getUrlHandler } from './navigation-commands'; // <-- Uncommented
import { getPageContentHandler } from './content-commands'; // <-- Uncommented
import { screenshotHandler } from './screenshot-commands'; // <-- Uncommented
import { jsEvaluateHandler, typeHandler, pressHandler } from './input-commands'; // <-- Uncommented
import { interactElementHandler } from './interaction-commands'; // <-- Uncommented
import { switchTabHandler, closeAgentSessionHandler } from './session-commands'; // <-- Uncommented

// Map of command name to handler function
const commandHandlers: {
  [K in keyof CommandParamMap]?: CommandHandler<K> // Make optional for partial testing
} = {
  'initialize_agent': getAgentTabHandler, // <-- Keep this uncommented
  'navigate': navigateHandler, // <-- Uncommented
  'get_page_content': getPageContentHandler, // <-- Uncommented
  'get_url': getUrlHandler, // <-- Uncommented
  'screenshot': screenshotHandler, // <-- Uncommented
  'js_evaluate': jsEvaluateHandler, // <-- Uncommented
  'type': typeHandler, // <-- Uncommented
  'press': pressHandler, // <-- Uncommented
  'interact_element': interactElementHandler, // <-- Uncommented
  'switch_tab': switchTabHandler, // <-- Uncommented
  'close_agent_session': closeAgentSessionHandler // <-- Uncommented
};

/**
 * Processes a command from the native host
 * @param command The command name
 * @param tabId The agent tab ID
 * @param params The command parameters
 * @returns Promise resolving to response message
 */
export async function processCommand(
  command: string,
  tabId: string,
  params: any
): Promise<ResponseMessage> {
  console.log(`[command-processor] Processing command: ${command}`);
  
  // Check if command is supported
  const handler = commandHandlers[command as keyof typeof commandHandlers];
  if (!handler) {
     console.warn(`[command-processor] Command handler for ${command} is not available or commented out.`);
    return {
      status: 'error',
      error: `Unsupported command or handler unavailable: ${command}`
    };
  }
  
  try {
    // Dynamic cast to get correct handler and parameter types - this is type-safe
    return await handler(tabId, params);
  } catch (error) {
    console.error(`[command-processor] Error processing command ${command}:`, error);
    return {
      status: 'error',
      error: `Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
      details: error instanceof Error ? error.stack : undefined
    };
  }
}
