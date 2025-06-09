/**
 * Simplified Design Search Utility for standalone use
 *
 * This is a minimal version that provides the basic functionality needed
 * by the design_image function without browser dependencies.
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { chromium } from 'playwright';
import { quick_llm_call } from './interfaces/mech.js';
import { Agent } from '@just-every/ensemble';
import type { ResponseInput } from '@just-every/ensemble';
import {
    DESIGN_ASSET_REFERENCE,
    DESIGN_SEARCH_DESCRIPTIONS,
    DESIGN_SEARCH_ENGINES,
    DesignSearchEngine,
    DesignSearchResult,
    type DESIGN_ASSET_TYPES,
    type DesignAssetAspect,
} from './constants.js';

const USER_AGENT =
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; design-tool/1.0)';

// Base directory for storing screenshots - configurable
const DEFAULT_ASSETS_DIR = process.env.DESIGN_OUTPUT_DIR || path.join(process.cwd(), '.output');
export const DESIGN_ASSETS_DIR = DEFAULT_ASSETS_DIR;

const SLEEP = (ms = 1000) => new Promise(res => setTimeout(res, ms));

/**
 * Communication manager stub - logs to console instead of sending to UI
 */
const communicationManager = {
    send: (data: any) => {
        console.log(`[DesignSearch] ${data.type}:`, {
            timestamp: data.timestamp,
            prompt: data.prompt,
            data: data.data ? `[${typeof data.data}]` : undefined
        });
    }
};

/**
 * Ensure the design assets directory exists
 */
function ensureDesignAssetsDir() {
    const screenshotsDir = path.join(DESIGN_ASSETS_DIR, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }
}

/**
 * Take a real screenshot of a webpage using Playwright
 */
async function takeScreenshot(
    url: string,
    title?: string
): Promise<string | null> {
    ensureDesignAssetsDir();

    try {
        // Launch browser
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        // Set viewport size
        await page.setViewportSize({ width: 1280, height: 720 });

        // Navigate to page with timeout
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        // Wait a bit more for dynamic content
        await page.waitForTimeout(2000);

        // Generate filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const uniqueId = uuidv4().substring(0, 8);
        const cleanTitle = title ? title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) : 'screenshot';
        const filename = `${cleanTitle}_${timestamp}_${uniqueId}.png`;

        const filePath = path.join(DESIGN_ASSETS_DIR, 'screenshots', filename);

        // Take screenshot
        await page.screenshot({
            path: filePath,
            fullPage: true
        });

        await browser.close();

        console.log(`[DesignSearch] Screenshot saved: ${filePath}`);
        return filePath;

    } catch (error) {
        console.error(`Error taking screenshot of ${url}:`, error);

        // Fallback to placeholder image if screenshot fails
        try {
            const canvas = createCanvas(400, 300);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, 400, 300);

            ctx.fillStyle = '#666';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Screenshot Failed', 200, 140);
            ctx.fillText(url.substring(0, 40) + '...', 200, 160);

            const buffer = canvas.toBuffer('image/png');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const uniqueId = uuidv4().substring(0, 8);
            const cleanTitle = title ? title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) : 'fallback';
            const filename = `${cleanTitle}_${timestamp}_${uniqueId}.png`;

            const filePath = path.join(DESIGN_ASSETS_DIR, 'screenshots', filename);
            fs.writeFileSync(filePath, buffer);

            return filePath;
        } catch (fallbackError) {
            console.error(`Error creating fallback image: ${fallbackError}`);
            return null;
        }
    }
}

/**
 * Search for design inspiration on Dribbble using real web scraping
 */
