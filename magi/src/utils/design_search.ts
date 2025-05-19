/**
 * Design Search Utility
 *
 * Provides tools for searching design inspiration from various sources including:
 * - Dribbble
 * - Behance
 * - Envato/ThemeForest
 * - Pinterest
 * - Awwwards
 * - SiteInspire
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

const USER_AGENT =
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; magi-user/1.0; +https://withmagi.com)';

// Type definitions
export interface DesignSearchResult {
    url: string;
    title?: string;
    thumbnailURL?: string;
    screenshotURL?: string;
    screenshotPath?: string;
}

export type DesignSearchEngine =
    | 'dribbble'
    | 'behance'
    | 'envato'
    | 'pinterest'
    | 'awwwards'
    | 'siteinspire'
    | 'web_search';

// Base directory for storing screenshots
const DESIGN_ASSETS_DIR = '/magi_output/shared/design_assets';
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
        await session.navigate(url);

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

        console.log(`[searchBehance] Loading URL in browser: ${url}`);

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

        console.log('[searchBehance] jsResult:', jsResult);

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
        console.log(`[searchEnvato] Loading Envato Elements URL: ${envatoUrl}`);

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

        console.log('[searchEnvato] jsResult:', jsResult);

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

        console.log('[searchPinterest] jsResult:', jsResult);

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
        console.log(`[searchAwwwards] Loading URL in browser: ${searchUrl}`);

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
                            let thumbnailURL;
                            let screenshotURL;

                            // Check for srcset first (preferred for high-quality images)
                            if (img.getAttribute('srcset')) {
                                const srcset = img.getAttribute('srcset');
                                const srcsetParts = srcset.split(',');

                                // For thumbnail, use the 1x version if available
                                // For screenshot, use the 2x version or highest resolution available
                                for (const part of srcsetParts) {
                                    const [url, descriptor] = part.trim().split(/\s+/);

                                    if (descriptor === '1x' && !thumbnailURL) {
                                        thumbnailURL = url;
                                    }

                                    if (descriptor === '2x' || descriptor === '3x') {
                                        screenshotURL = url;
                                        // Prefer the highest resolution
                                        if (descriptor === '3x') break;
                                    }
                                }
                            }

                            // Fallbacks if srcset parsing didn't yield results
                            if (!thumbnailURL) {
                                // Try data-src for lazy-loaded images first
                                thumbnailURL = img.getAttribute('data-src') || img.getAttribute('src');

                                // If it's the base64 placeholder image, try to get the real URL
                                if (thumbnailURL && thumbnailURL.startsWith('data:image/png;base64')) {
                                    // Try to find the real source from data-srcset
                                    const dataSrcset = img.getAttribute('data-srcset');
                                    if (dataSrcset) {
                                        const firstSrc = dataSrcset.split(',')[0].trim().split(/\s+/)[0];
                                        thumbnailURL = firstSrc;
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
                                            .replace('cache/thumb_', 'cache/optimize_');
                                    }
                                }
                            }

                            // Only add if we have valid data
                            if (url && (thumbnailURL || screenshotURL)) {
                                results.push({
                                    url,
                                    title,
                                    thumbnailURL,
                                    screenshotURL: screenshotURL || thumbnailURL
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

        console.log('[searchAwwwards] jsResult:', jsResult);

        // Parse the JSON result
        let results: DesignSearchResult[] = [];

        try {
            results = JSON.parse(jsResult).value;
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
 * Search for design inspiration on SiteInspire
 */
