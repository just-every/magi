/**
 * Simplified browser session implementation using Chrome DevTools Protocol (CDP)
 *
 * This implementation only handles connecting to an already-running Chrome instance
 * and does not try to launch or manage Chrome. It manages individual browser tabs
 * for different agents.
 */

import CDP from 'chrome-remote-interface';
import {
    buildElementArray, // Assuming this helper correctly uses DPR and scroll offset
    BrowserStatusPayload,
} from './cdp/browser_helpers.js'; // Assuming this helper exists

// --- Define Action Types ---

// Define specific action interfaces for type safety used by executeActions
interface NavigateAction { action: 'navigate'; url: string; }
interface GetPageUrlAction { action: 'get_page_url'; }
interface GetPageContentAction { action: 'get_page_content'; type: 'interactive' | 'markdown' | 'html'; }
interface BrowserStatusAction { action: 'browserStatus'; type?: 'viewport' | 'fullpage'; includeCoreTabs?: boolean; }
interface JsEvaluateAction { action: 'js_evaluate'; code: string; }
interface ScrollToAction { action: 'scroll_to'; mode: 'page_down' | 'page_up' | 'bottom' | 'top' | 'coordinates'; x?: number; y?: number; }
interface ClickAtAction { action: 'click_at'; x: number; y: number; button?: 'left' | 'middle' | 'right'; }
interface DragAction { action: 'drag'; startX: number; startY: number; endX: number; endY: number; button?: 'left' | 'middle' | 'right'; }
interface TypeAction { action: 'type'; text: string; }
interface PressAction { action: 'press'; keys: string; } // Changed from 'key' back to 'keys' to match executeActions switch
interface DebugCommandAction { action: 'debugCommand'; method: string; commandParams?: object; }

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
    | DebugCommandAction;


/**
 * Manages a browser session using Chrome DevTools Protocol for a specific tab.
 */
export class AgentBrowserSessionCDP {
    private tabId: string;
    private startUrl?: string;
    private initialized = false;
    private chromeTabId: string | null = null; // CDP target ID
    private cdpClient: CDP.Client | null = null;

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

            console.log(`[browser_session_cdp] Connecting to CDP at ${host}:${port}`);

            // Connect to the main CDP endpoint to manage targets (tabs).
            const rootClient = await CDP({
                host,
                port,
            });

