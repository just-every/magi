/**
 * Search utility functions for the MAGI system.
 *
 * This module provides tools for web searching and information gathering.
 */

import {
    web_search as webSearchLib,
    getSearchTools as getSearchToolsLib,
} from '@just-every/search';
import { ToolFunction } from '@just-every/ensemble';

/**
 * Perform a web search and get results
 *
 * @param inject_agent_id - Agent ID for tracking
 * @param engine - The search engine
 * @param query - The search query
 * @param numResults - Number of results to return (default: 5)
 * @returns Search results
 */
export async function web_search(
    inject_agent_id: string,
    engine: string,
    query: string,
    numResults?: number
): Promise<string> {
    // Use the web_search library with inject_agent_id
    return webSearchLib(inject_agent_id, engine, query, numResults);
}

/**
 * Get all search tools as an array of tool definitions
 */
export function getSearchTools(): ToolFunction[] {
    return getSearchToolsLib();
}
