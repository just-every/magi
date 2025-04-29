/**
 * Simplified browser session implementation using Chrome DevTools Protocol (CDP)
 *
 * This implementation only handles connecting to an already-running Chrome instance
 * and does not try to launch or manage Chrome. It manages individual browser tabs
 * for different agents.
 */
import CDP from 'chrome-remote-interface';
import {
    buildElementArray,
    BrowserStatusPayload,
} from './cdp/browser_helpers.js';
import { BROWSER_WIDTH, BROWSER_HEIGHT } from '../constants.js';
import { addGrid } from './image_utils.js';

// --- Define Action Types ---

// Define specific action interfaces for type safety used by executeActions
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
    location: 'page_down' | 'page_up' | 'bottom' | 'top' | 'coordinates';
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
    action: 'press_keys';
    keys: string;
} // Changed from 'key' back to 'keys' to match executeActions switch
interface DebugCommandAction {
    action: 'debugCommand';
    method: string;
    commandParams?: object;
}

// Union type for all possible actions used by executeActions
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
    | DebugCommandAction
    | string;

/**
 * Manages a browser session using Chrome DevTools Protocol for a specific tab.
 */
export class AgentBrowserSessionCDP {
    private tabId: string;
    private startUrl?: string;
    private initialized = false;
    private chromeTabId: string | null = null; // CDP target ID
    private cdpClient: CDP.Client | null = null;
    private navigationRequested = false; // Flag to track if navigation was requested
    private navigationStarted = false; // Flag to track if navigation started
    private navigationEventHandlersAdded = false; // Flag to track if navigation event handlers are added
    private cursorPosition: { x: number; y: number } | null = null; // Added for virtual cursor

    /**
     * Creates a new browser session manager for a tab.
     * @param tabId A unique identifier for the tab (often the agent ID).
     * @param startUrl Optional URL to navigate to when the tab is first created.
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

    // --- Initialization and Helper Methods ---

    /**
     * Initialize the browser session by connecting to Chrome and creating/attaching to a tab.
     * This method is idempotent (safe to call multiple times).
     */
    async initialize(): Promise<void> {
        // If already initialized, do nothing.
        if (this.initialized) {
            return;
        }

        console.log(
            `[browser_session_cdp] Initializing browser session for tab: ${this.tabId}...`
        );

        try {
            // Define host and port for the Chrome DevTools Protocol endpoint.
            // Uses 'host.docker.internal' for Docker compatibility, falling back to localhost.
            // Uses HOST_CDP_PORT environment variable, falling back to 9001.
            const host = 'host.docker.internal'; // Specific host for Docker bridge network
            const port = parseInt(process.env.HOST_CDP_PORT || '9001', 10); // Port from env or default

            console.log(
                `[browser_session_cdp] Connecting to CDP at ${host}:${port}`
            );

            // Connect to the main CDP endpoint to manage targets (tabs).
            const rootClient = await CDP({
                host,
                port,
            });

            try {
                // Create a new target (browser tab) - always starting with about:blank
                // This ensures we can attach listeners before any real navigation starts
                const { targetId } = await rootClient.Target.createTarget({
                    url: 'about:blank', // Always start with blank page, we'll navigate after client setup
                    newWindow: false, // Create a tab in the existing window
                    background: true, // Create the tab in the background without stealing focus
                });

                this.chromeTabId = targetId; // Store the CDP ID for our tab
                console.log(
                    `[browser_session_cdp] Created new target (tab) with ID: ${targetId} (in background: true)`
                );

                // Create a dedicated CDP client connected specifically to our new tab.
                this.cdpClient = await CDP({
                    host,
                    port,
                    target: targetId, // Scope commands to this tab
                });
                console.log(
                    `[browser_session_cdp] Connected CDP client to target: ${targetId}`
                );

                // Enable necessary CDP domains for browser interaction and status retrieval.
                await Promise.all([
                    this.cdpClient.Page.enable(), // Page navigation, lifecycle events
                    this.cdpClient.DOM.enable(), // DOM inspection, querying
                    this.cdpClient.Runtime.enable(), // JavaScript execution, getting properties
                ]);
                console.log(
                    `[browser_session_cdp] Enabled required CDP domains for target: ${targetId}`
                );

                // *** ADD SCRIPT INJECTION HERE ***
                try {
                    console.log(
                        `[browser_session_cdp] Injecting script to handle new tabs for target: ${targetId}`
                    );
                    await this.cdpClient.Page.addScriptToEvaluateOnNewDocument({
                        source: `(() => {
                            // override window.open to just navigate the current tab
                            const originalOpen = window.open;
                            window.open = (url, name, features) => {
                              if (url) { // Only navigate if URL is provided
                                location.href = url;
                              }
                              // Return null or a mock window object if needed by calling scripts
                              // Returning null might be simpler if compatibility isn't an issue.
                              return null;
                            };

                            // also catch <a target="_blank"> clicks
                            // Use capture phase to catch the event early
                            document.addEventListener('click', e => {
                              // Find the closest anchor tag starting from the event target
                              const a = e.target.closest('a[target="_blank"]');
                              // Check if an anchor was found, it has an href, and it's not just a fragment identifier
                              if (a && a.href && !a.href.startsWith(location.origin + location.pathname + '#')) {
                                e.preventDefault(); // Stop the default behavior (opening new tab)
                                e.stopPropagation(); // Stop the event from propagating further
                                location.href = a.href; // Navigate the current tab
                              }
                            }, true); // Use capture phase (true)
                          })();`,
                    });
                    console.log(
                        `[browser_session_cdp] Script injected successfully for target: ${targetId}`
                    );
                } catch (scriptError) {
                    console.error(
                        `[browser_session_cdp] Failed to inject script for target ${targetId}:`,
                        scriptError
                    );
                    // Decide if this should be a fatal error for initialization
                    // For now, we'll log and continue, but this might break expected behavior.
                }
                // *** END SCRIPT INJECTION ***

                // Close the initial root client connection as it's no longer needed.
                await rootClient.close();

                // If startUrl was provided, navigate to it and wait for load
                if (this.startUrl) {
                    console.log(
                        `[browser_session_cdp] Tab ${this.tabId} navigating to start URL: ${this.startUrl}`
                    );

                    // Temporarily mark as initialized to prevent navigate() from recursively calling initialize()
                    this.initialized = true;

                    try {
                        // Use existing navigate() method which already handles waiting for page load
                        const result = await this.navigate(this.startUrl);
                        console.log(
                            `[browser_session_cdp] Tab ${this.tabId} initial navigation result: ${result}`
                        );
                    } catch (navError) {
                        // If navigation fails, mark as not initialized and re-throw
                        console.error(
                            `[browser_session_cdp] Failed to load initial URL ${this.startUrl} for tab ${this.tabId}:`,
                            navError
                        );
                        this.initialized = false;
                        throw navError;
                    }
                }

                // Mark session as fully initialized
                this.initialized = true;
                console.log(
                    `[browser_session_cdp] Tab ${this.tabId} session initialized, CDP target ID: ${targetId}`
                );
            } catch (error) {
                // Handle errors during target creation or connection.
                console.error(
                    `[browser_session_cdp] Failed during target creation/connection for tab ${this.tabId}:`,
                    error
                );
                // Attempt to close the root client if it was opened.
                if (rootClient)
                    await rootClient
                        .close()
                        .catch(closeErr =>
                            console.error(
                                'Error closing root client:',
                                closeErr
                            )
                        );
                this.initialized = false; // Ensure state reflects failure
                throw error; // Re-throw the error
            }
        } catch (error) {
            // Handle errors establishing the initial CDP connection.
            console.error(
                `[browser_session_cdp] Failed to establish initial CDP connection for tab ${this.tabId}:`,
                error
            );
            this.initialized = false; // Ensure state reflects failure
            throw error; // Re-throw the error
        }
    }

