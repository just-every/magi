/**
 * Utility functions for working with Chrome DevTools Protocol
 * to extract browser information like element maps and interactive elements
 */

// Element map type definitions - matching original extension format
export type Viewport = { w: number; h: number };

export type ElementJSON = {
    id: number; // index in array for click reference
    role: string; // aria role or tag fallback
    tag: string; // original tag name (e.g. 'a', 'button')
    x: number;
    y: number;
    w: number;
    h: number;
    cx: number; // center point x
    cy: number; // center point y
    label?: string; // human-readable text label
    href?: string; // for links/buttons with navigation
    type?: string; // input/button type
    score?: number; // interaction priority score
    offscreen?: boolean; // element is outside the viewport
};

export type BrowserStatusPayload = {
    screenshot: string; // base‑64 PNG (data URL)
    view: Viewport; // current viewport (CSS px)
    full: { w: number; h: number }; // full‑page scroll size (CSS px)
    url: string; // current page URL
    elementMap: ElementJSON[]; // human‑readable element list
    coreTabs?: any[]; // Optional core tabs for multi-tab scenarios
};

/**
 * Builds an array of interactive elements from a DOM snapshot, correcting
 * coordinates for device pixel ratio to ensure output is in CSS pixels.
 * @param snap The DOM snapshot returned by DOMSnapshot.captureSnapshot
 * @param viewportWidth The width of the viewport in CSS pixels
 * @param viewportHeight The height of the viewport in CSS pixels
 * @param devicePixelRatio The actual device pixel ratio of the screen/emulation
 * @returns Array of interactive elements with properties needed for interaction (CSS pixels)
 */
