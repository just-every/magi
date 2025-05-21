/**
 * Design Search Utility
 *
 * Provides tools for searching design inspiration from various sources including:
 * - Dribbble
 * - Behance
 * - Envato/ThemeForest
 * - Pinterest
 * - Awwwards
 *
 * Each source has specific capabilities and limitations as noted
 */

/* eslint-disable no-useless-escape */
import fs from 'fs';
import path from 'path';
import { getAgentBrowserSession } from './browser_session.js';
import { web_search } from './search_utils.js';
import { createToolFunction } from './tool_call.js';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { quick_llm_call } from './llm_call_utils.js';
import { ResponseInput } from '../types/shared-types.js';
import {
    DESIGN_ASSET_REFERENCE,
    DESIGN_SEARCH_DESCRIPTIONS,
    DESIGN_SEARCH_ENGINES,
    DesignSearchEngine,
    DesignSearchResult,
    type DESIGN_ASSET_TYPES,
    type DesignAssetAspect,
} from './design/constants.js';

const USER_AGENT =
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; magi-user/1.0; +https://withmagi.com)';

// Base directory for storing screenshots
export const DESIGN_ASSETS_DIR = '/magi_output/shared/design_assets';
const SLEEP = (ms = 1000) => new Promise(res => setTimeout(res, ms));

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
 * Take a screenshot of a URL
 *
 * @param url URL to screenshot
 * @returns Path to the screenshot file
 */
async function runJavaScript(
    url: string,
    code: string
): Promise<string | null> {
    // Use a throwaway session per capture to avoid interference with other tabs
    const sessionId = `design-search-${uuidv4()}`;
    const session = getAgentBrowserSession(sessionId, url);

    try {
        await session.navigate(url);
        // Reduced initial wait time
        await SLEEP(2000);
        return await session.js_evaluate(code);
    } catch (error) {
        console.error(`Error running JavaScript on ${url}:`, error);
        return null;
    } finally {
        // Clean up the temporary session
        try {
            await session.closeSession();
        } catch (closeError) {
            console.error('Error closing JavaScript session:', closeError);
        }
    }
}

/**
 * Take a screenshot of a URL
 *
 * @param url URL to screenshot
 * @param title Optional title to use in the filename
 * @returns Path to the screenshot file
 */
async function takeScreenshot(
    url: string,
    title?: string
): Promise<string | null> {
    ensureDesignAssetsDir();

    // Use a throwaway session per capture to avoid interference with other tabs
    const sessionId = `design-search-${uuidv4()}`;
    const session = getAgentBrowserSession(sessionId, url);

    try {
        await session.navigate(url, 8_000);

        // Clean the title for use in a filename (remove/replace special characters)
        let cleanTitle = '';
        if (title) {
            // Replace spaces and special characters with underscores, limit length
            cleanTitle = title
                .trim()
                .replace(/[^a-zA-Z0-9]/g, '_') // Replace non-alphanumeric with underscore
                .replace(/_+/g, '_') // Replace multiple underscores with single one
                .substring(0, 50); // Limit length
        } else {
            // Try to get the page title if no title was provided
            try {
                const pageTitle = await session.js_evaluate(
                    'document.title || ""'
                );
                if (typeof pageTitle === 'string' && pageTitle.trim()) {
                    cleanTitle = pageTitle
                        .trim()
                        .replace(/[^a-zA-Z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .substring(0, 50);
                }
            } catch (e) {
                // Ignore errors when getting the title
            }
        }

        // Generate a unique filename including the title and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const uniqueId = uuidv4().substring(0, 8);
        const filename = cleanTitle
            ? `${cleanTitle}_${timestamp}_${uniqueId}.png`
            : `screenshot_${timestamp}_${uniqueId}.png`;

        const filePath = path.join(DESIGN_ASSETS_DIR, 'screenshots', filename);

        // Capture a lightweight screenshot of the viewport
        const result = await session.captureScreenshot(2000);
        if (typeof result === 'object' && 'error' in result) {
            throw new Error(`Browser error: ${result.error}`);
        }

        // Extract the base64 image data
        const base64Data = result.replace(/^data:image\/png;base64,/, '');

        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        return filePath;
    } catch (error) {
        console.error(`Error taking screenshot of ${url}:`, error);
        return null;
    } finally {
        // Clean up the temporary session
        try {
            await session.closeSession();
        } catch (closeError) {
            console.error('Error closing screenshot session:', closeError);
        }
    }
}

/**
 * Search for design inspiration on Dribbble
 */
async function searchDribbble(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        const url = `https://dribbble.com/search/${encodeURIComponent(query)}`;
        const html = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
        }).then(r => r.text());
        await SLEEP();

        const dom = new JSDOM(html);
        const document = dom.window.document;

        const results: DesignSearchResult[] = [];
        const shotItems = Array.from(
            document.querySelectorAll('li.shot-thumbnail')
        ).slice(0, limit);

        for (const item of shotItems) {
            // Find the link element with shot URL
            const linkEl = item.querySelector('a.shot-thumbnail-link');
            const shotPath = linkEl?.getAttribute('href');

            // Find the image element with srcset
            const imgEl = item.querySelector('figure img');

            if (!shotPath || !imgEl) continue;

            // Get title from alt attribute
            const title = imgEl.getAttribute('alt') ?? undefined;

            // Initialize URL variables
            let thumbnailURL: string | undefined;
            let screenshotURL: string | undefined;

            // Get the base image URL from src attribute
            const src = imgEl.getAttribute('src') || '';

            // Parse the base URL to create proper thumbnail and screenshot URLs
            const baseUrl = src.split('?')[0]; // Get URL without query parameters

            if (baseUrl) {
                // Create URLs with proper resize parameters
                thumbnailURL = `${baseUrl}?format=webp&resize=400x300&vertical=center`;
                screenshotURL = `${baseUrl}?format=webp&resize=1200x900&vertical=center`;
            } else {
                // Fallback if we can't extract a proper URL
                thumbnailURL = src;
                screenshotURL = src;
            }

            results.push({
                url: `https://dribbble.com${shotPath}`,
                title,
                thumbnailURL,
                screenshotURL,
            });
        }

        return results;
    } catch (error) {
        console.error('Error in searchDribbble:', error);
        return [];
    }
}

/**
 * Search for design inspiration on Behance
 *
 * This uses the embedded JSON data in the HTML page, which contains
 * all the search results even before JavaScript renders the page.
 */
export async function searchBehance(
    query: string,
    limit = 9
): Promise<DesignSearchResult[]> {
    try {
        const url = `https://www.behance.net/search/projects?search=${encodeURIComponent(
            query
        )}`;

        const jsResult = await runJavaScript(
            url,
            `async function waitForElements() {
          function extractBehanceData() {
            const items = document.querySelectorAll(".qa-search-project-item");
            const results = [];

            for (const item of items) {
              const anchor = item.querySelector('a[href*="/gallery/"]');
              const img = item.querySelector('img');

              if (!anchor || !img) continue;

              const url = anchor.href;
              const title = img.alt || item.getAttribute('aria-label') || anchor.getAttribute('title') || undefined;

              // Get image source
              let thumbnailURL = img.src;
              let screenshotURL = img.src;

              // Check for picture element with srcset
              const pictureSrc = item.querySelector('picture source[type="image/png"]')?.srcset;
              const srcset = pictureSrc || img.srcset || '';

              if (srcset) {
                const srcsetEntries = srcset.split(',').map(t => t.trim());
                for (const entry of srcsetEntries) {
                  const [candidate, size] = entry.split(/\s+/);

                  if (/^(404|400)w$/.test(size)) thumbnailURL = candidate;
                  if (/^(808|1400|1600)w$/.test(size) || /max_/.test(candidate)) {
                    screenshotURL = candidate;
                  }
                }
              }

              // Fallback if needed
              if (thumbnailURL === screenshotURL && /404/.test(thumbnailURL)) {
                screenshotURL = thumbnailURL.replace('404', '808');
              }

              results.push({
                url,
                title,
                thumbnailURL,
                screenshotURL
              });
            }

            return results;
          }

          // Wait for elements to appear with polling
          return new Promise((resolve) => {
            const maxAttempts = 20; // ~10 seconds total with 500ms intervals
            let attempts = 0;

            function checkForElements() {
              const items = document.querySelectorAll(".qa-search-project-item");
              console.log("Checking for elements, found: " + items.length);

              if (items.length > 0) {
                // Elements found, extract data
                resolve(extractBehanceData());
              } else if (attempts < maxAttempts) {
                // Not found yet, try again
                attempts++;
                setTimeout(checkForElements, 500);
              } else {
                // Timeout reached, return empty array
                console.log("Timeout waiting for elements");
                resolve([]);
              }
            }

            // Start polling
            checkForElements();
          });
        }

        return await waitForElements();`
        );

        /* ------------------------------------------------------------------ *\
      1. Process extracted data directly
         ───────────────────────────────
         The JavaScript extraction already handled all the DOM operations
    \* ------------------------------------------------------------------ */
        // Parse the JSON result and use it directly
        const results: DesignSearchResult[] = JSON.parse(jsResult).value;

        // Apply the limit parameter to restrict the number of results
        return results.slice(0, limit);
    } catch (err) {
        console.error('[searchBehance]', err);
        return [];
    }
}