async function searchDribbble(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        const url = `https://dribbble.com/search/${encodeURIComponent(query)}`;
        console.log(`[DesignSearch] Searching Dribbble: ${query}`);

        // Launch browser
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        // Set user agent to avoid being blocked
        await page.setExtraHTTPHeaders({
            'User-Agent': USER_AGENT
        });

        // Navigate to search page
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for search results to load and scroll to trigger lazy loading
        await page.waitForTimeout(3000);

        // Scroll down to load more content
        await page.evaluate(() => {
            window.scrollTo(0, window.innerHeight);
        });
        await page.waitForTimeout(2000);

        // Extract shot data from the page
        const results = await page.evaluate((limit) => {
            const shots: any[] = [];

            // Look for shot grid items - Dribbble often has these patterns
            const shotSelectors = [
                '.shot-thumbnail a[href*="/shots/"]',  // Classic shot thumbnails
                '[data-react-class*="Shot"] a[href*="/shots/"]',  // React components
                '.media-item a[href*="/shots/"]',  // Media grid items
                'li a[href*="/shots/"]',  // List items with shots
                'a[href*="/shots/"][class*="shot"]'  // Any shot links
            ];

            let foundLinks: HTMLAnchorElement[] = [];

            // Try each selector and collect results
            for (const selector of shotSelectors) {
                const elements = document.querySelectorAll(selector) as NodeListOf<HTMLAnchorElement>;
                foundLinks.push(...Array.from(elements));
            }

            // Filter to only actual shot URLs (not navigation links)
            const shotLinks = foundLinks.filter(link => {
                const href = link.href;
                return href &&
                       href.includes('/shots/') &&
                       /\/shots\/\d+/.test(href) && // Must have shot ID
                       !href.includes('/popular') &&
                       !href.includes('/recent') &&
                       !href.includes('/following');
            });

            // Remove duplicates
            const uniqueLinks = shotLinks.filter((link, index, self) =>
                self.findIndex(l => l.href === link.href) === index
            );

            console.log(`Found ${uniqueLinks.length} unique shot links`);

            for (let i = 0; i < Math.min(uniqueLinks.length, limit); i++) {
                const linkElement = uniqueLinks[i];

                // Extract title from image alt or surrounding text
                let title = '';
                const imgElement = linkElement.querySelector('img');
                if (imgElement) {
                    title = imgElement.alt || imgElement.title || '';
                }

                // Try parent elements for title text
                if (!title) {
                    const parent = linkElement.closest('[data-react-class]') || linkElement.parentElement;
                    const titleElement = parent?.querySelector('h3, h4, .shot-title, [class*="title"]');
                    if (titleElement) {
                        title = titleElement.textContent?.trim() || '';
                    }
                }

                // Extract thumbnail URL
                let thumbnailURL = '';
                if (imgElement) {
                    thumbnailURL = imgElement.src ||
                                  imgElement.getAttribute('data-src') ||
                                  imgElement.getAttribute('data-srcset')?.split(' ')[0] || '';
                }

                shots.push({
                    url: linkElement.href,
                    title: title || `Logo Design Shot ${i + 1}`,
                    thumbnailURL: thumbnailURL || undefined,
                    screenshotURL: thumbnailURL || undefined
                });
            }

            return shots;
        }, limit);

        await browser.close();

        console.log(`[DesignSearch] Found ${results.length} Dribbble results`);
        return results as DesignSearchResult[];

    } catch (error) {
        console.error('Error in searchDribbble:', error);

        // Fallback to basic mock data if scraping fails
        const fallbackResults: DesignSearchResult[] = [];
        for (let i = 0; i < Math.min(limit, 2); i++) {
            fallbackResults.push({
                url: `https://dribbble.com/search/${encodeURIComponent(query)}`,
                title: `${query} Design Reference ${i + 1}`,
                thumbnailURL: undefined,
                screenshotURL: undefined,
            });
        }
        return fallbackResults;
    }
}

/**
 * Search for design inspiration on Behance
 */
async function searchBehance(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        const url = `https://www.behance.net/search/projects?search=${encodeURIComponent(query)}`;
        console.log(`[DesignSearch] Searching Behance: ${query}`);

        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.setExtraHTTPHeaders({
            'User-Agent': USER_AGENT
        });

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for content to load
        await page.waitForTimeout(3000);

        // Extract project data
        const results = await page.evaluate((limit) => {
            const projects: any[] = [];

            // Try multiple selectors for Behance projects
            const selectors = [
                '.qa-search-project-item',
                'div[data-id]',
                'a[href*="/gallery/"]'
            ];

            let projectElements: Element[] = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    projectElements = Array.from(elements);
                    break;
                }
            }

            for (let i = 0; i < Math.min(projectElements.length, limit); i++) {
                const element = projectElements[i];

                // Find link
                const linkElement = element.querySelector('a[href*="/gallery/"]') ||
                                  element.closest('a[href*="/gallery/"]');
                if (!linkElement) continue;

                const url = (linkElement as HTMLAnchorElement).href;

                // Find image
                const imgElement = element.querySelector('img');
                let title = '';
                let thumbnailURL = '';

                if (imgElement) {
                    title = imgElement.alt || imgElement.title || '';
                    thumbnailURL = imgElement.src || imgElement.getAttribute('data-src') || '';

                    // Check for srcset for higher quality
                    const srcset = imgElement.srcset || imgElement.getAttribute('data-srcset');
                    if (srcset) {
                        const sources = srcset.split(',').map(s => s.trim());
                        // Get the highest resolution
                        const highRes = sources[sources.length - 1];
                        if (highRes) {
                            thumbnailURL = highRes.split(' ')[0];
                        }
                    }
                }

                if (url) {
                    projects.push({
                        url,
                        title: title || `Behance Project ${i + 1}`,
                        thumbnailURL,
                        screenshotURL: thumbnailURL
                    });
                }
            }

            return projects;
        }, limit);

        await browser.close();

        console.log(`[DesignSearch] Found ${results.length} Behance results`);
        return results as DesignSearchResult[];

    } catch (error) {
        console.error('Error in searchBehance:', error);
        return [];
    }
}

/**
 * Search for design inspiration on Pinterest
 */
