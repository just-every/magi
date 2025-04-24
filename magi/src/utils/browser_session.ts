/**
 * Simplified browser session implementation using Chrome DevTools Protocol (CDP)
 *
 * This implementation only handles connecting to an already-running Chrome instance
 * and does not try to launch or manage Chrome.
 */

import CDP from 'chrome-remote-interface';
import {
    buildElementArray,
    BrowserStatusPayload,
} from './cdp/browser_helpers.js'; // Assuming this helper exists

// --- Define Action Types ---

// Define specific action interfaces for type safety
interface NavigateAction {
    action: 'navigate';
    url: string;
}

interface GetPageUrlAction {
    action: 'get_page_url';
}

interface GetPageContentAction {
    action: 'get_page_content';
    type: 'interactive' | 'markdown' | 'html';
}

interface BrowserStatusAction {
    action: 'browserStatus';
    type?: 'viewport' | 'fullpage';
    includeCoreTabs?: boolean;
}

interface JsEvaluateAction {
    action: 'js_evaluate';
    code: string;
}

interface ScrollToAction {
    action: 'scroll_to';
    mode: 'page_down' | 'page_up' | 'bottom' | 'top' | 'coordinates';
    x?: number;
    y?: number;
}

interface ClickAtAction {
    action: 'click_at';
    x: number;
    y: number;
    button?: 'left' | 'middle' | 'right';
}

interface DragAction {
    action: 'drag';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    button?: 'left' | 'middle' | 'right';
}

interface TypeAction {
    action: 'type';
    text: string;
}

interface PressAction {
    action: 'press';
    keys: string;
}

interface DebugCommandAction {
    action: 'debugCommand';
    method: string;
    commandParams?: object;
}

// Union type for all possible actions
export type BrowserAction =
    | NavigateAction
    | GetPageUrlAction
    | GetPageContentAction
    | BrowserStatusAction
    | JsEvaluateAction
    | ScrollToAction
    | ClickAtAction
    | DragAction
    | TypeAction
    | PressAction
    | DebugCommandAction;

/**
 * Manages a browser session using Chrome DevTools Protocol
 */
export class AgentBrowserSessionCDP {
    private tabId: string;
    private startUrl?: string;
    private initialized = false;
    private chromeTabId: string | null = null; // CDP target ID
    private cdpClient: CDP.Client | null = null;

    /**
     * Creates a new browser session manager for a tab
     * @param tabId A unique identifier for the tab
     * @param startUrl Optional URL to navigate to on initialization
     */
    constructor(tabId: string, startUrl?: string) {
        if (!tabId) {
            throw new Error('Tab ID cannot be empty.');
        }
        this.tabId = tabId;
        this.startUrl = startUrl;
        console.log(
            `[browser_session_cdp] Session created for tab: ${this.tabId} ${this.startUrl ? `with start URL: ${this.startUrl}` : ''}`
        );
    }

    /**
     * Initialize the browser session by connecting to Chrome and creating a tab
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            console.log(
                `[browser_session_cdp] Tab ${this.tabId} session already initialized.`
            );
            return;
        }

        console.log(
            `[browser_session_cdp] Initializing browser session for tab: ${this.tabId}...`
        );

        try {
            const host = process.env.CDP_HOST || 'host.docker.internal'; // Use env var or default
            const port = parseInt(process.env.HOST_CDP_PORT || '9222', 10); // Default Chrome CDP port

            console.log(
                `[browser_session_cdp] Connecting to CDP at ${host}:${port}`
            );

            // Connect to CDP first with a root client
            const rootClient = await CDP({
                host,
                port,
                // local: true // Consider if running locally vs container
            });

            try {
                // Create a new target (tab) using the root client
                const { targetId } = await rootClient.Target.createTarget({
                    url: this.startUrl || 'about:blank',
                    newWindow: false, // Assuming we want a new tab in the existing window
                    // background: true, // Consider if the tab should be active or background
                });

                this.chromeTabId = targetId;
                console.log(
                    `[browser_session_cdp] Created new target (tab) with ID: ${targetId}`
                );

                // Create a new CDP client specifically targeting our new tab
                this.cdpClient = await CDP({
                    host,
                    port,
                    target: targetId, // This ensures all commands are scoped to our tab
                    // local: true
                });
                console.log(
                    `[browser_session_cdp] Connected CDP client to target: ${targetId}`
                );

                // Initialize CDP domains we'll use on our targeted client
                await Promise.all([
                    this.cdpClient.Page.enable(),
                    this.cdpClient.DOM.enable(),
                    this.cdpClient.Runtime.enable(),
                ]);
                console.log(
                    `[browser_session_cdp] Enabled required CDP domains for target: ${targetId}`
                );

                // Close the root client as it's no longer needed
                await rootClient.close();

                this.initialized = true;
                console.log(
                    `[browser_session_cdp] Tab ${this.tabId} session initialized, CDP target ID: ${targetId}`
                );
            } catch (error) {
                console.error(
                    `[browser_session_cdp] Failed during target creation/connection for tab ${this.tabId}:`,
                    error
                );
                // Attempt to close the root client if it exists
                if (rootClient)
                    await rootClient
                        .close()
                        .catch(closeErr =>
                            console.error(
                                'Error closing root client:',
                                closeErr
                            )
                        );
                this.initialized = false;
                throw error; // Re-throw after logging
            }
        } catch (error) {
            console.error(
                `[browser_session_cdp] Failed to establish initial CDP connection for tab ${this.tabId}:`,
                error
            );
            this.initialized = false;
            throw error; // Re-throw after logging
        }
    }

    /**
     * Ensure session is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized || !this.cdpClient) {
            console.warn(
                `[browser_session_cdp] Tab ${this.tabId} session not explicitly initialized or client missing. Auto-initializing.`
            );
            await this.initialize(); // This will throw if initialization fails
        }

        if (!this.cdpClient) {
            // This should theoretically not be reached if initialize() succeeds
            throw new Error(
                `CDP client not available for tab ${this.tabId} after initialization attempt.`
            );
        }
    }

    /**
     * Ensures the viewport is set to standard dimensions (1024x768)
     * Must be called before operations that depend on consistent viewport size
     * @private
     */
    private async ensureViewportSize(): Promise<void> {
        // No need to check cdpClient here as ensureInitialized() guarantees it
        try {
            await this.cdpClient!.Emulation.setDeviceMetricsOverride({
                width: 1024,
                height: 768,
                deviceScaleFactor: 1, // Force DPR to 1 for consistent coordinates
                mobile: false,
            });
            // console.log( // Reduce log noise
            //     `[browser_session_cdp] Tab ${this.tabId}: Set viewport to standard 1024x768, DPR 1`
            // );
        } catch (error) {
            console.error(
                `[browser_session_cdp] Error setting viewport size for tab ${this.tabId}:`,
                error
            );
            // Decide if this should throw or just warn
            // throw new Error(`Failed to set viewport size: ${error.message}`);
        }
    }

