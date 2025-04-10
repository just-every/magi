/**
 * Element map storage utilities for the MAGI browser extension.
 */

import { MAP_STORAGE_PREFIX } from '../config/config';
import { ElementInfo } from '../types';

/**
 * Stores element map data in session storage for a specific tab
 * @param agentTabId The agent tab ID
 * @param idMap The element ID to element info map
 * @returns Promise resolving when storage is complete
 */
export async function storeElementMap(
  agentTabId: string,
  idMap: Map<number, ElementInfo>
): Promise<void> {
  const storageKey = `${MAP_STORAGE_PREFIX}${agentTabId}`;
  console.log(`[element-storage] Storing element map for ${agentTabId} with ${idMap.size} elements.`);
  
  try {
    // Convert Map to array of entries for storage
    const mapArray = Array.from(idMap.entries());
    
    // Store in chrome.storage.session (auto-clears when browser closes)
    await chrome.storage.session.set({ [storageKey]: mapArray });
    
    console.log(`[element-storage] Element map stored for ${agentTabId}`);
  } catch (error) {
    console.error(`[element-storage] Error storing element map for ${agentTabId}:`, error);
    throw new Error(`Failed to store element map: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Retrieves element map data from session storage for a specific tab
 * @param agentTabId The agent tab ID
 * @returns Promise resolving to the element map or null if not found
 */
export async function getElementMap(
  agentTabId: string
): Promise<Map<number, ElementInfo> | null> {
  const storageKey = `${MAP_STORAGE_PREFIX}${agentTabId}`;
  console.log(`[element-storage] Retrieving element map for ${agentTabId}...`);
  
  try {
    const result = await chrome.storage.session.get(storageKey);
    const mapArray = result[storageKey] as [number, ElementInfo][] | undefined;
    
    if (!mapArray || !Array.isArray(mapArray)) {
      console.log(`[element-storage] No element map found for ${agentTabId}.`);
      return null;
    }
    
    // Convert array of entries back to Map
    const idMap = new Map<number, ElementInfo>(mapArray);
    console.log(`[element-storage] Retrieved element map for ${agentTabId} with ${idMap.size} elements.`);
    
    return idMap;
  } catch (error) {
    console.error(`[element-storage] Error retrieving element map for ${agentTabId}:`, error);
    return null;
  }
}

/**
 * Removes element map data from session storage for a specific tab
 * @param agentTabId The agent tab ID to clear storage for
 * @returns Promise resolving when cleared
 */
export async function clearElementMap(agentTabId: string): Promise<void> {
  const storageKey = `${MAP_STORAGE_PREFIX}${agentTabId}`;
  console.log(`[element-storage] Clearing element map for ${agentTabId}...`);
  
  try {
    await chrome.storage.session.remove(storageKey);
    console.log(`[element-storage] Element map cleared for ${agentTabId}.`);
  } catch (error) {
    console.error(`[element-storage] Error clearing element map for ${agentTabId}:`, error);
  }
}

/**
 * Gets a specific element from the stored map
 * @param agentTabId The agent tab ID
 * @param elementId The element ID to retrieve
 * @returns Promise resolving to the element info or null if not found
 */
export async function getElementById(
  agentTabId: string,
  elementId: number
): Promise<ElementInfo | null> {
  const idMap = await getElementMap(agentTabId);
  
  if (!idMap) {
    console.warn(`[element-storage] No element map available for ${agentTabId} to retrieve element ${elementId}.`);
    return null;
  }
  
  const element = idMap.get(elementId);
  
  if (!element) {
    console.warn(`[element-storage] Element ${elementId} not found in map for ${agentTabId}.`);
    return null;
  }
  
  return element;
}