/**
 * Search for design inspiration on Envato/ThemeForest
 */
async function searchEnvato(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        // Try Envato Elements first - more reliable than ThemeForest
        const envatoUrl = `https://elements.envato.com/web-templates/${encodeURIComponent(query)}`;
        const jsResult = await runJavaScript(
            envatoUrl,
            `async function waitForElements() {
                function extractEnvatoData() {
                    // First look for cards with the Envato Elements specific structure
                    // These are the primary item cards with class wtigj7JD
                    const envatoCards = document.querySelectorAll('div[class*="wtigj7JD"], div[data-testid="default-card"]');
                    console.log("Found " + envatoCards.length + " Envato template cards");

                    // Secondary approach - look for item-link elements, which are direct links to templates
                    const itemLinks = document.querySelectorAll('a[data-testid="item-link"]');
                    console.log("Found " + itemLinks.length + " item links");

                    // Tertiary approach - general link selection for older versions
                    const templateLinks = document.querySelectorAll('a[href*="/web-templates/"], a[href*="-"]');
                    console.log("Found " + templateLinks.length + " template links");

                    // Specifically look for images with srcset that include larger sizes
                    const srcsetImgs = document.querySelectorAll('img[srcset*="710w"]');
                    console.log("Found " + srcsetImgs.length + " images with 710w in srcset");

                    let results = [];

                    // Try the most specific approach first (primary cards)
                    if (envatoCards && envatoCards.length > 0) {
                        console.log("Processing Envato template cards");
                        for (const card of envatoCards) {
                            try {
                                // Get the link and image
                                const link = card.querySelector('a[data-testid="item-link"], a[title], a[href*="-"]');
                                if (!link) continue;

                                // Get the URL directly from the href
                                const href = link.getAttribute('href');
                                if (!href) continue;

                                // Make sure it's a full URL
                                const url = href.startsWith('http') ?
                                    href :
                                    new URL(href, window.location.origin).href;

                                // Get title directly from link title attribute or item title
                                let title = link.getAttribute('title');

                                // If no title on the link, look for the title element
                                if (!title) {
                                    const titleEl = card.querySelector('div[class*="hnXAr6Nr"], [data-testid="title-link"], span[class*="_7yoIykb4"], div[class*="hnXAr6Nr"]');
                                    if (titleEl) {
                                        title = titleEl.textContent.trim();
                                    }
                                }

                                // Find the image element - these have specific classes or data-testid in Envato
                                const img = card.querySelector('img[data-testid="img-default-card"], img[class*="AFrX7o04"], img[srcset]');

                                // If still no title, try to extract from URL
                                if (!title && href) {
                                    // Extract from URL pattern: /template-name-ABC123
                                    const urlParts = href.split('/');
                                    if (urlParts.length > 0) {
                                        // Get the last part of the URL
                                        const lastPart = urlParts[urlParts.length - 1];

                                        // Parse template ID format: template-name-ABC123
                                        // First remove any ID at the end (usually alphanumeric code)
                                        const nameWithoutId = lastPart.replace(/-[A-Z0-9]+$/, '');

                                        // Convert remaining hyphenated text to title case
                                        title = nameWithoutId
                                                .replace(/-/g, ' ')
                                                .split(' ')
                                                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                                .join(' ')
                                                .trim();
                                    }
                                }

                                // Get image URLs
                                let thumbnailURL, screenshotURL;

                                if (img) {
                                    // Default to src as a fallback
                                    thumbnailURL = img.src;
                                    screenshotURL = thumbnailURL;

                                    // Check for srcset attribute - Envato uses this for responsive images
                                    if (img.hasAttribute('srcset')) {
                                        const srcset = img.getAttribute('srcset');
                                        // Log the complete srcset for debugging
                                        console.log('[searchEnvato] Found image with srcset: ' + srcset.substring(0, 100) + '...');
                                        console.log('[searchEnvato] srcset contains 710w: ' + srcset.includes('710w'));

                                        // Parse the srcset to find different image sizes
                                        // Format example: "url 316w, url 355w, url 433w, url 632w, url 710w"
                                        const srcParts = srcset.split(',').map(part => part.trim());
                                        console.log('[searchEnvato] Parsed srcset into ' + srcParts.length + ' parts');

                                        // Find a small image for thumbnail (around 300-400w)
                                        for (const part of srcParts) {
                                            const [url, size] = part.split(/\s+/);
                                            if (size && url) {
                                                // For thumbnail, use smaller sizes
                                                if (/^[2-4][0-9]{2}w$/.test(size)) { // Match 200-499w
                                                    thumbnailURL = url;
                                                    break;
                                                }
                                            }
                                        }

                                        // Special check for 710w images which are the largest on Envato
                                        if (srcset.includes('710w')) {
                                            // Extract the 710w image URL with regexp to be precise
                                            const regex710 = /([^,]+)[\s,]+710w/;
                                            const match710 = srcset.match(regex710);
                                            if (match710 && match710[1]) {
                                                screenshotURL = match710[1].trim();
                                                console.log("[searchEnvato] Extracted 710w image directly: " + screenshotURL);
                                            } else {
                                                // Fallback to standard parsing if regex match fails
                                                // Find a larger image for screenshot (prefer 710w or largest available)
                                                let largestSize = 0;
                                                let largestUrl = '';

                                                // First try to find the 710w image which is typically the largest
                                                for (const part of srcParts) {
                                                    const [url, size] = part.split(/\s+/);
                                                    if (size && url && size === '710w') {
                                                        // Found the 710w image - this is optimal
                                                        screenshotURL = url;
                                                        console.log("[searchEnvato] Found 710w image: " + url);
                                                        break;
                                                    }

                                                    // Keep track of the largest image as fallback
                                                    if (size && url) {
                                                        // Extract the numeric width
                                                        const match = size.match(/^(\d+)w$/);
                                                        if (match) {
                                                            const width = parseInt(match[1], 10);
                                                            if (width > largestSize) {
                                                                largestSize = width;
                                                                largestUrl = url;
                                                            }
                                                        }
                                                    }
                                                }

                                                // If we didn't find a 710w image, use the largest we found
                                                if (!screenshotURL && largestUrl) {
                                                    screenshotURL = largestUrl;
                                                    console.log("[searchEnvato] Using largest image (" + largestSize + "w): " + largestUrl);
                                                }
                                            }
                                        } else {
                                            // No 710w image, find the largest available
                                            let largestSize = 0;
                                            let largestUrl = '';

                                            for (const part of srcParts) {
                                                const [url, size] = part.split(/\s+/);
                                                if (size && url) {
                                                    // Extract the numeric width
                                                    const match = size.match(/^(\d+)w$/);
                                                    if (match) {
                                                        const width = parseInt(match[1], 10);
                                                        if (width > largestSize) {
                                                            largestSize = width;
                                                            largestUrl = url;
                                                        }
                                                    }
                                                }
                                            }

                                            if (largestUrl) {
                                                screenshotURL = largestUrl;
                                                console.log("[searchEnvato] Using largest image (" + largestSize + "w): " + largestUrl);
                                            }
                                        }
                                    }

                                    // Try Envato's specific image URL patterns if we have a URL
                                    if (thumbnailURL && thumbnailURL.includes('elements-cover-images')) {
                                        // For thumbnails already containing size parameters
                                        if (thumbnailURL.includes('w=')) {
                                            // Keep thumbnail as-is

                                            // Create a larger screenshot URL by modifying parameters
                                            screenshotURL = thumbnailURL
                                                .replace(/w=\d+/, 'w=1200')  // Increase width
                                                .replace(/q=\d+/, 'q=90')    // Increase quality
                                                .replace(/format=\w+/, 'format=jpeg');  // Use JPEG format
                                        }
                                    }

                                    // For envatousercontent.com URLs, we need to keep the full URL with signature
                                    // DO NOT modify the URL parameters as they include security signatures
                                    if (screenshotURL && screenshotURL.includes('envatousercontent.com')) {
                                        // Instead of modifying the URL, just find the largest image in srcset if available
                                        // The URL modification is already handled earlier when parsing srcset
                                    }
                                } else {
                                    // If no img tag, check for background images in the card or parent
                                    const elements = [card, parent];
                                    for (const el of elements) {
                                        if (!el) continue;

                                        const computedStyle = window.getComputedStyle(el);
                                        const bgImage = computedStyle.backgroundImage;

                                        if (bgImage && bgImage !== 'none' && bgImage.includes('url')) {
                                            const urlMatch = bgImage.match(/url\(['"](.+?)['"]?\)/i);
                                            if (urlMatch && urlMatch[1]) {
                                                thumbnailURL = urlMatch[1];

                                                // For background images from Envato, keep original URL with signature
                                                if (urlMatch[1].includes('envatousercontent.com') || urlMatch[1].includes('elements-cover-images')) {
                                                    // Keep the original URL with its signature
                                                    screenshotURL = urlMatch[1];
                                                } else {
                                                    // For non-Envato URLs, we can modify parameters
                                                    screenshotURL = thumbnailURL;
                                                }
                                                break;
                                            }
                                        }
                                    }
                                }

                                // Only add results that have at least a URL
                                if (url) {
                                    results.push({
                                        url,
                                        title: title || "Envato Template",
                                        thumbnailURL,
                                        screenshotURL
                                    });
                                }
                            } catch (err) {
                                console.error("Error processing item:", err);
                            }
                        }
                    }

                    // If the primary approach didn't find results, try using direct item links
                    if (results.length === 0 && itemLinks.length > 0) {
                        console.log("Using direct item links approach");
                        for (const link of itemLinks) {
                            try {
                                // Get URL from link href
                                const href = link.getAttribute('href');
                                if (!href) continue;

                                // Make sure it's a full URL
                                const url = href.startsWith('http') ?
                                    href :
                                    new URL(href, window.location.origin).href;

                                // Get title
                                let title = link.getAttribute('title');

                                // Try to get the image - it's usually a direct child or sibling
                                const img = link.querySelector('img') ||
                                            link.parentElement?.querySelector('img') ||
                                            link.previousElementSibling?.querySelector('img') ||
                                            link.nextElementSibling?.querySelector('img');

                                // If still no title, try to extract from URL
                                if (!title && href) {
                                    // Extract from URL pattern: /template-name-ABC123
                                    const urlParts = href.split('/');
                                    if (urlParts.length > 0) {
                                        const lastPart = urlParts[urlParts.length - 1];
                                        const nameWithoutId = lastPart.replace(/-[A-Z0-9]+$/, '');

                                        title = nameWithoutId
                                                .replace(/-/g, ' ')
                                                .split(' ')
                                                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                                .join(' ')
                                                .trim();
                                    }
                                }

                                // Get image URLs
                                let thumbnailURL, screenshotURL;

                                if (img) {
                                    // Use the same image handling code as primary approach
                                    thumbnailURL = img.src;
                                    screenshotURL = thumbnailURL;

                                    if (img.hasAttribute('srcset')) {
                                        const srcset = img.getAttribute('srcset');
                                        const srcParts = srcset.split(',').map(part => part.trim());

                                        // Find a small image for thumbnail
                                        for (const part of srcParts) {
                                            const [url, size] = part.split(/\s+/);
                                            if (size && url && /^[2-4][0-9]{2}w$/.test(size)) {
                                                thumbnailURL = url;
                                                break;
                                            }
                                        }

                                        // Special check for 710w images which are the largest on Envato
                                        if (srcset.includes('710w')) {
                                            // Extract the 710w image URL with regexp to be precise
                                            const regex710 = /([^,]+)[\s,]+710w/;
                                            const match710 = srcset.match(regex710);
                                            if (match710 && match710[1]) {
                                                screenshotURL = match710[1].trim();
                                                console.log("[searchEnvato] Extracted 710w image directly from item links: " + screenshotURL);
                                            } else {
                                                // Fallback to standard parsing if regex match fails
                                                // Find a larger image for screenshot (prefer 710w or largest available)
                                                let largestSize = 0;
                                                let largestUrl = '';

                                                // First try to find the 710w image which is typically the largest
                                                for (const part of srcParts) {
                                                    const [url, size] = part.split(/\s+/);
                                                    if (size && url && size === '710w') {
                                                        // Found the 710w image - this is optimal
                                                        screenshotURL = url;
                                                        console.log("[searchEnvato] Found 710w image in item links: " + url);
                                                        break;
                                                    }

                                                    // Keep track of the largest image as fallback
                                                    if (size && url) {
                                                        // Extract the numeric width
                                                        const match = size.match(/^(\d+)w$/);
                                                        if (match) {
                                                            const width = parseInt(match[1], 10);
                                                            if (width > largestSize) {
                                                                largestSize = width;
                                                                largestUrl = url;
                                                            }
                                                        }
                                                    }
                                                }

                                                // If we didn't find a 710w image, use the largest we found
                                                if (!screenshotURL && largestUrl) {
                                                    screenshotURL = largestUrl;
                                                    console.log("[searchEnvato] Using largest image in item links (" + largestSize + "w): " + largestUrl);
                                                }
                                            }
                                        } else {
                                            // No 710w image, find the largest available
                                            let largestSize = 0;
                                            let largestUrl = '';

                                            for (const part of srcParts) {
                                                const [url, size] = part.split(/\s+/);
                                                if (size && url) {
                                                    // Extract the numeric width
                                                    const match = size.match(/^(\d+)w$/);
                                                    if (match) {
                                                        const width = parseInt(match[1], 10);
                                                        if (width > largestSize) {
                                                            largestSize = width;
                                                            largestUrl = url;
                                                        }
                                                    }
                                                }
                                            }

                                            if (largestUrl) {
                                                screenshotURL = largestUrl;
                                                console.log("[searchEnvato] Using largest image in item links (" + largestSize + "w): " + largestUrl);
                                            }
                                        }
                                    }

                                    // For Envato URLs, we need to keep the original URL with signature
                                    // DO NOT modify the URL parameters as they include security signatures
                                    if ((screenshotURL && screenshotURL.includes('elements-cover-images')) ||
                                       (screenshotURL && screenshotURL.includes('envatousercontent.com'))) {
                                        // Keep the original URL with signatures intact
                                        // The larger image URL selection is already handled in srcset parsing
                                    }
                                }

                                // Only add results with a URL
                                if (url) {
                                    results.push({
                                        url,
                                        title: title || "Envato Template",
                                        thumbnailURL,
                                        screenshotURL
                                    });
                                }
                            } catch (err) {
                                console.error("Error processing item link:", err);
                            }
                        }
                    }

                    // Final fallback - use generic template links if we still have no results
                    if (results.length === 0 && templateLinks.length > 0) {
                        console.log("Using generic template links as last resort");
                        for (const link of templateLinks) {
                            try {
                                const href = link.getAttribute('href');
                                if (!href || href.includes('properties-') || href.includes('pg-')) continue; // Skip pagination/filter links

                                const url = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
                                let title = link.getAttribute('title') || link.textContent.trim();

                                // Get an img if possible
                                const img = link.querySelector('img') || link.parentElement?.querySelector('img');

                                // Only add to results if it's not already there
                                const isDuplicate = results.some(r => r.url === url);
                                if (!isDuplicate && url) {
                                    results.push({
                                        url,
                                        title: title || "Envato Template",
                                        thumbnailURL: img?.src,
                                        screenshotURL: img?.src
                                    });
                                }
                            } catch (err) {
                                console.error("Error processing template link:", err);
                            }
                        }
                    }

                    return results;
                }

                // Wait for elements to appear with polling
                return new Promise((resolve) => {
                    const maxAttempts = 30; // ~15 seconds total with 500ms intervals
                    let attempts = 0;

                    function checkForElements() {
                        // Primary indicators - Envato Elements specific selectors
                        const envatoCards = document.querySelectorAll('div[class*="wtigj7JD"], div[data-testid="default-card"]');

                        // Secondary indicators - item links with data-testid
                        const itemLinks = document.querySelectorAll('a[data-testid="item-link"]');

                        // Tertiary indicators - general template links
                        const templateLinks = document.querySelectorAll('a[href*="/web-templates/"], a[href*="-"]');

                        // Total from all selectors
                        const itemsFound = envatoCards.length || itemLinks.length || templateLinks.length;

                        // Specific check for srcset images (common in Envato templates)
                        const srcsetImgs = document.querySelectorAll('img[srcset*="elements-cover-images"], img[srcset*="envatousercontent.com"]');

                        // Specifically look for high-res images (710w is the largest size in srcset)
                        const largeImgs = document.querySelectorAll('img[srcset*="710w"]');

                        console.log("Checking for elements, found: " + itemsFound +
                                   " (envatoCards: " + envatoCards.length +
                                   ", itemLinks: " + itemLinks.length +
                                   ", templateLinks: " + templateLinks.length +
                                   ", srcsetImgs: " + srcsetImgs.length +
                                   ", largeImgs: " + largeImgs.length + ")");

                        // Wait until we find at least some results or the page has meaningful content
                        if (itemsFound > 0 || srcsetImgs.length > 0) {
                            // Elements found, extract data
                            resolve(extractEnvatoData());
                        } else if (attempts < maxAttempts) {
                            // Not found yet, try again
                            attempts++;
                            setTimeout(checkForElements, 500);
                        } else {
                            // Timeout reached, return empty array
                            console.log("Timeout waiting for elements");
                            resolve([]);
                        }
                    }

                    // Start polling
                    checkForElements();
                });
            }

            return await waitForElements();`
        );

        // Parse the JSON result
        let results: DesignSearchResult[] = [];

        try {
            const parsed = JSON.parse(jsResult);
            if (parsed && parsed.value && Array.isArray(parsed.value)) {
                results = parsed.value;
                console.log(
                    `[searchEnvato] Successfully parsed ${results.length} results`
                );
            }
        } catch (err) {
            console.error('Error parsing Envato results:', err);
        }

        // If no results from Elements, try ThemeForest as fallback
        if (results.length === 0) {
            console.log(
                '[searchEnvato] No results from Envato Elements, trying ThemeForest...'
            );

            // Try ThemeForest as a fallback
            const themeforestUrl = `https://themeforest.net/search/${encodeURIComponent(query)}`;

            // Similar JS script but for ThemeForest
            const themeforestResult = await runJavaScript(
                themeforestUrl,
                `async function extractThemeForest() {
                    function getItems() {
                        // Look for item cards on ThemeForest
                        const cards = document.querySelectorAll('.product-grid__item');
                        console.log("Found " + cards.length + " ThemeForest cards");

                        const results = [];

                        for (const card of cards) {
                            try {
                                // Find the main link
                                const link = card.querySelector('a.product-grid__image-wrapper');
                                if (!link) continue;

                                const url = link.href;

                                // Find the image
                                const img = link.querySelector('img');

                                // Find the title
                                const titleEl = card.querySelector('.product-grid__title-text');
                                const title = titleEl ? titleEl.textContent.trim() :
                                             (img ? img.alt : "ThemeForest Template");

                                // Get image URLs
                                let thumbnailURL, screenshotURL;

                                if (img) {
                                    thumbnailURL = img.src;
                                    screenshotURL = thumbnailURL;

                                    // ThemeForest uses data attributes for image paths
                                    if (img.dataset.src) {
                                        thumbnailURL = img.dataset.src;
                                    }

                                    // Try to get higher resolution by manipulating URL
                                    if (thumbnailURL && thumbnailURL.includes('preview_')) {
                                        screenshotURL = thumbnailURL.replace('preview_', 'large_preview_');
                                    }
                                }

                                // Only add if we have a URL
                                if (url) {
                                    results.push({
                                        url,
                                        title,
                                        thumbnailURL,
                                        screenshotURL
                                    });
                                }
                            } catch (err) {
                                console.error("Error processing ThemeForest item:", err);
                            }
                        }

                        return results;
                    }

                    return new Promise((resolve) => {
                        const maxAttempts = 30;
                        let attempts = 0;

                        function checkForItems() {
                            const cards = document.querySelectorAll('.product-grid__item');
                            console.log("Checking ThemeForest items, found: " + cards.length);

                            if (cards.length > 0) {
                                resolve(getItems());
                            } else if (attempts < maxAttempts) {
                                attempts++;
                                setTimeout(checkForItems, 500);
                            } else {
                                console.log("Timeout waiting for ThemeForest items");
                                resolve([]);
                            }
                        }

                        checkForItems();
                    });
                }

                return await extractThemeForest();`
            );

            try {
                const themeForestParsed = JSON.parse(themeforestResult);
                if (
                    themeForestParsed &&
                    themeForestParsed.value &&
                    Array.isArray(themeForestParsed.value)
                ) {
                    results = themeForestParsed.value;
                    console.log(
                        `[searchEnvato] Found ${results.length} results from ThemeForest`
                    );
                }
            } catch (err) {
                console.error('Error parsing ThemeForest results:', err);
            }
        }

        // If we still didn't find any results, log it
        if (results.length === 0) {
            console.log(
                '[searchEnvato] No results found from either Envato Elements or ThemeForest'
            );
        }

        // Apply the limit and return
        return results.slice(0, limit);
    } catch (error) {
        console.error('Error in searchEnvato:', error);
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
        // Pinterest now requires JavaScript, so we'll use the browser approach
        const pinterestUrl = `https://pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
        console.log(
            `[searchPinterest] Loading URL in browser: ${pinterestUrl}`
        );

        const jsResult = await runJavaScript(
            pinterestUrl,
            `async function waitForElements() {
                function extractPinterestData() {
                    // Try various selectors for pins, using more stable and semantic options
                    const selectors = [
                        // Data attribute selectors (most stable)
                        'div[data-test-id="pin"]', // Pinterest's test ID
                        'div[data-pin-id]', // Pin ID attribute
                        'div[data-grid-item]', // Grid items

                        // Semantic and attribute-based selectors
                        'div[role="listitem"]', // Semantic list items
                        'div[class*="Pin"]', // Class contains "Pin"
                        'div[id*="Pin"]', // ID contains "Pin"

                        // URL-based detection
                        'a[href*="/pin/"]', // Links to pins

                        // Class-based selectors with alternatives
                        '.Grid__Item, .grid-item, .gridItem',
                        '.pin, .Pin, .pinWrapper, .pin-wrapper',

                        // Image container fallbacks
                        'div:has(img[srcset]):has(a[href*="/pin/"])', // Modern approach - container with srcset img
                        'div:has(img[src*="pinimg.com"])', // Has Pinterest image

                        // Last resort - any div with an image
                        'div:has(img):has(a[href]):not([class*="header"]):not([class*="footer"])'
                    ];

                    let pins = [];
                    // Find the first selector that returns results
                    for (const selector of selectors) {
                        try {
                            const elements = document.querySelectorAll(selector);
                            if (elements && elements.length > 0) {
                                pins = elements;
                                console.log("Found pins with selector: " + selector + ", count: " + elements.length);
                                break;
                            }
                        } catch (e) {
                            // Some complex selectors like :has() might not be supported in all browsers
                            console.log("Selector error: " + e.message);
                        }
                    }

                    const results = [];

                    for (const pin of pins) {
                        // Find the pin URL
                        const anchor = pin.querySelector('a[href*="/pin/"]');
                        if (!anchor) continue;

                        const url = new URL(anchor.href, window.location.origin).href;

                        // Find the image
                        const img = pin.querySelector('img');
                        if (!img) continue;

                        // Try to get title from Pinterest's title element first (more accurate than alt text)
                        let title = undefined;

                        // Look for the title in a variety of Pinterest-specific places
                        const titleDiv = pin.querySelector('[data-test-id="related-pins-title"] div.X8m, [title]:not(img)');
                        if (titleDiv) {
                            title = titleDiv.getAttribute('title') || titleDiv.textContent.trim();
                        }

                        // If no title found from title elements, try description elements
                        if (!title) {
                            const descEl = pin.querySelector('[data-test-id="desc"] span');
                            if (descEl) {
                                // Extract first sentence or part before comma for cleaner title
                                const descText = descEl.textContent.trim();
                                const firstSentence = descText.split(/[.,!?]/)[0];
                                if (firstSentence && firstSentence.length > 5 && firstSentence.length < 100) {
                                    title = firstSentence.trim();
                                }
                            }
                        }

                        // Last resort, fall back to image alt text
                        if (!title) {
                            title = img.alt || img.getAttribute('aria-label') || undefined;
                        }

                        // Get image URLs
                        let thumbnailURL = img.src;
                        let screenshotURL = thumbnailURL;

                        // Pinterest media URLs can be upgraded to larger sizes
                        if (thumbnailURL && thumbnailURL.includes('236x')) {
                            // Convert thumbnail URL to larger size (736x is Pinterest's large size)
                            screenshotURL = thumbnailURL.replace('236x', '736x');
                        }

                        results.push({
                            url,
                            title,
                            thumbnailURL,
                            screenshotURL
                        });
                    }

                    return results;
                }

                // Wait for pins to load with polling
                return new Promise((resolve) => {
                    const maxAttempts = 40; // ~20 seconds total with 500ms intervals
                    let attempts = 0;

                    function checkForElements() {
                        // Look for any pin elements using a broader approach
                        let pinsFound = 0;
                        const checkSelectors = [
                            // Data attribute selectors
                            'div[data-test-id="pin"]',
                            'div[data-pin-id]',
                            'div[data-grid-item]',

                            // Semantic selectors
                            'div[role="listitem"]',

                            // Class/ID-based selectors
                            'div[class*="Pin"]',
                            'div[id*="Pin"]',
                            'a[href*="/pin/"]',
                            '.Grid__Item, .grid-item, .gridItem',
                            '.pin, .Pin, .pinWrapper, .pin-wrapper'

                            // Note: We exclude :has() selectors here as they might not be supported in all browsers
                        ];

                        // Try each selector individually
                        for (const selector of checkSelectors) {
                            try {
                                pinsFound += document.querySelectorAll(selector).length;
                            } catch (e) {
                                // Skip any problematic selectors
                            }
                        }

                        console.log("Checking for pins, found: " + pinsFound);

                        if (pinsFound > 0) {
                            // Elements found, extract data
                            resolve(extractPinterestData());
                        } else if (attempts < maxAttempts) {
                            // Not found yet, try again
                            attempts++;
                            setTimeout(checkForElements, 500);
                        } else {
                            // Timeout reached, return empty array
                            console.log("Timeout waiting for pins");
                            resolve([]);
                        }
                    }

                    // Start polling
                    checkForElements();
                });
            }

            return await waitForElements();`
        );

        // Parse the JSON result
        let results: DesignSearchResult[] = [];

        try {
            results = JSON.parse(jsResult).value;
        } catch (err) {
            console.error('Error parsing Pinterest results:', err);
        }

        // If we didn't find any results, log it
        if (results.length === 0) {
            console.log('[searchPinterest] No results found');
        }

        // Apply the limit parameter to restrict the number of results
        return results.slice(0, limit);
    } catch (error) {
        console.error('Error in searchPinterest:', error);
        return [];
    }
}

/**
 * Search for design inspiration on Awwwards
 */
async function searchAwwwards(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        // Use browser approach since Awwwards may block direct fetches or use JS rendering
        const searchUrl = `https://www.awwwards.com/inspiration_search/?text=${encodeURIComponent(query)}`;
        const jsResult = await runJavaScript(
            searchUrl,
            `async function waitForElements() {
                function extractAwwwardsData() {
                    // More specific selector targeting the new Awwwards inspiration layout
                    // Target the list items that contain the inspiration cards
                    const items = document.querySelectorAll('li.js-collectable, li.item-inspiration');
                    console.log("Found " + items.length + " inspiration items");

                    const results = [];

                    for (const item of items) {
                        try {
                            // Get the main card element that contains the image and links
                            const cardElement = item.querySelector('.card-site, .inspiration-item');
                            if (!cardElement) continue;

                            // Find the main figure section
                            const figure = cardElement.querySelector('figure');
                            if (!figure) continue;

                            // Find the main link and title
                            const mainLink = figure.querySelector('a.figure-rollover__link, a[href*="/inspiration/"]');
                            if (!mainLink) continue;

                            // Get the title - try multiple sources
                            let title = null;

                            // First look for the strong link in the info section which usually has the title
                            const titleElement = cardElement.querySelector('.card-site__info strong a, .inspiration-title');
                            if (titleElement) {
                                title = titleElement.textContent.trim();
                            }

                            // Find the image - prioritize the main content image
                            const img = figure.querySelector('img.figure-rollover__file, img.lazy, img.inspiration-img');
                            if (!img) continue;

                            // If we still don't have a title, try the alt text or aria-label
                            if (!title) {
                                title = img.getAttribute('alt') || mainLink.getAttribute('aria-label') || undefined;
                            }

                            // Get initial URL from the main card link
                            let url = new URL(mainLink.getAttribute('href'), window.location.origin).href;

                            // Look for the external link - prioritizing this is better as it goes to the actual site
                            const externalLink = figure.querySelector('a[target="_blank"][rel*="noopener"], .figure-rollover__right a.figure-rollover__bt[target="_blank"]');
                            if (externalLink && externalLink.getAttribute('href')) {
                                url = externalLink.getAttribute('href');
                                // Ensure URL is absolute
                                if (!url.startsWith('http')) {
                                    url = new URL(url, window.location.origin).href;
                                }
                            }

                            // Handle image URLs with special processing for Awwwards
                            let thumbnailURL = '';
                            let screenshotURL = '';

                            // Check for srcset first (preferred for high-quality images)
                            if (img.getAttribute('srcset')) {
                                const srcset = img.getAttribute('srcset');
                                console.log("Image srcset found:", srcset);
                                const srcsetParts = srcset.split(',');

                                // For thumbnail, use the 1x version if available
                                // For screenshot, use the 2x version or highest resolution available
                                for (const part of srcsetParts) {
                                    const [srcUrl, descriptor] = part.trim().split(/\s+/);
                                    console.log("Parsed srcset part:", srcUrl, descriptor);

                                    if (descriptor === '1x' && !thumbnailURL) {
                                        thumbnailURL = srcUrl;
                                        console.log("Found 1x thumbnail:", srcUrl);
                                    }

                                    if (descriptor === '2x' || descriptor === '3x') {
                                        screenshotURL = srcUrl;
                                        console.log("Found higher-res screenshot:", srcUrl);
                                        // Prefer the highest resolution
                                        if (descriptor === '3x') break;
                                    }
                                }
                            }

                            // Fallbacks if srcset parsing didn't yield results
                            if (!thumbnailURL) {
                                // Check for data-srcset first, which is common in lazy-loaded images
                                const dataSrcset = img.getAttribute('data-srcset');
                                if (dataSrcset) {
                                    const dataSrcsetParts = dataSrcset.split(',');
                                    if (dataSrcsetParts.length > 0) {
                                        const firstSrc = dataSrcsetParts[0].trim().split(/\s+/)[0];
                                        thumbnailURL = firstSrc;
                                        console.log("data-srcset-url:", dataSrcset);
                                    }
                                } else {
                                    // Try data-src for lazy-loaded images
                                    const dataSrc = img.getAttribute('data-src');
                                    if (dataSrc) {
                                        thumbnailURL = dataSrc;
                                        console.log("data-src-url:", dataSrc);
                                    } else {
                                        // Fallback to regular src attribute
                                        thumbnailURL = img.getAttribute('src');
                                        console.log("src-url:", thumbnailURL);
                                    }
                                }

                                // If it's the base64 placeholder image, try to get the real URL
                                if (thumbnailURL && thumbnailURL.startsWith('data:image/png;base64')) {
                                    console.log("Found base64 placeholder, looking for real image URL");
                                    // Try to find the real source from data-srcset
                                    const dataSrcset = img.getAttribute('data-srcset');
                                    if (dataSrcset) {
                                        const firstSrc = dataSrcset.split(',')[0].trim().split(/\s+/)[0];
                                        thumbnailURL = firstSrc;
                                        console.log("base64-replacement-url:", thumbnailURL);
                                    }
                                }
                            }

                            // If we still don't have a screenshot URL, use the thumbnail
                            if (!screenshotURL) {
                                screenshotURL = thumbnailURL;

                                // If we have a thumbnail URL from assets.awwwards.com, try to get a larger version
                                if (thumbnailURL && thumbnailURL.includes('assets.awwwards.com')) {
                                    // Replace thumbnail cache pattern with larger size
                                    if (thumbnailURL.includes('cache/thumb_')) {
                                        screenshotURL = thumbnailURL
                                            .replace('cache/thumb_440_330', 'cache/optimize')
                                            .replace('cache/thumb_417_299', 'cache/optimize')
                                            .replace('cache/thumb_880_660', 'cache/optimize')
                                            .replace('cache/thumb_', 'cache/optimize_');
                                        console.log("custom-screenshot-url:", screenshotURL);
                                    }
                                }
                            }

                            // Only add results with full URLs (not partial URLs)
                            // Store the image URLs in an object to be returned
                            const imgData = {
                                thumbnail: thumbnailURL,
                                screenshot: screenshotURL || thumbnailURL
                            };

                            // Only add if we have valid data
                            if (url) {
                                results.push({
                                    url,
                                    title: title || '',
                                    imageData: imgData
                                });
                            }
                        } catch (e) {
                            console.error("Error processing item:", e);
                            // Continue to the next item
                        }
                    }

                    return results;
                }

                // Wait for site items to load with polling
                return new Promise((resolve) => {
                    const maxAttempts = 30; // ~15 seconds total with 500ms intervals
                    let attempts = 0;

                    function checkForElements() {
                        // Look specifically for the inspiration list items
                        const inspirationItems = document.querySelectorAll('li.js-collectable, li.item-inspiration');
                        const itemsFound = inspirationItems.length;

                        console.log("Checking for Awwwards inspiration items, found: " + itemsFound);

                        if (itemsFound > 0) {
                            // Elements found, extract data
                            resolve(extractAwwwardsData());
                        } else if (attempts < maxAttempts) {
                            // Not found yet, try again
                            attempts++;
                            setTimeout(checkForElements, 500);
                        } else {
                            // Timeout reached, return empty array
                            console.log("Timeout waiting for inspiration items");
                            resolve([]);
                        }
                    }

                    // Start polling
                    checkForElements();
                });
            }

            return await waitForElements();`
        );

        // Parse the JSON result
        let results: DesignSearchResult[] = [];

        try {
            const parsed = JSON.parse(jsResult);
            // Process the parsed value to ensure URLs are complete
            if (parsed && parsed.value && Array.isArray(parsed.value)) {
                // Get all image URLs from logs
                const imgUrls: Record<string, string> = {};
                if (parsed.logs) {
                    for (const log of parsed.logs) {
                        // Look for the data-srcset-url: pattern
                        if (log.includes('data-srcset-url:')) {
                            const match = log.match(/data-srcset-url: (.+)$/);
                            if (match && match[1]) {
                                // Extract the first URL from the srcset
                                const firstUrl = match[1]
                                    .split(',')[0]
                                    .trim()
                                    .split(/\s+/)[0];
                                imgUrls[
                                    `srcset-${Object.keys(imgUrls).length}`
                                ] = firstUrl;
                            }
                        }
                        // Look for other URL patterns
                        else if (log.includes('data-src-url:')) {
                            const match = log.match(/data-src-url: (.+)$/);
                            if (match && match[1]) {
                                imgUrls[
                                    `data-src-${Object.keys(imgUrls).length}`
                                ] = match[1];
                            }
                        } else if (log.includes('src-url:')) {
                            const match = log.match(/src-url: (.+)$/);
                            if (match && match[1]) {
                                imgUrls[`src-${Object.keys(imgUrls).length}`] =
                                    match[1];
                            }
                        } else if (log.includes('base64-replacement-url:')) {
                            const match = log.match(
                                /base64-replacement-url: (.+)$/
                            );
                            if (match && match[1]) {
                                imgUrls[
                                    `base64-${Object.keys(imgUrls).length}`
                                ] = match[1];
                            }
                        } else if (log.includes('custom-screenshot-url:')) {
                            const match = log.match(
                                /custom-screenshot-url: (.+)$/
                            );
                            if (match && match[1]) {
                                imgUrls[
                                    `screenshot-${Object.keys(imgUrls).length}`
                                ] = match[1];
                            }
                        }
                    }
                }

                // Convert extracted data to DesignSearchResult format
                results = parsed.value.map((item: any, index: number) => {
                    // Try to get the proper image URLs from the extracted data
                    let thumbnailURL = '';
                    let screenshotURL = '';

                    // If we have imageData in the item, use that
                    if (item.imageData) {
                        thumbnailURL = item.imageData.thumbnail || '';
                        screenshotURL =
                            item.imageData.screenshot || thumbnailURL;
                    }

                    // If we still don't have valid URLs, use extracted URLs from logs
                    if (!thumbnailURL || thumbnailURL === 'http') {
                        // Use the most relevant URL for this index
                        const urlKeys = Object.keys(imgUrls);
                        if (urlKeys.length > 0 && urlKeys.length > index) {
                            thumbnailURL =
                                imgUrls[urlKeys[index % urlKeys.length]];

                            // For screenshot, prefer higher resolution or just use thumbnail
                            screenshotURL = thumbnailURL;
                            if (thumbnailURL.includes('cache/thumb_')) {
                                screenshotURL = thumbnailURL
                                    .replace(
                                        'cache/thumb_440_330',
                                        'cache/thumb_880_660'
                                    )
                                    .replace(
                                        'cache/thumb_417_299',
                                        'cache/thumb_880_660'
                                    );
                            }
                        }
                    }

                    return {
                        url: item.url,
                        title: item.title || '',
                        thumbnailURL,
                        screenshotURL,
                    };
                });
            }
        } catch (err) {
            console.error('Error parsing Awwwards results:', err);
        }

        // If we couldn't get any results, log it
        if (results.length === 0) {
            console.log('[searchAwwwards] No results found');
        }

        // Apply the limit parameter
        return results.slice(0, limit);
    } catch (error) {
        console.error('Error in searchAwwwards:', error);
        return [];
    }
}