async function searchPinterest(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
        console.log(`[DesignSearch] Searching Pinterest: ${query}`);

        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.setExtraHTTPHeaders({
            'User-Agent': USER_AGENT
        });

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Pinterest needs time to load dynamic content
        await page.waitForTimeout(4000);

        // Scroll to load more pins
        await page.evaluate(() => {
            window.scrollTo(0, window.innerHeight * 2);
        });
        await page.waitForTimeout(2000);

        // Extract pin data
        const results = await page.evaluate((limit) => {
            const pins: any[] = [];

            // Pinterest uses various selectors over time
            const pinElements = document.querySelectorAll('[data-test-id="pin"], div[role="listitem"] a[href*="/pin/"]');

            for (let i = 0; i < Math.min(pinElements.length, limit); i++) {
                const element = pinElements[i];

                // Get the link
                const linkElement = element.tagName === 'A' ? element : element.querySelector('a[href*="/pin/"]');
                if (!linkElement) continue;

                const url = (linkElement as HTMLAnchorElement).href;

                // Get the image
                const imgElement = element.querySelector('img');
                let title = '';
                let thumbnailURL = '';

                if (imgElement) {
                    title = imgElement.alt || '';
                    thumbnailURL = imgElement.src || imgElement.getAttribute('data-src') || '';

                    // Pinterest often has srcset with higher quality
                    const srcset = imgElement.srcset;
                    if (srcset) {
                        const sources = srcset.split(',').map(s => s.trim());
                        // Get 2x or highest resolution
                        for (const source of sources) {
                            if (source.includes('2x') || source.includes('736x')) {
                                thumbnailURL = source.split(' ')[0];
                                break;
                            }
                        }
                    }
                }

                if (url && url.includes('/pin/')) {
                    pins.push({
                        url,
                        title: title || `Pinterest Pin ${i + 1}`,
                        thumbnailURL,
                        screenshotURL: thumbnailURL
                    });
                }
            }

            return pins;
        }, limit);

        await browser.close();

        console.log(`[DesignSearch] Found ${results.length} Pinterest results`);
        return results as DesignSearchResult[];

    } catch (error) {
        console.error('Error in searchPinterest:', error);
        return [];
    }
}

/**
 * Search for design inspiration on Envato Elements
 */
async function searchEnvato(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        const url = `https://elements.envato.com/web-templates?terms=${encodeURIComponent(query)}`;
        console.log(`[DesignSearch] Searching Envato: ${query}`);

        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.setExtraHTTPHeaders({
            'User-Agent': USER_AGENT
        });

        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        // Wait for results to load
        await page.waitForTimeout(3000);

        // Extract template data
        const results = await page.evaluate((limit) => {
            const templates: any[] = [];

            // Envato uses various selectors
            const itemElements = document.querySelectorAll(
                'a[data-testid="item-link"], ' +
                'div[data-testid="default-card"] a, ' +
                'a[href*="/web-templates/"]'
            );

            const uniqueUrls = new Set<string>();

            for (const element of itemElements) {
                if (templates.length >= limit) break;

                const linkElement = element as HTMLAnchorElement;
                const url = linkElement.href;

                // Skip if we've already processed this URL
                if (!url || uniqueUrls.has(url)) continue;
                uniqueUrls.add(url);

                // Find the image within this item
                const imgElement = linkElement.querySelector('img') ||
                                 linkElement.parentElement?.querySelector('img');

                let title = '';
                let thumbnailURL = '';

                if (imgElement) {
                    title = imgElement.alt || '';
                    thumbnailURL = imgElement.src || imgElement.getAttribute('data-src') || '';

                    // Look for srcset for higher quality
                    const srcset = imgElement.srcset || imgElement.getAttribute('data-srcset');
                    if (srcset) {
                        // Parse srcset and get highest resolution
                        const sources = srcset.split(',').map(s => s.trim());
                        for (const source of sources) {
                            if (source.includes('710w') || source.includes('800w')) {
                                thumbnailURL = source.split(' ')[0];
                                break;
                            }
                        }
                    }
                }

                // Try to get title from other elements if not from image
                if (!title) {
                    const titleElement = linkElement.querySelector('h3, h4, [class*="title"]');
                    if (titleElement) {
                        title = titleElement.textContent?.trim() || '';
                    }
                }

                if (url && (url.includes('/web-templates/') || url.includes('elements.envato.com'))) {
                    templates.push({
                        url,
                        title: title || `Envato Template`,
                        thumbnailURL,
                        screenshotURL: thumbnailURL
                    });
                }
            }

            return templates;
        }, limit);

        await browser.close();

        console.log(`[DesignSearch] Found ${results.length} Envato results`);
        return results as DesignSearchResult[];

    } catch (error) {
        console.error('Error in searchEnvato:', error);
        return [];
    }
}

/**
 * Search for award-winning web designs on Awwwards
 */
