/**
 * Utility functions for working with Chrome DevTools Protocol
 * to extract browser information like element maps and interactive elements
 */

import { BROWSER_WIDTH, BROWSER_HEIGHT } from '../../constants.js';

// More concise element representation for LLM processing
export type InteractiveElementInfo = {
    href?: string; // Absolute URL for links
    name?: string; // Input name attribute
    text?: string; // Visible text or fallback label
    value?: string; // Input value attribute
    label?: string; // aria-label or associated label text
    class?: string; // CSS classes (consider filtering common ones later)
    // Add other relevant attributes as needed, e.g., 'placeholder'
    placeholder?: string;
    alt?: string; // Alt text for images
    title?: string; // Title attribute
    role?: string; // Explicit ARIA role
    tag?: string; // Original HTML tag
    inputType?: string; // Specific type for <input> elements
};

export type InteractiveElement = {
    type: string; // Simplified type (e.g., 'link', 'button', 'input', 'textarea')
    x: number; // CSS pixels
    y: number; // CSS pixels
    w: number; // CSS pixels
    h: number; // CSS pixels
    info: InteractiveElementInfo; // Dictionary of important attributes/details
    // Removed: id, cx, cy, score, offscreen to minimize tokens
};

export type BrowserStatusPayload = {
    screenshot: string; // base‑64 PNG (data URL)
    devicePixelRatio: number; // device pixel ratio (DPR)
    view: { w: number; h: number }; // current viewport (CSS px)
    full: { w: number; h: number }; // full‑page scroll size (CSS px)
    cursor: {
        x: number;
        y: number;
        button?: 'none' | 'left' | 'middle' | 'right';
    }; // cursor position (CSS px)
    url: string; // current page URL
    elementMap: InteractiveElement[]; // Updated element list type
    coreTabs?: any[]; // Optional core tabs for multi-tab scenarios
};

/**
 * Builds an array of interactive elements from a DOM snapshot, correcting
 * coordinates for device pixel ratio to ensure output is in CSS pixels.
 * @param snap The DOM snapshot returned by DOMSnapshot.captureSnapshot
 * @param viewportWidth The width of the viewport in CSS pixels
 * @param viewportHeight The height of the viewport in CSS pixels
 * @param devicePixelRatio The actual device pixel ratio of the screen/emulation
 * @param scrollX Horizontal scroll offset (CSS pixels)
 * @param scrollY Vertical scroll offset (CSS pixels)
 * @param baseUrl The base URL of the current page, needed for resolving relative links.
 * @returns Array of interactive elements with properties needed for interaction (CSS pixels)
 */
