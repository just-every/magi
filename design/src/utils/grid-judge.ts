/**
 * Grid Judge - Shared image grid creation and selection utility
 *
 * Provides a consistent way to create grid images and select the best items
 * for both design search and image generation workflows.
 */

import {
    createNumberedGrid,
    selectBestFromGrid,
    ImageSource,
} from '../design-search.js';
import { DESIGN_ASSET_TYPES } from '../constants.js';

/**
 * Options for judging a set of images
 */
export interface JudgeOptions<T> {
    /** Array of items to judge */
    items: T[];

    /** Prompt or context to use for judging */
    prompt: string;

    /** Maximum number of items to select */
    selectLimit: number;

    /** Set of already processed IDs to avoid re-processing */
    processedIds: Set<string>;

    /** Function to get a unique ID for an item */
    getId: (item: T) => string;

    /** Function to convert an item to an ImageSource for grid creation */
    toImageSource: (item: T) => ImageSource;

    /** Name prefix for the grid (default: 'grid') */
    gridName?: string;

    /** Whether this is for design search (true) or image generation (false) */
    isDesignSearch?: boolean;

    /** Optional asset type for specialized judging criteria */
    type?: DESIGN_ASSET_TYPES;

    /** Optional guide text for the judge */
    judgeGuide?: string;
}

/**
 * Judge a set of images and select the best ones
 *
 * This is a shared implementation used by both the design search and
 * image generation workflows.
 *
 * @param opts Options for judging
 * @returns Array of selected items
 */
export async function judgeImageSet<T>(opts: JudgeOptions<T>): Promise<T[]> {
    const {
        items,
        prompt,
        selectLimit,
        processedIds,
        getId,
        toImageSource,
        gridName = 'grid',
        isDesignSearch = true,
        type,
        judgeGuide,
    } = opts;

    // Filter out items that have already been processed
    const unprocessedItems = items.filter(
        item => !processedIds.has(getId(item))
    );

    if (unprocessedItems.length === 0) return [];

    // Create groups of max 9 items for evaluation
    const groups: T[][] = [];

    // Group into batches of up to 9 items
    for (let i = 0; i < unprocessedItems.length; i += 9) {
        const group = unprocessedItems.slice(
            i,
            Math.min(i + 9, unprocessedItems.length)
        );
        if (group.length > 0) {
            groups.push(group);
        }
    }

    const groupName = gridName || 'grid';
    console.log(
        `[${groupName}] Processing ${groups.length} groups for judging`
    );

    // Process all groups and collect results
    const winners: T[] = [];

    // Process each group
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];

        // Create a name for this specific group
        const thisGridName = `${groupName}_${i + 1}`;

        // Create grid from the group's items
        const grid = await createNumberedGrid(
            group.map(toImageSource),
            thisGridName
        );

        // Select the best items from the grid
        const picks = await selectBestFromGrid(
            grid,
            prompt,
            group.length,
            selectLimit, // Max number to select from this group
            isDesignSearch,
            type,
            judgeGuide
        );

        console.log(`[${thisGridName}] Selected indexes:`, picks);

        // Add selected items to winners and mark as processed
        for (const idx of picks) {
            const item = group[idx - 1];
            winners.push(item);
            processedIds.add(getId(item));
        }
    }

    return winners;
}