async function searchAwwwards(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        // Awwwards doesn't have a search, so we browse their collections
        const url = 'https://www.awwwards.com/websites/';
        console.log(`[DesignSearch] Browsing Awwwards for inspiration related to: ${query}`);

        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.setExtraHTTPHeaders({
            'User-Agent': USER_AGENT
        });

        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        // Wait for content
        await page.waitForTimeout(3000);

        // Extract site data
        const results = await page.evaluate(({ limit, searchQuery }: { limit: number; searchQuery: string }) => {
            const sites: any[] = [];

            // Awwwards site cards
            const siteElements = document.querySelectorAll(
                '.list-items figure, ' +
                'a[href*="/sites/"], ' +
                '.site-thumbnail'
            );

            for (let i = 0; i < Math.min(siteElements.length, limit); i++) {
                const element = siteElements[i];

                // Find the link
                const linkElement = element.querySelector('a[href*="/sites/"]') ||
                                  element.closest('a[href*="/sites/"]');
                if (!linkElement) continue;

                const url = (linkElement as HTMLAnchorElement).href;

                // Find the image
                const imgElement = element.querySelector('img');
                let title = '';
                let thumbnailURL = '';

                if (imgElement) {
                    title = imgElement.alt || '';
                    thumbnailURL = imgElement.src || imgElement.getAttribute('data-src') || '';
                }

                // Try to get title from other elements
                if (!title) {
                    const titleElement = element.querySelector('h3, .heading-6');
                    if (titleElement) {
                        title = titleElement.textContent?.trim() || '';
                    }
                }

                // Filter results loosely based on query relevance
                const lowerTitle = title.toLowerCase();
                const lowerQuery = searchQuery.toLowerCase();
                const queryWords = lowerQuery.split(' ');

                // Include if any query word appears in title, or include all if query is generic
                const isRelevant = queryWords.some((word: string) => lowerTitle.includes(word)) ||
                                 lowerQuery.includes('design') ||
                                 lowerQuery.includes('website');

                if (url && isRelevant) {
                    sites.push({
                        url,
                        title: title || `Awwwards Site ${i + 1}`,
                        thumbnailURL,
                        screenshotURL: thumbnailURL
                    });
                }
            }

            return sites;
        }, { limit: limit * 2, searchQuery: query }); // Get more results then filter

        await browser.close();

        // Limit to requested number
        const limitedResults = (results as DesignSearchResult[]).slice(0, limit);

        console.log(`[DesignSearch] Found ${limitedResults.length} Awwwards results`);
        return limitedResults as DesignSearchResult[];

    } catch (error) {
        console.error('Error in searchAwwwards:', error);
        return [];
    }
}

/**
 * Web search that returns raw string results (like magi's implementation)
 *
 * @param inject_agent_id - Agent ID for tracking
 * @param engine - Search engine to use
 * @param query - The search query
 * @param numResults - Number of results to return
 * @returns Raw search results as string
 */
export async function web_search(
    inject_agent_id: string,
    engine: string,
    query: string,
    numResults: number = 9
): Promise<string> {
    // Environment variables for API keys
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const XAI_API_KEY = process.env.XAI_API_KEY;

    switch (engine) {
        case 'anthropic':
            if (!ANTHROPIC_API_KEY) return 'Error: Anthropic API key not configured.';
            const anthropicAgent = new Agent({
                name: 'ClaudeSearch',
                modelClass: 'standard',
                instructions: 'Please search the web for this query and return relevant results.',
                modelSettings: {
                    max_tokens: 2048,
                },
            });
            return await quick_llm_call(
                [{
                    type: 'message',
                    role: 'user',
                    content: `Search for: ${query}. Return ${numResults} relevant results with URLs and descriptions.`
                }],
                anthropicAgent
            );

        case 'openai':
            if (!OPENAI_API_KEY) return 'Error: OpenAI API key not configured.';
            const openaiAgent = new Agent({
                name: 'OpenAISearch',
                modelClass: 'standard',
                instructions: 'Please search the web for this query and return relevant results.',
            });
            return await quick_llm_call(
                [{
                    type: 'message',
                    role: 'user',
                    content: `Search for: ${query}. Return ${numResults} relevant results with URLs and descriptions.`
                }],
                openaiAgent
            );

        case 'google':
            if (!GOOGLE_API_KEY) return 'Error: Google API key not configured.';
            const googleAgent = new Agent({
                name: 'GoogleSearch',
                modelClass: 'standard',
                instructions: 'Please answer this using search grounding.',
            });
            return await quick_llm_call(
                [{
                    type: 'message',
                    role: 'user',
                    content: `Search for: ${query}. Return ${numResults} relevant results with URLs and descriptions.`
                }],
                googleAgent
            );

        case 'sonar':
        case 'sonar-pro':
        case 'sonar-deep-research':
            if (!OPENROUTER_API_KEY) return 'Error: OpenRouter API key not configured.';
            const sonarAgent = new Agent({
                name: `Perplexity${engine === 'sonar-deep-research' ? 'Research' : engine === 'sonar-pro' ? 'ProSearch' : 'Search'}`,
                modelClass: 'standard',
                instructions: 'Please answer this using the latest information available.',
            });
            return await quick_llm_call(
                [{
                    type: 'message',
                    role: 'user',
                    content: `Search for: ${query}. Return ${numResults} relevant results with URLs and descriptions.`
                }],
                sonarAgent
            );

        case 'xai':
            if (!XAI_API_KEY) return 'Error: X.AI API key not configured.';
            const xaiAgent = new Agent({
                name: 'GrokSearch',
                modelClass: 'standard',
                instructions: 'Please search the web for this query.',
            });
            return await quick_llm_call(
                [{
                    type: 'message',
                    role: 'user',
                    content: `Search for: ${query}. Return ${numResults} relevant results with URLs and descriptions.`
                }],
                xaiAgent
            );

        default:
            return `Error: Invalid or unsupported search engine ${engine}`;
    }
}

