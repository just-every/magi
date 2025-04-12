/**
 * DOM processor module for extracting simplified content and interactive elements.
 * 
 * This module provides a function to process the DOM and extract a simplified
 * representation suitable for analysis by an LLM, focusing on interactive elements
 * and key content.
 */

import { ElementInfo, DomProcessingOptions, DomProcessingResult, DomProcessingError } from '../types';
import { getCssSelector } from 'css-selector-generator';

/**
 * Processes the DOM of the current page to extract a simplified, structured representation
 * suitable for analysis by an LLM, focusing on interactive elements and key content.
 *
 * @param options - Configuration options for processing.
 * @returns An object containing the simplified text, a map of IDs to element details,
 * and any warnings encountered during processing. Returns an error object on failure.
 */
export function processDomForLLM(options: DomProcessingOptions = {}): DomProcessingResult | DomProcessingError {
    // --- Default Options ---
    // Ensure options is an object and provide defaults
    const effectiveOptions = typeof options === 'object' && options !== null ? options : {};
    const { includeAllContent = false } = effectiveOptions;

    // --- Constants ---
    const INCLUDE_NODES = [1, 3, 9, 11]; // ELEMENT_NODE, TEXT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE
    const INTERACTIVE_TAGS = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'DETAILS', 'SUMMARY']; // Added DETAILS/SUMMARY
    const INTERACTIVE_ROLES = [
        'button', 'link', 'checkbox', 'radio', 'switch', 'menuitem',
        'menuitemcheckbox', 'menuitemradio', 'tab', 'textbox', 'searchbox',
        'slider', 'spinbutton', 'combobox', 'listbox', 'option', 'treeitem', // Added treeitem
        'gridcell' // Added gridcell (often interactive within grids/tables)
    ];
    const LANDMARK_TAGS = ['HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE', 'FORM', 'SECTION', 'ARTICLE'];
    const LANDMARK_ROLES = ['banner', 'contentinfo', 'navigation', 'main', 'complementary', 'form', 'region', 'search'];
    // Added 'CODE', 'PRE' as potentially interesting content, 'FIGURE', 'FIGCAPTION'
    const IGNORE_TAGS = ['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'OBJECT', 'EMBED', 'PATH', 'LINE', 'POLYLINE', 'RECT', 'CIRCLE', 'ELLIPSE', 'SVG']; // Added common SVG elements, IFRAME handled separately
    const POTENTIALLY_INTERESTING_TAGS = ['P', 'LI', 'TD', 'TH', 'DT', 'DD', 'CODE', 'PRE', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

    // --- State ---
    const simplifiedLines: string[] = [];
    const newIdMap = new Map<number, ElementInfo>();
    let currentId = 1;
    const processedElements = new Set<Element>(); // Avoid processing elements multiple times across recursion/shadow DOM
    const warnings: string[] = []; // Collect non-fatal issues

    // --- Helper Functions ---

    // Basic CSS.escape polyfill
    const escapeCSS = window.CSS?.escape ?? ((ident: string) => {
        // Simple polyfill, might not cover all edge cases like the official one
        if (arguments.length === 0) {
            throw new TypeError('`CSS.escape` requires an argument.');
        }
        const string = String(ident);
        const length = string.length;
        let index = -1;
        let codeUnit: number;
        let result = '';
        const firstCodeUnit = string.charCodeAt(0);
        while (++index < length) {
            codeUnit = string.charCodeAt(index);
            // Null character
            if (codeUnit === 0x0000) {
                result += '\uFFFD';
                continue;
            }

            if (
                // If the character is in the range [\1-\1F] (U+0001 to U+001F) or is U+007F
                (codeUnit >= 0x0001 && codeUnit <= 0x001F) || codeUnit == 0x007F ||
                // If the character is the first character and is in the range [0-9] (U+0030 to U+0039)
                (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
                // If the character is the second character and is in the range [0-9] (U+0030 to U+0039)
                // and the first character is a `-` (U+002D)
                (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002D)
            ) {
                result += '\\' + codeUnit.toString(16) + ' ';
                continue;
            }

            if (
                // If the character is the first character and is a `-` (U+002D)
                // and there is no second character or the second character is also a `-`
                index === 0 && length === 1 && codeUnit === 0x002D
            ) {
                result += '\\' + string[index];
                continue;
            }

            // If the character is not handled by the previous rules and is in the range [!-~] (U+0021 to U+007E)
            // or is U+0000, U+000B, U+000C, U+000E to U+001F, U+0080 to U+FFFF
            if (
                codeUnit >= 0x0080 ||
                codeUnit === 0x002D || // -
                codeUnit === 0x005F || // _
                (codeUnit >= 0x0030 && codeUnit <= 0x0039) || // [0-9]
                (codeUnit >= 0x0041 && codeUnit <= 0x005A) || // [A-Z]
                (codeUnit >= 0x0061 && codeUnit <= 0x007A) // [a-z]
            ) {
                result += string[index];
                continue;
            }

            // Otherwise, the character needs to be escaped
            result += '\\' + string[index];
        }
        return result;
    });

    /**
     * Shadow DOM-aware version of querySelector
     * @param root - The root to start searching from
     * @param selector - CSS selector
     * @returns The first matching element or null
     */
    function querySelectorAcrossShadows(root: Document | Element | ShadowRoot, selector: string): Element | null {
        // Try the selector in the current root
        try {
            const element = root.querySelector(selector);
            if (element) return element;
        } catch (error) {
            // Some selectors might fail in specific contexts
        }
        
        // Search through all shadow roots in this tree
        const elements = Array.from(root.querySelectorAll('*'));
        
        for (const element of elements) {
            if (element.shadowRoot) {
                // Try to find the element in this shadow root
                const found = querySelectorAcrossShadows(element.shadowRoot, selector);
                if (found) return found;
            }
        }
        
        // Not found anywhere
        return null;
    }
    
    /**
     * Shadow DOM-aware version of querySelectorAll
     * @param root - The root to start searching from
     * @param selector - CSS selector
     * @returns Array of all matching elements
     */
    function querySelectorAllAcrossShadows(root: Document | Element | ShadowRoot, selector: string): Element[] {
        const results: Element[] = [];
        
        // Add matches from current root
        try {
            results.push(...Array.from(root.querySelectorAll(selector)));
        } catch (error) {
            // Some selectors might fail in specific contexts
        }
        
        // Search through all shadow roots in this tree
        const elements = Array.from(root.querySelectorAll('*'));
        
        for (const element of elements) {
            if (element.shadowRoot) {
                // Add matches from this shadow root
                results.push(...querySelectorAllAcrossShadows(element.shadowRoot, selector));
            }
        }
        
        return results;
    }
    
    /**
     * Generates a CSS selector for an element using the css-selector-generator library.
     * Shadow DOM-aware version that considers elements across shadow boundaries.
     * @param element - The DOM element.
     * @returns A CSS selector string, or empty string if invalid.
     */
    function generateSelector(element: Element): string {
        if (!(element instanceof Element)) return '';

        return getCssSelector(element, {
            combineWithinSelector: false,
            combineBetweenSelectors: false,
        });
    }

    /**
     * Checks if an element is potentially visible on the page.
     * This is an approximation and doesn't cover all edge cases (e.g., complex clipping, transforms).
     * @param element - The DOM element.
     * @returns True if the element is likely visible.
     */
    function isElementVisible(element: Element): boolean {
        if (!element || typeof element.getBoundingClientRect !== 'function') return false;

        // Check visibility recursively up the tree including shadow DOM hosts
        function checkVisibilityRecursive(el: Element): boolean {
            if (!el || el === document.body.parentElement) return true; // Reached top (html) or disconnected safely

            // Check the element itself first
            if (el instanceof Element) {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return false;
                }
                // Check for 0 size, but allow elements that might contain flow content or are options
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0 && el.tagName !== 'OPTION' && el.childElementCount === 0 && !el.textContent?.trim()) {
                    return false;
                }
                // Optional: Check if off-screen (can be expensive and sometimes wrong for fixed elements)
                // const isInViewport = rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
                // if (!isInViewport) return false;
            }

            // Check Shadow DOM host visibility if applicable
            const rootNode = el.getRootNode() as Document | ShadowRoot;
            if (rootNode instanceof ShadowRoot && rootNode.host && !checkVisibilityRecursive(rootNode.host)) {
                return false;
            }

            // Check regular parent visibility (avoid infinite loop for root's parent)
            const parent = el.parentElement;
            return !parent || checkVisibilityRecursive(parent);
        }

        return checkVisibilityRecursive(element);
    }

    /**
     * Determines if an element is considered interactive based on tag, role, and attributes.
     * @param element - The DOM element.
     * @returns True if the element is interactive.
     */
    function isInteractive(element: Element): boolean {
        if (!(element instanceof Element)) return false;

        // Check if disabled (overrides interactivity)
        if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
            return false;
        }

        const tagName = element.tagName.toUpperCase();

        // Check common interactive tags
        if (INTERACTIVE_TAGS.includes(tagName)) {
            // Exclude hidden inputs and potentially disabled fieldsets/details
            if (tagName === 'INPUT' && element.getAttribute('type')?.toLowerCase() === 'hidden') return false;
            if (tagName === 'DETAILS' && element.hasAttribute('disabled')) return false; // Check disabled on details too
            return true;
        }

        // Check interactive roles
        const role = element.getAttribute('role');
        if (role && INTERACTIVE_ROLES.includes(role)) {
            return true;
        }

        // Check contenteditable attribute
        if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false') {
            return true;
        }

        // Check if the element itself or an ancestor is a link with href
        // Ensure the link itself isn't inert/disabled
        const closestLink = element.closest('a[href]');
        if (closestLink && !closestLink.hasAttribute('disabled') && closestLink.getAttribute('aria-disabled') !== 'true') {
            // Check if the element *is* the link or a direct descendant not overriding interactivity
            if (element === closestLink || closestLink.contains(element)) {
                // Avoid marking static content inside a link as interactive itself unless it's the *only* content
                if (element.childElementCount === 0 || element.tagName === 'IMG' || element.tagName === 'SPAN') {
                    return true;
                }
            }
        }

        // Check for explicit click handlers (basic check, might miss dynamically attached listeners)
        if (element.hasAttribute('onclick') || element.hasAttribute('@click')) { // Added @click for Vue/Alpine
            return true;
        }

        // Check computed cursor style (heuristic, less reliable)
        // Only consider pointer if it's likely an interactive element type or has no children
        try {
            const style = window.getComputedStyle(element);
            if (style.cursor === 'pointer') {
                if (element.childElementCount === 0 || INTERACTIVE_TAGS.includes(tagName) || (role && INTERACTIVE_ROLES.includes(role))) {
                    return true;
                }
            }
        } catch (e) { /* Ignore potential errors getting computed style */ }

        // Check specific cases like summary for details element
        if (tagName === 'SUMMARY' && element.closest('details')) {
            return true; // SUMMARY is the interactive part of DETAILS
        }

        return false;
    }

    /**
     * Finds the topmost interactive parent element, if any.
     * @param element - The DOM element to check.
     * @returns The topmost interactive parent or null if none exists.
     */
    function findTopmostInteractiveParent(element: Element): Element | null {
        // First check if this element has an interactive ancestor
        let current: Element | null = element.parentElement;
        let interactiveParent: Element | null = null;
        
        while (current) {
            if (isInteractive(current)) {
                interactiveParent = current;
            }
            current = current.parentElement;
        }
        
        return interactiveParent;
    }

    /**
     * Checks if an element represents a semantic landmark region.
     * @param element - The DOM element.
     * @returns True if the element is a landmark.
     */
    function isLandmark(element: Element): boolean {
        if (!(element instanceof Element)) return false;
        const tagName = element.tagName.toUpperCase();
        const role = element.getAttribute('role');

        // Explicit landmark roles take precedence
        if (role && LANDMARK_ROLES.includes(role)) return true;

        // Implicit landmark tags (only if no conflicting non-landmark role is present)
        if (LANDMARK_TAGS.includes(tagName)) {
            // Roles that might override implicit landmark semantics or are redundant
            const nonLandmarkRoles = ['presentation', 'none', 'document', 'application', 'group', 'listitem', 'menuitem', 'treeitem', 'gridcell', 'article', 'figure']; // Added more specific overrides
            if (!role || !nonLandmarkRoles.includes(role)) {
                // Special case: <section> needs an accessible name to be a landmark
                if (tagName === 'SECTION' && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby') && !element.querySelector('h1, h2, h3, h4, h5, h6')) {
                    return false;
                }
                // Special case: <form> needs an accessible name to be a landmark (often has one implicitly via legend or label)
                if (tagName === 'FORM' && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby') && !element.querySelector('legend')) {
                    // Allow forms without explicit names if they contain interactive elements, often implying purpose
                    if (!element.querySelector('input, button, select, textarea')) {
                        return false;
                    }
                }
                return true;
            }
        }
        return false;
    }

    // Helper to check if a node is hidden (more robust than just display:none)
    function isNodeHidden(node: Node): boolean {
        if (!node) return true;
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.hasAttribute('aria-hidden') && element.getAttribute('aria-hidden') === 'true') return true;
            // Check computed style for visibility (simplified)
            try {
                const style = window.getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden') return true;
            } catch (e) { /* ignore */ }
        }
        // Check recursively up parent chain
        return node.parentNode ? isNodeHidden(node.parentNode) : false;
    }

    /**
     * Extracts a descriptive string for an element, prioritizing accessibility attributes
     * and providing context like tag name, roles, values, and state.
     * @param element - The DOM element.
     * @returns A description of the element.
     */
    function getElementDescription(element: Element): string {
        if (!(element instanceof Element)) return '';

        const tagName = element.tagName.toLowerCase();
        const descriptionParts: string[] = [];
        let accessibleName = ''; // Store the computed accessible name
        let nameSource: 'aria-labelledby' | 'aria-label' | 'native-label' | 'placeholder' | 'title' | 'alt' | 'figcaption' | 'content' | 'value' | 'none' = 'none'; // Track name source

        // --- Accessibility Tree Name Computation (Simplified Approximation) ---
        // Follows roughly the Accessible Name and Description Computation spec order

        // 1. aria-labelledby (Highest priority)
        const labelledBy = element.getAttribute('aria-labelledby');
        if (!accessibleName && labelledBy) {
            const labelTexts = labelledBy.split(/\s+/)
                .map(id => {
                    const labelElem = document.getElementById(id);
                    // Use recursive text content gathering for referenced elements, respecting hidden status
                    return labelElem && !isNodeHidden(labelElem) ? getNodeText(labelElem).trim() : null;
                })
                .filter(Boolean);
            if (labelTexts.length > 0) {
                accessibleName = labelTexts.join(' ');
                nameSource = 'aria-labelledby';
            }
        }

        // 2. aria-label
        const ariaLabel = element.getAttribute('aria-label')?.trim();
        if (!accessibleName && ariaLabel) {
            accessibleName = ariaLabel;
            nameSource = 'aria-label';
        }

        // 3. Native Labeling (for form controls)
        let nativeLabelText = '';
        if (!accessibleName && element.id && ['input', 'select', 'textarea', 'meter', 'progress', 'output'].includes(tagName)) {
            // Explicit label[for]
            const labels = document.querySelectorAll(`label[for="${escapeCSS(element.id)}"]`);
            for (const lbl of labels) {
                if (!isNodeHidden(lbl)) { // Check label visibility
                    nativeLabelText = getNodeText(lbl).trim(); // Use recursive text gathering
                    break;
                }
            }
            // Implicit label (control inside label)
            if (!nativeLabelText) {
                const ancestorLabel = element.closest('label');
                if (ancestorLabel && !isNodeHidden(ancestorLabel)) {
                    // Ensure the label isn't *just* the control itself
                    const labelTextOnly = getNodeText(ancestorLabel, element).trim(); // Exclude control's text
                    if (labelTextOnly) {
                        nativeLabelText = labelTextOnly;
                    }
                }
            }
            if (nativeLabelText) {
                accessibleName = nativeLabelText;
                nameSource = 'native-label';
            }
        }

        // 4. Placeholder attribute (for input/textarea)
        const placeholder = element.getAttribute('placeholder')?.trim();
        if (!accessibleName && placeholder && ['input', 'textarea'].includes(tagName)) {
            accessibleName = placeholder;
            nameSource = 'placeholder';
        }

        // 5. Alt attribute (for images/areas)
        const alt = element.getAttribute('alt')?.trim();
        if (!accessibleName && alt && (tagName === 'img' || tagName === 'area' || (tagName === 'input' && element.getAttribute('type') === 'image'))) {
            accessibleName = alt;
            nameSource = 'alt';
        }

        // 6. Figcaption for Figure
        if (!accessibleName && tagName === 'figure') {
            const figcaption = element.querySelector('figcaption');
            if (figcaption && !isNodeHidden(figcaption)) {
                accessibleName = getNodeText(figcaption).trim();
                nameSource = 'figcaption';
            }
        }

        // 7. Text Content (Recursive, fallback)
        if (!accessibleName) {
            // Get text content, excluding interactive descendants or elements already processed
            const contentText = getNodeText(element).trim();
            if (contentText) {
                accessibleName = contentText;
                nameSource = 'content';
            }
        }

        // 8. Title attribute (Lowest priority for name)
        const title = element.getAttribute('title')?.trim();
        if (!accessibleName && title) {
            accessibleName = title;
            nameSource = 'title';
        }

        // --- Construct Description ---

        // Start with the tag name
        descriptionParts.push(tagName);

        // Add Role if present and not implicit/redundant
        const role = element.getAttribute('role');
        const implicitRole = getImplicitRole(element); // Helper needed to get default ARIA role
        if (role && role !== implicitRole) {
            descriptionParts.push(`(role=${role})`);
        }

        // Add the computed accessible name, indicating its source if not from content
        if (accessibleName) {
            const nameMarker = (nameSource !== 'content' && nameSource !== 'none') ? `[${nameSource}]` : '';
            descriptionParts.push(`${nameMarker}"${truncate(accessibleName, 80)}"`);
        }

        // --- Add Key Attributes/Properties ---
        const type = element.getAttribute('type');
        const name = element.getAttribute('name');
        
        // Value handling for different form elements
        let value: string | undefined;
        
        // Handle form controls
        if (element instanceof HTMLInputElement) {
            // Don't leak password values
            if (type !== 'password') {
                value = element.value;
            }
        } else if (element instanceof HTMLTextAreaElement) {
            value = element.value;
        } else if (element instanceof HTMLSelectElement) {
            // For select, we'll handle the selected option separately
        }

        if (type && tagName === 'input') descriptionParts.push(`(type=${type})`);
        if (name) descriptionParts.push(`(name=${name})`);

        // Add placeholder only if it wasn't used as the name
        if (placeholder && nameSource !== 'placeholder') {
            descriptionParts.push(`(placeholder="${truncate(placeholder)}")`);
        }
        // Add title only if it wasn't used as the name
        if (title && nameSource !== 'title') {
            descriptionParts.push(`(title="${truncate(title)}")`);
        }
        // Add alt only if it wasn't used as the name
        if (alt && nameSource !== 'alt' && (tagName === 'img' || (tagName === 'input' && type === 'image'))) {
            descriptionParts.push(`(alt="${truncate(alt)}")`);
        }

        // --- Value/Selection State ---
        if (value !== undefined && value !== '' && ['input', 'textarea'].includes(tagName) && type !== 'password') {
            descriptionParts.push(`(value="${truncate(String(value))}")`);
        } else if (element instanceof HTMLSelectElement && element.selectedIndex >= 0) {
            const selectedOption = element.options[element.selectedIndex];
            if (selectedOption) {
                const optionText = selectedOption.textContent?.trim() || selectedOption.value; // Use value as fallback
                if (optionText) {
                    descriptionParts.push(`(Selected: "${truncate(optionText)}")`);
                }
            }
        } else if (tagName === 'meter' || tagName === 'progress') {
            if (element.hasAttribute('value')) {
                descriptionParts.push(`(value=${element.getAttribute('value')})`);
            }
        }

        // --- ARIA/State Attributes ---
        const stateMarkers: string[] = [];
        if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') stateMarkers.push('Disabled');
        
        // Check checked state for checkboxes and radios
        if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(type || '') && element.checked) {
            stateMarkers.push('Checked');
        }
        
        // Check selected state for options
        if (element instanceof HTMLOptionElement && element.selected) {
            stateMarkers.push('Selected');
        }

        const ariaChecked = element.getAttribute('aria-checked');
        if (ariaChecked === 'true') stateMarkers.push('Checked');
        else if (ariaChecked === 'mixed') stateMarkers.push('Mixed');

        const ariaPressed = element.getAttribute('aria-pressed');
        if (ariaPressed === 'true') stateMarkers.push('Pressed');
        // else if (ariaPressed === 'false') stateMarkers.push('Not Pressed'); // Optional verbosity
        else if (ariaPressed === 'mixed') stateMarkers.push('Mixed Pressed');

        const ariaExpanded = element.getAttribute('aria-expanded');
        if (ariaExpanded === 'true') stateMarkers.push('Expanded');
        else if (ariaExpanded === 'false') stateMarkers.push('Collapsed');

        const ariaSelected = element.getAttribute('aria-selected');
        if (ariaSelected === 'true') stateMarkers.push('Selected');
        // else if (ariaSelected === 'false') stateMarkers.push('Not Selected'); // Optional verbosity

        if (element.hasAttribute('required') || element.getAttribute('aria-required') === 'true') stateMarkers.push('Required');
        if (element.hasAttribute('readonly') || element.getAttribute('aria-readonly') === 'true') stateMarkers.push('ReadOnly');

        if (stateMarkers.length > 0) {
            descriptionParts.push(`[${stateMarkers.join(', ')}]`);
        }

        // Cleanup and join
        return descriptionParts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * Recursively gets text content of a node, skipping hidden elements and script/style tags.
     * Can optionally exclude a specific child node (e.g., the control within its label).
     * @param node - The starting node.
     * @param excludeNode - A node to exclude from text gathering.
     * @returns The aggregated text content.
     */
    function getNodeText(node: Node, excludeNode: Node | null = null): string {
        let text = '';
        if (!node || node === excludeNode || isNodeHidden(node)) {
            return '';
        }

        // For elements, skip script/style and check visibility
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const tagName = element.tagName.toUpperCase();
            if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT' || tagName === 'TEMPLATE') {
                return '';
            }
            // Basic check for visibility before descending
            try {
                const style = window.getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden') return '';
            } catch(e) { /* Ignore style errors */ }

            // Handle specific elements that might represent their value differently
            if (tagName === 'INPUT') {
                const type = element.getAttribute('type')?.toLowerCase();
                if (type === 'button' || type === 'submit' || type === 'reset') {
                    return (element as HTMLInputElement).value || ''; // Use value for button-like inputs
                }
                // Other inputs usually don't contribute to surrounding text content
                return '';
            }
            if (tagName === 'IMG') {
                return element.getAttribute('alt') || ''; // Use alt text for images
            }
            if (tagName === 'SELECT' || tagName === 'TEXTAREA') {
                return ''; // Typically don't contribute to surrounding text node content
            }

            // Recursively process child nodes
            let childText = '';
            node.childNodes.forEach(child => {
                childText += getNodeText(child, excludeNode) + ' '; // Add space between nodes
            });
            text = childText;

        } else if (node.nodeType === Node.TEXT_NODE) {
            text = node.textContent || '';
        }

        return text.replace(/\s+/g, ' ').trim(); // Normalize whitespace
    }

    /**
     * Gets the implicit ARIA role for a given HTML element.
     * (Simplified version - a full implementation is complex).
     * @param element - The DOM element.
     * @returns The implicit role, or null if none.
     */
    function getImplicitRole(element: Element): string | null {
        const tagName = element.tagName.toUpperCase();
        // Add more mappings based on https://www.w3.org/TR/html-aria/#docconformance
        switch (tagName) {
            case 'A': return element.hasAttribute('href') ? 'link' : null;
            case 'AREA': return element.hasAttribute('href') ? 'link' : null;
            case 'ARTICLE': return 'article';
            case 'ASIDE': return 'complementary';
            case 'BUTTON': return 'button';
            case 'DETAILS': return 'group'; // Can also be disclosure widget pattern
            case 'SUMMARY': return element.closest('details') ? 'button' : null; // Role depends on context
            case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': return 'heading';
            case 'HEADER': return 'banner'; // If not descendant of section/article
            case 'FOOTER': return 'contentinfo'; // If not descendant of section/article
            case 'FORM': return 'form';
            case 'IMG': return element.getAttribute('alt') !== null ? 'img' : null; // Role 'img' if alt is present, otherwise presentation/none if alt=""
            case 'INPUT':
                const type = element.getAttribute('type')?.toLowerCase();
                switch (type) {
                    case 'button': case 'image': case 'reset': case 'submit': return 'button';
                    case 'checkbox': return 'checkbox';
                    case 'radio': return 'radio';
                    case 'range': return 'slider';
                    case 'number': return 'spinbutton';
                    case 'search': return element.hasAttribute('list') ? 'combobox' : 'searchbox';
                    case 'email': case 'tel': case 'text': case 'url':
                        return element.hasAttribute('list') ? 'combobox' : 'textbox';
                    default: return 'textbox'; // Default for many text-like inputs
                }
            case 'LI': return 'listitem';
            case 'LINK': return element.hasAttribute('href') ? 'link' : null; // For <link> tag, though usually in <head>
            case 'MAIN': return 'main';
            case 'MENU': return 'list'; // Or 'toolbar' depending on context
            case 'NAV': return 'navigation';
            case 'OL': case 'UL': return 'list';
            case 'OPTION': return 'option';
            case 'OUTPUT': return 'status';
            case 'PROGRESS': return 'progressbar';
            case 'SECTION': return 'region'; // If it has an accessible name
            case 'SELECT': 
                return element instanceof HTMLSelectElement && 
                       (element.hasAttribute('multiple') || element.size > 1) ? 'listbox' : 'combobox';
            case 'TABLE': return 'table';
            case 'THEAD': case 'TBODY': case 'TFOOT': return 'rowgroup';
            case 'TD': return 'cell'; // Or 'gridcell' if in grid context
            case 'TH': return 'columnheader'; // Or 'rowheader'
            case 'TEXTAREA': return 'textbox';
            case 'TR': return 'row';
            default: return null;
        }
    }

    /**
     * Truncates a string to a specified length, adding ellipsis if needed.
     * @param str - The string to truncate.
     * @param maxLength - The maximum length.
     * @returns The truncated string.
     */
    function truncate(str: string, maxLength = 50): string {
        if (typeof str !== 'string') return '';
        str = str.replace(/\s+/g, ' ').trim(); // Normalize whitespace first
        if (str.length <= maxLength) {
            return str;
        }
        // Basic truncation, could be smarter about word boundaries
        return str.slice(0, maxLength) + '...';
    }

    // --- Processing Context Interface ---
    interface ProcessingContext {
        isInsideShadowDom: boolean;
        isParentHidden: boolean;
        isParentAriaHidden: boolean;
        depth: number;
        insideInteractiveElement: boolean; // Track if we're inside an interactive element
        interactiveAncestorId: number | null; // Track ID of nearest interactive ancestor
    }

    // --- Main Processing Logic ---

    /**
     * Recursively processes a node and its children, building the simplified representation.
     * @param node - The DOM node to process.
     * @param context - Current processing context.
     */
    function processNode(node: Node, context: ProcessingContext = { 
        isInsideShadowDom: false, 
        isParentHidden: false, 
        isParentAriaHidden: false, 
        depth: 0,
        insideInteractiveElement: false,
        interactiveAncestorId: null
    }): void {
        // --- Basic Filtering & Safety Checks ---
        if (!node || 
            (node instanceof Element && processedElements.has(node)) || 
            !INCLUDE_NODES.includes(node.nodeType) || 
            context.depth > 50) { // Added depth limit
            if (context.depth > 50) warnings.push("Max recursion depth reached, skipping deeper nodes.");
            return;
        }

        // --- Handle Text Nodes ---
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            // Include non-empty text nodes only if includeAllContent is true OR if the parent isn't interactive/landmark/heading (avoids duplicating text already captured)
            if (text) {
                const parentElement = node.parentElement;
                const parentIsSignificant = parentElement && (
                    isInteractive(parentElement) || 
                    isLandmark(parentElement) || 
                    parentElement.tagName.match(/^H[1-6]$/)
                );

                if (includeAllContent || !parentIsSignificant) {
                    let visibilityMarker = '';
                    if (includeAllContent && (context.isParentHidden || context.isParentAriaHidden)) {
                        if (context.isParentHidden) visibilityMarker += '[Parent Hidden]';
                        if (context.isParentAriaHidden) visibilityMarker += '[Parent ARIA Hidden]';
                        visibilityMarker = visibilityMarker.trim();
                    }
                    // Only add if parent isn't hidden OR we include all content
                    if (!context.isParentHidden || includeAllContent) {
                        simplifiedLines.push(`${text.replace(/\s+/g, ' ')} ${visibilityMarker}`.trim());
                    }
                }
            }
            return; // Text nodes don't have children
        }

        // --- Handle Element Nodes ---
        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const tagName = element.tagName.toUpperCase();

            // --- Basic Element Filtering ---
            if (IGNORE_TAGS.includes(tagName)) {
                //if (includeAllContent) simplifiedLines.push(`[SKIPPED TAG: ${tagName}]`);
                return;
            }

            // --- Visibility / Relevance Filtering ---
            let isCurrentlyVisible = true; // Assume visible unless proven otherwise
            const isCurrentlyAriaHidden = element.getAttribute('aria-hidden') === 'true';

            // Check computed visibility only if needed (can be expensive)
            // Need to check if *not* including all content OR if parent wasn't already hidden
            if (!includeAllContent || !context.isParentHidden) {
                isCurrentlyVisible = isElementVisible(element);
            } else {
                // If parent was hidden, this element is also considered hidden for context,
                // but we might still process it if includeAllContent is true.
                isCurrentlyVisible = false;
            }

            const combinedHidden = context.isParentHidden || !isCurrentlyVisible; // Inherit hidden status
            const combinedAriaHidden = context.isParentAriaHidden || isCurrentlyAriaHidden; // Inherit aria-hidden

            // --- Early Exit for Hidden Elements (Default Mode) ---
            if (!includeAllContent && (combinedHidden || combinedAriaHidden)) {
                return; // Skip hidden elements and their children in default mode
            }
            // Skip hidden inputs even in includeAll mode unless explicitly requested? (Decided against for now)
            // if (tagName === 'INPUT' && element.getAttribute('type')?.toLowerCase() === 'hidden') {
            //    if (includeAllContent) simplifiedLines.push(`[SKIPPED HIDDEN INPUT: ${getElementDescription(element)}]`);
            //    return;
            // }

            // --- Mark Element as Processed ---
            // Do this *after* visibility checks to avoid marking hidden elements unnecessarily
            processedElements.add(element);

            // --- Determine Element Type & Description ---
            const interactive = isInteractive(element);
            const landmark = isLandmark(element);
            const heading = tagName.match(/^H[1-6]$/);
            const description = getElementDescription(element); // Get description regardless of visibility for includeAll mode
            let linePrefix = '';
            let lineSuffix = '';
            let addedLine = false;
            let visibilityMarker = '';

            // Determine visibility marker only if including all content and element is hidden somehow
            if (includeAllContent && (combinedHidden || combinedAriaHidden)) {
                if (!isCurrentlyVisible && context.isParentHidden) visibilityMarker = '[HIDDEN]';
                else if (!isCurrentlyVisible) visibilityMarker = '[HIDDEN]';
                else if (context.isParentHidden) visibilityMarker = '[HIDDEN]'; // Should imply !isCurrentlyVisible due to logic above

                if (isCurrentlyAriaHidden && context.isParentAriaHidden) visibilityMarker += ' [ARIA-HIDDEN (Self & Parent)]';
                else if (isCurrentlyAriaHidden) visibilityMarker += ' [ARIA-HIDDEN (Self)]';
                else if (context.isParentAriaHidden) visibilityMarker += ' [ARIA-HIDDEN]';
                visibilityMarker = visibilityMarker.trim();
            }

            // --- Add Element Representation to Output ---
            let elementId: number | null = null;
            if (interactive) {
                // Check if this element has an interactive parent
                const interactiveParent = findTopmostInteractiveParent(element);
                
                // If this element has an interactive parent, add it as a child
                if (interactiveParent && processedElements.has(interactiveParent)) {
                    // Find the parent's ID by looking through all processed elements
                    let parentId = null;
                    for (const [id, info] of newIdMap.entries()) {
                        if (info.selector && querySelectorAcrossShadows(document, info.selector) === interactiveParent) {
                            parentId = id;
                            break;
                        }
                    }
                    
                    if (parentId !== null) {
                        const parentInfo = newIdMap.get(parentId);
                        if (parentInfo) {
                            // Add child information to parent's description
                            if (!parentInfo.childElements) {
                                parentInfo.childElements = [];
                            }
                            
                            // Add this element as a child but don't assign it an ID
                            parentInfo.childElements.push({
                                description: description,
                                tagName: element.tagName.toLowerCase(),
                                isVisible: isCurrentlyVisible
                            });
                            
                            // No need to add a new line to the output
                            addedLine = false;
                            // Use parent's ID as this element's ID for tracking
                            elementId = parentId;
                        } else {
                            // Fallback: Process this as a top-level element
                            elementId = currentId++;
                            const selector = generateSelector(element);
                            
                            // Get bounds if available
                            let bounds: {x: number, y: number, width: number, height: number} | undefined;
                            try {
                                const rect = element.getBoundingClientRect();
                                bounds = {
                                    x: rect.left,
                                    y: rect.top,
                                    width: rect.width,
                                    height: rect.height
                                };
                            } catch (e) {
                                // Ignore errors getting bounds
                            }
                            
                            const elementInfo: ElementInfo = {
                                id: elementId,
                                description: description,
                                selector: selector,
                                tagName: element.tagName.toLowerCase(),
                                isInteractive: true,
                                isVisible: isCurrentlyVisible,
                                bounds,
                                childElements: []
                            };
                            
                            newIdMap.set(elementId, elementInfo);
                            linePrefix = `[${elementId}] `;
                            simplifiedLines.push(`${linePrefix}${description} ${visibilityMarker}`.trim());
                            addedLine = true;
                        }
                    } else {
                        // Fallback: Process this as a top-level element
                        elementId = currentId++;
                        const selector = generateSelector(element);
                        
                        // Get bounds if available
                        let bounds: {x: number, y: number, width: number, height: number} | undefined;
                        try {
                            const rect = element.getBoundingClientRect();
                            bounds = {
                                x: rect.left,
                                y: rect.top,
                                width: rect.width,
                                height: rect.height
                            };
                        } catch (e) {
                            // Ignore errors getting bounds
                        }
                        
                        const elementInfo: ElementInfo = {
                            id: elementId,
                            description: description,
                            selector: selector,
                            tagName: element.tagName.toLowerCase(),
                            isInteractive: true,
                            isVisible: isCurrentlyVisible,
                            bounds,
                            childElements: []
                        };
                        
                        newIdMap.set(elementId, elementInfo);
                        linePrefix = `[${elementId}] `;
                        simplifiedLines.push(`${linePrefix}${description} ${visibilityMarker}`.trim());
                        addedLine = true;
                    }
                } else {
                    // This is a top-level interactive element, process normally
                    elementId = currentId++;
                    const selector = generateSelector(element);
                    
                    // Get bounds if available
                    let bounds: {x: number, y: number, width: number, height: number} | undefined;
                    try {
                        const rect = element.getBoundingClientRect();
                        bounds = {
                            x: rect.left,
                            y: rect.top,
                            width: rect.width,
                            height: rect.height
                        };
                    } catch (e) {
                        // Ignore errors getting bounds
                    }
                    
                    const elementInfo: ElementInfo = {
                        id: elementId,
                        description: description, // Store the full description
                        selector: selector,
                        tagName: element.tagName.toLowerCase(),
                        isInteractive: true,
                        isVisible: isCurrentlyVisible,
                        bounds,
                        childElements: [] // Initialize empty array for child elements
                    };
                    
                    newIdMap.set(elementId, elementInfo);
                    linePrefix = `[${elementId}] `;
                    simplifiedLines.push(`${linePrefix}${description} ${visibilityMarker}`.trim());
                    addedLine = true;
                }
            } else if (landmark) {
                // Add landmark start marker
                linePrefix = `\n## Landmark: ${description} ${visibilityMarker} ##`.trim();
                simplifiedLines.push(linePrefix);
                // Prepare suffix to be added after processing children
                lineSuffix = `\n## End Landmark: ${element.tagName.toLowerCase()} ##`;
                addedLine = true; // Mark that we added something for this element
            } else if (heading) {
                // Add heading marker (text content is usually included in description)
                linePrefix = `\n### ${description} ${visibilityMarker} ###`.trim();
                simplifiedLines.push(linePrefix);
                addedLine = true;
            } else if (includeAllContent && description && description !== tagName.toLowerCase()) {
                // Add potentially interesting non-interactive elements in includeAll mode
                // Avoid adding generic divs/spans unless they have specific roles/labels captured in description
                if (POTENTIALLY_INTERESTING_TAGS.includes(tagName) || 
                    element.hasAttribute('role') || 
                    element.hasAttribute('aria-label') || 
                    element.hasAttribute('aria-labelledby')) {
                    simplifiedLines.push(`(${tagName}) ${description} ${visibilityMarker}`.trim());
                    addedLine = true;
                }
            } else if (!includeAllContent && 
                        POTENTIALLY_INTERESTING_TAGS.includes(tagName) && 
                        !element.closest('button, a, input, select, textarea, [role="button"], [role="link"]')) {
                // Add short, non-interactive content blocks for context in default mode
                // Get text directly, as description might be just the tag name here
                const elementText = getNodeText(element).trim();
                if (elementText && elementText.length > 10 && elementText.length < 300) { // Heuristic length check
                    // Avoid adding if it's identical to the last line (e.g., nested paragraphs)
                    if (simplifiedLines.length === 0 || !simplifiedLines[simplifiedLines.length - 1].endsWith(elementText)) {
                        simplifiedLines.push(`(i) ${elementText} ${visibilityMarker}`.trim());
                        addedLine = true;
                    }
                }
            }

            // --- Prepare Context for Children ---
            const childContext: ProcessingContext = {
                isInsideShadowDom: context.isInsideShadowDom,
                isParentHidden: combinedHidden, // Pass down the combined hidden status
                isParentAriaHidden: combinedAriaHidden, // Pass down the combined aria-hidden status
                depth: context.depth + 1, // Increment depth
                // If this element is interactive, mark children as inside an interactive element
                insideInteractiveElement: context.insideInteractiveElement || (interactive && !context.insideInteractiveElement),
                // Pass down this element's ID if it's interactive and not already inside another interactive element
                // Otherwise, pass down the existing ancestor ID
                interactiveAncestorId: interactive && !context.insideInteractiveElement ? elementId : context.interactiveAncestorId
            };

            // --- Recursively Process Children ---
            // Skip children processing if the element itself added a line *and* its description
            // likely already contains the relevant child text (avoids duplication). Heuristic.
            const skipChildren = addedLine && (interactive || heading); // Adjust heuristic as needed

            if (!skipChildren) {
                element.childNodes.forEach(child => processNode(child, childContext));
            }

            // --- Process Shadow DOM (if exists) ---
            if (element.shadowRoot) {
                // Process shadow DOM only if host is visible OR we are including all content
                if (isCurrentlyVisible || includeAllContent) {
                    const shadowContext: ProcessingContext = {
                        isInsideShadowDom: true, // Set flag for shadow DOM context
                        isParentHidden: combinedHidden, // Host's hidden status becomes parent status
                        isParentAriaHidden: combinedAriaHidden, // Host's aria-hidden status
                        depth: context.depth + 1, // Reset or increment depth? Increment seems safer.
                        insideInteractiveElement: context.insideInteractiveElement,
                        interactiveAncestorId: context.interactiveAncestorId
                    };
                    //simplifiedLines.push(`  (Entering Shadow DOM for ${tagName}${elementId ? ` [${elementId}]` : ''}) ${visibilityMarker}`.trim());

                    element.shadowRoot.childNodes.forEach(child => processNode(child, shadowContext));

                    //simplifiedLines.push(`  (Exiting Shadow DOM for ${tagName}${elementId ? ` [${elementId}]` : ''})`);
                } else {
                    // Log skipped shadow DOM if includeAllContent is true but host was hidden
                    if (includeAllContent) simplifiedLines.push(`  [Skipping Shadow DOM content as host is hidden: ${tagName}${elementId ? ` [${elementId}]` : ''}]`);
                }
            }

            // --- Process IFRAME Content (Basic - Same Origin Only) ---
            if (tagName === 'IFRAME') {
                // Process iframe only if host is visible OR we are including all content
                if (isCurrentlyVisible) {
                    const iframeSrc = element.getAttribute('src') || 'no src';
                    simplifiedLines.push(`--- Start IFrame (${iframeSrc})${elementId ? ` [${elementId}]` : ''} ${visibilityMarker} ---`.trim());
                    try {
                        // Accessing contentDocument can throw cross-origin errors
                        const iframeElement = element as HTMLIFrameElement;
                        const iframeDoc = iframeElement.contentDocument || iframeElement.contentWindow?.document;
                        if (iframeDoc?.body) {
                            // Process iframe body with inherited context + iframe context
                            const iframeContext: ProcessingContext = {
                                isInsideShadowDom: context.isInsideShadowDom, // Keep outer shadow DOM status
                                isParentHidden: combinedHidden, // Host iframe's hidden status
                                isParentAriaHidden: combinedAriaHidden, // Host iframe's aria-hidden status
                                depth: context.depth + 1, // Increment depth
                                insideInteractiveElement: context.insideInteractiveElement,
                                interactiveAncestorId: context.interactiveAncestorId
                            };
                            // Add a marker for iframe body content
                            simplifiedLines.push("  (IFrame Body Content)");
                            processNode(iframeDoc.body, iframeContext);
                        } else {
                            simplifiedLines.push("  [IFrame content not accessible or empty]");
                        }
                    } catch (e) {
                        const errorMsg = e instanceof Error && e.message.includes('Blocked a frame with origin') 
                            ? 'Cross-origin restriction' 
                            : (e instanceof Error ? e.message : String(e));
                        //simplifiedLines.push(`  [IFrame content error: ${errorMsg}]`);
                        warnings.push(`Could not access iframe content for ${iframeSrc} (${errorMsg})`);
                    }
                    simplifiedLines.push(`--- End IFrame (${iframeSrc}) ---`);
                } else {
                    //if (includeAllContent) simplifiedLines.push(`  [Skipping IFrame content as host is hidden: ${element.getAttribute('src') || 'no src'}]`);
                }
            }

            // --- Add Landmark End Marker ---
            // Ensure suffix is added after all children, shadow DOM, and iframes are processed
            if (lineSuffix) {
                simplifiedLines.push(lineSuffix);
            }
        }
    }

    // --- Execution ---
    try {
        // Find the root node to start processing (usually body, fallback to documentElement)
        const rootNode = document.body || document.documentElement;
        if (!rootNode) {
            throw new Error("Could not find document body or document element.");
        }

        // Start processing from the root node with initial context
        processNode(rootNode, { 
            isInsideShadowDom: false, 
            isParentHidden: false, 
            isParentAriaHidden: false, 
            depth: 0,
            insideInteractiveElement: false,
            interactiveAncestorId: null
        });

        // --- Cleanup Output ---
        const cleanedText = simplifiedLines
            .map(line => line.trim()) // Trim whitespace from each line
            .filter((line, index, arr) => {
                // Filter out empty lines
                if (line.length === 0) return false;
                // Filter out basic duplicate lines (e.g. repeated text nodes)
                if (index > 0 && line === arr[index - 1] && !line.startsWith('[')) return false; // Keep duplicates if they are ID'd elements
                // Filter out redundant landmark end tags if start tag wasn't present (can happen with errors/skipping)
                if (line.startsWith("## End Landmark:") && !arr.slice(0, index).some(prevLine => prevLine.startsWith("## Landmark:") && prevLine.includes(line.split(':')[1].trim()))) return false;
                return true;
            })
            .join('\n'); // Join lines with newline characters

        // Convert Map to array of [id, elementInfo] pairs for JSON serialization
        const idMapArray = Array.from(newIdMap.entries());

        // Return the structured result
        return {
            simplifiedText: cleanedText,
            idMapArray: idMapArray,
            warnings: warnings // Include any non-fatal warnings
        };
    } catch (error) {
        console.error("[DOM Processor] Error during processing:", error);
        // Ensure error object is serializable and includes relevant info
        return {
            error: true,
            message: `DOM Processing Error: ${error instanceof Error ? error.message : String(error)}`,
            // Stack might not be serializable directly or might be too large, capture as string
            stack: error instanceof Error ? String(error.stack) : undefined,
            warnings: warnings // Include warnings even if a fatal error occurred later
        };
    }
}
