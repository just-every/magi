/**
 * Design Search Utility
 *
 * Provides tools for searching design inspiration from various sources including:
 * - Dribbble
 * - Behance
 * - Envato/ThemeForest
 * - Pinterest
 * - Landingfolio
 * - Awwwards
 * - SiteInspire
 *
 * Each source has specific capabilities and limitations as noted
 */

import fs from 'fs';
import path from 'path';
import { getAgentBrowserSession } from './browser_session.js';
import { quick_llm_call } from './llm_call_utils.js';
import { web_search } from './search_utils.js';
import { v4 as uuidv4 } from 'uuid';

// Type definitions
export interface DesignSearchResult {
    url: string;
    title?: string;
    thumbnail?: string;
    screenshotPath?: string;
}

export type DesignSearchEngine =
    | 'dribbble'
    | 'behance'
    | 'envato'
    | 'pinterest'
    | 'landingfolio'
    | 'awwwards'
    | 'siteinspire'
    | 'generic_web';

export interface DesignSearchOptions {
    query: string;
    engine: DesignSearchEngine;
    limit?: number;
    takeScreenshots?: boolean;
}

// Base directory for storing screenshots
const DESIGN_ASSETS_DIR = path.join(process.cwd(), 'design_assets');

/**
 * Ensure the design assets directory exists
 */
function ensureDesignAssetsDir() {
    if (!fs.existsSync(DESIGN_ASSETS_DIR)) {
        fs.mkdirSync(DESIGN_ASSETS_DIR, { recursive: true });
    }

    const screenshotsDir = path.join(DESIGN_ASSETS_DIR, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }
}

/**
 * Take a screenshot of a URL
 *
 * @param url URL to screenshot
 * @returns Path to the screenshot file
 */
async function takeScreenshot(url: string): Promise<string | null> {
    try {
        ensureDesignAssetsDir();

        // Generate a filename
        const filename = `${uuidv4()}.png`;
        const filePath = path.join(DESIGN_ASSETS_DIR, 'screenshots', filename);

        // Use browserStatus instead of direct browser manipulation
        const session = getAgentBrowserSession('screenshot-session');

        // Navigate to the URL
        await session.navigate(url);

        // Wait a bit for lazy-loaded content
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Take screenshot using browserStatus
        const status = await session.browserStatus();

        if ('error' in status) {
            throw new Error(`Browser error: ${status.error}`);
        }

        // Extract the base64 image data
        const base64Data = status.screenshot.replace(/^data:image\/png;base64,/, '');

        // Write to file
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        return filePath;
    } catch (error) {
        console.error(`Error taking screenshot of ${url}:`, error);
        return null;
    }
}

/**
 * Search for design inspiration on Dribbble
 */
async function searchDribbble(query: string, limit: number = 10): Promise<DesignSearchResult[]> {
    try {
        // Dribbble doesn't have a public API, so we'll use a web search approach
        const searchQuery = `site:dribbble.com ${query} web design`;
        const searchResultsStr = await web_search('design-agent', 'anthropic', searchQuery, limit);

        // Parse the JSON result
        const searchResults = JSON.parse(searchResultsStr);

        if (!Array.isArray(searchResults)) {
            console.warn('Search results is not an array:', searchResults);
            return [];
        }

        // Filter results to only include dribbble shots
        const filteredResults = searchResults.filter(result =>
            result && result.url && result.url.includes('dribbble.com/shots/')
        );

        return filteredResults.map(result => ({
            url: result.url,
            title: result.title,
            thumbnail: result.image_url || undefined
        }));
    } catch (error) {
        console.error('Error in searchDribbble:', error);
        return [];
    }
}

/**
 * Search for design inspiration on Behance
 */
