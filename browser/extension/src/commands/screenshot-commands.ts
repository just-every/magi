/* eslint-disable @typescript-eslint/no-explicit-any, no-irregular-whitespace, @typescript-eslint/no-unused-vars */
/**
 * Screenshot-related command handlers with enriched payload.
 */

import { ResponseMessage, ScreenshotParams } from '../types';
import {
    agentTabs,
    updateAgentTabActivity,
    attachedDebuggerTabs,
} from '../state/state';
import {
    attachDebugger,
    detachDebugger,
    sendDebuggerCommand,
    ensureViewportSize,
} from '../debugger/debugger-control';

/* ------------------------------------------------------------------ */
/* -------------------- Extended screenshot payload ----------------- */
/* ------------------------------------------------------------------ */

type Viewport = { w: number; h: number };

type ElementJSON = {
    id: number;         // index in array for click reference
    role: string;       // aria role or tag fallback
    tag: string;        // original tag name (e.g. 'a', 'button')
    x: number;
    y: number;
    w: number;
    h: number;
    cx: number;         // center point x
    cy: number;         // center point y
    label?: string;     // human-readable text label
    href?: string;      // for links/buttons with navigation
    type?: string;      // input/button type
    score?: number;     // interaction priority score
    offscreen?: boolean; // element is outside the viewport
};

type Payload = {
    screenshot: string; // base‑64 JPEG (data URL)
    view: Viewport; // current viewport (CSS px)
    full: { w: number; h: number }; // full‑page scroll size (CSS px)
    url: string; // current page URL
    elementMap: ElementJSON[]; // human‑readable element list
};

/**
 * Captures a full‑page screenshot together with a DOM snapshot and a compact
 * interactive‑element map. Maintains the debugger connection between calls
 * and retries up to 2 times on failure (same policy as previous
 * implementation).
 *
 * The function returns `{ status: 'ok', result: Payload }` on success.
 */
