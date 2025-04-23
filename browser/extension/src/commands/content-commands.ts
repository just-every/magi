/**
 * Content-related command handlers (DOM processing).
 */

// Import necessary types, including the specific result types
import {
    GetPageContentParams,
    ResponseMessage,
    DomProcessingResult, // Union type
    // InteractiveDomProcessingResult, // Removed unused import
    // HtmlDomProcessingResult,      // Removed unused import
    DomProcessingError,
    ElementInfo,
    DomProcessingOptions,
} from '../types';
import { agentTabs, updateAgentTabActivity } from '../state/state';
import { storeElementMap } from '../storage/element-storage';
// No longer import processDomForLLM directly, as we'll inject the bundle

/**
 * Processes the DOM of a page to extract simplified content and interactive elements
 * @param tabId The agent's tab identifier
 * @param params Content processing parameters
 * @returns Promise resolving to a response message with the content in the requested format
 */
export async function getPageContentHandler(
    tabId: string,
    params: GetPageContentParams // Updated parameter type
): Promise<ResponseMessage> {
    console.log(
        `[content-commands] Getting page content for tab ${tabId} as type: ${params.type}`
    );

    if (!agentTabs[tabId]) {
        return {
            status: 'error',
            error: `No tab found for agent ${tabId}. Initialize a tab first.`,
        };
    }

    try {
        const chromeTabId = agentTabs[tabId].chromeTabId;
        updateAgentTabActivity(tabId);

        // First check if the tab is on a valid URL (not about:blank or other restricted URLs)
        const tabInfo = await chrome.tabs.get(chromeTabId);

        // Check if the URL is undefined, empty, or a restricted URL
        if (
            !tabInfo.url ||
            tabInfo.url.startsWith('about:') ||
            tabInfo.url.startsWith('chrome:')
        ) {
            return {
                status: 'error',
                error: `Cannot process content: Tab is on a restricted URL (${tabInfo.url || 'undefined'}) or has not finished loading. Extension manifest must request permission to access this host.`,
            };
        }

        // Inject the bundled DOM processor script first
        await chrome.scripting.executeScript({
            target: { tabId: chromeTabId },
            files: ['dist/dom-processor.bundle.js'], // Path relative to extension root
            world: 'MAIN',
        });

        // For 'markdown' type, we need to request 'html' from the DOM processor
        // The actual markdown conversion happens in browser_utils.ts
        const requestType = params.type === 'markdown' ? 'html' : params.type;

        // Now, execute a small function to *call* the globally available function from the bundle
        const scriptResults = await chrome.scripting.executeScript<
            [DomProcessingOptions],
            DomProcessingResult | DomProcessingError
        >({
            target: { tabId: chromeTabId },
            // Updated function signature and return type annotation
            func: (
                options: DomProcessingOptions
            ): DomProcessingResult | DomProcessingError => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const processorUtil = (window as any).__MagiDomProcessorUtil;
                if (typeof processorUtil?.processDomForLLM === 'function') {
                    return processorUtil.processDomForLLM(options);
                } else {
                    throw new Error(
                        '__MagiDomProcessorUtil.processDomForLLM function not found after injection.'
                    );
                }
            },
            // Pass the mapped type parameter to the DOM processor
            args: [{ type: requestType }],
            world: 'MAIN',
        });

        // Check for script execution errors (including the error thrown above if function not found)
        if (
            !scriptResults ||
            scriptResults.length === 0 ||
            !scriptResults[0].result
        ) {
            const error =
                chrome.runtime.lastError?.message ||
                'Failed to execute content script or get result.';
            return {
                status: 'error',
                error: `DOM processing failed: ${error}`,
            };
        }

        // Handle the result based on its type
        const resultUnion = scriptResults[0].result; // Type is DomProcessingResult | DomProcessingError

        // First, check if it's an error
        if ('error' in resultUnion && resultUnion.error) {
            // Process as DomProcessingError
            const errorResult = resultUnion as DomProcessingError;
            return {
                status: 'error',
                error: `DOM processing error: ${errorResult.message}`,
                details: errorResult.stack,
            };
        }

        // If not an error, it must be a DomProcessingResult (Interactive or HTML)
        const domResult = resultUnion as DomProcessingResult;

        // Now check the specific type of the successful result
        if (domResult.type === 'interactive') {
            // Process as InteractiveDomProcessingResult (already narrowed by the check)
            const idMap = new Map<number, ElementInfo>(
                domResult.idMapArray.map(
                    ([id, info]: [number, ElementInfo]) => [id, info]
                ) // Added types for map
            );
            await storeElementMap(tabId, idMap); // Store map only for interactive type
            return {
                status: 'ok',
                // Return the simplified text string directly, as expected by browser_session.ts
                result: domResult.simplifiedText,
                // Optionally include warnings or map size if needed by backend:
                // result: {
                //   content: interactiveResult.simplifiedText,
                //   idMapSize: idMap.size,
                //   warnings: interactiveResult.warnings
                // }
            };
        } else if (domResult.type === 'html') {
            // Process as HtmlDomProcessingResult
            // Note: When the original requested type is 'markdown', we convert HTML to Markdown in browser_utils.ts
            return {
                status: 'ok',
                // Return the HTML content string directly
                result: domResult.htmlContent,
                // Optionally include warnings:
                // result: { content: domResult.htmlContent, warnings: domResult.warnings }
            };
        } else {
            // Should not happen if DOM processor works correctly
            return {
                status: 'error',
                error: 'Unknown result type received from DOM processor.',
            };
        }
    } catch (error) {
        console.error(
            `[content-commands] DOM processing failed for ${tabId}:`,
            error
        );
        return {
            status: 'error',
            error: `DOM processing failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
