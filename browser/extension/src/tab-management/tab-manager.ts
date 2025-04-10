/**
 * Tab management functions for the MAGI browser extension.
 */

import { agentTabs, registerAgentTab, removeAgentTab, getInactiveAgentTabs, updateAgentTabActivity } from '../state/state';
import { TAB_GROUP_NAME, TAB_GROUP_COLOR, TAB_GROUP_COLLAPSED, TAB_INACTIVITY_TIMEOUT, NAVIGATION_TIMEOUT_MS } from '../config/config';
import { ResponseMessage } from '../types';

/**
 * Gets or creates a Chrome tab for an agent session
 * @param agentTabId The unique agent identifier
 * @returns Promise resolving to a tab info object
 */
export async function getAgentTab(agentTabId: string): Promise<{
  chromeTabId: number,
  isNew: boolean
}> {
  console.log(`[tab-manager] Getting tab for agent: ${agentTabId}`);
  
  // If we already have a tab for this agent, check if it still exists
  if (agentTabs[agentTabId]) {
    try {
      const tab = await chrome.tabs.get(agentTabs[agentTabId].chromeTabId);
      if (tab && !tab.discarded) {
        console.log(`[tab-manager] Using existing tab ${tab.id} for agent ${agentTabId}`);
        updateAgentTabActivity(agentTabId);
        return { chromeTabId: tab.id!, isNew: false };
      }
    } catch (error) {
      console.warn(`[tab-manager] Tab for agent ${agentTabId} no longer exists, creating new tab.`);
      // Tab doesn't exist anymore, we'll create a new one
    }
  }
  
  // Create a new tab
  console.log(`[tab-manager] Creating new tab for agent ${agentTabId}`);
  const newTab = await chrome.tabs.create({
    url: 'about:blank',
    active: false
  });
  
  // Create or get tab group
  let groupId: number | undefined;
  try {
    // See if we have an existing MAGI group
    const groups = await chrome.tabGroups.query({ title: TAB_GROUP_NAME });
    
    if (groups.length > 0) {
      groupId = groups[0].id;
      console.log(`[tab-manager] Using existing tab group: ${groupId}`);
    } else {
      // Create a new group
      const tabIds = [newTab.id!];
      groupId = await chrome.tabs.group({ tabIds });
      
      // Set group properties
      await chrome.tabGroups.update(groupId, {
        title: TAB_GROUP_NAME,
        color: TAB_GROUP_COLOR as chrome.tabGroups.ColorEnum,
        collapsed: TAB_GROUP_COLLAPSED
      });
      
      console.log(`[tab-manager] Created new tab group: ${groupId}`);
    }
    
    // Add this tab to the group if not already there
    if (groups.length > 0) {
      await chrome.tabs.group({
        groupId,
        tabIds: [newTab.id!]
      });
    }
    
  } catch (error) {
    console.error('[tab-manager] Error managing tab group:', error);
    // Continue without group if group API fails
  }
  
  // Register the new tab
  registerAgentTab(agentTabId, newTab.id!, groupId);
  
  return { chromeTabId: newTab.id!, isNew: true };
}

/**
 * Closes inactive agent tabs to conserve resources
 */
export async function closeInactiveTabs(): Promise<void> {
  const inactiveAgentTabs = getInactiveAgentTabs(TAB_INACTIVITY_TIMEOUT);
  
  if (inactiveAgentTabs.length === 0) {
    return;
  }
  
  console.log(`[tab-manager] Closing ${inactiveAgentTabs.length} inactive tabs...`);
  
  for (const agentTabId of inactiveAgentTabs) {
    try {
      const chromeTabId = agentTabs[agentTabId].chromeTabId;
      
      // Close the tab
      await chrome.tabs.remove(chromeTabId);
      console.log(`[tab-manager] Closed inactive tab ${chromeTabId} for agent ${agentTabId}`);
      
      // Remove from our tracking
      removeAgentTab(agentTabId);
    } catch (error) {
      console.error(`[tab-manager] Error closing inactive tab for agent ${agentTabId}:`, error);
    }
  }
}

/**
 * Waits for a tab's navigation to complete with timeout
 * @param chromeTabId The Chrome tab ID
 * @param url The URL being navigated to (for logging)
 * @returns Promise that resolves when navigation is complete
 */
export function waitForTabComplete(chromeTabId: number, url: string): Promise<ResponseMessage> {
  return new Promise((resolve) => {
    // Timeout for navigation
    const navigationTimeout = setTimeout(() => {
      console.warn(`[tab-manager] Navigation timeout after ${NAVIGATION_TIMEOUT_MS}ms for tab ${chromeTabId} to ${url}`);
      resolve({
        status: 'ok',
        result: `Navigation may not have completed within ${NAVIGATION_TIMEOUT_MS}ms, but proceeding.`
      });
    }, NAVIGATION_TIMEOUT_MS);
    
    // Listen for the tab to complete loading
    const checkTabStatus = () => {
      chrome.tabs.get(chromeTabId, (tab) => {
        if (chrome.runtime.lastError) {
          clearTimeout(navigationTimeout);
          resolve({
            status: 'error',
            error: `Tab ${chromeTabId} no longer exists.`
          });
          return;
        }
        
        if (tab.status === 'complete') {
          clearTimeout(navigationTimeout);
          console.log(`[tab-manager] Tab ${chromeTabId} navigation complete. URL: ${tab.url}`);
          resolve({
            status: 'ok',
            result: `Successfully navigated to ${tab.title || tab.url}.`
          });
          return;
        }
        
        // Keep checking until timeout
        setTimeout(checkTabStatus, 100);
      });
    };
    
    // Start checking
    checkTabStatus();
  });
}

/**
 * Closes an agent's tab and cleans up resources
 * @param agentTabId The agent tab ID
 * @returns Promise resolving to response message
 */
export async function closeAgentSession(agentTabId: string): Promise<ResponseMessage> {
  console.log(`[tab-manager] Closing agent session for ${agentTabId}`);
  
  if (!agentTabs[agentTabId]) {
    return {
      status: 'ok',
      result: `No active session found for ${agentTabId}.`
    };
  }
  
  try {
    const chromeTabId = agentTabs[agentTabId].chromeTabId;
    
    // Close the tab
    await chrome.tabs.remove(chromeTabId);
    
    // Remove from our tracking
    removeAgentTab(agentTabId);
    
    return {
      status: 'ok',
      result: `Successfully closed session for ${agentTabId}.`
    };
  } catch (error) {
    console.error(`[tab-manager] Error closing session for ${agentTabId}:`, error);
    return {
      status: 'error',
      error: `Failed to close session: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