export async function screenshotHandler(
    tabId: string,
    params: ScreenshotParams
): Promise<ResponseMessage> {
    const includeCoreTabs = params.includeCoreTabs || false;
    console.log(
        `[screenshot-commands] Capturing full‑page screenshot for tab ${tabId}`
    );

    /* ---- validation & bookkeeping ---- */
    if (!agentTabs[tabId]) {
        return {
            status: 'error',
            error: `No tab found for agent ${tabId}. Initialize a tab first.`,
        };
    }

    const chromeTabId = agentTabs[tabId].chromeTabId;
    updateAgentTabActivity(tabId);

    /* ---- retry policy ---- */
    const maxRetries = 2;
    let retryCount = 0;
    let lastError: unknown = null;

    while (retryCount <= maxRetries) {
        try {
            /* 1. attach (or re‑use) debugger */
            if (!attachedDebuggerTabs.has(chromeTabId)) {
                const attached = await attachDebugger(chromeTabId);
                if (!attached)
                    throw new Error(
                        `Failed to attach debugger to tab ${chromeTabId}`
                    );
                console.log(
                    `[screenshot-commands] Debugger attached to tab ${chromeTabId}`
                );
            } else {
                console.log(
                    `[screenshot-commands] Re‑using existing debugger for tab ${chromeTabId}`
                );
            }

            // Ensure viewport is set to standard 1024×768 before capturing metrics
            await ensureViewportSize(chromeTabId);

            /* 2-5. Execute 4 independent operations in parallel:
                   - query metrics (layout & pixel ratio)
                   - capture screenshot
                   - take DOM snapshot
                   - retrieve tab info */
            const [
                metrics,
                { data: img },
                snap,
                tabInfo
            ] = await Promise.all([
                sendDebuggerCommand<any>(
                    chromeTabId,
                    'Page.getLayoutMetrics'
                ),

                sendDebuggerCommand<{ data: string }>(
                    chromeTabId,
                    'Page.captureScreenshot',
                    {
                        format: 'png',
                        fromSurface: true,
                        captureBeyondViewport: false,
                        optimizeForSpeed: true,
                    }
                ),

                sendDebuggerCommand<any>(
                    chromeTabId,
                    'DOMSnapshot.captureSnapshot',
                    {
                        computedStyles: [],
                        includeDOMRects: true,
                        includeInnerText: true,
                        includePaintOrder: false,
                    }
                ),

                new Promise<chrome.tabs.Tab>(resolve => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    chrome.tabs.get(chromeTabId, (t: any) => {
                        resolve(t as chrome.tabs.Tab);
                    });
                })
            ]);

            if (!img) throw new Error('Screenshot capture returned no data');

            const devicePixelRatio: number = metrics.devicePixelRatio ?? 1;
            const layoutViewport = metrics.layoutViewport ?? {
                clientWidth: metrics.cssLayoutViewport?.clientWidth ?? 1024,
                clientHeight: metrics.cssLayoutViewport?.clientHeight ?? 768,
            };
            const contentSize = metrics.contentSize ?? { width: 1024, height: 768 };

            /* 6. build readable interactive element map */
            const elementMap = buildElementArray(
                snap
            );

            /* 7. assemble payload */
            const currentUrl = tabInfo?.url ?? '';

            const payload: Payload & { coreTabs?: any[] } = {
                screenshot: `data:image/png;base64,${img}`,
                view: {
                    w: layoutViewport.clientWidth,
                    h: layoutViewport.clientHeight,
                },
                full: { w: contentSize.width, h: contentSize.height },
                url: currentUrl,
                elementMap,
            };

            // If includeCoreTabs is true, add the core tabs to the payload
            if (includeCoreTabs) {
                try {
                    // Get all open tabs and, if any, the IDs of groups titled "magi"
                    const [tabs, groups] = await Promise.all([
                        chrome.tabs.query({}),
                        chrome.tabGroups.query({})
                    ]);
                    const magiGroupIds = new Set<number>(
                        groups.filter(g => g.title === 'magi').map(g => g.id)
                    );

                    // Build core-tabs list in a single pass
                    const coreTabs = [];
                    for (const tab of tabs) {
                        const isMagiGroup =
                            tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE &&
                            magiGroupIds.has(tab.groupId);

                        if (
                            tab.active ||
                            (isMagiGroup && tab.url && tab.url !== 'about:blank') ||
                            tab.pinned
                        ) {
                            coreTabs.push({
                                id: tab.id,
                                title: tab.title || 'Untitled',
                                url: tab.url || '',
                                active: tab.active,
                                pinned: !!tab.pinned,
                                isMagiGroup
                            });
                        }
                    }

                    payload.coreTabs = coreTabs;
                } catch (error) {
                    console.error(
                        `[screenshot-commands] Failed to get core tabs:`,
                        error
                    );
                    // Continue with screenshot even if tab listing fails
                }
            }

            console.log(
                `[screenshot-commands] screenshotHandler() payload:`,
                payload
            );

            /* ---- success ---- */
            return {
                status: 'ok',
                result: payload,
            };
        } catch (error) {
            lastError = error;
            console.error(
                `[screenshot-commands] Screenshot attempt ${retryCount + 1}/${maxRetries + 1} failed for ${tabId}:`,
                error
            );

            if (retryCount < maxRetries) {
                /* detach & clean up before retry */
                try {
                    await detachDebugger(chromeTabId);
                    console.log(
                        `[screenshot-commands] Reset debugger connection for retry ${retryCount + 1}`
                    );
                } catch (detachError) {
                    console.warn(
                        '[screenshot-commands] Error during debugger reset before retry:',
                        detachError
                    );
                }
                /* brief back‑off */
                await new Promise(resolve =>
                    setTimeout(resolve, 300 * (retryCount + 1))
                );
            }

            retryCount++;
        }
    }

    /* ---- all retries exhausted ---- */
    return {
        status: 'error',
        error: `Screenshot failed after ${maxRetries + 1} attempts: ${
            lastError instanceof Error ? lastError.message : String(lastError)
        }`,
    };
}

/* ------------------------------------------------------------------ */
/* ---------------- helper functions + constants -------------------- */
/* ------------------------------------------------------------------ */