    /**
     * Ensures the session is initialized before performing actions.
     * Calls initialize() if the session is not already marked as initialized.
     * @private
     * @throws If initialization fails or the CDP client is unavailable after initialization attempt.
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized || !this.cdpClient) {
            console.warn(
                `[browser_session_cdp] Tab ${this.tabId} session not explicitly initialized or client missing. Auto-initializing.`
            );
            // Initialize will use the correct host/port settings.
            // It will throw an error if it fails.
            await this.initialize();
        }
        // Double-check if the client is available after potential initialization.
        if (!this.cdpClient) {
            // This should ideally not be reached if initialize() succeeds or throws.
            throw new Error(
                `CDP client not available for tab ${this.tabId} after initialization attempt.`
            );
        }

        // Initialize cursor position if not already set
        if (this.cursorPosition === null) {
            this.cursorPosition = {
                x: Math.floor(BROWSER_WIDTH / 2),
                y: Math.floor(BROWSER_HEIGHT / 4),
            };
            console.log(
                `[browser_session_cdp] Tab ${this.tabId}: Initialized cursor position to ${this.cursorPosition.x},${this.cursorPosition.y}`
            );
        }

        // Set up navigation tracking if not already done
        await this.setupNavigationTracking();
    }

    /**
     * Sets up event listeners to track page navigation events.
     * This method is idempotent and will only add listeners once.
     * @private
     */
    private async setupNavigationTracking(): Promise<void> {
        if (this.navigationEventHandlersAdded || !this.cdpClient) {
            return;
        }

        const client = this.cdpClient;

        // Listen for frameRequestedNavigation event (when navigation is requested)
        client.Page.on('frameRequestedNavigation', () => {
            console.log(
                `[browser_session_cdp] Tab ${this.tabId}: Navigation requested`
            );
            this.navigationRequested = true;
        });

        // Listen for frameNavigated event (when navigation starts)
        client.Page.on('frameNavigated', () => {
            console.log(
                `[browser_session_cdp] Tab ${this.tabId}: Navigation started`
            );
            this.navigationStarted = true;
        });

        this.navigationEventHandlersAdded = true;
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Navigation tracking set up`
        );
    }

    /**
     * Resets navigation tracking flags.
     * Should be called before an action that might trigger navigation.
     * @private
     */
    private trackPageLoad(): void {
        this.navigationRequested = false;
        this.navigationStarted = false;
    }

    /**
     * Waits for the page to load if navigation has been triggered.
     * Similar to the waiting logic in the navigate method but conditional.
     * @private
     * @returns A promise that resolves when page is loaded or timeout occurs
     */
    private async waitForPageLoad(): Promise<void> {
        await new Promise(r => setTimeout(r, 100)); // 100ms delay to allow navigation events to settle
        await this.waitForPageLoadComplete();
    }

    private async waitForPageLoadComplete(): Promise<void> {
        if (
            !this.cdpClient ||
            (!this.navigationRequested && !this.navigationStarted)
        ) {
            return; // No navigation detected, return immediately
        }

        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Navigation detected, waiting for page load...`
        );
        const client = this.cdpClient;
        let loadFired = false;

