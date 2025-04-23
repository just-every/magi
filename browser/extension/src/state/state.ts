/**
 * Global state management for the MAGI browser extension.
 */

import { AgentTabInfo } from '../types';

// Native messaging port connection
export let nativePort: chrome.runtime.Port | null = null;

// Track the dedicated MAGI window ID
export let magiWindowId: number | null = null;

// Track agent tabs: { agentTabId: { chromeTabId, lastActive: timestamp, groupId } }
// This state is inherently volatile and tied to live tabs, so in-memory is acceptable.
// It will be rebuilt as needed via getAgentTab.
export const agentTabs: Record<string, AgentTabInfo> = {};

// Keep track of tabs we've attached the debugger to
export const attachedDebuggerTabs = new Set<number>();

/**
 * Updates the last active timestamp for an agent tab
 * @param agentTabId The agent's tab identifier
 */
export function updateAgentTabActivity(agentTabId: string): void {
    if (agentTabs[agentTabId]) {
        agentTabs[agentTabId].lastActive = Date.now();
    }
}

/**
 * Records a new agent tab mapping
 * @param agentTabId The agent's tab identifier
 * @param chromeTabId The Chrome tab ID
 * @param groupId Optional tab group ID
 */
export function registerAgentTab(
    agentTabId: string,
    chromeTabId: number,
    groupId?: number
): void {
    agentTabs[agentTabId] = {
        chromeTabId,
        lastActive: Date.now(),
        groupId,
    };
}

/**
 * Removes an agent tab mapping
 * @param agentTabId The agent's tab identifier to remove
 */
export function removeAgentTab(agentTabId: string): void {
    delete agentTabs[agentTabId];
}

/**
 * Checks if a Chrome tab is associated with any agent
 * @param chromeTabId The Chrome tab ID to check
 * @returns The agent tab ID if found, undefined otherwise
 */
export function getAgentTabIdByChromeTabId(
    chromeTabId: number
): string | undefined {
    for (const [agentTabId, info] of Object.entries(agentTabs)) {
        if (info.chromeTabId === chromeTabId) {
            return agentTabId;
        }
    }
    return undefined;
}

/**
 * Gets all inactive agent tabs (no activity for longer than specified time)
 * @param inactivityThreshold Milliseconds of inactivity to consider a tab inactive
 * @returns Array of agent tab IDs that are inactive
 */
export function getInactiveAgentTabs(inactivityThreshold: number): string[] {
    const now = Date.now();
    return Object.entries(agentTabs)
        .filter(([, info]) => now - info.lastActive > inactivityThreshold)
        .map(([agentTabId]) => agentTabId);
}

/**
 * Sets the native port connection
 * @param port The Chrome runtime port object
 */
export function setNativePort(port: chrome.runtime.Port | null): void {
    nativePort = port;
}

/**
 * Sets the dedicated MAGI window ID
 * @param windowId The Chrome window ID
 */
export function setMagiWindowId(windowId: number | null): void {
    magiWindowId = windowId;
}