/**
 * Web search specifically for design inspiration
 * This can be called separately or used within design_search
 *
 * @param query - The search query
 * @param numResults - Number of results to return
 * @param preferredEngine - Optional preferred search engine
 * @returns Array of design search results
 */
export async function web_search_design(
    query: string,
    numResults: number = 9,
    preferredEngine?: string
): Promise<DesignSearchResult[]> {
    const inject_agent_id = `design-search-${uuidv4()}`;
    const searchQuery = `${query} design inspiration`;

    // Determine which engines are available
    const availableEngines: string[] = [];
    if (process.env.ANTHROPIC_API_KEY) availableEngines.push('anthropic');
    if (process.env.OPENAI_API_KEY) availableEngines.push('openai');
    if (process.env.GOOGLE_API_KEY) availableEngines.push('google');
    if (process.env.OPENROUTER_API_KEY) availableEngines.push('sonar');
    if (process.env.XAI_API_KEY) availableEngines.push('xai');

    // If no engines available, return empty array
    if (availableEngines.length === 0) {
        console.error('[web_search_design] No search engines configured');
        return [];
    }

    // Build engine list with preferred engine first
    let engines = [...availableEngines];
    if (preferredEngine && availableEngines.includes(preferredEngine)) {
        engines = [preferredEngine, ...availableEngines.filter(e => e !== preferredEngine)];
    }

    let searchResult = '';
    let successfulEngine = '';

    // Try each engine until one succeeds
    for (const engine of engines) {
        try {
            console.log(`[web_search_design] Trying ${engine} for: ${query}`);
            searchResult = await web_search(inject_agent_id, engine, searchQuery, numResults);

            if (!searchResult.startsWith('Error:')) {
                successfulEngine = engine;
                console.log(`[web_search_design] Success with ${engine}`);
                break;
            } else {
                console.log(`[web_search_design] ${engine} failed: ${searchResult}`);
            }
        } catch (error) {
            console.error(`[web_search_design] Error with ${engine}:`, error);
        }
    }

    // If all engines failed, return empty array
    if (!successfulEngine || searchResult.startsWith('Error:')) {
        console.error('[web_search_design] All search engines failed');
        return [];
    }

    // Parse search results into DesignSearchResult format
    const results = parseSearchResults(searchResult, numResults);
    console.log(`[web_search_design] Found ${results.length} results via ${successfulEngine}`);
    return results;
}

/**
 * Parse search results from LLM response
 */
function parseSearchResults(searchResult: string, limit: number): DesignSearchResult[] {
    const results: DesignSearchResult[] = [];

    try {
        // Try to extract URLs and titles from the response
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
        const urls = searchResult.match(urlRegex) || [];

        // Split by common separators and extract structured data
        const lines = searchResult.split(/[\n\r]+/);
        let currentResult: Partial<DesignSearchResult> | null = null;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Check if line contains a URL
            const urlMatch = trimmedLine.match(urlRegex);
            if (urlMatch && urlMatch[0]) {
                if (currentResult && currentResult.url) {
                    results.push(currentResult as DesignSearchResult);
                }
                currentResult = {
                    url: urlMatch[0],
                    title: trimmedLine.replace(urlMatch[0], '').trim() || `Design Example ${results.length + 1}`
                };
            } else if (currentResult && trimmedLine) {
                // Add as title if we have a current result without title
                if (!currentResult.title || currentResult.title.startsWith('Design Example')) {
                    currentResult.title = trimmedLine;
                }
            }
        }

        // Add the last result
        if (currentResult && currentResult.url) {
            results.push(currentResult as DesignSearchResult);
        }

        // If no structured results found, create from raw URLs
        if (results.length === 0 && urls.length > 0) {
            for (let i = 0; i < Math.min(urls.length, limit); i++) {
                results.push({
                    url: urls[i],
                    title: `Design Inspiration ${i + 1}`,
                });
            }
        }

    } catch (error) {
        console.error('[DesignSearch] Error parsing search results:', error);
    }

    return results.slice(0, limit);
}


/**
 * Main function to search for design inspiration
 */