        // Set up a promise that resolves when Page.loadEventFired is received
        return new Promise<void>(resolve => {
            // Add a timeout in case the load event never fires
            const loadTimeout = setTimeout(() => {
                if (!loadFired) {
                    console.warn(
                        `[browser_session_cdp] Tab ${this.tabId}: Page load timed out after 30s. Resolving anyway.`
                    );
                    resolve(); // Resolve even on timeout to avoid hanging
                }
            }, 30000); // 30-second timeout, same as navigate

            // Listen for the load event once
            client.once('Page.loadEventFired', () => {
                loadFired = true;
                clearTimeout(loadTimeout); // Clear timeout if load event fires
                console.log(
                    `[browser_session_cdp] Tab ${this.tabId}: Page load completed`
                );
                resolve();
            });
        });
    }

    /**
     * Sets the viewport *dimensions* to standard CSS pixel values (BROWSER_WIDTHxBROWSER_HEIGHT).
     * Allows the browser to use its native device pixel ratio for rendering.
     * This ensures a consistent layout size for measurement and interaction.
     * @private
     */
    private async ensureViewportSize(): Promise<void> {
        try {
            // Use Emulation domain to override device metrics for the tab.
            await this.cdpClient!.Emulation.setDeviceMetricsOverride({
                width: BROWSER_WIDTH, // Set viewport width in CSS pixels
                height: BROWSER_HEIGHT, // Set viewport height in CSS pixels
                deviceScaleFactor: 0, // Use 0 to adopt the browser's default/native DPR
                mobile: false, // Emulate a desktop browser
            });
            // Log reduced for less noise during execution
            // console.log(`[browser_session_cdp] Tab ${this.tabId}: Set viewport dimensions to BROWSER_WIDTHxBROWSER_HEIGHT CSS pixels (using native DPR)`);
        } catch (error) {
            // Log errors but allow execution to continue if possible.
            console.error(
                `[browser_session_cdp] Error setting viewport dimensions for tab ${this.tabId}:`,
                error
            );
            // Depending on requirements, could throw new Error(`Failed to set viewport dimensions: ${error.message}`);
        }
    }

    // --- Core Browser Actions ---

    /**
     * Navigates the browser tab to the specified URL.
     * Waits for the page load event before resolving.
     * @param url The absolute URL to navigate to.
     * @returns A promise resolving to a success or error message string.
     */
    async navigate(url: string): Promise<string> {
        await this.ensureInitialized(); // Ensure connection is ready
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Navigating to ${url}`
        );
        try {
            const client = this.cdpClient!;
            let loadFired = false;

            // Set up a promise that resolves when Page.loadEventFired is received.
            const loadPromise = new Promise<void>(resolve => {
                // Add a timeout in case the load event never fires.
                const loadTimeout = setTimeout(() => {
                    if (!loadFired) {
                        console.warn(
                            `[browser_session_cdp] Tab ${this.tabId}: Navigation to ${url} timed out after 30s (load event). Resolving anyway.`
                        );
                        resolve(); // Resolve even on timeout to avoid hanging
                    }
                }, 30000); // 30-second timeout

                // Listen for the load event once.
                client.once('Page.loadEventFired', () => {
                    loadFired = true;
                    clearTimeout(loadTimeout); // Clear the timeout if load event fires
                    resolve();
                });
            });

            // Initiate navigation.
            const { errorText } = await client.Page.navigate({ url });
            if (errorText) {
                // Check for immediate navigation errors.
                throw new Error(`Navigation failed immediately: ${errorText}`);
            }

            // Wait for the load event or timeout.
            await loadPromise;

            // Get the final URL after potential redirects.
            const result = await client.Runtime.evaluate({
                expression: 'window.location.href',
                returnByValue: true,
            });
            const finalUrl = result?.result?.value ?? 'unknown URL'; // Handle cases where URL couldn't be retrieved

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
     * Retrieves the current URL of the browser tab.
     * @returns A promise resolving to the current URL string or an error message string.
     */
    async get_page_url(): Promise<string> {
        await this.ensureInitialized();
        // Log reduced for less noise
        // console.log(`[browser_session_cdp] Tab ${this.tabId}: Getting current URL`);
        try {
            // Evaluate JavaScript to get window.location.href.
            const result = await this.cdpClient!.Runtime.evaluate({
                expression: 'window.location.href',
                returnByValue: true,
            });
            // Check for JavaScript exceptions during evaluation.
            if (result.exceptionDetails) {
                throw new Error(
                    `JS exception getting URL: ${result.exceptionDetails.text}`
                );
            }
            return result?.result?.value ?? 'Could not retrieve URL'; // Return URL or fallback message
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error getting URL for tab ${this.tabId}:`,
                error
            );
            return `Error getting URL: ${error.message || error}`;
        }
    }

    /**
     * Retrieves the full HTML content of the current page.
     * Note: Currently only supports returning HTML. 'markdown' and 'interactive' types are placeholders.
     * @param type The desired format ('html', 'markdown', 'interactive').
     * @returns A promise resolving to the HTML content string or an error message string.
     */
    async get_page_content(
        type: 'interactive' | 'markdown' | 'html'
    ): Promise<string> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Getting page content as ${type}`
        );
        // Warn if a non-HTML type is requested, as only HTML is implemented.
        if (type !== 'html') {
            console.warn(
                `[browser_session_cdp] Tab ${this.tabId}: get_page_content type '${type}' not fully implemented, returning full HTML.`
            );
        }
        try {
            // Get the root DOM node.
            const { root } = await this.cdpClient!.DOM.getDocument({
                depth: -1,
                pierce: true,
            }); // depth -1 for full tree, pierce for shadow DOM
            if (!root?.nodeId) {
                // Check if root node was retrieved
                throw new Error('Could not get document root node.');
            }
            // Get the outer HTML of the root node.
            const { outerHTML } = await this.cdpClient!.DOM.getOuterHTML({
                nodeId: root.nodeId,
            });
            return outerHTML || ''; // Return HTML or empty string if null
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error getting page content for tab ${this.tabId}:`,
                error
            );
            return `Error getting page content: ${error.message || error}`;
        }
    }

    /**
     * Injects a virtual cursor element into the page at the specified coordinates.
     * Creates an SVG cursor the first time, then updates its position.
     * @private
     * @param client The CDP client to use for JavaScript execution
     * @param cursorX The X coordinate in CSS pixels for cursor position
     * @param cursorY The Y coordinate in CSS pixels for cursor position
     * @returns A promise that resolves when the cursor has been injected, or rejects on error
     */
    private async injectVirtualCursor(
        client: CDP.Client,
        cursorX: number,
        cursorY: number
    ): Promise<void> {
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Setting virtual cursor at ${cursorX},${cursorY}`
        );
        try {
            await client.Runtime.evaluate({
                expression: `
                  (function(x, y) {
                    const ns = 'http://www.w3.org/2000/svg';
                    let c = document.getElementById('__virtualCursor');
                    if (!c) {
                      // 1) Container DIV
                      c = document.createElement('div');
                      c.id = '__virtualCursor';
                      Object.assign(c.style, {
                        position:      'fixed',
                        width:         '14px',
                        height:        '22px',
                        pointerEvents: 'none',
                        zIndex:        '2147483647'
                      });

                      // 2) Inline SVG
                      const svg = document.createElementNS(ns, 'svg');
                      svg.setAttribute('xmlns', ns);
                      svg.setAttribute('width',  '14px');
                      svg.setAttribute('height', '22px');
                      svg.setAttribute('viewBox','0 0 14 21.844');

                      // Stroke path
                      const p1 = document.createElementNS(ns, 'path');
                      p1.setAttribute('d',
                        'M 0.766 0.001 C 0.337 0.022 0 0.363 0 0.777 L 0 16.845 C -0.001 17.444 0.671 17.817 1.208 17.519 C 1.243 17.499 1.277 17.478 1.309 17.452 L 4.546 14.951 L 7.402 21.301 C 7.58 21.694 8.054 21.874 8.462 21.704 L 11.418 20.465 C 11.826 20.293 12.012 19.837 11.836 19.442 L 9.013 13.166 L 13.245 12.693 C 13.861 12.625 14.17 11.939 13.8 11.457 C 13.772 11.42 13.739 11.384 13.705 11.353 L 1.355 0.211 C 1.196 0.066 0.984 -0.009 0.766 0.001 Z M 1.61 2.569 L 11.334 11.343 L 7.746 11.743 C 7.211 11.802 6.887 12.346 7.103 12.824 L 10.037 19.349 L 8.559 19.967 L 5.604 13.398 C 5.392 12.93 4.777 12.781 4.364 13.103 L 1.61 15.226 L 1.61 2.569 Z'
                      );
                      p1.setAttribute('style',
                        'stroke-miterlimit:10.71;stroke-width:7px;stroke-opacity:0.72;' +
                        'fill-rule:nonzero;paint-order:stroke;transform-origin:0px 0px;'
                      );

                      // Fill path
                      const p2 = document.createElementNS(ns, 'path');
                      p2.setAttribute('d',
                        'M 1.568 2.525 L 11.467 11.42 L 7.817 11.825 C 7.269 11.887 6.941 12.438 7.158 12.923 L 10.148 19.537 L 8.641 20.166 L 5.635 13.506 C 5.42 13.03 4.791 12.88 4.371 13.204 L 1.568 15.358 L 1.568 2.525 Z'
                      );
                      p2.setAttribute('style',
                        'stroke-miterlimit:10.71;stroke-width:7px;stroke-opacity:0.72;' +
                        'fill-rule:nonzero;paint-order:stroke;fill:rgb(255,255,255);' +
                        'transform-origin:0px 0px;'
                      );

                      svg.appendChild(p1);
                      svg.appendChild(p2);
                      c.appendChild(svg);
                      document.body.appendChild(c);
                    }
                    // 3) Position it so the tip (0,0) lands at your coords
                    c.style.left = x + 'px';
                    c.style.top  = y + 'px';
                  })(${cursorX}, ${cursorY});
                `,
                returnByValue: false, // No need to return a value
                awaitPromise: false, // Don't wait for promises in the script
            });
        } catch (evalError: any) {
            console.error(
                `[browser_session_cdp] Tab ${this.tabId}: Error injecting virtual cursor:`,
                evalError
            );
            // Continue without cursor if injection fails
        }
    }

    /**
     * Captures a screenshot and gathers browser status information (URL, dimensions, element map).
     * Sets consistent viewport dimensions but allows native device pixel ratio (DPR).
     * Detects the actual DPR and scroll position, passing them to `buildElementArray`
     * for accurate coordinate calculation (CSS pixels relative to the viewport).
     *
     * @returns A promise resolving to the BrowserStatusPayload object on success, or an error object { error: string } on failure.
     */
    async browserStatus(): Promise<BrowserStatusPayload | { error: string }> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Taking screenshot with browser status (detecting DPR)`
        );

        try {
            const client = this.cdpClient!;

            // 1. Set consistent viewport dimensions (e.g., BROWSER_WIDTHxBROWSER_HEIGHT CSS pixels). Allows native DPR.
            await this.ensureViewportSize();

            // 1.5 Inject virtual cursor before taking the screenshot
            if (this.cursorPosition) {
                await this.injectVirtualCursor(
                    client,
                    this.cursorPosition.x,
                    this.cursorPosition.y
                );
            } else {
                console.warn(
                    `[browser_session_cdp] Tab ${this.tabId}: Cursor position not initialized, cannot draw virtual cursor.`
                );
            }

            // 2. Perform CDP operations concurrently for efficiency.
            const [
                metrics, // Page layout metrics (CSS pixels)
                screenshotResult, // Screenshot data
                snap, // DOM snapshot (includes raw element rects)
                urlResult, // Current page URL
                dprResult, // Actual device pixel ratio
                scrollResult, // Current scroll offsets (X and Y)
            ] = await Promise.all([
                client.Page.getLayoutMetrics(),
                client.Page.captureScreenshot({
                    format: 'png',
                    fromSurface: true, // Capture from surface for more accuracy
                    // captureBeyondViewport: false, // Viewport only for now
                    optimizeForSpeed: true, // Prioritize speed
                }),
                client.DOMSnapshot.captureSnapshot({
                    computedStyles: [], // Exclude computed styles for performance
                    includeDOMRects: true, // Essential for element coordinates
                    includeInnerText: true, // Include text content for labels
                    includePaintOrder: false, // Not needed for basic layout
                }),
                client.Runtime.evaluate({
                    expression: 'window.location.href',
                    returnByValue: true,
                }),
                client.Runtime.evaluate({
                    expression: 'window.devicePixelRatio',
                    returnByValue: true,
                }),
                client.Runtime.evaluate({
                    expression:
                        '{ scrollX: window.scrollX, scrollY: window.scrollY }',
                    returnByValue: true,
                }),
            ]);

            // 3. Extract results, providing defaults if necessary.
            const devicePixelRatio: number = dprResult?.result?.value ?? 1; // Default DPR to 1
            const scrollX: number = scrollResult?.result?.value?.scrollX ?? 0; // Default scroll to 0
            const scrollY: number = scrollResult?.result?.value?.scrollY ?? 0;
            console.log(
                `[browser_session_cdp] Detected DPR: ${devicePixelRatio}, Scroll: X=${scrollX}, Y=${scrollY}`
            );

            // Extract viewport and content dimensions (in CSS pixels).
            const viewWidth =
                metrics.cssLayoutViewport?.clientWidth ?? BROWSER_WIDTH;
            const viewHeight =
                metrics.cssLayoutViewport?.clientHeight ?? BROWSER_HEIGHT;
            const fullWidth = metrics.cssContentSize?.width ?? viewWidth;
            const fullHeight = metrics.cssContentSize?.height ?? viewHeight;

            // 4. Generate the element map using the helper function.
            // **Crucial:** `buildElementArray` MUST correctly use DPR and scroll offsets
            // to convert raw DOM snapshot rects into viewport-relative CSS pixel coordinates.
            const elementMap = buildElementArray(
                snap,
                viewWidth, // Viewport width (CSS pixels)
                viewHeight, // Viewport height (CSS pixels)
                devicePixelRatio //, // Actual device pixel ratio
                //scrollX,          // Horizontal scroll offset (CSS pixels)
                //scrollY           // Vertical scroll offset (CSS pixels)
            );

            const currentUrl = urlResult?.result?.value || ''; // Get URL or use empty string

            // Create base64 data URL from screenshot data
            const baseScreenshot = `data:image/png;base64,${screenshotResult.data}`;

            // Add grid overlay using the addGrid function
            const screenshotWithGrid = await addGrid(
                baseScreenshot,
                devicePixelRatio
            );

            // 5. Assemble the final payload.
            const payload: BrowserStatusPayload = {
                screenshot: screenshotWithGrid, // Base64 encoded screenshot with grid
                view: { w: viewWidth, h: viewHeight }, // Viewport dimensions (CSS pixels)
                full: { w: fullWidth, h: fullHeight }, // Full page dimensions (CSS pixels)
                url: currentUrl,
                elementMap, // Array of elements with corrected coordinates
            };

            return payload; // Return the successful payload
        } catch (error: any) {
            // Handle any errors during the process.
            console.error(
                `[browser_session_cdp] Error getting browser status/screenshot for tab ${this.tabId}:`,
                error
            );
            // Return a structured error object.
            return {
                error: `Error getting browser status: ${error.message || error}`,
            };
        }
    }

    /**
     * Executes arbitrary JavaScript code within the context of the page.
     * @param code The JavaScript code string to execute.
     * @returns A promise resolving to the result of the execution (converted to string) or an error message string.
     */
    async js_evaluate(code: string): Promise<string> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Evaluating JS: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`
        );
        try {
            // Reset navigation tracking flags before the action
            this.trackPageLoad();

            // Execute JavaScript using Runtime.evaluate.
            const { result, exceptionDetails } =
                await this.cdpClient!.Runtime.evaluate({
                    expression: code,
                    returnByValue: true, // Attempt to return simple values directly
                    awaitPromise: true, // Wait for promises returned by the script to resolve
                    userGesture: true, // Simulate execution within a user gesture context
                    timeout: 30000, // Set a timeout for long-running scripts
                });

            // Check if the script threw an exception.
            if (exceptionDetails) {
                throw new Error(
                    `JS exception: ${exceptionDetails.exception?.description || exceptionDetails.text}`
                );
            }

            // Wait for page load if navigation was triggered
            await this.waitForPageLoad();

            // Convert the result object to a string representation.
            let resultString = '';
            if (result.type === 'undefined') resultString = 'undefined';
            else if (result.subtype === 'null') resultString = 'null';
            else if (result.type === 'string') resultString = result.value;
            else if (result.type === 'number' || result.type === 'boolean')
                resultString = String(result.value);
            else if (result.type === 'object') {
                // Try to JSON stringify objects/arrays.
                try {
                    resultString = JSON.stringify(result.value);
                } catch (stringifyError: any) {
                    // Fallback if stringification fails (e.g., circular references).
                    console.warn(
                        `[browser_session_cdp] Could not JSON.stringify JS result for tab ${this.tabId}: ${stringifyError.message}`
                    );
                    resultString = result.description || '[object]';
                }
            } else resultString = result.description || String(result.value); // Use description or simple string conversion as fallback

            return resultString;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error evaluating JS for tab ${this.tabId}:`,
                error
            );
            // Check for specific timeout error message.
            if (error.message?.includes('timed out')) {
                return 'Error evaluating JavaScript: Execution timed out.';
            }
            return `Error evaluating JavaScript: ${error.message || error}`;
        }
    }

    /**
     * Scrolls the page according to the specified mode and coordinates.
     * Coordinates are expected in CSS pixels.
     * @param mode How to scroll ('page_down', 'page_up', 'bottom', 'top', 'coordinates').
     * @param x Target horizontal coordinate (CSS pixels), required for 'coordinates' mode.
     * @param y Target vertical coordinate (CSS pixels), required for 'coordinates' mode.
     * @returns A promise resolving to a success or error message string.
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
            // Determine the JavaScript scroll command based on the mode.
            switch (mode) {
                case 'page_down':
                    script = 'window.scrollBy(0, window.innerHeight * 0.8)';
                    break; // Scroll down 80% of viewport height
                case 'page_up':
                    script = 'window.scrollBy(0, -window.innerHeight * 0.8)';
                    break; // Scroll up 80% of viewport height
                case 'bottom':
                    script = 'window.scrollTo(0, document.body.scrollHeight)';
                    break; // Scroll to the bottom of the page
                case 'top':
                    script = 'window.scrollTo(0, 0)';
                    break; // Scroll to the top of the page
                case 'coordinates': {
                    if (typeof x !== 'number' || typeof y !== 'number') {
                        return 'Error scrolling: Coordinates (x, y) are required for "coordinates" scroll mode.';
                    }
                    // Ensure coordinates are non-negative integers (CSS pixels).
                    const scrollX = Math.max(0, Math.floor(x));
                    const scrollY = Math.max(0, Math.floor(y));
                    script = `window.scrollTo(${scrollX}, ${scrollY})`;
                    // Update cursor position when scrolling to specific coordinates
                    this.cursorPosition = { x: scrollX, y: scrollY };
                    console.log(
                        `[browser_session_cdp] Tab ${this.tabId}: Updated cursor position to ${scrollX},${scrollY} after scroll_to coordinates`
                    );
                    break;
                }
                default:
                    // Should not happen with TypeScript validation.
                    return `Error scrolling: Unsupported scroll mode: ${mode}`;
            }

            // Ensure viewport dimensions are set, especially if using window.innerHeight.
            await this.ensureViewportSize();

            // Execute the scroll script.
            const scrollResult = await this.cdpClient!.Runtime.evaluate({
                expression: script,
                awaitPromise: true,
                userGesture: true,
            });
            if (scrollResult.exceptionDetails) {
                // Check for JS errors during scroll
                throw new Error(
                    `JS exception during scroll: ${scrollResult.exceptionDetails.text}`
                );
            }

            // Wait briefly for rendering to potentially catch up after scroll.
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
     * Simulates a mouse click at the specified coordinates (CSS pixels relative to the viewport).
     * @param x The horizontal coordinate (CSS pixels).
     * @param y The vertical coordinate (CSS pixels).
     * @param button The mouse button to use ('left', 'middle', 'right'). Defaults to 'left'.
     * @returns A promise resolving to a success or error message string.
     */
    async click_at(
        x: number,
        y: number,
        button: 'left' | 'middle' | 'right' = 'left'
    ): Promise<string> {
        await this.ensureInitialized();
        // Floor coordinates to integers, as CDP expects integer pixel values.
        let clickX = Math.floor(x);
        let clickY = Math.floor(y);
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Clicking at CSS coords: ${clickX},${clickY} with ${button} button`
        );

        // Clamp negative coordinates to 0, as clicks outside the viewport might be problematic.
        if (clickX < 0 || clickY < 0) {
            console.warn(
                `[browser_session_cdp] Tab ${this.tabId}: Click coordinates (${clickX},${clickY}) are negative. Clamping to 0.`
            );
            clickX = Math.max(0, clickX);
            clickY = Math.max(0, clickY);
        }
        // Note: Upper bounds (e.g., BROWSER_WIDTHxBROWSER_HEIGHT) are not explicitly checked here. CDP might handle clicks
        // slightly outside the viewport, or the agent should use browserStatus info to provide valid coords.

        try {
            const client = this.cdpClient!;
            // Ensure viewport dimensions are set before interaction.
            await this.ensureViewportSize();

            // Reset navigation tracking flags before the action
            this.trackPageLoad();

            // Dispatch mouse pressed event.
            await client.Input.dispatchMouseEvent({
                type: 'mousePressed',
                x: clickX,
                y: clickY,
                button: button,
                clickCount: 1,
            });
            // Wait briefly between press and release.
            await new Promise(resolve => setTimeout(resolve, 50));
            // Dispatch mouse released event.
            await client.Input.dispatchMouseEvent({
                type: 'mouseReleased',
                x: clickX,
                y: clickY,
                button: button,
                clickCount: 1,
            });
            // Wait briefly to allow potential event handlers (like navigation) to trigger.
            await new Promise(resolve => setTimeout(resolve, 100));

            // Update cursor position after click
            this.cursorPosition = { x: clickX, y: clickY };
            console.log(
                `[browser_session_cdp] Tab ${this.tabId}: Updated cursor position to ${clickX},${clickY} after click`
            );

            // Wait for page load if navigation was triggered
            await this.waitForPageLoad();

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
     * Simulates a mouse drag operation from a start point to an end point (CSS pixels relative to the viewport).
     * @param startX Starting horizontal coordinate (CSS pixels).
     * @param startY Starting vertical coordinate (CSS pixels).
     * @param endX Ending horizontal coordinate (CSS pixels).
     * @param endY Ending vertical coordinate (CSS pixels).
     * @param button The mouse button to hold during the drag ('left', 'middle', 'right'). Defaults to 'left'.
     * @returns A promise resolving to a success or error message string.
     */
    async drag(
        startX: number,
        startY: number,
        endX: number,
        endY: number,
        button: 'left' | 'middle' | 'right' = 'left'
    ): Promise<string> {
        await this.ensureInitialized();
        // Floor coordinates to integers.
        const dragStartX = Math.floor(startX);
        const dragStartY = Math.floor(startY);
        const dragEndX = Math.floor(endX);
        const dragEndY = Math.floor(endY);
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Dragging CSS coords from ${dragStartX},${dragStartY} to ${dragEndX},${dragEndY} with ${button} button`
        );

        // Basic validation for coordinate types.
        if (
            typeof dragStartX !== 'number' ||
            typeof dragStartY !== 'number' ||
            typeof dragEndX !== 'number' ||
            typeof dragEndY !== 'number'
        ) {
            return 'Error dragging: Valid numeric start and end coordinates are required.';
        }
        // Consider clamping negative coordinates if necessary:
        // startX = Math.max(0, dragStartX); startY = Math.max(0, dragStartY);
        // endX = Math.max(0, dragEndX); endY = Math.max(0, dragEndY);

        try {
            // Reset navigation tracking flags before the action
            this.trackPageLoad();

            const client = this.cdpClient!;
            const steps = 10; // Number of intermediate mouse move events for smoother dragging.

            // Ensure viewport dimensions are set.
            await this.ensureViewportSize();

            // 1. Mouse down at the start position.
            await client.Input.dispatchMouseEvent({
                type: 'mousePressed',
                x: dragStartX,
                y: dragStartY,
                button: button,
                clickCount: 1,
            });
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay after press

            // 2. Simulate moves from start to end.
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
                    button: button,
                }); // Indicate button pressed during move
                await new Promise(resolve => setTimeout(resolve, 20)); // Small delay between moves
            }
            // Ensure the final move event is exactly at the end coordinates if steps > 0.
            if (steps > 0) {
                await client.Input.dispatchMouseEvent({
                    type: 'mouseMoved',
                    x: dragEndX,
                    y: dragEndY,
                    button: button,
                });
                await new Promise(resolve => setTimeout(resolve, 20));
            }

            // 3. Mouse release at the end position.
            await client.Input.dispatchMouseEvent({
                type: 'mouseReleased',
                x: dragEndX,
                y: dragEndY,
                button: button,
                clickCount: 1,
            }); // clickCount=1 often works, though 0 might be technically correct for release
            await new Promise(resolve => setTimeout(resolve, 100)); // Allow potential drop handlers

            // Update cursor position after drag
            this.cursorPosition = { x: dragEndX, y: dragEndY };
            console.log(
                `[browser_session_cdp] Tab ${this.tabId}: Updated cursor position to ${dragEndX},${dragEndY} after drag`
            );

            // Wait for page load if navigation was triggered
            await this.waitForPageLoad();

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
     * Simulates typing text into the currently focused element in the page.
     * Handles newline characters ('\n') by simulating an 'Enter' key press.
     * @param text The text string to type.
     * @returns A promise resolving to a success or error message string.
     */
    async type(text: string): Promise<string> {
        await this.ensureInitialized();
        // Normalize line endings to '\n'.
        const normalizedText = text.replace(/\r\n/g, '\n');
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Typing text (length ${normalizedText.length}): "${normalizedText.substring(0, 50)}${normalizedText.length > 50 ? '...' : ''}"`
        );
        try {
            const client = this.cdpClient!;
            // Small delay to allow element focus to settle.
            await new Promise(resolve => setTimeout(resolve, 50));

            // Process each character in the text.
            for (const char of normalizedText) {
                if (char === '\n') {
                    // Simulate Enter key press for newline characters.
                    await client.Input.dispatchKeyEvent({
                        type: 'keyDown',
                        key: 'Enter',
                        code: 'Enter',
                        windowsVirtualKeyCode: 13,
                        text: '\r',
                    }); // Send key down
                    await new Promise(resolve => setTimeout(resolve, 20)); // Brief pause
                    await client.Input.dispatchKeyEvent({
                        type: 'keyUp',
                        key: 'Enter',
                        code: 'Enter',
                        windowsVirtualKeyCode: 13,
                    }); // Send key up
                } else {
                    // For regular characters, use Input.insertText for better reliability than simulating key events.
                    await client.Input.insertText({ text: char });
                }
                // Small delay between characters/actions for more natural simulation.
                await new Promise(resolve => setTimeout(resolve, 30));
            }
            // Small delay after typing finishes.
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
     * Parses a key specification string that may include modifier keys.
     * @private
     * @param keySpec The key or combination to press (e.g., 'Ctrl+C', 'Shift+Tab', 'Meta+ArrowLeft').
     * @returns Parsed info for CDP dispatchKeyEvent (key, code, optional text, optional windowsVirtualKeyCode, modifiers bitmask, modifierKeys array).
     */
    private parseKeySpec(keySpec: string): {
        key: string;
        code: string;
        text?: string;
        windowsVirtualKeyCode?: number;
        modifiers: number;
        modifierKeys: string[];
    } {
        const parts = keySpec
            .trim()
            .split('+')
            .map(s => s.trim());
        if (!parts.length || !parts[0]) {
            throw new Error('Key cannot be empty');
        }
        const main = parts.pop()!;
        let ctrl = false,
            alt = false,
            shift = false,
            meta = false;
        for (const mod of parts) {
            switch (mod.toLowerCase()) {
                case 'ctrl':
                case 'control':
                    ctrl = true;
                    break;
                case 'alt':
                    alt = true;
                    break;
                case 'shift':
                    shift = true;
                    break;
                case 'meta':
                case 'cmd':
                case 'command':
                    meta = true;
                    break;
            }
        }
        const keyMap: Record<
            string,
            { code: string; key: string; wvk?: number }
        > = {
            enter: { code: 'Enter', key: 'Enter', wvk: 13 },
            tab: { code: 'Tab', key: 'Tab', wvk: 9 },
            space: { code: 'Space', key: ' ', wvk: 32 },
            escape: { code: 'Escape', key: 'Escape', wvk: 27 },
            esc: { code: 'Escape', key: 'Escape', wvk: 27 },
            backspace: { code: 'Backspace', key: 'Backspace', wvk: 8 },
            delete: { code: 'Delete', key: 'Delete', wvk: 46 },
            arrowup: { code: 'ArrowUp', key: 'ArrowUp', wvk: 38 },
            arrowdown: { code: 'ArrowDown', key: 'ArrowDown', wvk: 40 },
            arrowleft: { code: 'ArrowLeft', key: 'ArrowLeft', wvk: 37 },
            arrowright: { code: 'ArrowRight', key: 'ArrowRight', wvk: 39 },
            home: { code: 'Home', key: 'Home', wvk: 36 },
            end: { code: 'End', key: 'End', wvk: 35 },
            pageup: { code: 'PageUp', key: 'PageUp', wvk: 33 },
            pagedown: { code: 'PageDown', key: 'PageDown', wvk: 34 },
        };
        const norm = main.trim().toLowerCase();
        let info = keyMap[norm] || null;
        if (!info) {
            if (main.length === 1) {
                const ch = main;
                if (/^[a-zA-Z]$/.test(ch)) {
                    const up = ch.toUpperCase();
                    info = { code: `Key${up}`, key: ch, wvk: up.charCodeAt(0) };
                } else if (/^[0-9]$/.test(ch)) {
                    info = {
                        code: `Digit${main}`,
                        key: main,
                        wvk: main.charCodeAt(0),
                    };
                } else {
                    info = { code: main, key: main };
                }
            } else {
                info = { code: main, key: main };
            }
        }
        const modifiers =
            (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
        const modifierKeys: string[] = [];
        if (ctrl) modifierKeys.push('Control');
        if (alt) modifierKeys.push('Alt');
        if (shift) modifierKeys.push('Shift');
        if (meta) modifierKeys.push('Meta');
        return {
            key: info.key,
            code: info.code,
            text: info.key.length === 1 ? info.key : undefined,
            windowsVirtualKeyCode: info.wvk,
            modifiers,
            modifierKeys,
        };
    }

    /**
     * Simulates pressing a keyboard key or key combination (supports modifiers).
     * @param keySpec The key or combination to press (e.g., 'Enter', 'Ctrl+C').
     * @returns A promise resolving to a success or error message string.
     */
    async press_keys(keySpec: string): Promise<string> {
        await this.ensureInitialized();
        try {
            const client = this.cdpClient!;

            // Reset navigation tracking flags before the action
            this.trackPageLoad();

            const {
                key,
                code,
                text,
                windowsVirtualKeyCode,
                modifiers,
                modifierKeys,
            } = this.parseKeySpec(keySpec);
            const pressed: string[] = [];
            // Modifier keyDown
            for (const mod of modifierKeys) {
                await client.Input.dispatchKeyEvent({
                    type: 'keyDown',
                    key: mod,
                    code: mod,
                });
                pressed.push(mod);
                await new Promise(r => setTimeout(r, 10));
            }
            // Main keyDown
            await client.Input.dispatchKeyEvent({
                type: 'keyDown',
                key,
                code,
                modifiers,
                windowsVirtualKeyCode,
                text,
            });
            await new Promise(r => setTimeout(r, 30));
            // Main keyUp
            await client.Input.dispatchKeyEvent({
                type: 'keyUp',
                key,
                code,
                modifiers,
                windowsVirtualKeyCode,
            });
            // Modifier keyUp in reverse
            for (const mod of pressed.reverse()) {
                await new Promise(r => setTimeout(r, 10));
                await client.Input.dispatchKeyEvent({
                    type: 'keyUp',
                    key: mod,
                    code: mod,
                });
            }
            await new Promise(r => setTimeout(r, 100));

            // Wait for page load if navigation was triggered
            await this.waitForPageLoad();

            return `Successfully pressed key: ${keySpec}`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error pressing key '${keySpec}' for tab ${this.tabId}:`,
                error
            );
            return `Error pressing key '${keySpec}': ${error.message || error}`;
        }
    }

    /**
     * Executes a sequence of browser actions defined in the input array.
     * Actions are executed sequentially. If any action fails, execution stops immediately,
     * and an error result is returned.
     * @param actions An array of BrowserAction objects defining the sequence.
     * @returns A promise resolving to a JSON string summarizing the execution result:
     * `{ status: "success" | "error", message: string, lastResult: any | null }`.
     */
    async useBrowser(actions: BrowserAction[]): Promise<string> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Executing batch of ${actions.length} actions.`
        );
        const results: string[] = []; // Optional: Store success messages
        let lastResult: any = null; // Store the result of the last successful action

        for (let i = 0; i < actions.length; i++) {
            let action: BrowserAction = actions[i];
            if (typeof action === 'string') {
                try {
                    // Attempt to parse the string as JSON
                    action = JSON.parse(action);
                } catch (error) {
                    // If parsing fails, treat it as a raw string action
                    console.warn(
                        `[browser_session_cdp] Tab ${this.tabId}: Action ${i + 1} is a raw string: ${action}`
                    );
                    action = { action: 'js_evaluate', code: action as string }; // Default to js_evaluate with the raw string
                }
            }

            if (typeof action === 'string') {
                return 'Error: Action is a raw string and cannot be executed.';
            }

            console.log(
                `[browser_session_cdp] Tab ${this.tabId}: Executing action ${i + 1}/${actions.length}: ${action.action}`
            );
            // Variable to hold the result of the current action.
            let result:
                | string
                | BrowserStatusPayload
                | { error: string }
                | any = '';

            try {
                // Execute the appropriate method based on the action type.
                switch (action.action) {
                    case 'navigate':
                        result = await this.navigate(action.url);
                        break;
                    case 'js_evaluate':
                        result = await this.js_evaluate(action.code);
                        break;
                    case 'scroll_to':
                        result = await this.scroll_to(
                            action.location,
                            action.x,
                            action.y
                        );
                        break;
                    case 'click_at':
                        result = await this.click_at(
                            action.x,
                            action.y,
                            action.button
                        );
                        break;
                    case 'drag':
                        result = await this.drag(
                            action.startX,
                            action.startY,
                            action.endX,
                            action.endY,
                            action.button
                        );
                        break;
                    case 'type':
                        result = await this.type(action.text);
                        break;
                    case 'press_keys':
                        result = await this.press_keys(action.keys);
                        break; // Use 'keys' based on PressAction interface
                    default:
                        // Handle unknown action types (shouldn't occur with TypeScript).
                        console.error(
                            `[browser_session_cdp] Tab ${this.tabId}: Unknown action type encountered:`,
                            action
                        );
                        // Return error immediately.
                        return JSON.stringify({
                            status: 'error',
                            message: `Execution failed at step ${i + 1}: Unknown action type.`,
                            lastResult: null,
                        });
                }

                // Check results: Handle errors returned as strings or successful results.
                if (typeof result === 'string' && result.startsWith('Error')) {
                    // Action failed (returned an error string), stop execution.
                    console.error(
                        `[browser_session_cdp] Tab ${this.tabId}: Action ${i + 1} (${action.action}) failed: ${result}`
                    );
                    return JSON.stringify({
                        status: 'error',
                        message: `Execution failed at step ${i + 1} (${action.action}): ${result}`,
                        lastResult: null,
                    });
                } else if (typeof result === 'string') {
                    // Action succeeded (returned a success string).
                    results.push(result); // Store success message (optional)
                    lastResult = result;
                } else {
                    // Action succeeded (returned an object payload - browserStatus or debugCommand).
                    // Success message was already generated above.
                    results.push(
                        `Action ${action.action} completed successfully.`
                    );
                    // lastResult was already set above.
                }
            } catch (error: any) {
                // Catch errors thrown explicitly (e.g., by browserStatus error object) or unexpected errors.
                console.error(
                    `[browser_session_cdp] Tab ${this.tabId}: Uncaught error during action ${i + 1} (${action.action}):`,
                    error
                );
                return JSON.stringify({
                    status: 'error',
                    message: `Execution failed at step ${i + 1} (${action.action}): ${error.message || error}`,
                    lastResult: null,
                });
            }
        }

        // All actions executed successfully.
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Successfully performed all ${actions.length} actions.`
        );
        // Return success status, message, and the result of the very last action.
        return JSON.stringify({
            status: 'success',
            message: `Successfully performed ${actions.length} actions.`,
            lastResult: lastResult, // Include the actual result of the last action
        });
    }

    /**
     * Executes a raw Chrome DevTools Protocol command directly. Use with caution.
     * Requires knowledge of the CDP specification.
     * @param method The CDP method name (e.g., 'Page.navigate', 'DOM.querySelector').
     * @param commandParams Optional parameters object for the CDP method.
     * @returns A promise resolving to the raw result object from the CDP command.
     * @throws If the method name is invalid, the command doesn't exist, or execution fails.
     */
    async debugCommand(method: string, commandParams?: object): Promise<any> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Executing DEBUG command: ${method} with params:`,
            commandParams || {}
        );
        try {
            // Validate method name format.
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

            // Basic runtime check if the domain and command seem to exist on the client object.
            // Note: This doesn't guarantee the command is valid according to the current CDP spec.
            if (typeof (client as any)[domain]?.[command] !== 'function') {
                throw new Error(
                    `CDP method "${method}" not found or is not a function on the client.`
                );
            }

            // Execute the command dynamically using bracket notation.
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
            // Re-throw a more informative error.
            throw new Error(
                `Debug command "${method}" failed: ${error.message || error}`
            );
        }
    }

    /**
     * Closes the associated browser tab and cleans up the CDP connection resources.
     * Attempts to close the tab gracefully, trying a root client if the specific client fails.
     * @returns A promise resolving to a success or error message string.
     */
    async closeSession(): Promise<string> {
        // Check if already closed or not initialized.
        if (!this.initialized || !this.cdpClient || !this.chromeTabId) {
            console.log(
                `[browser_session_cdp] Tab ${this.tabId} session already closed or not initialized.`
            );
            return `Tab ${this.tabId} session already closed or was not initialized.`; // Considered success state
        }

        const targetIdToClose = this.chromeTabId; // Store ID before resetting state
        console.log(
            `[browser_session_cdp] Closing tab ${this.tabId} (CDP target: ${targetIdToClose})`
        );

        try {
            // 1. Try closing the target using its dedicated client first.
            try {
                await this.cdpClient.Target.closeTarget({
                    targetId: targetIdToClose,
                });
                console.log(
                    `[browser_session_cdp] Closed target ${targetIdToClose} via specific client.`
                );
            } catch (closeError: any) {
                // If specific client fails (e.g., disconnected), try using a temporary root client.
                console.warn(
                    `[browser_session_cdp] Could not close target ${targetIdToClose} via its own client: ${closeError.message}. Attempting via root.`
                );
                let rootClient = null;
                try {
                    // Use the same host/port logic as initialize for consistency.
                    const host = 'host.docker.internal';
                    const port = parseInt(
                        process.env.HOST_CDP_PORT || '9001',
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
                    // Log error if root client also fails. Target might already be closed.
                    console.error(
                        `[browser_session_cdp] Failed to close target ${targetIdToClose} via root client: ${rootCloseError.message}.`
                    );
                } finally {
                    // Ensure temporary root client is closed.
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

            // 2. Clean up internal session state regardless of close success.
            this.initialized = false;
            this.cdpClient = null; // Release client reference
            this.chromeTabId = null;

            console.log(
                `[browser_session_cdp] Session resources released for tab ${this.tabId}.`
            );
            return `Successfully closed tab ${this.tabId}`;
        } catch (error: any) {
            // Catch any other unexpected errors during the closing process.
            console.error(
                `[browser_session_cdp] Unexpected error during closeSession for tab ${this.tabId}:`,
                error
            );
            // Attempt to clean up state even on unexpected error.
            this.initialized = false;
            this.cdpClient = null;
            this.chromeTabId = null;
            return `Error closing tab ${this.tabId}: ${error.message || error}`;
        }
    }
}

// --- Agent Session Cache ---

// Stores active browser sessions, mapping tabId to AgentBrowserSessionCDP instance.
const activeSessions = new Map<string, AgentBrowserSessionCDP>();

/**
 * Closes all active browser sessions managed by the cache.
 * Iterates through the cache, calls closeSession for each, and clears the cache.
 * Logs errors during closure but continues attempting to close others.
 * @returns A promise that resolves when all closure attempts are complete.
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

    // Create an array of close promises.
    const closePromises = sessionIds.map(tabId => {
        const session = activeSessions.get(tabId);
        if (session) {
            // Remove from cache *before* calling close to prevent race conditions.
            activeSessions.delete(tabId);
            // Call closeSession and catch individual errors.
            return session.closeSession().catch(err => {
                console.error(
                    `[browser_utils] Error closing session for tab ${tabId}:`,
                    err
                );
            });
        }
        return Promise.resolve(); // Should not happen if key exists, but be safe.
    });

    // Wait for all close attempts to finish.
    await Promise.all(closePromises);

    // Ensure cache is clear.
    activeSessions.clear();
    console.log(
        '[browser_utils] All active sessions have been processed for closure.'
    );
}

// --- Factory Function for Agent Sessions ---

/**
 * Gets or creates an AgentBrowserSessionCDP instance for a given tab ID.
 * Uses a cache to return existing sessions for the same tab ID.
 * If a new session is created, its closeSession method is patched to remove
 * it from the cache upon closure.
 *
 * @param tabId A unique identifier for the tab (usually an agent ID).
 * @param startUrl Optional URL to navigate to if a new session/tab is created.
 * @returns The existing or newly created AgentBrowserSessionCDP instance.
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

    // Check cache for existing session.
    const existingSession = activeSessions.get(tabId);
    if (existingSession) {
        // Log reduced for less noise
        // console.log(`[browser_utils] Reusing existing session for tab: ${tabId}`);
        return existingSession;
    }

    // Create a new session if not found in cache.
    console.log(
        `[browser_utils] Creating new session for tab: ${tabId} ${startUrl ? `with start URL: ${startUrl}` : ''}`
    );
    const session = new AgentBrowserSessionCDP(tabId, startUrl);

    // Monkey-patch the closeSession method to ensure removal from cache.
    const originalClose = session.closeSession.bind(session); // Store original method
    session.closeSession = async function (): Promise<string> {
        // Override
        console.log(
            `[browser_utils] Session for tab ${tabId} is closing, removing from cache.`
        );
        activeSessions.delete(tabId); // Remove from cache *first*
        return originalClose(); // Call original close logic
    };

    // Add the new session to the cache.
    activeSessions.set(tabId, session);
    console.log(`[browser_utils] Session for tab ${tabId} added to cache.`);
    return session;
}

// --- Graceful Shutdown ---

// Set up listeners for common termination signals to attempt closing sessions.
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

signals.forEach(signal => {
    process.on(signal, async () => {
        console.log(
            `[browser_utils] Received ${signal}. Attempting to close active sessions...`
        );
        // Set a timeout to force exit if cleanup takes too long.
        const cleanupTimeout = setTimeout(() => {
            console.warn(
                '[browser_utils] Cleanup timed out (5s). Forcing exit.'
            );
            process.exit(1); // Force exit with error code
        }, 5000); // 5-second timeout

        try {
            await closeAllSessions(); // Attempt to close all sessions
            console.log('[browser_utils] Graceful shutdown complete.');
            clearTimeout(cleanupTimeout); // Clear the timeout on successful cleanup
            process.exit(0); // Exit cleanly
        } catch (error) {
            console.error(
                '[browser_utils] Error during graceful shutdown:',
                error
            );
            clearTimeout(cleanupTimeout); // Clear timeout even on error
            process.exit(1); // Exit with error code
        }
    });
});