    /**
     * Navigate to a URL
     * @param url The URL to navigate to
     * @returns Success or error message string
     */
    async navigate(url: string): Promise<string> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Navigating to ${url}`
        );

        try {
            const client = this.cdpClient!;
            let loadFired = false;

            // Navigate to the URL and wait for load event
            const loadPromise = new Promise<void>(resolve => {
                const loadTimeout = setTimeout(() => {
                    if (!loadFired) {
                        console.warn(
                            `[browser_session_cdp] Tab ${this.tabId}: Navigation to ${url} timed out after 30s (load event).`
                        );
                        // Resolve anyway, as the page might be partially loaded or interactive
                        resolve();
                    }
                }, 30000); // 30 second timeout

                client.once('Page.loadEventFired', () => {
                    loadFired = true;
                    clearTimeout(loadTimeout);
                    // console.log(`[browser_session_cdp] Tab ${this.tabId}: Page.loadEventFired received for ${url}`);
                    resolve();
                });
            });

            // Start navigation
            const { errorText } = await client.Page.navigate({ url });
            if (errorText) {
                throw new Error(`Navigation failed immediately: ${errorText}`);
            }

            // Wait for page load or timeout
            await loadPromise;

            // Get the final URL after navigation attempt
            const result = await client.Runtime.evaluate({
                expression: 'window.location.href',
                returnByValue: true, // Ensure we get the value directly
            });
            const finalUrl = result?.result?.value ?? 'unknown URL'; // Handle potential undefined result

            return `Successfully navigated to ${finalUrl}`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error navigating tab ${this.tabId} to ${url}:`,
                error
            );
            return `Error navigating to ${url}: ${error.message || error}`;
        }
    }

    /**
     * Get the current page URL
     * @returns Current URL string or error message string
     */
    async get_page_url(): Promise<string> {
        await this.ensureInitialized();
        // console.log( // Reduce log noise
        //     `[browser_session_cdp] Tab ${this.tabId}: Getting current URL`
        // );

        try {
            const result = await this.cdpClient!.Runtime.evaluate({
                expression: 'window.location.href',
                returnByValue: true,
            });
            if (result.exceptionDetails) {
                throw new Error(
                    `JS exception getting URL: ${result.exceptionDetails.text}`
                );
            }
            return result?.result?.value ?? 'Could not retrieve URL';
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error getting URL for tab ${this.tabId}:`,
                error
            );
            return `Error getting URL: ${error.message || error}`;
        }
    }

    /**
     * Get page content as HTML (currently only supports HTML)
     * @param type The desired format ('html', 'markdown', 'interactive' - only 'html' implemented)
     * @returns HTML content string or error message string
     */
    async get_page_content(
        type: 'interactive' | 'markdown' | 'html'
    ): Promise<string> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Getting page content as ${type}`
        );

        if (type !== 'html') {
            console.warn(
                `[browser_session_cdp] Tab ${this.tabId}: get_page_content type '${type}' not fully implemented, returning full HTML.`
            );
            // Fallback to HTML for now
        }

        try {
            const client = this.cdpClient!;

            // Get the root node of the document
            const { root } = await client.DOM.getDocument({
                depth: -1, // Get the full document tree
                pierce: true, // Pierce shadow DOM roots
            });

            if (!root || !root.nodeId) {
                throw new Error('Could not get document root node.');
            }

            // Get the outer HTML of the root node
            const { outerHTML } = await client.DOM.getOuterHTML({
                nodeId: root.nodeId,
            });

            return outerHTML || '';
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error getting page content for tab ${this.tabId}:`,
                error
            );
            return `Error getting page content: ${error.message || error}`;
        }
    }

    /**
     * Take a screenshot and return browser status information.
     * Forces DPR=1 via ensureViewportSize for consistent coordinates.
     * @param type Type of screenshot ('viewport' or 'fullpage') - fullpage not implemented
     * @param includeCoreTabs Whether to include core tab info (not implemented)
     * @returns BrowserStatusPayload object or an object containing an error message
     */
    async browserStatus(
        type: 'viewport' | 'fullpage' = 'viewport',
        includeCoreTabs = false // Placeholder
    ): Promise<BrowserStatusPayload | { error: string }> {
        // Return type includes error possibility
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Taking ${type} screenshot with browser status`
        );

        if (type === 'fullpage') {
            console.warn(
                `[browser_session_cdp] Tab ${this.tabId}: 'fullpage' screenshot type not implemented, capturing viewport instead.`
            );
            type = 'viewport'; // Fallback
        }

        try {
            const client = this.cdpClient!;

            // Ensure viewport is set (forces DPR=1) *before* any measurements or captures
            await this.ensureViewportSize();

            // Now that viewport (and DPR=1) is set, perform operations
            const [
                metrics,
                screenshotResult,
                snap,
                urlResult,
                // dprResult // No longer needed as we force DPR=1
            ] = await Promise.all([
                client.Page.getLayoutMetrics(),
                client.Page.captureScreenshot({
                    format: 'png',
                    fromSurface: true, // Capture from surface for accuracy
                    // captureBeyondViewport: false, // Since we only support viewport for now
                    optimizeForSpeed: true,
                }),
                client.DOMSnapshot.captureSnapshot({
                    computedStyles: [], // Keep minimal for performance
                    includeDOMRects: true, // Essential for coordinates
                    includeInnerText: true, // Useful for labels
                    includePaintOrder: false,
                }),
                client.Runtime.evaluate({
                    expression: 'window.location.href',
                    returnByValue: true,
                }),
                // No longer need to fetch DPR separately
                // client.Runtime.evaluate({ expression: 'window.devicePixelRatio', returnByValue: true }),
            ]);

            // Extract layout metrics (CSS pixels, should match set viewport due to DPR=1)
            const viewWidth = metrics.cssLayoutViewport?.clientWidth ?? 1024;
            const viewHeight = metrics.cssLayoutViewport?.clientHeight ?? 768;
            // Content size might still differ, e.g., if page content is smaller/larger than viewport
            const fullWidth = metrics.cssContentSize?.width ?? viewWidth;
            const fullHeight = metrics.cssContentSize?.height ?? viewHeight;

            // Build element map. Since DPR=1, no correction needed.
            const elementMap = buildElementArray(
                snap,
                viewWidth,
                viewHeight,
                1 // Pass DPR=1 explicitly
            );

            const currentUrl = urlResult?.result?.value || '';

            const payload: BrowserStatusPayload = {
                screenshot: `data:image/png;base64,${screenshotResult.data}`,
                view: { w: viewWidth, h: viewHeight },
                full: { w: fullWidth, h: fullHeight },
                url: currentUrl,
                elementMap,
            };

            if (includeCoreTabs) {
                payload.coreTabs = []; // Placeholder
            }

            return payload;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error getting browser status/screenshot for tab ${this.tabId}:`,
                error
            );
            // Return a structured error object
            return {
                error: `Error getting browser status: ${error.message || error}`,
            };
        }
    }

    /**
     * Execute JavaScript in the page
     * @param code The JavaScript code string to execute
     * @returns Result of execution as a string, or an error message string
     */
    async js_evaluate(code: string): Promise<string> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Evaluating JS: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`
        );

        try {
            const { result, exceptionDetails } =
                await this.cdpClient!.Runtime.evaluate({
                    expression: code,
                    returnByValue: true, // Get simple values directly
                    awaitPromise: true, // Wait for promises to resolve
                    userGesture: true, // Simulate user interaction context
                    timeout: 30000, // Add a timeout (30 seconds)
                });

            if (exceptionDetails) {
                console.error(
                    `[browser_session_cdp] JS evaluation exception for tab ${this.tabId}:`,
                    exceptionDetails.exception?.description ||
                        exceptionDetails.text
                );
                return `Error evaluating JavaScript: ${exceptionDetails.exception?.description || exceptionDetails.text}`;
            }

            // Convert result to string representation
            let resultString = '';
            if (result.type === 'undefined') {
                resultString = 'undefined';
            } else if (result.subtype === 'null') {
                resultString = 'null';
            } else if (result.type === 'string') {
                resultString = result.value; // Already a string
            } else if (result.type === 'number' || result.type === 'boolean') {
                resultString = String(result.value);
            } else if (result.type === 'object') {
                // For objects/arrays, try to JSON stringify
                // Note: This might fail for complex objects (like DOM nodes if not returnByValue)
                // or circular references. Consider using remoteObjectId if needed.
                try {
                    resultString = JSON.stringify(result.value);
                } catch (stringifyError: any) {
                    console.warn(
                        `[browser_session_cdp] Could not JSON.stringify JS result for tab ${this.tabId}: ${stringifyError.message}`
                    );
                    resultString = result.description || '[object]'; // Fallback description
                }
            } else {
                resultString = result.description || String(result.value); // Fallback description
            }

            return resultString;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error evaluating JS for tab ${this.tabId}:`,
                error
            );
            // Check if it's a timeout error from CDP
            if (error.message && error.message.includes('timed out')) {
                return 'Error evaluating JavaScript: Execution timed out.';
            }
            return `Error evaluating JavaScript: ${error.message || error}`;
        }
    }

    /**
     * Scroll the page
     * @param mode How to scroll
     * @param x Target x-coordinate (for 'coordinates' mode)
     * @param y Target y-coordinate (for 'coordinates' mode)
     * @returns Success or error message string
     */
    async scroll_to(
        mode: 'page_down' | 'page_up' | 'bottom' | 'top' | 'coordinates',
        x?: number,
        y?: number
    ): Promise<string> {
        await this.ensureInitialized();
        const coordString =
            mode === 'coordinates' &&
            typeof x === 'number' &&
            typeof y === 'number'
                ? ` to ${x},${y}`
                : '';
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Scrolling (${mode})${coordString}`
        );

        try {
            let script = '';

            switch (mode) {
                case 'page_down':
                    // Scroll by 80% of viewport height for a smoother page down
                    script = 'window.scrollBy(0, window.innerHeight * 0.8)';
                    break;
                case 'page_up':
                    // Scroll by 80% of viewport height up
                    script = 'window.scrollBy(0, -window.innerHeight * 0.8)';
                    break;
                case 'bottom':
                    // Scroll to the very bottom of the document body
                    script = 'window.scrollTo(0, document.body.scrollHeight)';
                    break;
                case 'top':
                    // Scroll to the top-left corner
                    script = 'window.scrollTo(0, 0)';
                    break;
                case 'coordinates': {
                    if (typeof x !== 'number' || typeof y !== 'number') {
                        return 'Error scrolling: Coordinates (x, y) are required for "coordinates" scroll mode.';
                    }
                    // Ensure coordinates are non-negative integers
                    const scrollX = Math.max(0, Math.floor(x));
                    const scrollY = Math.max(0, Math.floor(y));
                    script = `window.scrollTo(${scrollX}, ${scrollY})`;
                    break;
                }
                default: {
                    // Should not happen with TypeScript, but good practice
                    return `Error scrolling: Unsupported scroll mode: ${mode}`;
                }
            }

            // Ensure viewport is set *before* calculating scroll distances based on it (like innerHeight)
            // Although scrollTo doesn't strictly need it, scrollBy using innerHeight does.
            // It also ensures consistency if other actions follow.
            await this.ensureViewportSize();

            // Execute the scroll script
            const scrollResult = await this.cdpClient!.Runtime.evaluate({
                expression: script,
                awaitPromise: true, // Wait for any potential promise returned by scroll behavior
                userGesture: true, // Important for triggering potential scroll-linked effects
            });

            if (scrollResult.exceptionDetails) {
                throw new Error(
                    `JS exception during scroll: ${scrollResult.exceptionDetails.text}`
                );
            }

            // Add a small delay to allow layout/rendering to potentially catch up after scroll
            await new Promise(resolve => setTimeout(resolve, 100));

            return `Successfully scrolled (${mode})${coordString}`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error scrolling tab ${this.tabId}:`,
                error
            );
            return `Error scrolling: ${error.message || error}`;
        }
    }

    /**
     * Click at specific coordinates (CSS pixels).
     * Assumes ensureViewportSize (forcing DPR=1) has been called by the caller or previously.
     * @param x X-coordinate (CSS pixels)
     * @param y Y-coordinate (CSS pixels)
     * @param button Mouse button
     * @returns Success or error message string
     */
    async click_at(
        x: number,
        y: number,
        button: 'left' | 'middle' | 'right' = 'left'
    ): Promise<string> {
        await this.ensureInitialized();
        // Floor coordinates to integers as CDP expects integers
        const clickX = Math.floor(x);
        const clickY = Math.floor(y);
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Clicking at: ${clickX},${clickY} with ${button} button`
        );

        if (clickX < 0 || clickY < 0) {
            console.warn(
                `[browser_session_cdp] Tab ${this.tabId}: Click coordinates (${clickX},${clickY}) are out of bounds (negative). Attempting anyway.`
            );
            // Allow potentially negative coordinates but warn, CDP might handle/clamp them.
        }

        try {
            const client = this.cdpClient!;

            // Ensure viewport is set (forces DPR=1) before interaction
            // This ensures the x, y coordinates map correctly to the browser's internal representation
            await this.ensureViewportSize();

            // Dispatch Mouse Pressed event
            await client.Input.dispatchMouseEvent({
                type: 'mousePressed',
                x: clickX,
                y: clickY,
                button: button,
                clickCount: 1,
            });

            // Short delay between press and release
            await new Promise(resolve => setTimeout(resolve, 50)); // Increased delay slightly

            // Dispatch Mouse Released event
            await client.Input.dispatchMouseEvent({
                type: 'mouseReleased',
                x: clickX,
                y: clickY,
                button: button,
                clickCount: 1,
            });

            // Add a small delay after click to allow potential navigation or JS handlers to trigger
            await new Promise(resolve => setTimeout(resolve, 100));

            return `Successfully clicked at ${clickX},${clickY} with ${button} button`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error clicking at ${clickX},${clickY} for tab ${this.tabId}:`,
                error
            );
            return `Error clicking at ${clickX},${clickY}: ${error.message || error}`;
        }
    }

    /**
     * Simulate dragging from a start point to an end point (CSS pixels).
     * Assumes ensureViewportSize (forcing DPR=1) has been called.
     * @param startX Starting X-coordinate (CSS pixels)
     * @param startY Starting Y-coordinate (CSS pixels)
     * @param endX Ending X-coordinate (CSS pixels)
     * @param endY Ending Y-coordinate (CSS pixels)
     * @param button Mouse button
     * @returns Success or error message string
     */
    async drag(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        button: 'left' | 'middle' | 'right' = 'left'
    ): Promise<string> {
        await this.ensureInitialized();
        // Floor coordinates
        const dragStartX = Math.floor(startX);
        const dragStartY = Math.floor(startY);
        const dragEndX = Math.floor(endX);
        const dragEndY = Math.floor(endY);

        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Dragging from ${dragStartX},${dragStartY} to ${dragEndX},${dragEndY} with ${button} button`
        );

        if (
            typeof dragStartX !== 'number' ||
            typeof dragStartY !== 'number' ||
            typeof dragEndX !== 'number' ||
            typeof dragEndY !== 'number'
        ) {
            return 'Error dragging: Valid numeric start and end coordinates are required.';
        }

        try {
            const client = this.cdpClient!;
            const steps = 10; // Number of intermediate move steps

            // Ensure viewport is set (forces DPR=1) before interaction
            await this.ensureViewportSize();

            // Mouse down at the start position
            await client.Input.dispatchMouseEvent({
                type: 'mousePressed',
                x: dragStartX,
                y: dragStartY,
                button: button,
                clickCount: 1,
            });

            // Small delay after press
            await new Promise(resolve => setTimeout(resolve, 50));

            // Simulate mouse moves along the path from start to end
            for (let i = 1; i <= steps; i++) {
                const intermediateX = Math.floor(
                    dragStartX + ((dragEndX - dragStartX) * i) / steps
                );
                const intermediateY = Math.floor(
                    dragStartY + ((dragEndY - dragStartY) * i) / steps
                );

                await client.Input.dispatchMouseEvent({
                    type: 'mouseMoved',
                    x: intermediateX,
                    y: intermediateY,
                    button: button, // Indicate which button is pressed during move
                });

                // Small delay between move steps
                await new Promise(resolve => setTimeout(resolve, 20)); // Adjusted delay
            }

            // Ensure the final move event is exactly at the end coordinates
            if (steps > 0) {
                // Avoid duplicate if steps = 0 (though unlikely)
                await client.Input.dispatchMouseEvent({
                    type: 'mouseMoved',
                    x: dragEndX,
                    y: dragEndY,
                    button: button,
                });
                await new Promise(resolve => setTimeout(resolve, 20));
            }

            // Mouse release at the end position
            await client.Input.dispatchMouseEvent({
                type: 'mouseReleased',
                x: dragEndX,
                y: dragEndY,
                button: button,
                clickCount: 1, // clickCount for release should technically be 0, but 1 often works
            });

            // Add a small delay after drag to allow potential drop handlers to trigger
            await new Promise(resolve => setTimeout(resolve, 100));

            return `Successfully dragged from ${dragStartX},${dragStartY} to ${dragEndX},${dragEndY} with ${button} button`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error dragging for tab ${this.tabId}:`,
                error
            );
            return `Error dragging: ${error.message || error}`;
        }
    }

    /**
     * Type text into the currently focused element. Handles newlines ('\n') by pressing Enter.
     * @param text The text to type
     * @returns Success or error message string
     */
    async type(text: string): Promise<string> {
        await this.ensureInitialized();
        // Replace \r\n with \n, then handle \n
        const normalizedText = text.replace(/\r\n/g, '\n');
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Typing text (length ${normalizedText.length}): "${normalizedText.substring(0, 50)}${normalizedText.length > 50 ? '...' : ''}"`
        );

        try {
            const client = this.cdpClient!;

            // Small delay before typing to ensure focus is ready
            await new Promise(resolve => setTimeout(resolve, 50));

            for (const char of normalizedText) {
                if (char === '\n') {
                    // Press Enter for newline
                    // Key down for Enter
                    await client.Input.dispatchKeyEvent({
                        type: 'keyDown',
                        key: 'Enter',
                        code: 'Enter',
                        windowsVirtualKeyCode: 13, // Standard virtual key code for Enter
                        text: '\r', // Typically Enter sends a carriage return as text
                    });

                    // Small delay
                    await new Promise(resolve => setTimeout(resolve, 20));

                    // Key up for Enter
                    await client.Input.dispatchKeyEvent({
                        type: 'keyUp',
                        key: 'Enter',
                        code: 'Enter',
                        windowsVirtualKeyCode: 13,
                    });
                } else {
                    // Type regular character using 'char' type for simplicity,
                    // but dispatchKeyEvent might be more robust for some inputs.
                    // Using Input.insertText might be even better as it bypasses key events.

                    // Option 1: Using Input.insertText (often more reliable)
                    await client.Input.insertText({ text: char });

                    // Option 2: Using dispatchKeyEvent 'char' (original approach)
                    // await client.Input.dispatchKeyEvent({ type: 'char', text: char });

                    // Option 3: Using dispatchKeyEvent keyDown/keyUp (more complex, handles modifiers)
                    // await client.Input.dispatchKeyEvent({ type: 'keyDown', key: char, text: char /* ... other properties */ });
                    // await new Promise(resolve => setTimeout(resolve, 10));
                    // await client.Input.dispatchKeyEvent({ type: 'keyUp', key: char, text: char /* ... */ });
                }
                // Small delay between characters/actions
                await new Promise(resolve => setTimeout(resolve, 30)); // Adjusted delay
            }

            // Add a small delay after typing finishes
            await new Promise(resolve => setTimeout(resolve, 100));

            return `Successfully typed text (length ${normalizedText.length})`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error typing text for tab ${this.tabId}:`,
                error
            );
            return `Error typing text: ${error.message || error}`;
        }
    }

    /**
     * Press keyboard keys (e.g., 'Enter', 'Tab', 'ArrowDown').
     * Note: Does not currently support modifier keys (Shift, Ctrl, Alt).
     * @param keys The key to press (e.g., 'Enter', 'Tab'). See CDP Input.dispatchKeyEvent 'key' values.
     * @returns Success or error message string
     */
    async press(keys: string): Promise<string> {
        await this.ensureInitialized();
        const key = keys.trim(); // Use the provided key directly
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Pressing key: ${key}`
        );

        if (!key) {
            return 'Error pressing key: Key cannot be empty.';
        }

        try {
            const client = this.cdpClient!;

            // Key down event
            await client.Input.dispatchKeyEvent({
                type: 'keyDown',
                key: key, // Use the key name directly (e.g., 'Enter', 'Tab', 'a', 'A')
                // code: Determine appropriate code if needed (e.g., 'Enter', 'Tab', 'KeyA')
                // windowsVirtualKeyCode: Determine appropriate virtual key code if needed
                // autoRepeat: false, // Typically false for single press
                // isKeypad: false, // Typically false unless simulating numpad
            });

            // Small delay between down and up
            await new Promise(resolve => setTimeout(resolve, 30)); // Adjusted delay

            // Key up event
            await client.Input.dispatchKeyEvent({
                type: 'keyUp',
                key: key,
                // code: Corresponding code
                // windowsVirtualKeyCode: Corresponding virtual key code
            });

            // Add a small delay after key press
            await new Promise(resolve => setTimeout(resolve, 100));

            return `Successfully pressed key: ${key}`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error pressing key '${key}' for tab ${this.tabId}:`,
                error
            );
            return `Error pressing key '${key}': ${error.message || error}`;
        }
    }

    /**
     * Execute a sequence of browser actions. Stops on the first error.
     * @param actions An array of BrowserAction objects.
     * @returns A summary message indicating success or the point of failure.
     */
    async executeActions(actions: BrowserAction[]): Promise<string> {
        await this.ensureInitialized(); // Ensure session is ready before starting sequence
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Executing batch of ${actions.length} actions.`
        );

        const results: string[] = []; // Store results of each action (optional)
        let lastResult: any = null; // Store result of last successful action (e.g., browserStatus)

        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            console.log(
                `[browser_session_cdp] Tab ${this.tabId}: Executing action ${i + 1}/${actions.length}: ${action.action}`
            );

            let result:
                | string
                | BrowserStatusPayload
                | { error: string }
                | any = ''; // Use 'any' for debugCommand flexibility

            try {
                switch (action.action) {
                    case 'navigate': {
                        result = await this.navigate(action.url);
                        break;
                    }
                    case 'get_page_url': {
                        result = await this.get_page_url();
                        break;
                    }
                    case 'get_page_content': {
                        result = await this.get_page_content(action.type);
                        break;
                    }
                    case 'browserStatus': {
                        // browserStatus returns a payload or an error object
                        result = await this.browserStatus(
                            action.type,
                            action.includeCoreTabs
                        );
                        // Check if the result is an error object
                        if (
                            typeof result === 'object' &&
                            result !== null &&
                            'error' in result
                        ) {
                            throw new Error(result.error); // Throw to enter catch block
                        }
                        lastResult = result; // Store the successful payload
                        result =
                            'Successfully retrieved browser status and screenshot.'; // Use a generic success string for the sequence log
                        break;
                    }
                    case 'js_evaluate': {
                        result = await this.js_evaluate(action.code);
                        break;
                    }
                    case 'scroll_to': {
                        result = await this.scroll_to(
                            action.mode,
                            action.x,
                            action.y
                        );
                        break;
                    }
                    case 'click_at': {
                        result = await this.click_at(
                            action.x,
                            action.y,
                            action.button
                        );
                        break;
                    }
                    case 'drag': {
                        result = await this.drag(
                            action.startX,
                            action.startY,
                            action.endX,
                            action.endY,
                            action.button
                        );
                        break;
                    }
                    case 'type': {
                        result = await this.type(action.text);
                        break;
                    }
                    case 'press': {
                        result = await this.press(action.keys);
                        break;
                    }
                    case 'debugCommand': {
                        // debugCommand might return complex objects or throw
                        const debugResult = await this.debugCommand(
                            action.method,
                            action.commandParams
                        );
                        // For simplicity in sequence logging, just indicate success or stringify
                        result = `Successfully executed debug command: ${action.method}. Result: ${JSON.stringify(debugResult).substring(0, 100)}...`;
                        lastResult = debugResult; // Store the actual result
                        break;
                    }
                    default: {
                        // This should not happen with TypeScript checking BrowserAction type
                        console.error(
                            `[browser_session_cdp] Tab ${this.tabId}: Unknown action type encountered:`,
                            action
                        );
                        result = `Error: Unknown action type at step ${i + 1}.`;
                        // Stop execution on unknown action
                        return `Execution failed at step ${i + 1}: Unknown action type.`;
                    }
                }

                // Check if the result string indicates an error (for methods returning strings)
                if (typeof result === 'string' && result.startsWith('Error')) {
                    // Action failed, stop execution and report
                    console.error(
                        `[browser_session_cdp] Tab ${this.tabId}: Action ${i + 1} (${action.action}) failed: ${result}`
                    );
                    return `Execution failed at step ${i + 1} (${action.action}): ${result}`;
                } else if (typeof result === 'string') {
                    // Action succeeded (based on string result)
                    results.push(result); // Store success message
                    // Don't overwrite lastResult if it was set by browserStatus or debugCommand
                    if (
                        action.action !== 'browserStatus' &&
                        action.action !== 'debugCommand'
                    ) {
                        lastResult = result;
                    }
                } else {
                    // Should only be browserStatus payload or debugCommand result here
                    // Success message was already generated for these cases above
                    results.push(
                        `Action ${action.action} completed successfully.`
                    );
                }
            } catch (error: any) {
                // Catch errors thrown by methods (like browserStatus error object or debugCommand errors)
                console.error(
                    `[browser_session_cdp] Tab ${this.tabId}: Uncaught error during action ${i + 1} (${action.action}):`,
                    error
                );
                return `Execution failed at step ${i + 1} (${action.action}): ${error.message || error}`;
            }
        }

        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Successfully executed all ${actions.length} actions.`
        );
        // Optionally return the result of the *last* action, or a summary
        // Returning the last result might be useful if the sequence ends with browserStatus or get_page_url etc.
        // return `Successfully executed ${actions.length} actions. Last result: ${JSON.stringify(lastResult)}`;
        return JSON.stringify({
            status: 'success',
            message: `Successfully executed ${actions.length} actions.`,
            lastResult: lastResult, // Include the actual result of the last action
        });
    }

    /**
     * Execute a Chrome DevTools Protocol command directly. Use with caution.
     * @param method The CDP method (e.g., 'Page.navigate', 'DOM.querySelector')
     * @param commandParams Parameters for the method
     * @returns The result from the CDP command
     * @throws If the command fails or method is invalid
     */
    async debugCommand(method: string, commandParams?: object): Promise<any> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Executing DEBUG command: ${method} with params:`,
            commandParams || {}
        );

        try {
            if (!method || typeof method !== 'string') {
                throw new Error(
                    'Valid method name string is required for debugCommand'
                );
            }

            const parts = method.split('.');
            if (parts.length !== 2 || !parts[0] || !parts[1]) {
                throw new Error(
                    `Invalid CDP method format: "${method}". Expected "Domain.command".`
                );
            }
            const [domain, command] = parts;

            const client = this.cdpClient!;

            // Basic check if the domain and command exist on the client object
            // Note: This is a runtime check and might not catch all invalid methods
            // if the CDP definition changes or the client library has issues.
            if (typeof (client as any)[domain]?.[command] !== 'function') {
                throw new Error(
                    `CDP method "${method}" not found or is not a function on the client.`
                );
            }

            // Execute the command
            // Use 'any' type assertion as we are dynamically calling methods
            const result = await (client as any)[domain][command](
                commandParams || {}
            );

            console.log(
                `[browser_session_cdp] Debug command ${method} executed successfully for tab ${this.tabId}.`
            );
            return result; // Return the raw result from CDP
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error executing debug command "${method}" for tab ${this.tabId}:`,
                error
            );
            // Re-throw the error so the caller (like executeActions) can handle it
            throw new Error(
                `Debug command "${method}" failed: ${error.message || error}`
            );
        }
    }

    /**
     * Close the tab and release resources
     * @returns Success or error message string
     */
    async closeSession(): Promise<string> {
        if (!this.initialized || !this.cdpClient || !this.chromeTabId) {
            console.log(
                `[browser_session_cdp] Tab ${this.tabId} session already closed or not initialized.`
            );
            // Return success even if already closed, as the desired state is achieved
            return `Tab ${this.tabId} session already closed or was not initialized.`;
        }

        const targetIdToClose = this.chromeTabId; // Store ID before resetting
        console.log(
            `[browser_session_cdp] Closing tab ${this.tabId} (CDP target: ${targetIdToClose})`
        );

        try {
            // 1. Attempt to close the target using the specific client first
            //    This might fail if the connection is already severed.
            try {
                await this.cdpClient.Target.closeTarget({
                    targetId: targetIdToClose,
                });
                console.log(
                    `[browser_session_cdp] Closed target ${targetIdToClose} via specific client.`
                );
            } catch (closeError: any) {
                console.warn(
                    `[browser_session_cdp] Could not close target ${targetIdToClose} via its own client (might be disconnected): ${closeError.message}. Will attempt via root client.`
                );
                // If closing via the specific client fails, try connecting a temporary root client
                // This handles cases where the tab might have crashed or the connection dropped.
                let rootClient = null;
                try {
                    const host = process.env.CDP_HOST || 'localhost';
                    const port = parseInt(
                        process.env.HOST_CDP_PORT || '9222',
                        10
                    );
                    rootClient = await CDP({ host, port });
                    await rootClient.Target.closeTarget({
                        targetId: targetIdToClose,
                    });
                    console.log(
                        `[browser_session_cdp] Closed target ${targetIdToClose} via temporary root client.`
                    );
                } catch (rootCloseError: any) {
                    console.error(
                        `[browser_session_cdp] Failed to close target ${targetIdToClose} via root client as well: ${rootCloseError.message}. The target might already be closed.`
                    );
                    // Continue cleanup even if closing fails
                } finally {
                    if (rootClient)
                        await rootClient
                            .close()
                            .catch(err =>
                                console.error(
                                    'Error closing temp root client:',
                                    err
                                )
                            );
                }
            }

            // 2. Clean up internal state regardless of close success/failure
            this.initialized = false;
            this.cdpClient = null; // Release client reference
            this.chromeTabId = null;

            console.log(
                `[browser_session_cdp] Session resources released for tab ${this.tabId}.`
            );
            return `Successfully closed tab ${this.tabId}`;
        } catch (error: any) {
            // Catch any unexpected errors during the process
            console.error(
                `[browser_session_cdp] Unexpected error during closeSession for tab ${this.tabId}:`,
                error
            );
            // Still attempt to clean up state
            this.initialized = false;
            this.cdpClient = null;
            this.chromeTabId = null;
            return `Error closing tab ${this.tabId}: ${error.message || error}`;
        }
    }
}

// --- Agent Session Cache ---
const activeSessions = new Map<string, AgentBrowserSessionCDP>();

/**
 * Closes all active browser sessions and clears the session cache.
 * Useful for graceful shutdown or cleanup.
 *
 * @returns Promise that resolves when all sessions are closed (or attempted to be closed)
 */
export async function closeAllSessions(): Promise<void> {
    const sessionIds = Array.from(activeSessions.keys());
    if (sessionIds.length === 0) {
        console.log('[browser_utils] No active browser sessions to close.');
        return;
    }

    console.log(
        `[browser_utils] Closing all ${sessionIds.length} active browser sessions: [${sessionIds.join(', ')}]...`
    );

    const closePromises = sessionIds.map(tabId => {
        const session = activeSessions.get(tabId);
        if (session) {
            // Remove from cache immediately *before* calling close
            // This prevents race conditions if closeSession is called again elsewhere
            activeSessions.delete(tabId);
            return session.closeSession().catch(err => {
                // Log error but don't let one failure stop others
                console.error(
                    `[browser_utils] Error closing session for tab ${tabId}:`,
                    err
                );
            });
        }
        return Promise.resolve(); // Should not happen if key exists, but be safe
    });

    await Promise.all(closePromises);

    // Double-check the map is clear in case of race conditions (though unlikely now)
    activeSessions.clear();
    console.log(
        '[browser_utils] All active sessions have been processed for closure.'
    );
}

// --- Factory Function for Agent Sessions ---

/**
 * Creates or retrieves a browser session manager for a specific tab.
 * Maintains a cache of sessions so repeated calls with the same tabId
 * return the same instance (unless it has been closed).
 *
 * @param tabId A unique identifier for the tab.
 * @param startUrl Optional URL to navigate to if creating a new session.
 * @returns An AgentBrowserSessionCDP instance for the given tabId.
 * @throws If tabId is empty.
 */
export function getAgentBrowserSession(
    tabId: string,
    startUrl?: string
): AgentBrowserSessionCDP {
    if (!tabId) {
        throw new Error(
            'Tab ID cannot be empty when getting/creating a browser session.'
        );
    }

    // Return the existing session if it's in the cache
    const existingSession = activeSessions.get(tabId);
    if (existingSession) {
        // console.log(`[browser_utils] Reusing existing session for tab: ${tabId}`);
        return existingSession;
    }

    // Create a new session if not found
    console.log(
        `[browser_utils] Creating new session for tab: ${tabId} ${startUrl ? `with start URL: ${startUrl}` : ''}`
    );
    const session = new AgentBrowserSessionCDP(tabId, startUrl);

    // Monkey-patch closeSession to ensure removal from cache upon closing
    // Store the original method
    const originalClose = session.closeSession.bind(session);
    // Override with a function that removes from cache *then* calls original
    session.closeSession = async function (): Promise<string> {
        console.log(
            `[browser_utils] Session for tab ${tabId} is closing, removing from cache.`
        );
        activeSessions.delete(tabId); // Remove from cache first
        return originalClose(); // Call the original close logic
    };

    // Add the new session to the cache
    activeSessions.set(tabId, session);
    console.log(`[browser_utils] Session for tab ${tabId} added to cache.`);
    return session;
}

// --- Graceful Shutdown ---
// Attempt to close sessions on common exit signals.
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

signals.forEach(signal => {
    process.on(signal, async () => {
        console.log(
            `[browser_utils] Received ${signal}. Attempting to close active sessions...`
        );
        // Allow some time for cleanup, but force exit eventually
        const cleanupTimeout = setTimeout(() => {
            console.warn(
                '[browser_utils] Cleanup timed out (5s). Forcing exit.'
            );
            process.exit(1); // Force exit if cleanup hangs
        }, 5000); // 5 seconds timeout

        try {
            await closeAllSessions();
            console.log('[browser_utils] Graceful shutdown complete.');
            clearTimeout(cleanupTimeout);
            process.exit(0); // Clean exit
        } catch (error) {
            console.error(
                '[browser_utils] Error during graceful shutdown:',
                error
            );
            clearTimeout(cleanupTimeout);
            process.exit(1); // Exit with error code
        }
    });
});
