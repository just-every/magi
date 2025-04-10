/**
 * Tab management command handlers.
 */

import { ResponseMessage } from '../types';
import { getAgentTab } from '../tab-management/tab-manager';
import { agentTabs } from '../state/state';

/**
 * Initializes an agent tab session
 * @param tabId The agent's tab identifier
 * @returns Promise resolving to a response message
 */
export async function getAgentTabHandler(
  tabId: string,
  _params: Record<string, never>
): Promise<ResponseMessage> {
  console.log(`[tab-commands] Initializing agent tab for ${tabId}`);
  
  try {
    // Get or create a Chrome tab for this agent
    const { chromeTabId, isNew } = await getAgentTab(tabId);
    
    return {
      status: 'ok',
      result: {
        tabId: chromeTabId,
        isNew,
        message: `${isNew ? 'Created new' : 'Using existing'} tab (${chromeTabId}) for agent session ${tabId}.`
      }
    };
  } catch (error) {
    console.error(`[tab-commands] Failed to initialize agent tab for ${tabId}:`, error);
    return {
      status: 'error',
      error: `Failed to initialize agent tab: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}