export async function design_search(
    engine: DesignSearchEngine,
    query: string,
    limit: number = 9
): Promise<string> {
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
        case 'awwwards':
            results = await searchAwwwards(query, limit);
            break;
        case 'web_search':
        default:
            // Use web_search_design which handles engine selection and fallback
            results = await web_search_design(query, limit);
            break;
    }

    // Limit results
    results = results.slice(0, limit);

    // Take screenshots for results that don't have image URLs
    const screenshotPromises = results.map(async result => {
        // If we already have a screenshot URL from the site, use that
        if (result.screenshotURL) {
            return result;
        }

        // If we have a thumbnailURL but no screenshotURL, use thumbnailURL as screenshotURL
        if (result.thumbnailURL && !result.screenshotURL) {
            result.screenshotURL = result.thumbnailURL;
            return result;
        }

        // If we don't have any image URLs, take a screenshot (placeholder)
        if (!result.screenshotURL) {
            const screenshotPath = await takeScreenshot(
                result.url,
                result.title
            );
            if (screenshotPath) {
                result.screenshotURL = screenshotPath;
            }
        }
        return result;
    });

    results = await Promise.all(screenshotPromises);

    return JSON.stringify(results, null, 2);
}

/**
 * Image source types for the createNumberedGrid function
 */
export interface ImageSource {
    url?: string; // URL or file path to the image
    dataUrl?: string; // Data URL of the image
    title?: string; // Optional title for the image
}

/**
 * Create a numbered grid image from a list of image sources
 * Returns a base64 PNG data URL
 */