/**
 * Role → UInt8 mapping for binary element encoding.
 */
const ROLE_CODES: Record<string, number> = {
    button: 0,
    link: 1,
    textbox: 2,
    img: 3,
};

/**
 * Clamp a number to the UInt16 range.
 */
const clamp = (n: number): number =>
    Math.max(0, Math.min(65535, Math.round(n)));

/**
 * Portable ArrayBuffer → base64 converter (browser & Node environments).
 */
function b64(buf: ArrayBuffer): string {
    /* browser */
    if (typeof btoa === 'function') {
        let binary = '';
        const bytes = new Uint8Array(buf);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    /* Node / test runner */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof Buffer !== 'undefined')
        return (Buffer as any).from(buf).toString('base64');

    throw new Error('Base64 encoding not supported in this environment');
}

/**
 * Convert DOMSnapshot into an array of interactive elements with scores
 * to prioritize important elements for clicking/interaction.
 *
 * Elements are scored based on:
 * - Visibility in viewport
 * - Element type (input, button, link, etc.)
 * - Size/area (larger elements are easier to click)
 * - Position (elements at top of page often include menus)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildElementArray(
    snap: any,
    viewportWidth = 1024,
    viewportHeight = 768
): ElementJSON[] {
    const doc = snap.documents?.[0];
    const strings: string[] = snap.strings ?? [];
    const { nodes, layout } = doc ?? {};

    if (!nodes || !layout) {
        return [];
    }

    // Extract arrays from NodeTreeSnapshot (Chrome ≥118 format)
    const nodeNames: number[] = nodes.nodeName ?? [];
    const nodeAttrs: any[] = nodes.attributes ?? [];
    // isClickable may be a RareBooleanData object with values and index arrays
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isClickable = nodes.isClickable?.values ?? []; // Chrome 118+

    type RawEl = {
        role: string;
        tag: string;         // Original tag name
        x: number;
        y: number;
        w: number;
        h: number;
        labelIdx?: number;
        label?: string;      // Direct label text
        href?: string;       // For links
        type?: string;       // For inputs and buttons
        score?: number;      // Interactivity score
        offscreen?: boolean; // Element is outside viewport
    };
    let elements: RawEl[] = [];

    /* -------- local string table (only labels actually used) -------- */
    const labelTable: string[] = [];
    const strIndexMap = new Map<number, number>();
    const toLocalIdx = (globalIdx: number | undefined): number | undefined => {
        if (globalIdx === undefined) return undefined;
        if (!strIndexMap.has(globalIdx)) {
            // Cap label table at 250 entries to ensure labelIdx < 255
            if (labelTable.length >= 250) return undefined;
            strIndexMap.set(globalIdx, labelTable.length);
            labelTable.push(strings[globalIdx] || '');
        }
        return strIndexMap.get(globalIdx);
    };

    // More comprehensive set of interactive roles for better accessibility mapping
    const allowedRoles = new Set([
        'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox',
        'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
        'option', 'slider', 'spinbutton', 'switch', 'tab', 'searchbox',
        'img', 'heading', 'banner', 'main', 'navigation', 'region'
    ]);

    const allowedTags = new Set([
        'A', 'BUTTON', 'INPUT', 'TEXTAREA', 'IMG', 'SELECT', 'AREA',
        'DETAILS', 'SUMMARY', 'OPTION', 'LABEL', 'FIELDSET', 'LEGEND',
        'VIDEO', 'AUDIO', 'MAP', 'CANVAS'
    ]);

    // Minimum size in square pixels for an element to be considered interactive
    const MIN_AREA = 400; // 20x20px or equivalent
    const MIN_DIMENSION = 12; // Absolute minimum size in either dimension

    // Extract innerText from text nodes
    const texts = layout.text ?? [];

    /* Modern DOMSnapshot has layout as an object with parallel arrays */
    const nodeIndices = layout.nodeIndex ?? [];
    const bounds = layout.bounds ?? [];

    // Check if arrays exist
    if (!Array.isArray(nodeIndices) || !Array.isArray(bounds)) {
        console.warn(
            '[screenshot-commands] Layout missing nodeIndex or bounds arrays'
        );
        return [];
    }

    // Detect bounds format: flat (length = nodeIndices.length * 4) or parallel (length = nodeIndices.length)
    const flatBounds = bounds.length === nodeIndices.length * 4;
    const getRect = (i: number): [number, number, number, number] =>
        flatBounds
            ? [
                  bounds[i * 4],
                  bounds[i * 4 + 1],
                  bounds[i * 4 + 2],
                  bounds[i * 4 + 3],
              ]
            : (bounds[i] ?? [0, 0, 0, 0]);

    // Determine how many nodes to process
    const length = Math.min(
        nodeIndices.length,
        flatBounds ? Math.floor(bounds.length / 4) : bounds.length
    );
    console.log(
        `[screenshot-commands] Processing ${length} nodes with ${flatBounds ? 'flat' : 'parallel'} bounds format`
    );

    // Iterate through layout
    for (let i = 0; i < length; i++) {
        const nodeIdx = nodeIndices[i];
        // Get rectangle coordinates based on bounds format
        const [x, y, w, h] = getRect(i);

        // Skip elements that are too small
        if (w === 0 || h === 0) continue;
        if (w * h < MIN_AREA) continue;
        if (w < MIN_DIMENSION && h < MIN_DIMENSION) continue;

        // Get tag name from nodeName
        const tagStr = strings[nodeNames[nodeIdx]] || '';

        // Extract role from attributes (flattened name/value pairs)
        let roleStr = '';
        let href = '';
        let ariaLabel = '';
        let title = '';
        let alt = '';
        let placeholder = '';

        const attrs = nodeAttrs[nodeIdx] ?? [];
        for (let j = 0; j < attrs.length; j += 2) {
            const attrName = strings[attrs[j]] || '';
            const attrValue = strings[attrs[j + 1]] || '';

            if (attrName === 'role') {
                roleStr = attrValue;
            } else if (attrName === 'href' && tagStr === 'A') {
                href = attrValue;
            } else if (attrName === 'aria-label') {
                ariaLabel = attrValue;
            } else if (attrName === 'title') {
                title = attrValue;
            } else if (attrName === 'alt' && tagStr === 'IMG') {
                alt = attrValue;
            } else if (attrName === 'placeholder' && (tagStr === 'INPUT' || tagStr === 'TEXTAREA')) {
                placeholder = attrValue;
            }
        }

        // Skip elements that don't have allowed roles or tags
        if (!allowedRoles.has(roleStr) && !allowedTags.has(tagStr)) continue;

        // Skip presentation/generic elements with empty labels
        if (roleStr === 'presentation' && !ariaLabel && !title && !alt) continue;

        // Determine the best label using our priority hierarchy
        let label = ariaLabel || alt || title || placeholder || '';

        // If no static labels found, try to extract innerText if available
        if (!label && texts && texts[i] !== undefined) {
            const textIndex = texts[i];
            if (textIndex >= 0 && textIndex < strings.length) {
                label = strings[textIndex] || '';
                // Trim and limit innerText length
                label = label.trim().substring(0, 50);
                if (label.length === 50) label += '...';
            }
        }

        // Extract type attribute for inputs and buttons
        let type = '';
        if (tagStr === 'INPUT' || tagStr === 'BUTTON') {
            for (let j = 0; j < attrs.length; j += 2) {
                if (strings[attrs[j]] === 'type') {
                    type = strings[attrs[j + 1]] || '';
                    break;
                }
            }
        }

        // Check if element is in viewport
        const inViewport = (x < viewportWidth && x + w > 0 && y < viewportHeight && y + h > 0);
        const fullyInViewport = (x >= 0 && x + w <= viewportWidth && y >= 0 && y + h <= viewportHeight);

        // Calculate distance to viewport center
        const centerX = viewportWidth / 2;
        const centerY = viewportHeight / 2;
        const elementCenterX = x + w / 2;
        const elementCenterY = y + h / 2;
        const distanceToCenter = Math.sqrt(
            Math.pow(elementCenterX - centerX, 2) +
            Math.pow(elementCenterY - centerY, 2)
        );

        // Calculate score based on criteria
        let score = 0;

        // Viewport visibility
        if (inViewport) score += 60;
        if (fullyInViewport) score += 40;

        // Element type bonuses
        if (tagStr === 'INPUT' || tagStr === 'TEXTAREA' || tagStr === 'SELECT') {
            if (w >= 10 && h >= 10) score += 30;
        }
        if (tagStr === 'BUTTON' || roleStr === 'button') {
            if (w >= 8 && h >= 8) score += 25;
        }
        if (tagStr === 'A' && href) {
            if (w >= 8 && h >= 8) score += 20;
        }
        if (roleStr === 'checkbox' || roleStr === 'radio' || roleStr === 'menuitem') {
            if (w >= 6 && h >= 6) score += 10;
        }

        // Size bonus (log base 2 of area, capped at 15)
        const area = w * h;
        const areaBonus = Math.min(15, Math.log2(area > 0 ? area : 1));
        score += areaBonus;

        // Distance penalty (avoid too much penalty for offscreen elements)
        const distancePenalty = Math.log2(distanceToCenter + 50);
        score -= distancePenalty;

        elements.push({
            role: roleStr || tagStr.toLowerCase(),
            tag: tagStr,
            x,
            y,
            w,
            h,
            label, // Store the direct label we constructed
            href: href || undefined,
            type: type || undefined,
            score, // Store the calculated interaction score
            offscreen: !inViewport // Flag for elements outside viewport
        });
    }

    /* ----- deduplicate overlapping elements & cap count ----- */
    elements.sort((a, b) => b.w * b.h - a.w * a.h);
    const filtered: typeof elements = [];

    // Use variable IOU threshold based on element size
    const getIOUThreshold = (area: number) => {
        return area > 10000 ? 0.9 : 0.6; // Lower threshold for smaller elements
    };

    const MAX_ELEMENTS = 200;

    for (const el of elements) {
        let skip = false;
        const elArea = el.w * el.h;
        const threshold = getIOUThreshold(elArea);

        for (const kept of filtered) {
            const ix = Math.max(
                0,
                Math.min(el.x + el.w, kept.x + kept.w) - Math.max(el.x, kept.x)
            );
            const iy = Math.max(
                0,
                Math.min(el.y + el.h, kept.y + kept.h) - Math.max(el.y, kept.y)
            );
            const inter = ix * iy;
            if (inter > 0) {
                const union = el.w * el.h + kept.w * kept.h - inter;
                if (inter / union >= threshold) {
                    skip = true;
                    break;
                }
            }
        }
        if (!skip) {
            filtered.push(el);
            if (filtered.length >= MAX_ELEMENTS) break;
        }
    }
    elements = filtered;

    /* ----- Sort by score and build high-quality element list ----- */

    // First, sort by score (descending), then by y-position (ascending) as secondary sort
    elements.sort((a, b) => {
        // Primary sort: score (descending)
        if ((b.score || 0) !== (a.score || 0)) {
            return (b.score || 0) - (a.score || 0);
        }
        // Secondary sort: y-position (ascending - top elements first)
        return a.y - b.y;
    });

    /* ----- build human‑readable JSON list with all required fields ----- */
    const elementJson: ElementJSON[] = elements.map((el, index) => {
        // Calculate center point coordinates
        const cx = Math.round(el.x + el.w / 2);
        const cy = Math.round(el.y + el.h / 2);

        return {
            id: index + 1, // Use 1-based indexing for human readability
            role: el.role,
            tag: el.tag,
            x: Math.round(el.x),
            y: Math.round(el.y),
            w: Math.round(el.w),
            h: Math.round(el.h),
            cx,
            cy,
            label: el.label,
            href: el.href,
            type: el.type,
            score: el.score,
            offscreen: el.offscreen
        };
    });

    // Log details about scoring results
    const inViewport = elementJson.filter(el => !(el.offscreen)).length;
    console.log(`[screenshot-commands] Scored ${elementJson.length} elements, ${inViewport} in viewport`);

    return elementJson;
}
