/**
 * Utility functions for working with Shadow DOM.
 */

/**
 * Queries for an element across shadow DOM boundaries.
 * This function will search through the main document and all shadow roots recursively.
 *
 * @param rootNode The root node to start searching from (usually document)
 * @param selector The CSS selector to search for
 * @returns The first matching element or null if not found
 */
export function querySelectorAcrossShadows(
    rootNode: Document | Element | ShadowRoot,
    selector: string
): Element | null {
    // Try the selector in the current root
    try {
        const element = rootNode.querySelector(selector);
        if (element) return element;
    } catch (error) {
        console.warn(`Error querying selector "${selector}" in root:`, error);
    }

    // If not found, search through all shadow roots in this tree
    const elements = Array.from(rootNode.querySelectorAll('*'));

    for (const element of elements) {
        // Check if this element has a shadow root
        if (element.shadowRoot) {
            // Try to find the element in this shadow root
            const found = querySelectorAcrossShadows(
                element.shadowRoot,
                selector
            );
            if (found) return found;
        }
    }

    // Not found anywhere
    return null;
}

/**
 * Type guard to check if an element is within a shadow DOM.
 *
 * @param element The element to check
 * @returns True if the element is within a shadow DOM
 */
export function isInShadowDOM(element: Element): boolean {
    let root = element.getRootNode();
    return root instanceof ShadowRoot;
}

/**
 * Finds all shadow roots in the document.
 *
 * @param doc The document to search in
 * @returns Array of shadow roots
 */
export function findAllShadowRoots(doc: Document = document): ShadowRoot[] {
    const shadowRoots: ShadowRoot[] = [];

    function traverse(root: Document | Element | ShadowRoot) {
        const elements = Array.from(root.querySelectorAll('*'));

        for (const element of elements) {
            if (element.shadowRoot) {
                shadowRoots.push(element.shadowRoot);
                traverse(element.shadowRoot);
            }
        }
    }

    traverse(doc);
    return shadowRoots;
}
