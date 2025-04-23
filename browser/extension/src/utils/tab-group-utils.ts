/**
 * Utility functions for managing browser tab groups.
 */

import { TAB_GROUP_NAME, TAB_GROUP_COLOR } from '../config/config';

/**
 * Ensures a tab is part of the 'magi' tab group
 * @param tabId The Chrome tab ID to add to a group
 * @returns Promise resolving to the group ID
 */
export async function ensureMagiTabGroup(tabId: number): Promise<number> {
    try {
        // Check if we have existing magi groups
        const groups = await chrome.tabGroups.query({ title: TAB_GROUP_NAME });

        let groupId: number;

        // Handle multiple groups scenario - consolidate into one
        if (groups.length > 1) {
            console.log(
                `[tab-utils] Found ${groups.length} '${TAB_GROUP_NAME}' tab groups - consolidating`
            );

            // Use the first group as the primary one
            groupId = groups[0].id!;

            // Move all tabs from other groups to the primary group
            try {
                for (let i = 1; i < groups.length; i++) {
                    // Get all tabs in this duplicate group
                    const duplicateGroupId = groups[i].id!;

                    try {
                        const tabs = await chrome.tabs.query({
                            groupId: duplicateGroupId,
                        });

                        if (tabs.length > 0) {
                            // Extract tab IDs
                            const tabIds = tabs.map(tab => tab.id!);
                            console.log(
                                `[tab-utils] Moving ${tabIds.length} tabs from group ${duplicateGroupId} to ${groupId}`
                            );

                            // Move tabs to primary group
                            await chrome.tabs.group({
                                groupId: groupId,
                                tabIds: tabIds,
                            });
                        }
                    } catch (tabError) {
                        console.error(
                            `[tab-utils] Error processing group ${duplicateGroupId}:`,
                            tabError
                        );
                        // Continue with next group
                        continue;
                    }
                }
            } catch (moveError) {
                console.error(
                    '[tab-utils] Error consolidating tab groups:',
                    moveError
                );
                // Continue with the primary group even if consolidation fails
            }

            console.log(
                `[tab-utils] Using consolidated '${TAB_GROUP_NAME}' tab group: ${groupId}`
            );
        } else if (groups.length === 1) {
            // Use existing group - normal case
            groupId = groups[0].id!;
            console.log(
                `[tab-utils] Found existing '${TAB_GROUP_NAME}' tab group: ${groupId}`
            );
        } else {
            // Create a new group with this tab
            groupId = await chrome.tabs.group({ tabIds: [tabId] });

            // Set group properties
            await chrome.tabGroups.update(groupId, {
                title: TAB_GROUP_NAME,
                color: TAB_GROUP_COLOR as chrome.tabGroups.ColorEnum,
            });

            console.log(
                `[tab-utils] Created new '${TAB_GROUP_NAME}' tab group: ${groupId}`
            );
            return groupId; // Tab is already in the group we just created
        }

        try {
            // Check if tab is already in this group
            const tab = await chrome.tabs.get(tabId);
            if (tab.groupId !== groupId) {
                // Add tab to the existing group
                await chrome.tabs.group({
                    groupId: groupId,
                    tabIds: [tabId],
                });
                console.log(
                    `[tab-utils] Added tab ${tabId} to '${TAB_GROUP_NAME}' group ${groupId}`
                );
            } else {
                console.log(
                    `[tab-utils] Tab ${tabId} is already in '${TAB_GROUP_NAME}' group ${groupId}`
                );
            }
        } catch (tabError) {
            console.error(
                `[tab-utils] Error getting tab information:`,
                tabError
            );
            // If tab doesn't exist anymore, just continue
        }

        return groupId;
    } catch (error) {
        console.error(`[tab-utils] Error managing tab group:`, error);
        // Return -1 to indicate error
        return -1;
    }
}
