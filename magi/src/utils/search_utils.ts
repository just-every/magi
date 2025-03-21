/**
 * Search utility functions for the MAGI system.
 *
 * This module provides tools for web searching and information gathering.
 */

import axios from 'axios';
import { ToolDefinition } from '../types.js';
import 'dotenv/config';

const DEFAULT_RESULTS_COUNT = 5;

// Brave Search API configuration
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
const BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Search using the Brave Search API
 *
 * @param query - Search query
 * @param numResults - Number of results to return (default: 5)
 * @returns Search results from Brave API
 */
async function braveSearch(
  query: string,
  numResults: number = DEFAULT_RESULTS_COUNT
): Promise<{ success: boolean; results: any[]; message: string }> {
  console.log(`Performing Brave API search for: ${query}`);

  if (!BRAVE_API_KEY) {
    throw new Error('BRAVE_API_KEY not set');
  }

  const response = await axios.get(BRAVE_SEARCH_ENDPOINT, {
    params: {
      q: query,
      count: numResults
    },
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': BRAVE_API_KEY
    }
  });

  if (response.data && response.data.web && response.data.web.results) {
    const results = response.data.web.results.map((result: any) => ({
      title: result.title,
      url: result.url,
      snippet: result.description
    }));

    return {
      success: true,
      results,
      message: `Found ${results.length} results for "${query}" using Brave Search API`
    };
  }
  throw new Error(`Invalid response from Brave ${response}`);
}

/**
 * Perform a web search
 *
 * @param query - Search query
 * @param numResults - Number of results to return (default: 5)
 * @returns Search results
 */
export async function webSearch(
  query: string,
  numResults: number = DEFAULT_RESULTS_COUNT
): Promise<{ success: boolean; results: any[]; message: string }> {
  return await braveSearch(query, numResults);
}

/**
 * Web search tool definition
 */
export const webSearchTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Perform a web search and get results',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        num_results: {
          type: 'number',
          description: 'Number of results to return (default: 5)'
        },
      },
      required: ['query']
    }
  }
};

/**
 * Get all search tools as an array of tool definitions
 */
export function getSearchTools(): ToolDefinition[] {
  return [
    webSearchTool,
  ];
}

/**
 * Search tool implementations mapped by name for easy lookup
 */
export const searchToolImplementations: Record<string, (...args: any[]) => any | Promise<any>> = {
  'web_search': webSearch,
};
