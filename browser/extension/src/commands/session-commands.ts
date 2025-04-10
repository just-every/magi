/**
 * Session management command handlers.
 */

import { ResponseMessage, SwitchTabParams } from '../types';
import { agentTabs, updateAgentTabActivity, registerAgentTab, getAgentTabIdByChromeTabId } from '../state/state';
import { closeAgentSession } from '../tab-management/tab-manager';
import { clearElementMap } from '../storage/element-storage';

/**
 * Switches between tabs or creates a new tab
 * @param tabId The agent's current tab identifier
 * @param params Switch tab parameters
 * @returns Promise resolving to a response message
 */
export async function switchTabHandler(
  tabId: string,
  params: SwitchTabParams
): Promise<ResponseMessage> {
  console.log(`[session-commands] Switching tab type: ${params.type}`);
  
  try {
    if (params.type === 'active') {
      // Get the active tab
      const activeTabs = await chrome.tabs.query({active: true, currentWindow: true});
      if (activeTabs.length === 0) {
        return {
          status: 'error',
          error: 'No active tab found in current window.'
        };
      }
      
      const activeTab = activeTabs[0];
      if (!activeTab.id) {
        return {
          status: 'error',
          error: 'Active tab has no ID.'
        };
      }
      
      // Check if this tab is already associated with an agent
      const existingAgentId = getAgentTabIdByChromeTabId(activeTab.id);
      if (existingAgentId) {
        return {
          status: 'error',
          error: `Active tab is already associated with agent ${existingAgentId}.`
        };
      }
      
      // Associate this tab with the agent
      registerAgentTab(tabId, activeTab.id);
      await clearElementMap(tabId); // Clear element map for the new tab
      
      return {
        status: 'ok',
        result: {
          tabId: activeTab.id,
          message: `Successfully switched to active tab (${activeTab.id}) for agent ${tabId}.`
        }
      };
    }
    else if (params.type === 'new') {
      // Create a new tab
      const newTab = await chrome.tabs.create({url: 'about:blank'});
      if (!newTab.id) {
        return {
          status: 'error',
          error: 'Failed to create new tab.'
        };
      }
      
      // Register the new tab
      registerAgentTab(tabId, newTab.id);
      await clearElementMap(tabId); // Clear element map for the new tab
      
      return {
        status: 'ok',
        result: {
          tabId: newTab.id,
          message: `Successfully created new tab (${newTab.id}) for agent ${tabId}.`
        }
      };
    }
    else if (params.type === 'id') {
      if (!params.tabId) {
        return {
          status: 'error',
          error: 'Tab ID is required for tab type "id".'
        };
      }
      
      // Look up tab by chrome tab ID
      const targetTabId = Number(params.tabId);
      if (isNaN(targetTabId)) {
        return {
          status: 'error',
          error: `Invalid tab ID: ${params.tabId}`
        };
      }
      
      try {
        const tab = await chrome.tabs.get(targetTabId);
        if (!tab.id) {
          return {
            status: 'error',
            error: `Tab ${targetTabId} not found or has no ID.`
          };
        }
        
        // Check if this tab is already associated with another agent
        const existingAgentId = getAgentTabIdByChromeTabId(tab.id);
        if (existingAgentId && existingAgentId !== tabId) {
          return {
            status: 'error',
            error: `Tab ${targetTabId} is already associated with agent ${existingAgentId}.`
          };
        }
        
        // Associate this tab with the agent
        registerAgentTab(tabId, tab.id);
        await clearElementMap(tabId); // Clear element map for the new tab
        
        return {
          status: 'ok',
          result: {
            tabId: tab.id,
            message: `Successfully switched to tab (${tab.id}) for agent ${tabId}.`
          }
        };
      } catch (error) {
        return {
          status: 'error',
          error: `Tab ${targetTabId} not found: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
    else {
      return {
        status: 'error',
        error: `Unsupported tab type: ${params.type}`
      };
    }
  } catch (error) {
    console.error(`[session-commands] Failed to switch tab for ${tabId}:`, error);
    return {
      status: 'error',
      error: `Failed to switch tab: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Closes an agent's tab and cleans up resources
 * @param tabId The agent's tab identifier
 * @returns Promise resolving to a response message
 */
export async function closeAgentSessionHandler(
  tabId: string,
  _params: Record<string, never>
): Promise<ResponseMessage> {
  console.log(`[session-commands] Closing agent session for ${tabId}`);
  
  try {
    if (!agentTabs[tabId]) {
      return {
        status: 'ok',
        result: `No active session found for ${tabId}.`
      };
    }
    
    updateAgentTabActivity(tabId);
    
    // Close the tab and clean up
    const result = await closeAgentSession(tabId);
    return result;
  } catch (error) {
    console.error(`[session-commands] Error closing session for ${tabId}:`, error);
    return {
      status: 'error',
      error: `Failed to close session: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}