export function buildElementArray(
    snap: any,
    viewportWidth = BROWSER_WIDTH,
    viewportHeight = BROWSER_HEIGHT,
    devicePixelRatio = 1, // Default to 1 if not provided
    scrollX = 0, // Default to 0 if not provided
    scrollY = 0, // Default to 0 if not provided
    baseUrl: string = '' // Added baseUrl parameter
): InteractiveElement[] {
    // Updated return type
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

    // Temporary structure to hold extracted data before final formatting
    type TempElementData = {
        role: string;
        tag: string;
        x: number;
        y: number;
        w: number;
        h: number;
        href?: string;
        ariaLabel?: string;
        title?: string;
        alt?: string;
        placeholder?: string;
        name?: string; // Added
        value?: string; // Added
        className?: string; // Added (using className to avoid conflict with 'class' keyword)
        inputType?: string; // Renamed from 'type'
        visibleText?: string; // Extracted text content
        score?: number; // Keep score for intermediate sorting/filtering
        offscreen?: boolean; // Keep offscreen for intermediate filtering
    };
    let elements: TempElementData[] = [];

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
    // We now also account for scroll offsets to get viewport-relative coordinates.
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
        // Convert to CSS pixels and adjust for scroll position
        return [
            rawRect[0] / dpr - scrollX, // x (CSS pixels) adjusted for horizontal scroll
            rawRect[1] / dpr - scrollY, // y (CSS pixels) adjusted for vertical scroll
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
        `[browser_helpers] Processing ${length} nodes with ${flatBounds ? 'flat' : 'parallel'} bounds format. DPR: ${devicePixelRatio}, Scroll: X=${scrollX}, Y=${scrollY}`
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

        // Extract attributes (role, href, labels, etc.)
        let roleStr = '';
        let href = '';
        let ariaLabel = '';
        let title = '';
        let alt = '';
        let placeholder = '';
        let name = ''; // Added
        let value = ''; // Added
        let className = ''; // Added
        let inputType = ''; // Added (for input type)

        const attrs = nodeAttrs[nodeIdx] ?? [];
        for (let j = 0; j < attrs.length; j += 2) {
            const attrName = strings[attrs[j]] || '';
            const attrValue = strings[attrs[j + 1]] || '';

            switch (attrName) {
                case 'role':
                    roleStr = attrValue;
                    break;
                case 'href': // Keep collecting href for any tag initially
                    href = attrValue;
                    break;
                case 'aria-label':
                    ariaLabel = attrValue;
                    break;
                case 'title':
                    title = attrValue;
                    break;
                case 'alt': // Keep collecting alt for any tag initially
                    alt = attrValue;
                    break;
                case 'placeholder':
                    placeholder = attrValue;
                    break;
                case 'name': // Capture name attribute
                    name = attrValue;
                    break;
                case 'value': // Capture value attribute
                    value = attrValue;
                    break;
                case 'class': // Capture class attribute
                    className = attrValue;
                    break;
                case 'type': // Capture type attribute (often for input/button)
                    if (tagStr === 'INPUT' || tagStr === 'BUTTON') {
                        inputType = attrValue;
                    }
                    break;
            }
        }

        // Resolve absolute URL for href if baseUrl is provided
        if (href && baseUrl) {
            try {
                href = new URL(href, baseUrl).toString();
            } catch (e) {
                // console.warn(`[browser_helpers] Invalid URL encountered: ${href} with base ${baseUrl}`);
                // Keep original href if URL parsing fails
            }
        } else if (href && !baseUrl) {
            // console.warn(`[browser_helpers] Cannot resolve relative href '${href}' without baseUrl.`);
            // Keep potentially relative href
        }

        // Only keep href for actual link tags ('A' or role='link')
        if (tagStr !== 'A' && roleStr !== 'link') {
            href = '';
        }
        // Only keep alt for IMG tags
        if (tagStr !== 'IMG') {
            alt = '';
        }
        // Only keep placeholder for relevant input types
        if (tagStr !== 'INPUT' && tagStr !== 'TEXTAREA') {
            placeholder = '';
        }

        // Filter by role/tag - Remains the same
        if (!allowedRoles.has(roleStr) && !allowedTags.has(tagStr)) continue;
        if (roleStr === 'presentation' && !ariaLabel && !title && !alt)
            continue;

        // Determine visible text content
        let visibleText = '';
        if (texts && texts[i] !== undefined) {
            const textIndex = texts[i];
            if (textIndex >= 0 && textIndex < strings.length) {
                visibleText = strings[textIndex] || '';
                visibleText = visibleText.trim().substring(0, 100); // Limit length
                // Consider adding ellipsis if truncated: if (visibleText.length === 100) visibleText += '...';
            }
        }

        // Note: inputType was already extracted in the attribute loop

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
            if (w >= 10 && h >= 10) score += 100;
        }
        if (tagStr === 'BUTTON' || roleStr === 'button') {
            if (w >= 8 && h >= 8) score += 50;
        }
        if (tagStr === 'A' && href) {
            if (w >= 8 && h >= 8) score += 20;
        }
        if (
            roleStr === 'checkbox' ||
            roleStr === 'radio' ||
            roleStr === 'menuitem'
        ) {
            if (w >= 6 && h >= 6) score += 60;
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
            href: href || undefined,
            ariaLabel: ariaLabel || undefined,
            title: title || undefined,
            alt: alt || undefined,
            placeholder: placeholder || undefined,
            name: name || undefined,
            value: value || undefined,
            className: className || undefined,
            inputType: inputType || undefined,
            visibleText: visibleText || undefined,
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
            return (b.score || 0) - (a.score || 0); // Primary sort: score descending
        }
        return a.y - b.y; // Secondary sort: y-position ascending (CSS pixels)
    });

    /* ----- Build final InteractiveElement list ----- */
    const interactiveElements: InteractiveElement[] = elements.map(el => {
        // Determine simplified type
        const simpleType = el.role.toUpperCase() || el.tag.toUpperCase();

        // Consolidate info fields, prioritizing specific labels/text
        const info: InteractiveElementInfo = {
            text:
                el.visibleText ||
                el.ariaLabel ||
                el.alt ||
                el.title ||
                el.placeholder ||
                undefined,
            label: el.ariaLabel || undefined, // Explicit aria-label
            href: el.href,
            name: el.name,
            value: el.value,
            class: el.className,
            placeholder: el.placeholder,
            alt: el.alt,
            title: el.title,
            role: el.role || undefined,
            tag: el.tag || undefined,
            inputType: el.inputType || undefined,
        };

        // Remove undefined fields from info to keep it clean
        Object.keys(info).forEach(
            key =>
                info[key as keyof InteractiveElementInfo] === undefined &&
                delete info[key as keyof InteractiveElementInfo]
        );

        return {
            type: simpleType,
            x: Math.round(el.x), // Final CSS pixels
            y: Math.round(el.y), // Final CSS pixels
            w: Math.round(el.w), // Final CSS pixels
            h: Math.round(el.h), // Final CSS pixels
            info: info,
            // Removed id, cx, cy, score, offscreen
        };
    });

    const inViewportCount = elements.filter(el => !el.offscreen).length; // Count before final mapping
    console.log(
        `[browser_helpers] Processed ${interactiveElements.length} interactive elements (${inViewportCount} in viewport) using CSS pixels after DPR correction.`
    );

    return interactiveElements;
}