async function searchBehance(query: string, limit: number = 10): Promise<DesignSearchResult[]> {
    try {
        // Behance doesn't have a simple public API, so we'll use a web search approach
        const searchQuery = `site:behance.net ${query} web design`;
        const searchResultsStr = await web_search('design-agent', 'anthropic', searchQuery, limit);

        // Parse the JSON result
        const searchResults = JSON.parse(searchResultsStr);

        if (!Array.isArray(searchResults)) {
            console.warn('Search results is not an array:', searchResults);
            return [];
        }

        // Filter results to only include behance projects
        const filteredResults = searchResults.filter(result =>
            result && result.url && result.url.includes('behance.net/gallery/')
        );

        return filteredResults.map(result => ({
            url: result.url,
            title: result.title,
            thumbnail: result.image_url || undefined
        }));
    } catch (error) {
        console.error('Error in searchBehance:', error);
        return [];
    }
}

/**
 * Search for design inspiration on Envato/ThemeForest
 */
async function searchEnvato(query: string, limit: number = 10): Promise<DesignSearchResult[]> {
    try {
        const searchQuery = `site:themeforest.net ${query} website template`;
        const searchResultsStr = await web_search('design-agent', 'anthropic', searchQuery, limit);

        // Parse the JSON result
        const searchResults = JSON.parse(searchResultsStr);

        if (!Array.isArray(searchResults)) {
            console.warn('Search results is not an array:', searchResults);
            return [];
        }

        return searchResults.map(result => ({
            url: result.url,
            title: result.title,
            thumbnail: result.image_url || undefined
        }));
    } catch (error) {
        console.error('Error in searchEnvato:', error);
        return [];
    }
}

/**
 * Search for design inspiration on Pinterest
 */
async function searchPinterest(query: string, limit: number = 10): Promise<DesignSearchResult[]> {
    try {
        const searchQuery = `site:pinterest.com ${query} web design`;
        const searchResultsStr = await web_search('design-agent', 'anthropic', searchQuery, limit);

        // Parse the JSON result
        const searchResults = JSON.parse(searchResultsStr);

        if (!Array.isArray(searchResults)) {
            console.warn('Search results is not an array:', searchResults);
            return [];
        }

        return searchResults.map(result => ({
            url: result.url,
            title: result.title,
            thumbnail: result.image_url || undefined
        }));
    } catch (error) {
        console.error('Error in searchPinterest:', error);
        return [];
    }
}

/**
 * Search for design inspiration on Landingfolio
 */
async function searchLandingfolio(query: string, limit: number = 10): Promise<DesignSearchResult[]> {
    try {
        const searchQuery = `site:landingfolio.com ${query}`;
        const searchResultsStr = await web_search('design-agent', 'anthropic', searchQuery, limit);

        // Parse the JSON result
        const searchResults = JSON.parse(searchResultsStr);

        if (!Array.isArray(searchResults)) {
            console.warn('Search results is not an array:', searchResults);
            return [];
        }

        return searchResults.map(result => ({
            url: result.url,
            title: result.title,
            thumbnail: result.image_url || undefined
        }));
    } catch (error) {
        console.error('Error in searchLandingfolio:', error);
        return [];
    }
}

/**
 * Search for design inspiration on Awwwards
 */
async function searchAwwwards(query: string, limit: number = 10): Promise<DesignSearchResult[]> {
    try {
        const searchQuery = `site:awwwards.com ${query} website`;
        const searchResultsStr = await web_search('design-agent', 'anthropic', searchQuery, limit);

        // Parse the JSON result
        const searchResults = JSON.parse(searchResultsStr);

        if (!Array.isArray(searchResults)) {
            console.warn('Search results is not an array:', searchResults);
            return [];
        }

        // Filter to only include websites, not articles
        const filteredResults = searchResults.filter(result =>
            result && result.url && result.url.includes('/websites/')
        );

        return filteredResults.map(result => ({
            url: result.url,
            title: result.title,
            thumbnail: result.image_url || undefined
        }));
    } catch (error) {
        console.error('Error in searchAwwwards:', error);
        return [];
    }
}

/**
 * Search for design inspiration on SiteInspire
 */