/**
 * Generic web search for websites related to a query
 */
async function genericWebSearch(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        const random_agent_id = `design-search-${uuidv4()}`;

        // Randomly choose between OpenAI and Google engines
        const engines = ['openai', 'google'];
        let engine = engines[Math.floor(Math.random() * engines.length)];

        try {
            const searchQuery = `Please provide a list of up to ${limit} URLs for the most popular "${query}". Please return the results in JSON format [{url: 'https://...', title: 'Example Site'}, ...]. Only respond with the JSON, and no other text of comments.`;

            // Use web_search with the selected engine
            let result = await web_search(
                random_agent_id,
                engine,
                searchQuery,
                limit
            );

            // If the first engine fails, try the other one
            if (result.startsWith('Error:')) {
                console.log(
                    `[genericWebSearch] ${engine} search failed, trying alternative engine`
                );
                engine = engine === 'openai' ? 'google' : 'openai';
                result = await web_search(
                    random_agent_id,
                    engine,
                    searchQuery,
                    limit
                );
            }

            console.log('[genericWebSearch] Raw search result:', result);

            // Try to extract JSON from the result
            let jsonData = [];

            try {
                // First attempt: try parsing the entire response as JSON
                jsonData = JSON.parse(result);
            } catch (e) {
                console.log(
                    '[genericWebSearch] Could not parse entire result as JSON, trying to extract JSON array'
                );

                // Second attempt: look for array pattern using regex
                const jsonArrayMatch = result.match(
                    /\[\s*{(?:.|[\r\n])*?}\s*\]/
                );
                if (jsonArrayMatch) {
                    try {
                        jsonData = JSON.parse(jsonArrayMatch[0]);
                    } catch (innerError) {
                        console.error(
                            '[genericWebSearch] Failed to parse extracted JSON array:',
                            innerError
                        );
                    }
                }
            }

            if (Array.isArray(jsonData) && jsonData.length > 0) {
                // Filter out results that are clearly not websites
                const filteredResults = jsonData.filter(item => {
                    if (!item || !item.url) return false;

                    // Exclude common non-website results
                    return (
                        !item.url.includes('wikipedia.org') &&
                        !item.url.includes('youtube.com') &&
                        !item.url.includes('amazon.com') &&
                        !item.url.includes('reddit.com')
                    );
                });

                // Map to our format
                if (filteredResults.length > 0) {
                    const results = filteredResults.map(item => ({
                        url: item.url,
                        title: item.title || `${query} Website`,
                        thumbnailURL: undefined,
                        screenshotURL: undefined,
                    }));

                    console.log(
                        `[genericWebSearch] Successfully parsed ${results.length} results from ${engine}`
                    );
                    return results.slice(0, limit);
                }
            }

            console.log(
                '[genericWebSearch] No valid results extracted from search response'
            );
            return [];
        } catch (searchError) {
            console.error(
                '[genericWebSearch] Error performing search:',
                searchError
            );
            return [];
        }
    } catch (error) {
        console.error('Error in genericWebSearch:', error);
        return [];
    }
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

            // Find and fix any Envato URLs that need to be upgraded to higher resolution
            results.forEach(item => {
                // For Envato URLs we need to make sure thumbnails and screenshots have different resolutions
                if (
                    item.thumbnailURL &&
                    item.screenshotURL &&
                    item.thumbnailURL === item.screenshotURL
                ) {
                    // Only process URLs from Envato content delivery
                    if (
                        item.thumbnailURL.includes('envatousercontent.com') ||
                        item.thumbnailURL.includes('elements-cover-images')
                    ) {
                        console.log(
                            `[design_search] Enhancing screenshot quality for ${item.title}`
                        );

                        // Get the original URL
                        const originalUrl = item.thumbnailURL;

                        // Check for width parameter pattern (most common case)
                        if (originalUrl.includes('w=433')) {
                            // Change to higher resolution (710 or 1200 depending on what's available)
                            item.screenshotURL = originalUrl.replace(
                                'w=433',
                                'w=710'
                            );
                            console.log(
                                `[design_search] Set screenshotURL to higher resolution: ${item.screenshotURL.substring(0, 80) + '...'}`
                            );
                        }
                        // Alternative resolution patterns
                        else if (originalUrl.includes('w=316')) {
                            item.screenshotURL = originalUrl.replace(
                                'w=316',
                                'w=710'
                            );
                        } else if (originalUrl.includes('w=356')) {
                            item.screenshotURL = originalUrl.replace(
                                'w=356',
                                'w=710'
                            );
                        }
                        // If no width parameter is found but quality parameter exists
                        else if (originalUrl.includes('q=')) {
                            // Add width parameter or increase quality
                            if (!originalUrl.includes('w=')) {
                                // Add width parameter before quality
                                const qPos = originalUrl.indexOf('q=');
                                const beforeQ = originalUrl.substring(0, qPos);
                                const afterQ = originalUrl.substring(qPos);
                                item.screenshotURL = `${beforeQ}w=710&${afterQ}`;
                            } else {
                                // Increase quality only
                                item.screenshotURL = originalUrl.replace(
                                    'q=85',
                                    'q=95'
                                );
                            }
                        }
                    }
                }
            });

            break;
        case 'pinterest':
            results = await searchPinterest(query, limit);
            break;
        case 'awwwards':
            results = await searchAwwwards(query, limit);
            break;
        case 'web_search':
        default:
            results = await genericWebSearch(query, limit);
            break;
    }

    // Limit results
    results = results.slice(0, limit);

    // Take screenshots only if we don't already have image URLs
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

        // If we don't have any image URLs, take a screenshot
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
 * Create a custom tool for design_search
 */