export async function createNumberedGrid(
    images: ImageSource[],
    gridName: string = 'grid',
    aspect: DesignAssetAspect = 'square'
): Promise<string> {
    // Make sure grid directory exists
    const gridDir = path.join(DESIGN_ASSETS_DIR, 'grid');
    if (!fs.existsSync(gridDir)) {
        fs.mkdirSync(gridDir, { recursive: true });
    }

    const BASE_CELL = 256;
    let cellWidth = BASE_CELL;
    let cellHeight = BASE_CELL;

    // Adjust cell dimensions based on aspect ratio
    if (aspect === 'landscape') {
        cellWidth = Math.round(BASE_CELL * 1.5); // 1.5x wider for landscape
    } else if (aspect === 'portrait') {
        cellHeight = Math.round(BASE_CELL * 1.5); // 1.5x taller for portrait
    }

    const cols = 3;
    const rows = Math.ceil(images.length / cols);
    const canvas = createCanvas(cols * cellWidth, rows * cellHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set highest quality rendering options for sharper image scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (let i = 0; i < images.length; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        try {
            // Load image based on available sources
            let img;
            const imageSource = images[i];

            if (imageSource.dataUrl) {
                // Directly load from data URL if available
                img = await loadImage(imageSource.dataUrl);
            } else if (imageSource.url) {
                // Load from URL or file path
                if (imageSource.url.startsWith('data:image')) {
                    img = await loadImage(imageSource.url);
                } else if (imageSource.url.startsWith('/') && fs.existsSync(imageSource.url)) {
                    img = await loadImage(imageSource.url);
                } else {
                    // For HTTP URLs, create a placeholder since we can't easily fetch in this standalone version
                    const placeholder = createCanvas(cellWidth, cellHeight);
                    const placeholderCtx = placeholder.getContext('2d');
                    placeholderCtx.fillStyle = '#e0e0e0';
                    placeholderCtx.fillRect(0, 0, cellWidth, cellHeight);
                    placeholderCtx.fillStyle = '#666';
                    placeholderCtx.font = '14px Arial';
                    placeholderCtx.textAlign = 'center';
                    placeholderCtx.fillText('Image', cellWidth / 2, cellHeight / 2);
                    img = placeholder;
                }
            }

            if (!img) {
                throw new Error('Failed to load image');
            }

            // Calculate scaled dimensions while maintaining aspect ratio
            const aspectRatio = img.width / img.height;
            const scaledWidth = cellWidth;
            let scaledHeight = scaledWidth / aspectRatio;

            // If height > cellHeight, truncate from top-down
            // If height < cellHeight, vertically center
            const destX = col * cellWidth;
            let destY = row * cellHeight;

            if (scaledHeight > cellHeight) {
                // Truncate height to cellHeight (from the top down)
                scaledHeight = cellHeight;
            } else if (scaledHeight < cellHeight) {
                // Vertically center the image in the cell
                destY = row * cellHeight + (cellHeight - scaledHeight) / 2;
            }

            // Draw the image
            ctx.drawImage(img, destX, destY, scaledWidth, scaledHeight);
        } catch (e) {
            console.error('Error drawing image in grid:', e);
            ctx.fillStyle = '#eee';
            ctx.fillRect(
                col * cellWidth,
                row * cellHeight,
                cellWidth,
                cellHeight
            );
        }

        // Draw the number label
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(col * cellWidth, row * cellHeight, 32, 24);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(String(i + 1), col * cellWidth + 8, row * cellHeight + 18);
    }

    const out = canvas.toBuffer('image/png');

    // Save grid image to disk
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uniqueId = uuidv4().substring(0, 8);
    const filename = `${gridName}_${timestamp}_${uniqueId}.png`;
    const filePath = path.join(gridDir, filename);

    fs.writeFileSync(filePath, out);
    console.log(`[${gridName}] Saved grid image to:`, filePath);

    const dataUrl = `data:image/png;base64,${out.toString('base64')}`;
    communicationManager.send({
        type: 'design',
        data: dataUrl,
        timestamp: new Date().toISOString(),
        prompt: gridName,
        cols,
        rows,
    });

    return dataUrl;
}

/**
 * Select the best items from a grid using a vision model
 */
export async function selectBestFromGrid(
    gridDataUrl: string,
    context: string,
    count: number,
    limit: number,
    isDesignSearch: boolean = true,
    type?: DESIGN_ASSET_TYPES,
    judge_guide?: string
): Promise<number[]> {
    const cols = 3;
    const rows = Math.ceil(count / cols);

    // Determine appropriate message based on whether this is for design search or image generation
    let content: string;
    if (type) {
        const readableType = type.replace(/_/g, ' ');
        const reference = DESIGN_ASSET_REFERENCE[type];
        const readableName = reference.name.toLowerCase();

        if (isDesignSearch) {
            content = `We are looking for inspiration/reference images for a ${readableName}. We have ${count} images that we want to rank. When you rank the images, you should first choose only the relevant images. Once you have selected the relevant images, rank them by how aesthetically pleasing they are.`;
        } else {
            content = `We are designing a new ${readableName}. I've generated ${count} different versions of a ${readableType} and would like you to rank them for me. Please evaluate them and select the best version(s).`;
        }
    } else {
        if (isDesignSearch) {
            content = `We are trying to create a design and are searching the web for design inspiration. We have ${count} images that we want to rank. When you rank the images, you should first choose only the relevant images. Once you have selected the relevant images, rank them by how aesthetically pleasing they are.`;
        } else {
            content = `I've generated ${count} different designs. Please evaluate them and select the best version(s). Consider overall aesthetics, composition, and how well they match the prompt.`;
        }
    }

    if (context) {
        content += `\n\n${context}`;
    }
    if (judge_guide) {
        content += `\n\n${judge_guide}`;
    }

    content += `\n\nPlease select the best ${limit} images from the grid below. You MUST respond with valid JSON in the exact format specified in the schema. Do not include any other text or explanation outside the JSON.`;

    const messages: ResponseInput = [
        {
            type: 'message',
            role: 'developer',
            content: content,
        },
        {
            type: 'message',
            role: 'user',
            content: gridDataUrl,
        },
    ];

    const imageSelectorAgent = new Agent({
        name: 'ImageSelector',
        modelClass: 'vision_mini',
        instructions: 'You are a design assistant. Your job is to select the best images from a grid of images.',
        modelSettings: {
            force_json: true,
            json_schema: {
                name: 'image_selection',
                type: 'json_schema',
                schema: {
                    type: 'object',
                    properties: {
                        best_images: {
                            type: 'array',
                            description: `Select the best ${limit} images from the grid.`,
                            items: {
                                type: 'object',
                                properties: {
                                    number: {
                                        type: 'number',
                                        description: `The image's number in the grid (1-${count})`,
                                    },
                                    reason: {
                                        type: 'string',
                                        description:
                                            'What qualities make this image the best?',
                                    },
                                },
                                additionalProperties: false,
                                required: ['number', 'reason'],
                            },
                        },
                    },
                    additionalProperties: false,
                    required: ['best_images'],
                },
            },
        },
    });
    
    const response = await quick_llm_call(messages, imageSelectorAgent);

    console.log('[selectBestFromGrid] LLM response:', response);

    try {
        // Handle cases where LLM returns duplicate JSON by finding the first valid JSON
        let jsonStr = response.trim();
        
        // Try to find the first complete JSON object
        let braceCount = 0;
        let jsonEndIndex = -1;
        
        for (let i = 0; i < jsonStr.length; i++) {
            if (jsonStr[i] === '{') braceCount++;
            else if (jsonStr[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    jsonEndIndex = i + 1;
                    break;
                }
            }
        }
        
        if (jsonEndIndex > 0) {
            jsonStr = jsonStr.substring(0, jsonEndIndex);
        }
        
        const results = JSON.parse(jsonStr);
        let selectedImages: number[] = [];

        // Handle different response formats
        if (results.best_images && Array.isArray(results.best_images)) {
            // Expected format: { best_images: [{number: 1, reason: "..."}, ...] }
            selectedImages = results.best_images.map((img: any) => img.number);
        } else if (results.rankings && Array.isArray(results.rankings)) {
            // Alternative format: { rankings: [{image_number: 1, ...}, ...] }
            selectedImages = results.rankings.map((r: any) => r.image_number || r.rank);
        } else if (results.ranking && Array.isArray(results.ranking)) {
            // Another format: { ranking: [1, 2, 3] }
            selectedImages = results.ranking;
        } else if (results.bestImages && Array.isArray(results.bestImages)) {
            // Another format: { bestImages: [1, 2, 3] }
            selectedImages = results.bestImages;
        } else if (Array.isArray(results)) {
            // Simple array format: [1, 2, 3]
            selectedImages = results;
        }

        // Filter out invalid numbers
        selectedImages = selectedImages.filter(n =>
            typeof n === 'number' && n >= 1 && n <= count
        );

        if (selectedImages.length > 0) {
            console.log(`[selectBestFromGrid] Selected images: ${selectedImages}`);

            communicationManager.send({
                type: 'design',
                data: gridDataUrl,
                timestamp: new Date().toISOString(),
                prompt,
                selected_indices: selectedImages,
                cols,
                rows,
            });

            return selectedImages;
        }
    } catch (error) {
        console.error('[selectBestFromGrid] Error parsing LLM response:', error);

        // Try to extract numbers from plain text response
        const numberMatches = response.match(/\b\d+\b/g);
        if (numberMatches) {
            const selectedImages = numberMatches
                .map((n: string) => parseInt(n))
                .filter((n: number) => n >= 1 && n <= count)
                .slice(0, limit);

            if (selectedImages.length > 0) {
                console.log(`[selectBestFromGrid] Extracted images from text: ${selectedImages}`);
                return selectedImages;
            }
        }
    }

    console.error('[selectBestFromGrid] No valid images selected');
    return [];
}

/**
 * Generates a unique identifier for a design to prevent duplicate processing
 */
export function getDesignId(design: DesignSearchResult): string {
    return design.url || design.screenshotURL || JSON.stringify(design);
}

/**
 * Raw design search configurations with iterative vision-based ranking
 * Accepts an array of search configurations to run in parallel
 */
export async function smart_design_raw(
    context: string,
    searchConfigs: {
        engine: DesignSearchEngine;
        query: string;
        limit?: number;
    }[],
    finalLimit: number = 3,
    type: DESIGN_ASSET_TYPES,
    judge_guide?: string,
    prefix: string = 'smart'
): Promise<DesignSearchResult[]> {
    console.log(`[smart_design_raw] Running ${searchConfigs.length} search configs`);

    const background = `We are designing a ${type} and looking for reference images for inspiration\n\n${context}`;

    // Run all searches in parallel
    const searchPromises = searchConfigs.map(async (config) => {
        try {
            const result = await design_search(
                config.engine,
                `${background}\n\n${config.query}`,
                config.limit || 9
            );
            return JSON.parse(result) as DesignSearchResult[];
        } catch (error) {
            console.error(`[smart_design_raw] Error searching ${config.engine}:`, error);
            return [];
        }
    });

    // Wait for all searches to complete
    const searchResults = await Promise.all(searchPromises);

    // Flatten all results into a single array
    const allDesigns = searchResults.flat();
    console.log(`[smart_design_raw] Found ${allDesigns.length} total designs from all searches`);

    if (allDesigns.length === 0) {
        return [];
    }

    // If we have fewer results than requested, just return them all
    if (allDesigns.length <= finalLimit) {
        return allDesigns;
    }

    // Use iterative vision-based selection to narrow down to the best designs
    const processedIds = new Set<string>();
    let currentCandidates = [...allDesigns];
    let round = 1;

    // Keep selecting best designs until we reach the target count
    while (currentCandidates.length > finalLimit && round <= 3) {
        console.log(`[smart_design_raw] Selection round ${round}: ${currentCandidates.length} candidates`);

        // Create groups of up to 9 for grid evaluation
        const groups: DesignSearchResult[][] = [];
        for (let i = 0; i < currentCandidates.length; i += 9) {
            groups.push(currentCandidates.slice(i, i + 9));
        }

        const roundWinners: DesignSearchResult[] = [];

        // Process each group
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const gridName = `${prefix}_round${round}_group${i + 1}`;

            // Create grid from group
            const imageSources = group.map(design => ({
                url: design.screenshotURL || design.thumbnailURL,
                title: design.title
            }));

            const gridDataUrl = await createNumberedGrid(
                imageSources,
                gridName,
                type ? DESIGN_ASSET_REFERENCE[type].spec.aspect : 'square'
            );

            // Select best from this group
            const selectCount = Math.min(
                Math.ceil(group.length * 0.5), // Select top 50%
                Math.ceil(finalLimit / groups.length) + 1 // But at least enough to reach final count
            );

            const selectedIndices = await selectBestFromGrid(
                gridDataUrl,
                background,
                group.length,
                selectCount,
                true, // isDesignSearch
                type,
                judge_guide
            );

            // Add selected designs to round winners
            for (const idx of selectedIndices) {
                if (idx >= 1 && idx <= group.length) {
                    const selected = group[idx - 1];
                    const id = getDesignId(selected);
                    if (!processedIds.has(id)) {
                        roundWinners.push(selected);
                        processedIds.add(id);
                    }
                }
            }
        }

        currentCandidates = roundWinners;
        round++;

        console.log(`[smart_design_raw] Round ${round - 1} complete: ${currentCandidates.length} designs selected`);
    }

    // Return the final selection, limited to requested count
    return currentCandidates.slice(0, finalLimit);
}