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
interface MoveAction {
    action: 'move';
    x: number;
    y: number;
}
interface ClickAtAction {
    action: 'click';
    button?: 'left' | 'middle' | 'right';
    event?: 'click' | 'mousedown' | 'mouseup';
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

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Union type for all possible actions used by executeActions
export type BrowserAction =
    | NavigateAction
    | GetPageUrlAction
    | GetPageContentAction
    | BrowserStatusAction
    | JsEvaluateAction
    | ScrollToAction
    | MoveAction
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
    private cursorPosition: {
        x: number;
        y: number;
        button?: 'none' | 'left' | 'middle' | 'right';
    } | null = null; // Added for virtual cursor
    private lastScrollX: number = 0; // Track last known scroll X position
    private lastScrollY: number = 0; // Track last known scroll Y position

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

        try {
            // Define host and port for the Chrome DevTools Protocol endpoint.
            // Uses 'host.docker.internal' for Docker compatibility, falling back to localhost.
            // Uses HOST_CDP_PORT environment variable, falling back to 9001.
            const host = 'host.docker.internal'; // Specific host for Docker bridge network
            const port = parseInt(process.env.HOST_CDP_PORT || '9001', 10); // Port from env or default

            // Connect to the main CDP endpoint to manage targets (tabs).
            const rootClient = await CDP({
                host,
                port,
            });

            try {
                // Look for an existing window containing the UI (localhost:3010)
                // to reuse its browser context for tabs
                let existingCtx: string | undefined;
                try {
                    const { targetInfos } =
                        await rootClient.Target.getTargets();
                    const uiTarget = targetInfos.find(
                        target =>
                            target.type === 'page' &&
                            target.url.includes('localhost:3010')
                    );

                    if (uiTarget && uiTarget.browserContextId) {
                        existingCtx = uiTarget.browserContextId;
                        console.log(
                            `[browser_session_cdp] Found UI page in browserContextId: ${existingCtx}`
                        );
                    } else {
                        console.log(
                            '[browser_session_cdp] No UI context found - creating tab with default context'
                        );
                    }
                } catch (targetsError) {
                    console.error(
                        '[browser_session_cdp] Error getting targets:',
                        targetsError
                    );
                    // Continue without the context ID - will fall back to default behavior
                }

                // Create a new target (browser tab) - always starting with about:blank
                // This ensures we can attach listeners before any real navigation starts
                const createParams: any = {
                    url: 'about:blank', // Always start with blank page, we'll navigate after client setup
                    newWindow: false, // Create a tab in the existing window
                    background: true, // Create the tab in the background without stealing focus
                };

                // Add browserContextId if we found the UI context
                if (existingCtx) {
                    createParams.browserContextId = existingCtx;
                }

                const { targetId } =
                    await rootClient.Target.createTarget(createParams);

                this.chromeTabId = targetId; // Store the CDP ID for our tab

                // Create a dedicated CDP client connected specifically to our new tab.
                this.cdpClient = await CDP({
                    host,
                    port,
                    target: targetId, // Scope commands to this tab
                });

                // Enable necessary CDP domains for browser interaction and status retrieval.
                await Promise.all([
                    this.cdpClient.Page.enable(), // Page navigation, lifecycle events
                    this.cdpClient.DOM.enable(), // DOM inspection, querying
                    this.cdpClient.Runtime.enable(), // JavaScript execution, getting properties
                ]);

                // Set up CDP guard to catch any tabs that manage to open despite our injected script
                try {
                    // Store original targetId for comparison
                    const ourTabId = targetId;

                    this.cdpClient.Target.on('targetCreated', async params => {
                        const newTarget = params.targetInfo;

                        // If a new page-type target was created and it was initiated by our tab
                        if (
                            newTarget.type === 'page' &&
                            newTarget.openerTabId === ourTabId
                        ) {
                            console.log(
                                `[browser_session_cdp] Intercepted new tab creation from tab ${this.tabId}. ` +
                                    `Closing new tab ${newTarget.targetId} and redirecting to: ${newTarget.url || '(unknown)'}`
                            );

                            // 1. Try to close the new tab immediately
                            try {
                                await this.cdpClient.Target.closeTarget({
                                    targetId: newTarget.targetId,
                                });
                                console.log(
                                    `[browser_session_cdp] Successfully closed intercepted tab ${newTarget.targetId}`
                                );

                                // 2. If there's a URL, redirect our current tab to it to maintain navigation
                                if (
                                    newTarget.url &&
                                    newTarget.url !== 'about:blank'
                                ) {
                                    console.log(
                                        `[browser_session_cdp] Redirecting current tab to: ${newTarget.url}`
                                    );
                                    await this.cdpClient.Runtime.evaluate({
                                        expression: `location.href = ${JSON.stringify(newTarget.url)}`,
                                        userGesture: true,
                                    });
                                }
                            } catch (err) {
                                console.error(
                                    `[browser_session_cdp] Error closing intercepted tab ${newTarget.targetId}:`,
                                    err
                                );
                            }
                        }
                    });
                } catch (guardError) {
                    console.error(
                        `[browser_session_cdp] Failed to set up Target.targetCreated guard for tab ${this.tabId}:`,
                        guardError
                    );
                    // Non-fatal error, continue with initialization
                }

                // *** ADD SCRIPT INJECTION HERE ***
                try {
                    await this.cdpClient.Page.addScriptToEvaluateOnNewDocument({
                        source: `(() => {
                            // Hardened window.open override with Proxy to catch all call paths
                            const originalOpen = window.open;
                            const openProxy = new Proxy(originalOpen, {
                                apply(_t, _this, args) {
                                    const url = args[0];
                                    if (url) location.href = url;
                                    return null;
                                }
                            });
                            // Lock down the property so it cannot be overwritten by other scripts
                            Object.defineProperty(window, 'open', {
                                value: openProxy,
                                writable: false,
                                configurable: false
                            });

                            // Extract URL from various element types and attributes
                            const urlFrom = n => n?.href ??
                                n?.getAttribute?.('href') ??
                                n?.getAttribute?.('post-outbound-link') ??
                                n?.dataset?.url ??
                                n?.dataset?.href ?? null;

                            // Intercept handler that works on event path (handles shadow DOM)
                            const intercept = e => {
                                const path = e.composedPath?.() ?? [];
                                for (const n of path) {
                                    if (!n?.getAttribute) continue;
                                    if (n.getAttribute('target') === '_blank') {
                                        const url = urlFrom(n);
                                        if (url) {
                                            e.preventDefault();
                                            e.stopImmediatePropagation();
                                            location.href = url;
                                        }
                                        return;
                                    }
                                }
                            };

                            // Attach intercept to multiple event types in capture phase
                            ['pointerdown', 'click', 'auxclick'].forEach(ev =>
                                document.addEventListener(ev, intercept, { capture: true })
                            );

                            // Handle keyboard navigation (Enter/Space on focused _blank links)
                            document.addEventListener('keydown', e => {
                                if ((e.key === 'Enter' || e.key === ' ') &&
                                    document.activeElement?.getAttribute?.('target') === '_blank') {
                                    e.preventDefault();
                                    const url = urlFrom(document.activeElement);
                                    if (url) location.href = url;
                                }
                            }, { capture: true });

                            // Handle form submissions with target="_blank"
                            document.addEventListener('submit', e => {
                                if (e.target?.target === '_blank') {
                                    e.preventDefault();
                                    e.target.target = '_self';
                                    e.target.submit();
                                }
                            }, { capture: true });

                            // Helper to attach our listeners to shadow roots
                            const attach = root =>
                                ['pointerdown', 'click', 'auxclick'].forEach(ev =>
                                    root.addEventListener(ev, intercept, { capture: true })
                                );

                            // Set up MutationObserver to watch for shadow DOM elements
                            new MutationObserver(muts => {
                                muts.forEach(m =>
                                    m.addedNodes.forEach(n => n.shadowRoot && attach(n.shadowRoot))
                                );
                            }).observe(document.documentElement, { subtree: true, childList: true });
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
            if (!this.navigationRequested) {
                this.navigationRequested = true;
            }
        });

        // Listen for frameNavigated event (when navigation starts)
        client.Page.on('frameNavigated', () => {
            if (!this.navigationStarted) {
                this.navigationStarted = true;
            }
        });

        this.navigationEventHandlersAdded = true;
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
        await new Promise(r => setTimeout(r, randomInt(200, 250))); // delay to allow navigation events to settle
        await this.waitForPageLoadComplete();
    }

    private async waitForPageLoadComplete(): Promise<void> {
        if (
            !this.cdpClient ||
            (!this.navigationRequested && !this.navigationStarted)
        ) {
            return; // No navigation detected, return immediately
        }

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
            client.once('Page.loadEventFired', async () => {
                loadFired = true;
                clearTimeout(loadTimeout); // Clear timeout if load event fires
                await new Promise(r => setTimeout(r, randomInt(300, 400))); // allow navigation events to complete
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
    async navigate(url: string, timeout: number = 30_000): Promise<string> {
        await this.ensureInitialized(); // Ensure connection is ready
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
                }, timeout); // 30-second timeout

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
        try {
            const cursorWidth = 20; // Width of the cursor in pixels
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
                        width:         '${cursorWidth}px',
                        pointerEvents: 'none',
                        zIndex:        '2147483647'
                      });

                      // 2) Inline SVG
                      const svg = document.createElementNS(ns, 'svg');
                      svg.setAttribute('xmlns', ns);
                      svg.setAttribute('width',  '${cursorWidth}px');
                      svg.setAttribute('viewBox','0 0 14 21.844');

                      // Stroke path
                      const p1 = document.createElementNS(ns, 'path');
                      p1.setAttribute('d',
                        'M 0.766 0.001 C 0.337 0.022 0 0.363 0 0.777 L 0 16.845 C -0.001 17.444 0.671 17.817 1.208 17.519 C 1.243 17.499 1.277 17.478 1.309 17.452 L 4.546 14.951 L 7.402 21.301 C 7.58 21.694 8.054 21.874 8.462 21.704 L 11.418 20.465 C 11.826 20.293 12.012 19.837 11.836 19.442 L 9.013 13.166 L 13.245 12.693 C 13.861 12.625 14.17 11.939 13.8 11.457 C 13.772 11.42 13.739 11.384 13.705 11.353 L 1.355 0.211 C 1.196 0.066 0.984 -0.009 0.766 0.001 Z M 1.61 2.569 L 11.334 11.343 L 7.746 11.743 C 7.211 11.802 6.887 12.346 7.103 12.824 L 10.037 19.349 L 8.559 19.967 L 5.604 13.398 C 5.392 12.93 4.777 12.781 4.364 13.103 L 1.61 15.226 L 1.61 2.569 Z'
                      );
                      p1.setAttribute('style',
                        'stroke-miterlimit:10.71;stroke-width:7px;stroke-opacity:0.72;' +
                        'fill-rule:nonzero;paint-order:stroke;fill:rgb(0,0,0);transform-origin:0px 0px;'
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
     * Capture a simple screenshot of the current viewport.
     * Primarily used for lightweight screenshot needs where DOM metadata is unnecessary.
     * @param delayMs Optional delay before capture to allow the page to settle.
     * @returns Base64 data URL string on success or an error object on failure.
     */
    async captureScreenshot(
        delayMs: number = 0
    ): Promise<string | { error: string }> {
        await this.ensureInitialized();
        try {
            await this.ensureViewportSize();
            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
            const result = await this.cdpClient!.Page.captureScreenshot({
                format: 'png',
                fromSurface: true,
                optimizeForSpeed: true,
            });
            return `data:image/png;base64,${result.data}`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error capturing screenshot for tab ${this.tabId}:`,
                error
            );
            return { error: error.message || String(error) };
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

            // 2. Perform CDP operations concurrently for efficiency, but without separate scroll evaluation
            const [
                metrics, // Page layout metrics (CSS pixels)
                screenshotResult, // Screenshot data
                snap, // DOM snapshot (includes raw element rects)
                urlResult, // Current page URL
                dprResult, // Actual device pixel ratio
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
            ]);

            // 3. Extract results, providing defaults if necessary.
            let devicePixelRatio: number = dprResult?.result?.value ?? 1; // Default DPR to 1

            // Use cached scroll position - these are updated after each scroll operation
            const scrollX: number = this.lastScrollX;
            const scrollY: number = this.lastScrollY;

            // Extract viewport dimensions from metrics
            const viewWidth =
                metrics.cssLayoutViewport?.clientWidth ?? BROWSER_WIDTH;
            const viewHeight =
                metrics.cssLayoutViewport?.clientHeight ?? BROWSER_HEIGHT;

            // Verify DPR by comparing actual screenshot dimensions with expected viewport size
            // If we have a mismatch, recalculate DPR
            const imgWidth = screenshotResult.data
                ? Buffer.from(screenshotResult.data, 'base64').readUInt32BE(16)
                : 0; // PNG width at offset 16

            if (
                imgWidth > 0 &&
                Math.abs(imgWidth - viewWidth * devicePixelRatio) > 10
            ) {
                // Large discrepancy detected; recalculate DPR using actual screenshot dimensions
                const correctedDpr = imgWidth / viewWidth;
                console.log(
                    `[browser_session_cdp] DPR correction: reported=${devicePixelRatio}, actual=${correctedDpr} (screenshot width=${imgWidth}px, viewport=${viewWidth}px)`
                );
                devicePixelRatio = correctedDpr;
            }

            console.log(
                `[browser_session_cdp] Using DPR: ${devicePixelRatio}, Scroll position: X=${scrollX}, Y=${scrollY}`
            );

            // Extract content dimensions (in CSS pixels) - viewport dims already extracted above
            const fullWidth = metrics.cssContentSize?.width ?? viewWidth;
            const fullHeight = metrics.cssContentSize?.height ?? viewHeight;

            // 4. Generate the element map using the helper function.
            // **Crucial:** `buildElementArray` MUST correctly use DPR and scroll offsets
            // to convert raw DOM snapshot rects into viewport-relative CSS pixel coordinates.
            const elementMap = buildElementArray(
                snap,
                viewWidth, // Viewport width (CSS pixels)
                viewHeight, // Viewport height (CSS pixels)
                devicePixelRatio, // Actual device pixel ratio
                scrollX, // Horizontal scroll offset (CSS pixels)
                scrollY // Vertical scroll offset (CSS pixels)
            );

            const currentUrl = urlResult?.result?.value || ''; // Get URL or use empty string

            // 5. Assemble the final payload.
            const payload: BrowserStatusPayload = {
                screenshot: `data:image/png;base64,${screenshotResult.data}`, // Base64 encoded screenshot with grid and crosshairs
                devicePixelRatio: devicePixelRatio, // Actual device pixel ratio
                view: { w: viewWidth, h: viewHeight }, // Viewport dimensions (CSS pixels)
                full: { w: fullWidth, h: fullHeight }, // Full page dimensions (CSS pixels)
                cursor: this.cursorPosition, // Full page dimensions (CSS pixels)
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
            this.trackPageLoad();

            // Enhanced heuristic to auto-wrap expressions with return

            // Helper to check if a line looks like an expression that should be returned
            const isExpressionLine = (line: string): boolean => {
                line = line.trim();
                if (!line) return false;

                // Skip lines that are already returns or start with control keywords
                const controlKeywordPattern =
                    /^\s*(?:return|const|let|var|class|function|async|if|for|while|switch|try|catch|finally|throw|import|export|yield|await|break|continue|debugger)\b/;
                if (controlKeywordPattern.test(line)) return false;

                // Skip lines that end with block closures or semicolons for block-ending statements
                if (/^\s*}\s*(?:else|catch|finally)?\s*(?:$|\/[/*])/.test(line))
                    return false;

                // Simple test for lines that look like expressions
                // - Doesn't start with a keyword
                // - Doesn't start with a closing brace (likely end of a block)
                // - Has some content
                return /\S/.test(line) && !/^\s*[{}]/.test(line);
            };

            // Helper to detect if code contains an IIFE pattern
            const looksLikeIIFE = (fullCode): boolean => {
                // Simple heuristic: Look for IIFE patterns - functions invoked immediately
                const iifePatterns = [
                    /\(\s*function\s*\(.*\)\s*\{[\s\S]*\}\s*\)\s*\([^)]*\)\s*;/,
                    /\(\s*async\s+function\s*\(.*\)\s*\{[\s\S]*\}\s*\)\s*\([^)]*\)\s*;/,
                    /\(\s*\(\s*.*\)\s*=>\s*\{[\s\S]*\}\s*\)\s*\([^)]*\)\s*;/,
                    /\(\s*async\s*\(\s*.*\)\s*=>\s*\{[\s\S]*\}\s*\)\s*\([^)]*\)\s*;/,
                ];

                return iifePatterns.some(pattern => pattern.test(fullCode));
            };

            // Analyze the code
            const lines = code.split(/\r?\n/);
            let lastExprLine = -1;
            let hasExplicitReturn = false;

            // Check if this might be an IIFE
            const isIIFEPattern = looksLikeIIFE(code);

            // Only scan for significant lines if this isn't an IIFE
            if (!isIIFEPattern) {
                // Scan for significant lines from the end
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('//')) continue; // Skip empty and comment-only lines

                    // Check if there's already an explicit return
                    if (/^\s*return\b/.test(line)) {
                        hasExplicitReturn = true;
                        break;
                    }

                    // Remember the last expression-looking line
                    if (lastExprLine === -1 && isExpressionLine(line)) {
                        lastExprLine = i;
                        // Break early if it's clearly an expression (doesn't end with ; or })
                        if (!line.endsWith(';') && !line.endsWith('}')) {
                            break;
                        }
                    }
                }
            }

            // For declaration-only snippets, try to capture the last variable defined
            let captureVar: string | null = null;
            const declMatch = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(
                code
            );
            if (declMatch) captureVar = declMatch[1];

            // Decide how to build the function body
            let body: string;

            // For IIFE patterns, use a direct evaluation approach
            if (isIIFEPattern) {
                try {
                    // Directly execute the IIFE to get its value
                    // This is run inside a try-catch because it might fail in certain environments
                    // or if the IIFE uses browser-specific APIs

                    // Use Function constructor instead of eval for potentially safer execution
                    // This still executes in the current scope but isolates variable declarations
                    const directValue = new Function(`return ${code}`)();

                    // Create a function body that just returns this value
                    body = `return ${JSON.stringify(directValue)};`;
                } catch (err) {
                    console.warn(
                        'IIFE direct execution failed, falling back to original mode:',
                        err
                    );
                    // If direct execution fails, fall back to code as-is
                    body = code;
                }
            } else if (hasExplicitReturn) {
                // Already has a return, use code as-is
                body = code;
            } else if (lastExprLine !== -1) {
                // Regular expression line - inject return
                const prefix = lines.slice(0, lastExprLine).join('\n');
                const exprLine = lines[lastExprLine].trim();
                const suffix = lines.slice(lastExprLine + 1).join('\n');

                // Handle object literals and array literals specially - make sure to wrap them in parentheses
                const needsWrapping =
                    exprLine.startsWith('{') || exprLine.startsWith('[');
                const wrappedExpr = needsWrapping ? `(${exprLine})` : exprLine;

                body = `${prefix}\nreturn ${wrappedExpr};\n${suffix}`;
            } else if (captureVar) {
                // Fall back to the original variable capture logic
                body = `${code}; return typeof ${captureVar} !== 'undefined' ? ${captureVar} : undefined;`;
            } else {
                // No expression detected, use code as-is
                body = code;
            }

            const wrapped = `(async () => {
    // Capture console.log output as fallback for undefined returns
    const __logs = [];
    const __origLog = console.log;

    // Safe serializer for console.log arguments
    function safe(arg) {
        if (arg === null || typeof arg !== 'object') return String(arg);
        try { return JSON.stringify(arg); } catch { return '[Circular]'; }
    }

    console.log = function(...args) {
        __logs.push(args.map(safe).join(' '));
        __origLog.apply(console, args);
    };

    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const fn = new AsyncFunction(${JSON.stringify(body)});
        const value = await fn();
        return {
            success: true,
            value: (value === undefined && __logs.length > 0) ? __logs[__logs.length-1] : value,
            logs: __logs
        };
    } catch (err) {
        return {
            success: false,
            error: err.toString(),
            logs: __logs
        };
    } finally {
        console.log = __origLog;
    }
})()`;

            const { result, exceptionDetails } =
                await this.cdpClient!.Runtime.evaluate({
                    expression: wrapped,
                    returnByValue: true,
                    awaitPromise: true,
                    userGesture: true,
                    timeout: 30000,
                });

            if (exceptionDetails) {
                throw new Error(
                    `CDP eval error: ${exceptionDetails.exception?.description || exceptionDetails.text}`
                );
            }

            const payload = result.value as any;

            await this.waitForPageLoad();

            // 4) Read your Node-side flags
            const navigated =
                this.navigationRequested || this.navigationStarted;
            if (navigated) {
                const { result: urlRes } =
                    await this.cdpClient!.Runtime.evaluate({
                        expression: 'window.location.href',
                        returnByValue: true,
                    });
                const final_url = urlRes.value as string;

                payload.metadata = {
                    navigated,
                    final_url,
                };
            }

            // Ensure value is always present in the payload (even if null)
            if (
                payload.success === true &&
                (payload.value === undefined || !('value' in payload))
            ) {
                payload.value = null;
            }

            return JSON.stringify(payload, null, 2);
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
     * Scrolls the page according to the specified method and coordinates.
     * Coordinates are expected in CSS pixels.
     * @param method How to scroll ('page_down', 'page_up', 'bottom', 'top', 'coordinates').
     * @param x Target horizontal coordinate (CSS pixels), required for 'coordinates' method.
     * @param y Target vertical coordinate (CSS pixels), required for 'coordinates' method.
     * @returns A promise resolving to a success or error message string.
     */
    async scroll_to(
        method: 'page_down' | 'page_up' | 'bottom' | 'top' | 'coordinates',
        x?: number,
        y?: number
    ): Promise<string> {
        await this.ensureInitialized();
        const coordString =
            method === 'coordinates' &&
            typeof x === 'number' &&
            typeof y === 'number'
                ? ` to ${x},${y}`
                : '';
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Scrolling (${method})${coordString}`
        );
        try {
            let script = '';
            // Determine the JavaScript scroll command based on the method.
            switch (method) {
                case 'page_down':
                    script =
                        'window.scrollBy({ top: window.innerHeight * 0.8, behavior: "instant" })';
                    break; // Scroll down 80% of viewport height
                case 'page_up':
                    script =
                        'window.scrollBy({ top: -window.innerHeight * 0.8, behavior: "instant" })';
                    break; // Scroll up 80% of viewport height
                case 'bottom':
                    script =
                        'window.scrollTo({ top: document.body.scrollHeight, left: 0, behavior: "instant" })';
                    break; // Scroll to the bottom of the page
                case 'top':
                    script =
                        'window.scrollTo({ top: 0, left: 0, behavior: "instant" })';
                    break; // Scroll to the top of the page
                case 'coordinates': {
                    if (typeof x !== 'number' && typeof y !== 'number') {
                        return 'Error scrolling: Coordinates (x, y) are required for "coordinates" scroll mode.';
                    }
                    if (typeof x !== 'number') {
                        x = 0;
                    }
                    if (typeof y !== 'number') {
                        y = 0;
                    }
                    // Ensure coordinates are non-negative integers (CSS pixels).
                    const scrollX = Math.max(0, Math.floor(x));
                    const scrollY = Math.max(0, Math.floor(y));
                    script = `window.scrollTo({ left: ${scrollX}, top: ${scrollY}, behavior: "instant" })`;
                    // Update cursor position when scrolling to specific coordinates
                    break;
                }
                default:
                    // Should not happen with TypeScript validation.
                    return `Error scrolling: Unsupported scroll method: ${method}`;
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

            // Wait for the scroll to settle
            await new Promise(resolve => setTimeout(resolve, 200));

            // After scrolling settles, update the cached scroll position
            const scrollPositionResult = await this.cdpClient!.Runtime.evaluate(
                {
                    expression:
                        '({ scrollX: window.scrollX, scrollY: window.scrollY })',
                    returnByValue: true,
                }
            );

            // Update cached scroll values
            if (scrollPositionResult?.result?.value) {
                this.lastScrollX =
                    scrollPositionResult.result.value.scrollX || 0;
                this.lastScrollY =
                    scrollPositionResult.result.value.scrollY || 0;
                console.log(
                    `[browser_session_cdp] Tab ${this.tabId}: Updated cached scroll position to X=${this.lastScrollX}, Y=${this.lastScrollY} after scrolling`
                );
            }

            return `Successfully scrolled (${method}). New scroll position is {x: ${this.lastScrollX}, y: ${this.lastScrollY}}`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error scrolling tab ${this.tabId}:`,
                error
            );
            return `Error scrolling: ${error.message || error}`;
        }
    }

    /**
     * Simulates a mouse move to specified coordinates (CSS pixels relative to the viewport).
     * @param x The horizontal coordinate (CSS pixels).
     * @param y The vertical coordinate (CSS pixels).
     * @returns A promise resolving to a success or error message string.
     */
    async move(x: number, y: number): Promise<string> {
        await this.ensureInitialized();
        // Floor coordinates to integers, as CDP expects integer pixel values.
        let moveX = Math.floor(x);
        let moveY = Math.floor(y);
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Moving cursor to CSS coords: ${moveX},${moveY}`
        );

        // Clamp negative coordinates to 0, as outside the viewport might be problematic.
        if (moveX < 0 || moveY < 0) {
            console.warn(
                `[browser_session_cdp] Tab ${this.tabId}: Move coordinates (${moveX},${moveY}) are negative. Clamping to 0.`
            );
            moveX = Math.max(0, moveX);
            moveY = Math.max(0, moveY);
        }
        // Note: Upper bounds (e.g., BROWSER_WIDTHxBROWSER_HEIGHT) are not explicitly checked here. CDP might handle clicks
        // slightly outside the viewport, or the agent should use browserStatus info to provide valid coords.

        try {
            const client = this.cdpClient!;
            // Ensure viewport dimensions are set before interaction.
            await this.ensureViewportSize();

            // Reset navigation tracking flags before the action
            this.trackPageLoad();

            /*const steps = randomInt(6, 16);
            const delay = randomInt(8, 18);
            const startX = Math.floor(this.cursorPosition?.x) || 0;
            const startY = Math.floor(this.cursorPosition?.y) || 0;

            // Simulate moves from start to end.
            for (let i = 1; i <= steps; i++) {
                const intermediateX = Math.floor(
                    startX + ((moveX - startX) * i) / steps
                );
                const intermediateY = Math.floor(
                    startY + ((moveY - startY) * i) / steps
                );
                // We add a small random offset to the intermediate coordinates to simulate more natural movement.
                await client.Input.dispatchMouseEvent({
                    type: 'mouseMoved',
                    x: randomInt(intermediateX-3, intermediateX+3),
                    y: randomInt(intermediateY-3, intermediateY+3),
                    button: this.cursorPosition?.button || 'none',
                });
                await new Promise(resolve => setTimeout(resolve, randomInt(delay-2, delay+2))); // Small delay between moves
            }*/

            // Ensure the final move event is exactly at the end coordinates
            await client.Input.dispatchMouseEvent({
                type: 'mouseMoved',
                x: moveX,
                y: moveY,
                button: this.cursorPosition?.button || 'none',
            });
            await new Promise(resolve =>
                setTimeout(resolve, randomInt(30, 40))
            );

            // Update cursor position after click (retain button state)
            this.cursorPosition.x = moveX;
            this.cursorPosition.y = moveY;

            console.log(
                `[browser_session_cdp] Tab ${this.tabId}: Updated cursor position to ${moveX},${moveY}`
            );

            // Wait for page load if navigation was triggered
            await this.waitForPageLoad();

            return `Successfully moved cursor. New cursor position is {x: ${moveX}, y: ${moveY}}. The screenshot shows the new cursor position.`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error moving mouse to ${moveX},${moveY} for tab ${this.tabId}:`,
                error
            );
            return `Error moving mouse to ${moveX},${moveY}: ${error.message || error}`;
        }
    }

    /**
     * Simulates a mouse click at the current coordinates (CSS pixels relative to the viewport).
     * @param button The mouse button to use ('left', 'middle', 'right'). Defaults to 'left'.
     * @param button Type of click event ('click', 'mousedown', 'mouseup'). Defaults to 'click'.
     * @returns A promise resolving to a success or error message string.
     */
    async click(
        button: 'left' | 'middle' | 'right' = 'left',
        event: 'click' | 'mousedown' | 'mouseup' = 'click',
        x?: number,
        y?: number
    ): Promise<string> {
        await this.ensureInitialized();

        const useParamCoords =
            (typeof x === 'number' && x > 0) ||
            (typeof y === 'number' && y > 0);

        // Floor coordinates to integers, as CDP expects integer pixel values.
        const clickX = Math.floor(
            (typeof x === 'number' && useParamCoords
                ? x
                : this.cursorPosition?.x) || 0
        );
        const clickY = Math.floor(
            (typeof y === 'number' && useParamCoords
                ? y
                : this.cursorPosition?.y) || 0
        );

        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Clicking at CSS coords: ${clickX},${clickY} with ${button} button`
        );

        try {
            const client = this.cdpClient!;
            // Ensure viewport dimensions are set before interaction.
            await this.ensureViewportSize();

            // Reset navigation tracking flags before the action
            this.trackPageLoad();

            if (event === 'click' || event === 'mousedown') {
                // Dispatch mouse pressed event.
                await client.Input.dispatchMouseEvent({
                    type: 'mousePressed',
                    x: clickX,
                    y: clickY,
                    button: button,
                    clickCount: 1,
                });
            }
            if (event === 'click') {
                // Wait briefly between press and release.
                await new Promise(resolve =>
                    setTimeout(resolve, randomInt(30, 60))
                );
            }
            if (event === 'click' || event === 'mouseup') {
                // Dispatch mouse released event.
                await client.Input.dispatchMouseEvent({
                    type: 'mouseReleased',
                    x: clickX,
                    y: clickY,
                    button: button,
                    clickCount: 1,
                });
            }

            // Wait briefly to allow potential event handlers (like navigation) to trigger.
            await new Promise(resolve =>
                setTimeout(resolve, randomInt(100, 150))
            );

            // Update cursor position after click
            this.cursorPosition = { x: clickX, y: clickY };
            if (event === 'mousedown') {
                // If we are in mousedown mode, we need to keep the button pressed
                this.cursorPosition.button = button;
            }
            console.log(
                `[browser_session_cdp] Tab ${this.tabId}: Updated cursor position to ${clickX},${clickY} after click`
            );

            // Wait for page load if navigation was triggered
            await this.waitForPageLoad();

            return `Successfully clicked at {x: ${clickX}, y: ${clickY}} with the ${button} mouse button. The screenshot shows the updated page state.`;
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

            return `Successfully dragged from ${dragStartX},${dragStartY} to ${dragEndX},${dragEndY} with ${button} button. The screen shows the final cursor position.`;
        } catch (error: any) {
            console.error(
                `[browser_session_cdp] Error dragging for tab ${this.tabId}:`,
                error
            );
            return `Error dragging: ${error.message || error}`;
        }
    }

    /**
     * Ensures an editable element is focused.
     * 1. Keep current focus if already on an editable element.
     * 2. If a virtual-cursor position is known, prefer element under that point.
     * 3. Else pick the visible editable element that is closest to the viewport
     *    center, preferring larger area on ties.
     * @private
     * @returns true when focus is on an editable element, false otherwise.
     */
    private async ensureEditableFocused(): Promise<boolean> {
        const pos = this.cursorPosition; // May be null
        const { result } = await this.cdpClient!.Runtime.evaluate({
            expression: `
                (function(cursorX, cursorY) {
                    const editable = el => el && (
                        el.tagName === 'INPUT' ||
                        el.tagName === 'TEXTAREA' ||
                        el.isContentEditable
                    );

                    // 1) Keep current focus if editable
                    if (editable(document.activeElement)) return true;

                    // 2) Try element at cursor point
                    if (Number.isFinite(cursorX) && Number.isFinite(cursorY)) {
                        let el = document.elementFromPoint(cursorX, cursorY);
                        while (el && !editable(el)) el = el.parentElement;
                        if (editable(el)) { el.focus(); return true; }
                    }

                    // 3) Find best visible candidate (closest to center, then bigger)
                    const cx = window.innerWidth/2, cy = window.innerHeight/2;
                    const candidates = [...document.querySelectorAll('input,textarea,[contenteditable],[contenteditable=""],[contenteditable="true"]')]
                        .filter(n => editable(n) &&
                                n.offsetWidth > 0 &&
                                n.offsetHeight > 0 &&
                                getComputedStyle(n).visibility !== 'hidden' &&
                                getComputedStyle(n).display !== 'none')
                        .map(n => {
                            const r = n.getBoundingClientRect();
                            const dx = r.left + r.width/2 - cx;
                            const dy = r.top + r.height/2 - cy;
                            return {
                                node: n,
                                dist: dx*dx + dy*dy,
                                area: r.width * r.height
                            };
                        })
                        .sort((a, b) => a.dist - b.dist || b.area - a.area);

                    if (candidates.length) {
                        candidates[0].node.focus();
                        return true;
                    }
                    return false;
                })(${pos?.x ?? 'undefined'}, ${pos?.y ?? 'undefined'})
            `,
            returnByValue: true,
            awaitPromise: true,
        });
        return Boolean(result?.value);
    }

    /**
     * Simulates typing text into the currently focused element in the page.
     * Handles newline characters ('\n') by simulating an 'Enter' key press.
     * First checks if an editable element has focus, or tries to focus one.
     * Optimized for different text lengths:
     * - Short text (≤20 chars): Types character by character for natural feel
     * - Medium text (≤1000 chars): Types in small chunks for better performance while maintaining reliability
     * - Long text (>1000 chars): Uses a direct value insertion method for instant typing
     *
     * @param text The text string to type.
     * @returns A promise resolving to a success or error message string.
     */
    async type(text: string): Promise<string> {
        await this.ensureInitialized();

        // First ensure there's an editable element focused
        if (!(await this.ensureEditableFocused())) {
            return 'Error typing text: no editable element focused.';
        }

        // Normalize line endings to '\n'.
        const normalizedText = text.replace(/\r\n/g, '\n');
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Typing text (length ${normalizedText.length}): "${normalizedText.substring(0, 50)}${normalizedText.length > 50 ? '...' : ''}"`
        );

        try {
            const client = this.cdpClient!;

            // Helper functions
            const sleep = (ms: number) =>
                new Promise(resolve => setTimeout(resolve, ms));
            const pressEnter = async () => {
                await client.Input.dispatchKeyEvent({
                    type: 'keyDown',
                    key: 'Enter',
                    code: 'Enter',
                    windowsVirtualKeyCode: 13,
                    text: '\n',
                });
                await sleep(20);
                await client.Input.dispatchKeyEvent({
                    type: 'keyUp',
                    key: 'Enter',
                    code: 'Enter',
                    windowsVirtualKeyCode: 13,
                });
            };

            // Strategy constants
            const SHORT = 20; // Character-by-character threshold
            const MEDIUM = 1000; // Chunk-based threshold
            const CHUNK_MEDIUM = 10; // Chunk size for medium text
            const CHUNK_LONG = 50; // Chunk size for long text fallback

            // Type in chunks helper (used for medium text and long fallback)
            const typeChunks = async (
                text: string,
                chunkSize: number,
                delay: number
            ): Promise<void> => {
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Process line in chunks of specified size
                    for (let j = 0; j < line.length; j += chunkSize) {
                        const chunk = line.substring(j, j + chunkSize);
                        await client.Input.insertText({ text: chunk });
                        if (delay > 0) {
                            await sleep(delay);
                        }
                    }
                    // Add Enter between lines (except for the last line)
                    if (i < lines.length - 1) {
                        await pressEnter();
                    }
                    // Brief delay between lines
                    await sleep(10);
                }
            };

            let strategy = '';

            // Choose typing strategy based on text length
            if (normalizedText.length <= SHORT) {
                // For short text: use character-by-character approach for natural typing
                strategy = 'character-by-character';
                console.log(
                    `[browser_session_cdp] Tab ${this.tabId}: Using ${strategy} typing for short text`
                );

                for (const char of normalizedText) {
                    if (char === '\n') {
                        await pressEnter();
                    } else {
                        await client.Input.insertText({ text: char });
                    }
                    await sleep(20); // Delay between characters
                }
            } else if (normalizedText.length <= MEDIUM) {
                // For medium text: process in small chunks
                strategy = 'chunk-based';
                console.log(
                    `[browser_session_cdp] Tab ${this.tabId}: Using ${strategy} typing for medium text`
                );
                await typeChunks(normalizedText, CHUNK_MEDIUM, 5);
            } else {
                // For long text: attempt direct insertion first, fallback to chunks
                strategy = 'large chunk-based';
                console.log(
                    `[browser_session_cdp] Tab ${this.tabId}: Attempting direct value insertion for long text`
                );
                await typeChunks(normalizedText, CHUNK_LONG, 1);
            }

            // Small delay after typing finishes.
            await sleep(100);

            return `Successfully typed ${normalizedText.length} chars using ${strategy} strategy`;
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
                } catch {
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
                    case 'move':
                        result = await this.move(action.x, action.y);
                        break;
                    case 'click':
                        result = await this.click(action.button, action.event);
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

        try {
            // 1. Try closing the target using its dedicated client first.
            try {
                await this.cdpClient.Target.closeTarget({
                    targetId: targetIdToClose,
                });
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
        activeSessions.delete(tabId); // Remove from cache *first*
        return originalClose(); // Call original close logic
    };

    // Add the new session to the cache.
    activeSessions.set(tabId, session);
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