export function buildElementArray(
    snap: any,
    viewportWidth = 1024,
    viewportHeight = 768,
    devicePixelRatio = 1 // Default to 1 if not provided
): ElementJSON[] {
    const doc = snap.documents?.[0];
    const strings: string[] = snap.strings ?? [];
    const { nodes, layout } = doc ?? {};

    if (!nodes || !layout) {
        console.log(
            '[browser_helpers] Missing nodes or layout in DOM snapshot'
        );
        return [];
    }

    // Extract arrays from NodeTreeSnapshot
    const nodeNames: number[] = nodes.nodeName ?? [];
    const nodeAttrs: any[] = nodes.attributes ?? [];

    type RawEl = {
        role: string;
        tag: string;
        x: number; // Will store corrected CSS pixels
        y: number; // Will store corrected CSS pixels
        w: number; // Will store corrected CSS pixels
        h: number; // Will store corrected CSS pixels
        label?: string;
        href?: string;
        type?: string;
        score?: number;
        offscreen?: boolean;
    };
    let elements: RawEl[] = [];

    // Allowed roles and tags (keep as is)
    const allowedRoles = new Set([
        /* ... roles ... */ 'button',
        'link',
        'textbox',
        'checkbox',
        'radio',
        'combobox',
        'listbox',
        'menuitem',
        'menuitemcheckbox',
        'menuitemradio',
        'option',
        'slider',
        'spinbutton',
        'switch',
        'tab',
        'searchbox',
        'img',
        'heading',
        'banner',
        'main',
        'navigation',
        'region',
    ]);
    const allowedTags = new Set([
        /* ... tags ... */ 'A',
        'BUTTON',
        'INPUT',
        'TEXTAREA',
        'IMG',
        'SELECT',
        'AREA',
        'DETAILS',
        'SUMMARY',
        'OPTION',
        'LABEL',
        'FIELDSET',
        'LEGEND',
        'VIDEO',
        'AUDIO',
        'MAP',
        'CANVAS',
    ]);
    const MIN_AREA = 400;
    const MIN_DIMENSION = 12;
    const texts = layout.text ?? [];
    const nodeIndices = layout.nodeIndex ?? [];
    const bounds = layout.bounds ?? [];

    if (!Array.isArray(nodeIndices) || !Array.isArray(bounds)) {
        console.warn(
            '[browser_helpers] Layout missing nodeIndex or bounds arrays'
        );
        return [];
    }

    const flatBounds = bounds.length === nodeIndices.length * 4;
    // --- IMPORTANT: Coordinate Correction ---
    // This function now gets raw coordinates (potentially physical pixels if DPR > 1)
    // and divides by DPR to get CSS pixels.
    const getRect = (i: number): [number, number, number, number] => {
        const rawRect = flatBounds
            ? [
                  bounds[i * 4],
                  bounds[i * 4 + 1],
                  bounds[i * 4 + 2],
                  bounds[i * 4 + 3],
              ]
            : (bounds[i] ?? [0, 0, 0, 0]);

        // Divide by DPR to convert to CSS pixels. Avoid division by zero.
        const dpr = devicePixelRatio || 1;
        return [
            rawRect[0] / dpr, // x (CSS pixels)
            rawRect[1] / dpr, // y (CSS pixels)
            rawRect[2] / dpr, // width (CSS pixels)
            rawRect[3] / dpr, // height (CSS pixels)
        ];
    };
    // --- End Coordinate Correction ---

    const length = Math.min(
        nodeIndices.length,
        flatBounds ? Math.floor(bounds.length / 4) : bounds.length
    );
    console.log(
        `[browser_helpers] Processing ${length} nodes with ${flatBounds ? 'flat' : 'parallel'} bounds format. DPR: ${devicePixelRatio}`
    );

    // Iterate through layout
    for (let i = 0; i < length; i++) {
        const nodeIdx = nodeIndices[i];
        // Get rectangle coordinates IN CSS PIXELS via getRect
        const [x, y, w, h] = getRect(i);

        // Skip elements that are too small (using CSS pixel dimensions)
        if (w === 0 || h === 0) continue;
        if (w * h < MIN_AREA / (devicePixelRatio * devicePixelRatio)) {
            // Adjust area threshold based on DPR if needed, or keep fixed in CSS pixels
            // If MIN_AREA is intended as physical pixels, scale it. If CSS pixels, use as is.
            // Assuming MIN_AREA is intended as CSS pixels:
            if (w * h < MIN_AREA) continue;
        }
        if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
            // Check dimensions in CSS pixels
            // If MIN_DIMENSION is physical, adjust: w < MIN_DIMENSION / devicePixelRatio
            continue;
        }

        // Get tag name
        const tagStr = strings[nodeNames[nodeIdx]] || '';

        // Extract attributes (role, href, labels, etc.) - This logic remains the same
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
            // ... (attribute extraction logic as before) ...
            if (attrName === 'role') roleStr = attrValue;
            else if (attrName === 'href' && tagStr === 'A') href = attrValue;
            else if (attrName === 'aria-label') ariaLabel = attrValue;
            else if (attrName === 'title') title = attrValue;
            else if (attrName === 'alt' && tagStr === 'IMG') alt = attrValue;
            else if (
                attrName === 'placeholder' &&
                (tagStr === 'INPUT' || tagStr === 'TEXTAREA')
            )
                placeholder = attrValue;
        }

        // Filter by role/tag - Remains the same
        if (!allowedRoles.has(roleStr) && !allowedTags.has(tagStr)) continue;
        if (roleStr === 'presentation' && !ariaLabel && !title && !alt)
            continue;

        // Determine label - Remains the same
        let label = ariaLabel || alt || title || placeholder || '';
        if (!label && texts && texts[i] !== undefined) {
            const textIndex = texts[i];
            if (textIndex >= 0 && textIndex < strings.length) {
                label = strings[textIndex] || '';
                label = label.trim().substring(0, 50);
                if (label.length === 50) label += '...';
            }
        }

        // Extract type - Remains the same
        let type = '';
        if (tagStr === 'INPUT' || tagStr === 'BUTTON') {
            for (let j = 0; j < attrs.length; j += 2) {
                if (strings[attrs[j]] === 'type') {
                    type = strings[attrs[j + 1]] || '';
                    break;
                }
            }
        }

        // Check if element is in viewport (using CSS pixel coordinates and viewport dimensions)
        const inViewport =
            x < viewportWidth && x + w > 0 && y < viewportHeight && y + h > 0;
        const fullyInViewport =
            x >= 0 &&
            x + w <= viewportWidth &&
            y >= 0 &&
            y + h <= viewportHeight;

        // Calculate distance to center (using CSS pixel coordinates)
        const centerX = viewportWidth / 2;
        const centerY = viewportHeight / 2;
        const elementCenterX = x + w / 2;
        const elementCenterY = y + h / 2;
        const distanceToCenter = Math.sqrt(
            Math.pow(elementCenterX - centerX, 2) +
                Math.pow(elementCenterY - centerY, 2)
        );

        // Calculate score (based on CSS pixel dimensions and positions)
        let score = 0;
        if (inViewport) score += 60;
        if (fullyInViewport) score += 40;
        // ... (type bonuses based on CSS pixel w/h checks) ...
        if (
            tagStr === 'INPUT' ||
            tagStr === 'TEXTAREA' ||
            tagStr === 'SELECT'
        ) {
            if (w >= 10 && h >= 10) score += 30;
        }
        if (tagStr === 'BUTTON' || roleStr === 'button') {
            if (w >= 8 && h >= 8) score += 25;
        }
        if (tagStr === 'A' && href) {
            if (w >= 8 && h >= 8) score += 20;
        }
        if (
            roleStr === 'checkbox' ||
            roleStr === 'radio' ||
            roleStr === 'menuitem'
        ) {
            if (w >= 6 && h >= 6) score += 10;
        }

        const area = w * h; // Area in CSS pixels squared
        const areaBonus = Math.min(15, Math.log2(area > 0 ? area : 1));
        score += areaBonus;
        const distancePenalty = Math.log2(distanceToCenter + 50); // Based on CSS distance
        score -= distancePenalty;

        elements.push({
            role: roleStr || tagStr.toLowerCase(),
            tag: tagStr,
            x, // CSS pixels
            y, // CSS pixels
            w, // CSS pixels
            h, // CSS pixels
            label,
            href: href || undefined,
            type: type || undefined,
            score,
            offscreen: !inViewport,
        });
    }

    /* ----- deduplicate overlapping elements (using CSS pixel coordinates) ----- */
    elements.sort((a, b) => b.w * b.h - a.w * a.h); // Sort by CSS pixel area
    const filtered: typeof elements = [];
    const getIOUThreshold = (area: number) => {
        // Area is CSS pixels squared
        return area > 10000 ? 0.9 : 0.6; // Threshold based on CSS pixel area
    };
    const MAX_ELEMENTS = 200;

    for (const el of elements) {
        let skip = false;
        const elArea = el.w * el.h; // CSS pixel area
        const threshold = getIOUThreshold(elArea);

        for (const kept of filtered) {
            // Intersection calculation using CSS pixel coordinates
            const ix = Math.max(
                0,
                Math.min(el.x + el.w, kept.x + kept.w) - Math.max(el.x, kept.x)
            );
            const iy = Math.max(
                0,
                Math.min(el.y + el.h, kept.y + kept.h) - Math.max(el.y, kept.y)
            );
            const inter = ix * iy; // Intersection area in CSS pixels squared
            if (inter > 0) {
                const union = el.w * el.h + kept.w * kept.h - inter; // Union area in CSS pixels squared
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

    /* ----- Sort by score (descending), then y-position (ascending CSS pixels) ----- */
    elements.sort((a, b) => {
        if ((b.score || 0) !== (a.score || 0)) {
            return (b.score || 0) - (a.score || 0);
        }
        return a.y - b.y; // Sort by CSS pixel y-coordinate
    });

    /* ----- build final JSON list (using CSS pixel coordinates) ----- */
    const elementJson: ElementJSON[] = elements.map((el, index) => {
        // Calculate center point using CSS pixel coordinates
        const cx = Math.round(el.x + el.w / 2);
        const cy = Math.round(el.y + el.h / 2);

        return {
            id: index + 1,
            role: el.role,
            tag: el.tag,
            x: Math.round(el.x), // Final CSS pixels
            y: Math.round(el.y), // Final CSS pixels
            w: Math.round(el.w), // Final CSS pixels
            h: Math.round(el.h), // Final CSS pixels
            cx, // Center X in CSS pixels
            cy, // Center Y in CSS pixels
            label: el.label,
            href: el.href,
            type: el.type,
            score: el.score,
            offscreen: el.offscreen,
        };
    });

    const inViewport = elementJson.filter(el => !el.offscreen).length;
    console.log(
        `[browser_helpers] Scored ${elementJson.length} elements (${inViewport} in viewport) using CSS pixels after DPR correction.`
    );

    return elementJson;
}