async function searchSiteInspire(query: string, limit: number = 10): Promise<DesignSearchResult[]> {
    try {
        const searchQuery = `site:siteinspire.com ${query}`;
        const searchResultsStr = await web_search('design-agent', 'anthropic', searchQuery, limit);

        // Parse the JSON result
        const searchResults = JSON.parse(searchResultsStr);

        if (!Array.isArray(searchResults)) {
            console.warn('Search results is not an array:', searchResults);
            return [];
        }

        return searchResults.map(result => ({
            url: result.url,
            title: result.title,
            thumbnail: result.image_url || undefined
        }));
    } catch (error) {
        console.error('Error in searchSiteInspire:', error);
        return [];
    }
}

/**
 * Generic web search for websites related to a query
 */
async function genericWebSearch(query: string, limit: number = 10): Promise<DesignSearchResult[]> {
    try {
        // Use LLM to generate a better search query
        const enhancedQuery = await quick_llm_call(
            `I need to find examples of websites in the following category: "${query}".
            Generate a web search query that will help me find the best examples of real websites (not articles about websites) in this category.
            Return ONLY the search query with no additional explanation.`,
            'reasoning_mini'
        );

        // Use the enhanced query to search for websites
        const searchResultsStr = await web_search('design-agent', 'anthropic', enhancedQuery.trim(), limit);

        // Parse the JSON result
        const searchResults = JSON.parse(searchResultsStr);

        if (!Array.isArray(searchResults)) {
            console.warn('Search results is not an array:', searchResults);
            return [];
        }

        // Filter out results that are clearly not websites (e.g., articles about websites)
        const websiteResults = searchResults.filter(result => {
            if (!result || !result.url) return false;

            // Exclude common non-website results
            return !result.url.includes('wikipedia.org') &&
                !result.url.includes('youtube.com') &&
                !result.url.includes('amazon.com') &&
                !result.url.includes('reddit.com');
        });

        return websiteResults.map(result => ({
            url: result.url,
            title: result.title,
            thumbnail: result.image_url || undefined
        }));
    } catch (error) {
        console.error('Error in genericWebSearch:', error);
        return [];
    }
}

/**
 * Main function to search for design inspiration
 */
export async function design_search(options: DesignSearchOptions): Promise<{ results: DesignSearchResult[] }> {
    const { query, engine, limit = 10, takeScreenshots = false } = options;

    // Select the appropriate search function based on the engine
    let results: DesignSearchResult[];

    switch (engine) {
        case 'dribbble':
            results = await searchDribbble(query, limit);
            break;
        case 'behance':
            results = await searchBehance(query, limit);
            break;
        case 'envato':
            results = await searchEnvato(query, limit);
            break;
        case 'pinterest':
            results = await searchPinterest(query, limit);
            break;
        case 'landingfolio':
            results = await searchLandingfolio(query, limit);
            break;
        case 'awwwards':
            results = await searchAwwwards(query, limit);
            break;
        case 'siteinspire':
            results = await searchSiteInspire(query, limit);
            break;
        case 'generic_web':
        default:
            results = await genericWebSearch(query, limit);
            break;
    }

    // Limit results
    results = results.slice(0, limit);

    // Take screenshots if requested
    if (takeScreenshots) {
        const screenshotPromises = results.map(async (result) => {
            const screenshotPath = await takeScreenshot(result.url);
            if (screenshotPath) {
                result.screenshotPath = screenshotPath;
            }
            return result;
        });

        results = await Promise.all(screenshotPromises);
    }

    return { results };
}

/**
 * Create a custom tool for design_search
 */
export function createDesignSearchTool() {
    return {
        name: 'design_search',
        description: 'Search for design inspiration from various sources',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query, e.g. "b2b customer support homepage"'
                },
                engine: {
                    type: 'string',
                    enum: ['dribbble', 'behance', 'envato', 'pinterest', 'landingfolio', 'awwwards', 'siteinspire', 'generic_web'],
                    description: 'The design platform to search for inspiration'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results to return (default: 10)'
                },
                takeScreenshots: {
                    type: 'boolean',
                    description: 'Whether to capture screenshots of the websites (default: false)'
                }
            },
            required: ['query', 'engine']
        },
        function: design_search
    };
}