export function getDesignSearchTools() {
    return [
        createToolFunction(
            design_search,
            'Search for design inspiration from high-quality, domain-specific sources - pick the engines that best fit the query.',
            {
                engine: {
                    type: 'string',
                    enum: DESIGN_SEARCH_ENGINES,
                    description: `Engine to use:\n${DESIGN_SEARCH_DESCRIPTIONS.join('\n')}`,
                },
                query: {
                    type: 'string',
                    description:
                        'Plain-language design query, e.g. "AI SaaS dashboard hero" or "e-commerce checkout flow".',
                },
                limit: {
                    type: 'number',
                    description:
                        'Maximum number of results to return (default: 9)',
                    optional: true,
                },
            }
        ),
    ];
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
    (ctx as any).patternQuality = 'best';
    (ctx as any).quality = 'best';
    (ctx as any).antialias = 'subpixel';

    // Helper function for improved progressive downsampling
    const drawScaled = (
        srcImg: any, // Use 'any' to bypass TS type checking for napi-rs/canvas compatibility
        dx: number,
        dy: number,
        dw: number,
        dh: number,
        srcWidth: number,
        srcHeight: number
    ) => {
        // Fast path for smaller images
        if (Math.max(srcWidth, srcHeight) < 1024) {
            ctx.drawImage(srcImg, dx, dy, dw, dh);
            return;
        }

        // Progressive down-scaling for large images
        let tmpCanvas = createCanvas(srcWidth, srcHeight);
        let tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.imageSmoothingEnabled = true;
        tmpCtx.imageSmoothingQuality = 'high';
        tmpCtx.drawImage(srcImg, 0, 0);

        let curW = tmpCanvas.width;
        let curH = tmpCanvas.height;

        // Scale down by halves until we're close to target size
        while (curW * 0.5 > dw && curH * 0.5 > dh) {
            curW = Math.round(curW * 0.5);
            curH = Math.round(curH * 0.5);
            const next = createCanvas(curW, curH);
            const nctx = next.getContext('2d');
            nctx.imageSmoothingEnabled = true;
            nctx.imageSmoothingQuality = 'high';
            nctx.drawImage(tmpCanvas, 0, 0, curW, curH);
            tmpCanvas = next;
            tmpCtx = nctx;
        }

        // Final draw to the main canvas
        ctx.drawImage(tmpCanvas, dx, dy, dw, dh);
    };

    for (let i = 0; i < images.length; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        try {
            // Load image based on available sources
            let img;
            const imageSource = images[i];

            if (imageSource.dataUrl) {
                // Directly load from data URL if available
                console.log(
                    `[createNumberedGrid] Loaded image from data URL ${imageSource.dataUrl}`
                );
                img = await loadImage(imageSource.dataUrl);
            } else if ((imageSource as DesignSearchResult).screenshotURL) {
                // Handle DesignSearchResult objects for backward compatibility
                const design = imageSource as DesignSearchResult;
                const src = design.thumbnailURL || design.screenshotURL;
                if (src.startsWith('data:image')) {
                    console.log(
                        `[createNumberedGrid] Loaded image from data:image thumbnailURL/screenshotURL ${src}`
                    );
                    img = await loadImage(src);
                } else if (
                    src.startsWith('/magi_output') &&
                    fs.existsSync(src)
                ) {
                    console.log(
                        `[createNumberedGrid] Loaded image from /magi_output from thumbnailURL/screenshotURL ${src}`
                    );
                    img = await loadImage(src);
                } else {
                    console.log(
                        `[createNumberedGrid] Loaded image from source URL from thumbnailURL/screenshotURL ${src}`
                    );
                    const res = await fetch(src);
                    const buf = Buffer.from(await res.arrayBuffer());
                    img = await loadImage(buf);
                }
            } else if (imageSource.url) {
                // Load from URL or file path
                if (imageSource.url.startsWith('data:image')) {
                    console.log(
                        `[createNumberedGrid] Loaded image from data:image URL ${imageSource.url}`
                    );
                    img = await loadImage(imageSource.url);
                } else if (
                    imageSource.url.startsWith('/magi_output') &&
                    fs.existsSync(imageSource.url)
                ) {
                    console.log(
                        `[createNumberedGrid] Loaded image from /magi_output ${imageSource.url}`
                    );
                    img = await loadImage(imageSource.url);
                } else {
                    console.log(
                        `[createNumberedGrid] Loaded image from source URL ${imageSource.url}`
                    );
                    const res = await fetch(imageSource.url);
                    const buf = Buffer.from(await res.arrayBuffer());
                    img = await loadImage(buf);
                }
            }

            if (!img) throw new Error('Failed to load image');

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

            // Draw the image with progressive downsampling for better quality
            drawScaled(
                img,
                destX,
                destY,
                scaledWidth,
                scaledHeight,
                img.width,
                img.height
            );
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

    return `data:image/png;base64,${out.toString('base64')}`;
}

/**
 * Generate a grid overview of all design asset screenshots.
 * Returns a base64 encoded PNG or null if no assets exist.
 */
export async function createDesignAssetsOverview(
    limit = 20
): Promise<string | null> {
    const screenshotsDir = path.join(DESIGN_ASSETS_DIR, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
        return null;
    }

    const files = fs
        .readdirSync(screenshotsDir)
        .filter(f => f.match(/\.(png|jpe?g)$/i))
        .slice(-limit);

    if (files.length === 0) return null;

    const sources: ImageSource[] = files.map(f => ({
        url: path.join(screenshotsDir, f),
        title: f,
    }));

    return createNumberedGrid(sources, 'design_assets_overview');
}

/**
 * Select the best items from a grid using a vision model
 */
export async function selectBestFromGrid(
    gridDataUrl: string,
    prompt: string,
    count: number,
    limit: number,
    isDesignSearch: boolean = true,
    type?: DESIGN_ASSET_TYPES,
    judge_guide?: string
): Promise<number[]> {
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
            content = `We are trying to create a "${prompt}" and are searching the web for design inspiration. We have ${count} images that we want to rank. When you rank the images, you should first choose only the relevant images. Once you have selected the relevant images, rank them by how aesthetically pleasing they are.`;
        } else {
            content = `I've generated ${count} different versions of "${prompt}". Please evaluate them and select the best version(s). Consider overall aesthetics, composition, and how well they match the prompt.`;
        }
    }

    if (judge_guide) {
        content += `\n\n${judge_guide}`;
    }

    content += `\n\nPlease select the best ${limit} images from the grid below. Respond only with their numbers, separated by commas. If no images are relevant or good quality, make the best_images array empty.`;

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

    const response = await quick_llm_call(messages, 'vision_mini', {
        name: 'ImageSelector',
        description: 'Select best images from grid',
        instructions:
            'You are a design assistant. Your job is to select the best images from a grid of images.',
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

    console.log('[selectBestFromGrid] LLM response:', response);

    const results = JSON.parse(response);
    if (results && results.best_images) {
        const selectedImages = results.best_images.map(
            (img: any) => img.number
        );
        console.log(`[selectBestFromGrid] Selected images: ${selectedImages}`);
        return selectedImages;
    } else {
        console.error('[selectBestFromGrid] No valid images selected');
        return [];
    }
}

/**
 * Generates a unique identifier for a design to prevent duplicate processing
 */
export function getDesignId(design: DesignSearchResult): string {
    return design.url || design.screenshotURL || JSON.stringify(design);
}

import { judgeImageSet } from './design/grid_judge.js';

/**
 * Raw design search configurations with iterative vision-based ranking
 * Accepts an array of search configurations to run in parallel
 */
export async function smart_design_raw(
    searchConfigs: {
        engine: DesignSearchEngine;
        query: string;
        limit?: number;
    }[],
    finalLimit: number = 3,
    type?: DESIGN_ASSET_TYPES,
    judge_guide?: string,
    prefix: string = 'smart'
): Promise<DesignSearchResult[]> {
    // Track designs that have been processed
    const processedIds = new Set<string>();

    // Use the first query as the main query for ranking purposes
    const mainQuery = searchConfigs.length > 0 ? searchConfigs[0].query : '';

    // Run all search queries in parallel
    const searchPromises = searchConfigs.map(config =>
        design_search(config.engine, config.query, config.limit)
            .then(res => {
                const parsed: DesignSearchResult[] = JSON.parse(res);
                return parsed.filter(item => item.screenshotURL);
            })
            .catch(e => {
                console.error(
                    'smart_design_raw search failed for',
                    config.engine,
                    e
                );
                return []; // Return empty array on error
            })
    );

    // Wait for all search promises to complete and flatten results
    let candidates: DesignSearchResult[] = [];
    try {
        const allResults = await Promise.all(searchPromises);
        candidates = allResults.flat();
    } catch (e) {
        console.error('Error awaiting search promises:', e);
        candidates = [];
    }

    // Main selection loop - continue processing in rounds until we reach the limit
    let round = 1;
    while (candidates.length > finalLimit) {
        console.log(
            `[smart_design_raw] Round ${round}: Processing ${candidates.length} candidates`
        );

        // Process the current candidates
        const roundWinners = await judgeImageSet({
            items: candidates,
            prompt: mainQuery,
            selectLimit: finalLimit,
            processedIds,
            getId: getDesignId,
            toImageSource: (item: any) => {
                // For design search, treat as DesignSearchResult
                const d = item as DesignSearchResult;
                return {
                    url: d.screenshotURL || d.thumbnailURL || d.url,
                    title: d.title,
                };
            },
            gridName: `${prefix}_search_round_${round}`,
            isDesignSearch: true,
            type,
            judgeGuide: judge_guide,
        });

        // Assign before checking for empty
        candidates = roundWinners;
        if (candidates.length === 0) break;

        round++;

        // If we have reached the limit or fewer, we're done
        if (candidates.length <= finalLimit) break;
    }

    // Final safety cap
    return candidates;
}

/**
 * High level design search with iterative vision-based ranking
 * Uses smart_design_raw with default engines
 */
export async function smart_design(
    query: string,
    limit: number = 3
): Promise<string> {
    // Build search configurations for all engines using the same query and a limit of 9 per engine
    const searchConfigs = DESIGN_SEARCH_ENGINES.map(engine => ({
        engine,
        query,
    }));

    // Run the raw design search with these configurations
    return JSON.stringify(
        await smart_design_raw(searchConfigs, limit),
        null,
        2
    );
}

export function getSmartDesignTools() {
    return [
        createToolFunction(
            smart_design,
            'An intelligent, multi-engine design search returns the top designs from across the web.',
            {
                query: {
                    type: 'string',
                    description:
                        'Design search query, e.g. "logo for an ai startup" or "homepage for a customer support tool"',
                },
                limit: {
                    type: 'number',
                    description: 'Number of results to return (default 3)',
                    optional: true,
                },
            }
        ),
    ];
}