            try {
                // Create a new target (browser tab).
                const { targetId } = await rootClient.Target.createTarget({
                    url: this.startUrl || 'about:blank', // Navigate to start URL or blank page
                    newWindow: false, // Create a tab in the existing window
                    background: true, // Create the tab in the background without stealing focus
                });

                this.chromeTabId = targetId; // Store the CDP ID for our tab
                console.log(`[browser_session_cdp] Created new target (tab) with ID: ${targetId} (in background: true)`);

                // Create a dedicated CDP client connected specifically to our new tab.
                this.cdpClient = await CDP({
                    host,
                    port,
                    target: targetId, // Scope commands to this tab
                });
                console.log(`[browser_session_cdp] Connected CDP client to target: ${targetId}`);

                // Enable necessary CDP domains for browser interaction and status retrieval.
                await Promise.all([
                    this.cdpClient.Page.enable(),      // Page navigation, lifecycle events
                    this.cdpClient.DOM.enable(),       // DOM inspection, querying
                    this.cdpClient.Runtime.enable(),   // JavaScript execution, getting properties
                ]);
                console.log(`[browser_session_cdp] Enabled required CDP domains for target: ${targetId}`);

                // Close the initial root client connection as it's no longer needed.
                await rootClient.close();

                this.initialized = true; // Mark session as initialized
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
                if (rootClient) await rootClient.close().catch(closeErr => console.error("Error closing root client:", closeErr));
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
            throw new Error(`CDP client not available for tab ${this.tabId} after initialization attempt.`);
        }
    }

    /**
     * Sets the viewport *dimensions* to standard CSS pixel values (1024x768).
     * Allows the browser to use its native device pixel ratio for rendering.
     * This ensures a consistent layout size for measurement and interaction.
     * @private
     */
    private async ensureViewportSize(): Promise<void> {
        try {
            // Use Emulation domain to override device metrics for the tab.
            await this.cdpClient!.Emulation.setDeviceMetricsOverride({
                width: 1024, // Set viewport width in CSS pixels
                height: 768, // Set viewport height in CSS pixels
                deviceScaleFactor: 0, // Use 0 to adopt the browser's default/native DPR
                mobile: false, // Emulate a desktop browser
            });
            // Log reduced for less noise during execution
            // console.log(`[browser_session_cdp] Tab ${this.tabId}: Set viewport dimensions to 1024x768 CSS pixels (using native DPR)`);
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
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Navigating to ${url}`);
        try {
            const client = this.cdpClient!;
            let loadFired = false;

            // Set up a promise that resolves when Page.loadEventFired is received.
            const loadPromise = new Promise<void>((resolve) => {
                 // Add a timeout in case the load event never fires.
                 const loadTimeout = setTimeout(() => {
                     if (!loadFired) {
                         console.warn(`[browser_session_cdp] Tab ${this.tabId}: Navigation to ${url} timed out after 30s (load event). Resolving anyway.`);
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
            if (errorText) { // Check for immediate navigation errors.
                 throw new Error(`Navigation failed immediately: ${errorText}`);
            }

            // Wait for the load event or timeout.
            await loadPromise;

            // Get the final URL after potential redirects.
            const result = await client.Runtime.evaluate({ expression: 'window.location.href', returnByValue: true });
            const finalUrl = result?.result?.value ?? 'unknown URL'; // Handle cases where URL couldn't be retrieved

            return `Successfully navigated to ${finalUrl}`;
        } catch (error: any) {
            console.error(`[browser_session_cdp] Error navigating tab ${this.tabId} to ${url}:`, error);
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
            const result = await this.cdpClient!.Runtime.evaluate({ expression: 'window.location.href', returnByValue: true });
            // Check for JavaScript exceptions during evaluation.
            if (result.exceptionDetails) {
                throw new Error(`JS exception getting URL: ${result.exceptionDetails.text}`);
            }
            return result?.result?.value ?? 'Could not retrieve URL'; // Return URL or fallback message
        } catch (error: any) {
            console.error(`[browser_session_cdp] Error getting URL for tab ${this.tabId}:`, error);
            return `Error getting URL: ${error.message || error}`;
        }
    }

    /**
     * Retrieves the full HTML content of the current page.
     * Note: Currently only supports returning HTML. 'markdown' and 'interactive' types are placeholders.
     * @param type The desired format ('html', 'markdown', 'interactive').
     * @returns A promise resolving to the HTML content string or an error message string.
     */
    async get_page_content(type: 'interactive' | 'markdown' | 'html'): Promise<string> {
        await this.ensureInitialized();
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Getting page content as ${type}`);
        // Warn if a non-HTML type is requested, as only HTML is implemented.
        if (type !== 'html') {
             console.warn(`[browser_session_cdp] Tab ${this.tabId}: get_page_content type '${type}' not fully implemented, returning full HTML.`);
        }
        try {
            // Get the root DOM node.
            const { root } = await this.cdpClient!.DOM.getDocument({ depth: -1, pierce: true }); // depth -1 for full tree, pierce for shadow DOM
            if (!root?.nodeId) { // Check if root node was retrieved
                throw new Error('Could not get document root node.');
            }
            // Get the outer HTML of the root node.
            const { outerHTML } = await this.cdpClient!.DOM.getOuterHTML({ nodeId: root.nodeId });
            return outerHTML || ''; // Return HTML or empty string if null
        } catch (error: any) {
            console.error(`[browser_session_cdp] Error getting page content for tab ${this.tabId}:`, error);
            return `Error getting page content: ${error.message || error}`;
        }
    }

    /**
     * Captures a screenshot and gathers browser status information (URL, dimensions, element map).
     * Sets consistent viewport dimensions but allows native device pixel ratio (DPR).
     * Detects the actual DPR and scroll position, passing them to `buildElementArray`
     * for accurate coordinate calculation (CSS pixels relative to the viewport).
     *
     * @param type Type of screenshot ('viewport' or 'fullpage'). Currently only 'viewport' is implemented.
     * @param includeCoreTabs Whether to include information about other tabs (placeholder).
     * @returns A promise resolving to the BrowserStatusPayload object on success, or an error object { error: string } on failure.
     */
    async browserStatus(
        type: 'viewport' | 'fullpage' = 'viewport',
        includeCoreTabs = false // Placeholder parameter
    ): Promise<BrowserStatusPayload | { error: string }> {
        await this.ensureInitialized();
        console.log(
            `[browser_session_cdp] Tab ${this.tabId}: Taking ${type} screenshot with browser status (detecting DPR)`
        );

        // Fallback for unimplemented 'fullpage' type.
        if (type === 'fullpage') {
            console.warn(`[browser_session_cdp] Tab ${this.tabId}: 'fullpage' screenshot type not implemented, capturing viewport instead.`);
            type = 'viewport';
        }

        try {
            const client = this.cdpClient!;

            // 1. Set consistent viewport dimensions (e.g., 1024x768 CSS pixels). Allows native DPR.
            await this.ensureViewportSize();

            // 2. Perform CDP operations concurrently for efficiency.
            const [
                metrics,          // Page layout metrics (CSS pixels)
                screenshotResult, // Screenshot data
                snap,             // DOM snapshot (includes raw element rects)
                urlResult,        // Current page URL
                dprResult,        // Actual device pixel ratio
                scrollResult,     // Current scroll offsets (X and Y)
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
                client.Runtime.evaluate({ expression: 'window.location.href', returnByValue: true }),
                client.Runtime.evaluate({ expression: 'window.devicePixelRatio', returnByValue: true }),
                client.Runtime.evaluate({ expression: '{ scrollX: window.scrollX, scrollY: window.scrollY }', returnByValue: true }),
            ]);

            // 3. Extract results, providing defaults if necessary.
            const devicePixelRatio: number = dprResult?.result?.value ?? 1; // Default DPR to 1
            const scrollX: number = scrollResult?.result?.value?.scrollX ?? 0; // Default scroll to 0
            const scrollY: number = scrollResult?.result?.value?.scrollY ?? 0;
            console.log(`[browser_session_cdp] Detected DPR: ${devicePixelRatio}, Scroll: X=${scrollX}, Y=${scrollY}`);

            // Extract viewport and content dimensions (in CSS pixels).
            const viewWidth = metrics.cssLayoutViewport?.clientWidth ?? 1024;
            const viewHeight = metrics.cssLayoutViewport?.clientHeight ?? 768;
            const fullWidth = metrics.cssContentSize?.width ?? viewWidth;
            const fullHeight = metrics.cssContentSize?.height ?? viewHeight;

            // 4. Generate the element map using the helper function.
            // **Crucial:** `buildElementArray` MUST correctly use DPR and scroll offsets
            // to convert raw DOM snapshot rects into viewport-relative CSS pixel coordinates.
            const elementMap = buildElementArray(
                snap,
                viewWidth,        // Viewport width (CSS pixels)
                viewHeight,       // Viewport height (CSS pixels)
                devicePixelRatio//, // Actual device pixel ratio
                //scrollX,          // Horizontal scroll offset (CSS pixels)
                //scrollY           // Vertical scroll offset (CSS pixels)
            );

            const currentUrl = urlResult?.result?.value || ''; // Get URL or use empty string

            // 5. Assemble the final payload.
            const payload: BrowserStatusPayload = {
                screenshot: `data:image/png;base64,${screenshotResult.data}`, // Base64 encoded screenshot
                view: { w: viewWidth, h: viewHeight }, // Viewport dimensions (CSS pixels)
                full: { w: fullWidth, h: fullHeight }, // Full page dimensions (CSS pixels)
                url: currentUrl,
                elementMap, // Array of elements with corrected coordinates
            };

            // Add placeholder for coreTabs if requested.
            if (includeCoreTabs) {
                payload.coreTabs = [];
            }

            return payload; // Return the successful payload
        } catch (error: any) {
            // Handle any errors during the process.
            console.error(
                `[browser_session_cdp] Error getting browser status/screenshot for tab ${this.tabId}:`,
                error
            );
            // Return a structured error object.
            return { error: `Error getting browser status: ${error.message || error}` };
        }
    }

    /**
     * Executes arbitrary JavaScript code within the context of the page.
     * @param code The JavaScript code string to execute.
     * @returns A promise resolving to the result of the execution (converted to string) or an error message string.
     */
    async js_evaluate(code: string): Promise<string> {
        await this.ensureInitialized();
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Evaluating JS: ${code.substring(0, 100)}${code.length > 100 ? '...' : ''}`);
        try {
            // Execute JavaScript using Runtime.evaluate.
            const { result, exceptionDetails } = await this.cdpClient!.Runtime.evaluate({
                expression: code,
                returnByValue: true, // Attempt to return simple values directly
                awaitPromise: true, // Wait for promises returned by the script to resolve
                userGesture: true, // Simulate execution within a user gesture context
                timeout: 30000, // Set a timeout for long-running scripts
            });

            // Check if the script threw an exception.
            if (exceptionDetails) {
                throw new Error(`JS exception: ${exceptionDetails.exception?.description || exceptionDetails.text}`);
            }

            // Convert the result object to a string representation.
            let resultString = '';
            if (result.type === 'undefined') resultString = 'undefined';
            else if (result.subtype === 'null') resultString = 'null';
            else if (result.type === 'string') resultString = result.value;
            else if (result.type === 'number' || result.type === 'boolean') resultString = String(result.value);
            else if (result.type === 'object') {
                 // Try to JSON stringify objects/arrays.
                 try { resultString = JSON.stringify(result.value); }
                 catch (stringifyError: any) {
                     // Fallback if stringification fails (e.g., circular references).
                     console.warn(`[browser_session_cdp] Could not JSON.stringify JS result for tab ${this.tabId}: ${stringifyError.message}`);
                     resultString = result.description || '[object]';
                 }
            } else resultString = result.description || String(result.value); // Use description or simple string conversion as fallback

            return resultString;
        } catch (error: any) {
            console.error(`[browser_session_cdp] Error evaluating JS for tab ${this.tabId}:`, error);
            // Check for specific timeout error message.
            if (error.message?.includes('timed out')) {
                 return `Error evaluating JavaScript: Execution timed out.`;
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
        const coordString = (mode === 'coordinates' && typeof x === 'number' && typeof y === 'number') ? ` to ${x},${y}` : '';
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Scrolling (${mode})${coordString}`);
        try {
            let script = '';
            // Determine the JavaScript scroll command based on the mode.
            switch (mode) {
                case 'page_down': script = 'window.scrollBy(0, window.innerHeight * 0.8)'; break; // Scroll down 80% of viewport height
                case 'page_up': script = 'window.scrollBy(0, -window.innerHeight * 0.8)'; break; // Scroll up 80% of viewport height
                case 'bottom': script = 'window.scrollTo(0, document.body.scrollHeight)'; break; // Scroll to the bottom of the page
                case 'top': script = 'window.scrollTo(0, 0)'; break; // Scroll to the top of the page
                case 'coordinates':
                    if (typeof x !== 'number' || typeof y !== 'number') {
                        return 'Error scrolling: Coordinates (x, y) are required for "coordinates" scroll mode.';
                    }
                    // Ensure coordinates are non-negative integers (CSS pixels).
                    const scrollX = Math.max(0, Math.floor(x));
                    const scrollY = Math.max(0, Math.floor(y));
                    script = `window.scrollTo(${scrollX}, ${scrollY})`;
                    break;
                default:
                    // Should not happen with TypeScript validation.
                    return `Error scrolling: Unsupported scroll mode: ${mode}`;
            }

            // Ensure viewport dimensions are set, especially if using window.innerHeight.
            await this.ensureViewportSize();

            // Execute the scroll script.
            const scrollResult = await this.cdpClient!.Runtime.evaluate({ expression: script, awaitPromise: true, userGesture: true });
            if (scrollResult.exceptionDetails) { // Check for JS errors during scroll
                throw new Error(`JS exception during scroll: ${scrollResult.exceptionDetails.text}`);
            }

            // Wait briefly for rendering to potentially catch up after scroll.
            await new Promise(resolve => setTimeout(resolve, 100));

            return `Successfully scrolled (${mode})${coordString}`;
        } catch (error: any) {
            console.error(`[browser_session_cdp] Error scrolling tab ${this.tabId}:`, error);
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
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Clicking at CSS coords: ${clickX},${clickY} with ${button} button`);

        // Clamp negative coordinates to 0, as clicks outside the viewport might be problematic.
        if (clickX < 0 || clickY < 0) {
            console.warn(`[browser_session_cdp] Tab ${this.tabId}: Click coordinates (${clickX},${clickY}) are negative. Clamping to 0.`);
            clickX = Math.max(0, clickX);
            clickY = Math.max(0, clickY);
        }
        // Note: Upper bounds (e.g., 1024x768) are not explicitly checked here. CDP might handle clicks
        // slightly outside the viewport, or the agent should use browserStatus info to provide valid coords.

        try {
            const client = this.cdpClient!;
            // Ensure viewport dimensions are set before interaction.
            await this.ensureViewportSize();

            // Dispatch mouse pressed event.
            await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: clickX, y: clickY, button: button, clickCount: 1 });
            // Wait briefly between press and release.
            await new Promise(resolve => setTimeout(resolve, 50));
            // Dispatch mouse released event.
            await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: clickX, y: clickY, button: button, clickCount: 1 });
            // Wait briefly to allow potential event handlers (like navigation) to trigger.
            await new Promise(resolve => setTimeout(resolve, 100));

            return `Successfully clicked at ${clickX},${clickY} with ${button} button`;
        } catch (error: any) {
            console.error(`[browser_session_cdp] Error clicking at ${clickX},${clickY} for tab ${this.tabId}:`, error);
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
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Dragging CSS coords from ${dragStartX},${dragStartY} to ${dragEndX},${dragEndY} with ${button} button`);

        // Basic validation for coordinate types.
        if (typeof dragStartX !== 'number' || typeof dragStartY !== 'number' || typeof dragEndX !== 'number' || typeof dragEndY !== 'number') {
            return 'Error dragging: Valid numeric start and end coordinates are required.';
        }
        // Consider clamping negative coordinates if necessary:
        // startX = Math.max(0, dragStartX); startY = Math.max(0, dragStartY);
        // endX = Math.max(0, dragEndX); endY = Math.max(0, dragEndY);

        try {
            const client = this.cdpClient!;
            const steps = 10; // Number of intermediate mouse move events for smoother dragging.

            // Ensure viewport dimensions are set.
            await this.ensureViewportSize();

            // 1. Mouse down at the start position.
            await client.Input.dispatchMouseEvent({ type: 'mousePressed', x: dragStartX, y: dragStartY, button: button, clickCount: 1 });
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay after press

            // 2. Simulate moves from start to end.
            for (let i = 1; i <= steps; i++) {
                const intermediateX = Math.floor(dragStartX + ((dragEndX - dragStartX) * i) / steps);
                const intermediateY = Math.floor(dragStartY + ((dragEndY - dragStartY) * i) / steps);
                await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: intermediateX, y: intermediateY, button: button }); // Indicate button pressed during move
                await new Promise(resolve => setTimeout(resolve, 20)); // Small delay between moves
            }
            // Ensure the final move event is exactly at the end coordinates if steps > 0.
            if (steps > 0) {
                 await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: dragEndX, y: dragEndY, button: button });
                 await new Promise(resolve => setTimeout(resolve, 20));
            }

            // 3. Mouse release at the end position.
            await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x: dragEndX, y: dragEndY, button: button, clickCount: 1 }); // clickCount=1 often works, though 0 might be technically correct for release
            await new Promise(resolve => setTimeout(resolve, 100)); // Allow potential drop handlers

            return `Successfully dragged from ${dragStartX},${dragStartY} to ${dragEndX},${dragEndY} with ${button} button`;
        } catch (error: any) {
            console.error(`[browser_session_cdp] Error dragging for tab ${this.tabId}:`, error);
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
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Typing text (length ${normalizedText.length}): "${normalizedText.substring(0, 50)}${normalizedText.length > 50 ? '...' : ''}"`);
        try {
            const client = this.cdpClient!;
            // Small delay to allow element focus to settle.
            await new Promise(resolve => setTimeout(resolve, 50));

            // Process each character in the text.
            for (const char of normalizedText) {
                if (char === '\n') {
                    // Simulate Enter key press for newline characters.
                    await client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); // Send key down
                    await new Promise(resolve => setTimeout(resolve, 20)); // Brief pause
                    await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); // Send key up
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
            console.error(`[browser_session_cdp] Error typing text for tab ${this.tabId}:`, error);
            return `Error typing text: ${error.message || error}`;
        }
    }

    /**
     * Simulates pressing a single keyboard key (e.g., 'Enter', 'Tab', 'ArrowDown').
     * Does not currently support modifier keys (Shift, Ctrl, Alt) directly.
     * @param key The key to press (e.g., 'Enter', 'Tab', 'a', 'A'). See CDP Input.dispatchKeyEvent 'key' values.
     * @returns A promise resolving to a success or error message string.
     */
    async press(key: string): Promise<string> {
        await this.ensureInitialized();
        // Trim whitespace from the key name.
        key = key.trim();
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Pressing key: ${key}`);
        if (!key) { // Check for empty key string.
            return `Error pressing key: Key cannot be empty.`;
        }
        try {
            const client = this.cdpClient!;
            // Dispatch key down event.
            // Additional properties like 'code', 'windowsVirtualKeyCode' might be needed for some keys/systems.
            await client.Input.dispatchKeyEvent({ type: 'keyDown', key: key });
            await new Promise(resolve => setTimeout(resolve, 30)); // Brief pause
            // Dispatch key up event.
            await client.Input.dispatchKeyEvent({ type: 'keyUp', key: key });
            await new Promise(resolve => setTimeout(resolve, 100)); // Delay after press

            return `Successfully pressed key: ${key}`;
        } catch (error: any) {
            console.error(`[browser_session_cdp] Error pressing key '${key}' for tab ${this.tabId}:`, error);
            return `Error pressing key '${key}': ${error.message || error}`;
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
    async executeActions(actions: BrowserAction[]): Promise<string> {
        await this.ensureInitialized();
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Executing batch of ${actions.length} actions.`);
        let results: string[] = []; // Optional: Store success messages
        let lastResult: any = null; // Store the result of the last successful action

        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            console.log(`[browser_session_cdp] Tab ${this.tabId}: Executing action ${i + 1}/${actions.length}: ${action.action}`);
            // Variable to hold the result of the current action.
            let result: string | BrowserStatusPayload | { error: string } | any = '';

            try {
                // Execute the appropriate method based on the action type.
                switch (action.action) {
                    case 'navigate': result = await this.navigate(action.url); break;
                    case 'get_page_url': result = await this.get_page_url(); break;
                    case 'get_page_content': result = await this.get_page_content(action.type); break;
                    case 'browserStatus':
                        result = await this.browserStatus(action.type, action.includeCoreTabs);
                        // Check if browserStatus returned an error object.
                        if (typeof result === 'object' && result !== null && 'error' in result) {
                            throw new Error(result.error); // Throw to enter the main catch block
                        }
                        lastResult = result; // Store the successful payload
                        result = `Successfully retrieved browser status and screenshot.`; // Generic success message for sequence log
                        break;
                    case 'js_evaluate': result = await this.js_evaluate(action.code); break;
                    case 'scroll_to': result = await this.scroll_to(action.mode, action.x, action.y); break;
                    case 'click_at': result = await this.click_at(action.x, action.y, action.button); break;
                    case 'drag': result = await this.drag(action.startX, action.startY, action.endX, action.endY, action.button); break;
                    case 'type': result = await this.type(action.text); break;
                    case 'press': result = await this.press(action.keys); break; // Use 'keys' based on PressAction interface
                    case 'debugCommand':
                        // debugCommand might return complex objects or throw errors.
                        const debugResult = await this.debugCommand(action.method, action.commandParams);
                        // Create a summary string for the sequence log.
                        result = `Successfully executed debug command: ${action.method}. Result: ${JSON.stringify(debugResult).substring(0, 100)}...`;
                        lastResult = debugResult; // Store the actual raw result
                        break;
                    default:
                        // Handle unknown action types (shouldn't occur with TypeScript).
                        console.error(`[browser_session_cdp] Tab ${this.tabId}: Unknown action type encountered:`, action);
                        // Return error immediately.
                        return JSON.stringify({ status: "error", message: `Execution failed at step ${i + 1}: Unknown action type.`, lastResult: null });
                }

                // Check results: Handle errors returned as strings or successful results.
                if (typeof result === 'string' && result.startsWith('Error')) {
                    // Action failed (returned an error string), stop execution.
                    console.error(`[browser_session_cdp] Tab ${this.tabId}: Action ${i + 1} (${action.action}) failed: ${result}`);
                    return JSON.stringify({ status: "error", message: `Execution failed at step ${i + 1} (${action.action}): ${result}`, lastResult: null });
                } else if (typeof result === 'string') {
                    // Action succeeded (returned a success string).
                    results.push(result); // Store success message (optional)
                    // Update lastResult only if it wasn't already set by browserStatus or debugCommand.
                    if (action.action !== 'browserStatus' && action.action !== 'debugCommand') {
                         lastResult = result;
                    }
                } else {
                     // Action succeeded (returned an object payload - browserStatus or debugCommand).
                     // Success message was already generated above.
                     results.push(`Action ${action.action} completed successfully.`);
                     // lastResult was already set above.
                }

            } catch (error: any) {
                // Catch errors thrown explicitly (e.g., by browserStatus error object) or unexpected errors.
                console.error(`[browser_session_cdp] Tab ${this.tabId}: Uncaught error during action ${i + 1} (${action.action}):`, error);
                return JSON.stringify({ status: "error", message: `Execution failed at step ${i + 1} (${action.action}): ${error.message || error}`, lastResult: null });
            }
        }

        // All actions executed successfully.
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Successfully executed all ${actions.length} actions.`);
        // Return success status, message, and the result of the very last action.
        return JSON.stringify({
            status: "success",
            message: `Successfully executed ${actions.length} actions.`,
            lastResult: lastResult // Include the actual result of the last action
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
        console.log(`[browser_session_cdp] Tab ${this.tabId}: Executing DEBUG command: ${method} with params:`, commandParams || {});
        try {
            // Validate method name format.
            if (!method || typeof method !== 'string') {
                throw new Error('Valid method name string is required for debugCommand');
            }
            const parts = method.split('.');
            if (parts.length !== 2 || !parts[0] || !parts[1]) {
                throw new Error(`Invalid CDP method format: "${method}". Expected "Domain.command".`);
            }
            const [domain, command] = parts;

            const client = this.cdpClient!;

            // Basic runtime check if the domain and command seem to exist on the client object.
            // Note: This doesn't guarantee the command is valid according to the current CDP spec.
            if (typeof (client as any)[domain]?.[command] !== 'function') {
                 throw new Error(`CDP method "${method}" not found or is not a function on the client.`);
            }

            // Execute the command dynamically using bracket notation.
            const result = await (client as any)[domain][command](commandParams || {});

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
            throw new Error(`Debug command "${method}" failed: ${error.message || error}`);
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
            console.log(`[browser_session_cdp] Tab ${this.tabId} session already closed or not initialized.`);
            return `Tab ${this.tabId} session already closed or was not initialized.`; // Considered success state
        }

        const targetIdToClose = this.chromeTabId; // Store ID before resetting state
        console.log(`[browser_session_cdp] Closing tab ${this.tabId} (CDP target: ${targetIdToClose})`);

        try {
            // 1. Try closing the target using its dedicated client first.
            try {
                 await this.cdpClient.Target.closeTarget({ targetId: targetIdToClose });
                 console.log(`[browser_session_cdp] Closed target ${targetIdToClose} via specific client.`);
            } catch (closeError: any) {
                 // If specific client fails (e.g., disconnected), try using a temporary root client.
                 console.warn(`[browser_session_cdp] Could not close target ${targetIdToClose} via its own client: ${closeError.message}. Attempting via root.`);
                 let rootClient = null;
                 try {
                     // Use the same host/port logic as initialize for consistency.
                     const host = 'host.docker.internal';
                     const port = parseInt(process.env.HOST_CDP_PORT || '9001', 10);
                     rootClient = await CDP({ host, port });
                     await rootClient.Target.closeTarget({ targetId: targetIdToClose });
                     console.log(`[browser_session_cdp] Closed target ${targetIdToClose} via temporary root client.`);
                 } catch (rootCloseError: any) {
                     // Log error if root client also fails. Target might already be closed.
                     console.error(`[browser_session_cdp] Failed to close target ${targetIdToClose} via root client: ${rootCloseError.message}.`);
                 } finally {
                     // Ensure temporary root client is closed.
                     if (rootClient) await rootClient.close().catch(err => console.error("Error closing temp root client:", err));
                 }
            }

            // 2. Clean up internal session state regardless of close success.
            this.initialized = false;
            this.cdpClient = null; // Release client reference
            this.chromeTabId = null;

            console.log(`[browser_session_cdp] Session resources released for tab ${this.tabId}.`);
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
                console.error(`[browser_utils] Error closing session for tab ${tabId}:`, err);
            });
        }
        return Promise.resolve(); // Should not happen if key exists, but be safe.
    });

    // Wait for all close attempts to finish.
    await Promise.all(closePromises);

    // Ensure cache is clear.
    activeSessions.clear();
    console.log('[browser_utils] All active sessions have been processed for closure.');
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
        throw new Error('Tab ID cannot be empty when getting/creating a browser session.');
    }

    // Check cache for existing session.
    const existingSession = activeSessions.get(tabId);
    if (existingSession) {
        // Log reduced for less noise
        // console.log(`[browser_utils] Reusing existing session for tab: ${tabId}`);
        return existingSession;
    }

    // Create a new session if not found in cache.
    console.log(`[browser_utils] Creating new session for tab: ${tabId} ${startUrl ? `with start URL: ${startUrl}` : ''}`);
    const session = new AgentBrowserSessionCDP(tabId, startUrl);

    // Monkey-patch the closeSession method to ensure removal from cache.
    const originalClose = session.closeSession.bind(session); // Store original method
    session.closeSession = async function (): Promise<string> { // Override
        console.log(`[browser_utils] Session for tab ${tabId} is closing, removing from cache.`);
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
        console.log(`[browser_utils] Received ${signal}. Attempting to close active sessions...`);
        // Set a timeout to force exit if cleanup takes too long.
        const cleanupTimeout = setTimeout(() => {
            console.warn('[browser_utils] Cleanup timed out (5s). Forcing exit.');
            process.exit(1); // Force exit with error code
        }, 5000); // 5-second timeout

        try {
            await closeAllSessions(); // Attempt to close all sessions
            console.log('[browser_utils] Graceful shutdown complete.');
            clearTimeout(cleanupTimeout); // Clear the timeout on successful cleanup
            process.exit(0); // Exit cleanly
        } catch (error) {
            console.error('[browser_utils] Error during graceful shutdown:', error);
            clearTimeout(cleanupTimeout); // Clear timeout even on error
            process.exit(1); // Exit with error code
        }
    });
});
