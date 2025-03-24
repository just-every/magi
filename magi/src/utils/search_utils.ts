/**
 * Search utility functions for the MAGI system.
 *
 * This module provides tools for web searching and information gathering.
 */

import axios from 'axios';
import {ToolFunction} from '../types.js';
import 'dotenv/config';
import {createToolFunction} from './tool_call.js';

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
): Promise<string> {
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

		return JSON.stringify(results);
	}
	throw new Error(`Invalid response from Brave ${response}`);
}

/**
 * Perform a web search and get results
 *
 * @param query - The search query
 * @param numResults - Number of results to return (default: 5)
 * @returns Search results
 */
export async function web_search(
	query: string,
	numResults: number = DEFAULT_RESULTS_COUNT
): Promise<string> {
	return await braveSearch(query, numResults);
}

/**
 * Get all search tools as an array of tool definitions
 */
export function getSearchTools(): ToolFunction[] {
	return [
		createToolFunction(
			web_search,
			'Perform a web search and get results',
			{'query': 'The search query', 'numResults': { type: 'number', description: 'Number of results to return (default: 5)'}}
		)
	];
}