async function searchSiteInspire(
    query: string,
    limit: number = 9
): Promise<DesignSearchResult[]> {
    try {
        // Use browser approach since SiteInspire may have JS-based rendering
        const siteInspireUrl = `https://www.siteinspire.com/websites?search=${encodeURIComponent(query)}`;
        console.log(
            `[searchSiteInspire] Loading URL in browser: ${siteInspireUrl}`
        );

        const jsResult = await runJavaScript(
            siteInspireUrl,
            `async function waitForElements() {
                function extractSiteInspireData() {
                    // Prioritize elements with the website-card data-testid attribute
                    const primarySelector = 'div[data-testid="website-card"]';

                    // Fallback selectors in case the primary one doesn't work
                    const fallbackSelectors = [
                        // Semantic elements
                        'figure', // Figure elements commonly used for sites
                        'article', // Semantic article elements

                        // Attribute-based selectors (most stable)
                        'div[data-website-id]', // Website IDs
                        'div[data-site-id]', // Site IDs
                        'div[data-id]', // Generic IDs
                        'div[role="listitem"]', // Accessibility role

                        // URL pattern detection
                        'a[href*="/websites/"]', // Links to websites
                        'a[href*="/sites/"]', // Links to sites
                        'a[href*="/inspiration/"]', // Links to inspiration

                        // Structure-based selectors
                        'div:has(img):has(a[href*="/websites/"])', // Container with image and website link
                        'figure:has(img):has(figcaption)', // Figure with image and caption

                        // Class-based selectors with wildcards
                        'div[class*="website"], div[class*="site"]', // Website/site classes
                        'div[class*="card"], div[class*="Card"]', // Card classes
                        'div[class*="grid-item"], div[class*="gridItem"]', // Grid items

                        // Original selectors as fallbacks
                        'figure.item',
                        '.websites .site',
                        '.website-item',
                        'article.website',
                        '.grid-item',

                        // Last resort - generic but likely to match website grid items
                        'div.grid > div', // Grid child elements
                        'ul > li:has(img)' // List items with images
                    ];

                    // First try the primary selector (data-testid="website-card")
                    let items = document.querySelectorAll(primarySelector);
                    if (items && items.length > 0) {
                        console.log("Found items with primary selector: " + primarySelector + ", count: " + items.length);
                    } else {
                        // If primary selector doesn't find elements, try fallbacks
                        for (const selector of fallbackSelectors) {
                            try {
                                const elements = document.querySelectorAll(selector);
                                if (elements && elements.length > 0) {
                                    items = elements;
                                    console.log("Found items with fallback selector: " + selector + ", count: " + elements.length);
                                    break;
                                }
                            } catch (e) {
                                // Skip any problematic selectors
                                console.log("Selector error: " + e.message);
                            }
                        }
                    }

                    const results = [];

                    for (const item of items) {
                        // Find the link to the SiteInspire page
                        const anchor = item.querySelector('a');
                        if (!anchor) continue;

                        // Get full URL (handling relative URLs)
                        const href = anchor.getAttribute('href');
                        let url = href.startsWith('http') ?
                            href :
                            new URL(href, window.location.origin).href;

                        // Check if this is a valid website card
                        const isWebsiteCard = item.getAttribute('data-testid') === 'website-card';

                        // If not a website card with data-testid, filter out ads via URL
                        if (!isWebsiteCard && url.includes('utm_source=siteinspire')) continue;

                        // Look for external link button which links to the actual site
                        const externalLinkButton = item.querySelector('a[target="_blank"][rel="noreferrer"][aria-label^="Visit"]');
                        if (externalLinkButton) {
                            const originalUrl = externalLinkButton.getAttribute('href');
                            if (originalUrl) {
                                // Remove any SiteInspire referral parameters
                                url = originalUrl.split('?ref=siteinspire')[0];
                            }
                        }

                        // Find image
                        const img = item.querySelector('img');
                        if (!img) continue;

                        // Try to get title from various sources
                        let title = anchor.getAttribute('title') || img.getAttribute('alt') || undefined;

                        if (!title) {
                            // Look for title in other elements
                            const titleEl = item.querySelector('.title, [data-title], h2, h3, figcaption');
                            if (titleEl) title = titleEl.textContent.trim();
                        }

                        // Get image URLs
                        let thumbnailURL;
                        let screenshotURL;

                        // First try the src attribute
                        const src = img.getAttribute('src');
                        const dataSrc = img.getAttribute('data-src');

                        // Check if we have a srcset attribute with various sizes
                        const srcset = img.getAttribute('srcset');
                        if (srcset) {
                            try {
                                // Parse the srcset to extract different image sizes
                                const srcsetEntries = srcset.split(',').map(entry => entry.trim());

                                // Look for specific sizes
                                for (const entry of srcsetEntries) {
                                    if (!entry) continue;
                                    const parts = entry.split(/\s+/);
                                    if (parts.length < 2) continue;

                                    const [url, size] = parts;

                                    // For thumbnail, use smaller sizes (384px or 640px width)
                                    if (/384w|640w/.test(size) && !thumbnailURL) {
                                        thumbnailURL = url;
                                    }

                                    // For screenshot, prefer the largest size (1920w)
                                    if (/1920w/.test(size)) {
                                        screenshotURL = url;
                                    }
                                }
                            } catch (err) {
                                console.log("Error parsing srcset:", err);
                            }
                        }

                        // Fallback to src if no thumbnailURL from srcset
                        if (!thumbnailURL) {
                            thumbnailURL = dataSrc || src;
                        }

                        // Fallback to src if no screenshotURL from srcset
                        if (!screenshotURL) {
                            screenshotURL = dataSrc || src;
                        }

                        // Test for SiteInspire's specific image URL format
                        if (thumbnailURL && thumbnailURL.includes('/cdn-cgi/image/width=')) {
                            // Good - we have proper URLs
                        } else if (thumbnailURL && thumbnailURL.includes('compress=true/')) {
                            // Handle partial URLs - add the base part
                            const baseUrl = 'https://r2.siteinspire.com/cdn-cgi/image/width=384,quality=75,format=auto,metadata=none,gravity=top,fit=crop,compress=true/';
                            const screenshotBaseUrl = 'https://r2.siteinspire.com/cdn-cgi/image/width=1920,quality=75,format=auto,metadata=none,gravity=top,fit=crop,compress=true/';

                            // Extract the filename part
                            const filenamePart = thumbnailURL.split('compress=true/')[1];
                            if (filenamePart) {
                                thumbnailURL = baseUrl + filenamePart;
                                screenshotURL = screenshotBaseUrl + filenamePart;
                            }
                        }

                        if (url && thumbnailURL) {
                            results.push({
                                url,
                                title,
                                thumbnailURL,
                                screenshotURL
                            });
                        }
                    }

                    return results;
                }

                // Wait for site items to load with polling
                return new Promise((resolve) => {
                    const maxAttempts = 30; // ~15 seconds total with 500ms intervals
                    let attempts = 0;

                    function checkForElements() {
                        // First check for the primary data-testid="website-card" selector
                        const primaryItemsFound = document.querySelectorAll('div[data-testid="website-card"]').length;

                        // If primary items are found, we can use those directly
                        if (primaryItemsFound > 0) {
                            console.log("Found website cards with data-testid: " + primaryItemsFound);
                            resolve(extractSiteInspireData());
                            return;
                        }

                        // Otherwise, check for site items using more robust selectors
                        let itemsFound = 0;
                        const checkSelectors = [
                            // Semantic elements
                            'figure',
                            'article',

                            // Attribute-based selectors
                            'div[data-website-id]',
                            'div[data-site-id]',
                            'div[data-id]',
                            'div[role="listitem"]',

                            // URL pattern detection
                            'a[href*="/websites/"]',
                            'a[href*="/sites/"]',
                            'a[href*="/inspiration/"]',

                            // Class-based selectors
                            'div[class*="website"], div[class*="site"]',
                            'div[class*="card"], div[class*="Card"]',
                            'div[class*="grid-item"], div[class*="gridItem"]',

                            // Original selectors as fallbacks
                            'figure.item',
                            '.websites .site',
                            '.website-item',
                            'article.website',
                            '.grid-item',

                            // Generic grid selectors
                            'div.grid > div'

                            // Note: :has() selectors excluded for compatibility
                        ];

                        // Try each selector individually
                        for (const selector of checkSelectors) {
                            try {
                                itemsFound += document.querySelectorAll(selector).length;
                            } catch (e) {
                                // Skip any problematic selectors
                            }
                        }

                        console.log("Checking for site items, found: " + itemsFound);

                        if (itemsFound > 0) {
                            // Elements found, extract data
                            resolve(extractSiteInspireData());
                        } else if (attempts < maxAttempts) {
                            // Not found yet, try again
                            attempts++;
                            setTimeout(checkForElements, 500);
                        } else {
                            // Timeout reached, return empty array
                            console.log("Timeout waiting for site items");
                            resolve([]);
                        }
                    }

                    // Start polling
                    checkForElements();
                });
            }

            return await waitForElements();`
        );

        console.log('[searchSiteInspire] jsResult:', jsResult);

        // Parse the JSON result
        let results: DesignSearchResult[] = [];

        try {
            results = JSON.parse(jsResult).value;
        } catch (err) {
            console.error('Error parsing SiteInspire results:', err);
        }

        // If no results found, log it
        if (results.length === 0) {
            console.log('[searchSiteInspire] No results found');
        }

        // Apply the limit parameter
        return results.slice(0, limit);
    } catch (error) {
        console.error('Error in searchSiteInspire:', error);
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

        console.log(`[genericWebSearch] Using ${engine} for search`);

        try {
            const searchQuery = `Please provide a list of up to ${limit} URLs for the most popular sites matching "${query}". Please return the results in JSON format [{url: 'https://...', title: 'Example Site'}, ...]. Only respond with the JSON, and not other text of comments.`;

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

    console.log(`[design_search] Searching for "${query}" on ${engine}...`);
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
        case 'siteinspire':
            results = await searchSiteInspire(query, limit);
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
    const availableEngines: string[] = [
        'dribbble',
        'behance',
        'envato',
        'pinterest',
        'awwwards',
        'siteinspire',
        'web_search',
    ];

    const engineDescriptions: string[] = [
        '- dribbble: massive designer-driven “shot” gallery focused on UI/UX, branding and motion—great for modern micro-interactions or single-component screenshots',
        '- behance: Adobe’s portfolio network; long-form project breakdowns and full site/brand presentations—ideal when you need contextual hero + entire flow in one deck',
        '- envato: ThemeForest marketplace with thousands of production-ready site templates—best for full-page screenshots that already ship with code',
        '- pinterest: broad, lifestyle-driven inspiration boards—handy for eclectic or non-web visuals and quick style tiles',
        '- awwwards: daily judged showcase of cutting-edge, interactive web experiences—use this for avant-garde, animation-heavy screenshots',
        '- siteinspire: hand-picked collection of typography-led, grid-perfect sites—great for minimal or content-heavy page examples',
        '- web_search: broad web crawl; use when you need raw screenshots beyond the curated sources (lower signal, but widest net)',
    ];

    return [
        createToolFunction(
            design_search,
            'Search for design inspiration from high-quality, domain-specific sources - pick the engines that best fit the query.',
            {
                engine: {
                    type: 'string',
                    enum: availableEngines,
                    description: `Engine to use:\n${engineDescriptions.join('\n')}`,
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
