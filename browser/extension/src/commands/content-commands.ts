/**
 * Content-related command handlers (DOM processing).
 */

// Re-add DomProcessingOptions import
import { GetPageContentParams, ResponseMessage, DomProcessingResult, DomProcessingError, ElementInfo, DomProcessingOptions } from '../types'; 
import { agentTabs, updateAgentTabActivity } from '../state/state';
import { storeElementMap } from '../storage/element-storage';
// No longer import processDomForLLM directly, as we'll inject the bundle

/**
 * Processes the DOM of a page to extract simplified content and interactive elements
 * @param tabId The agent's tab identifier
 * @param params Content processing parameters
 * @returns Promise resolving to a response message with the simplified content
 */
export async function getPageContentHandler(
  tabId: string,
  params: GetPageContentParams
): Promise<ResponseMessage> {
  console.log(`[content-commands] Getting page content for tab ${tabId}`);
  
  if (!agentTabs[tabId]) {
    return {
      status: 'error',
      error: `No tab found for agent ${tabId}. Initialize a tab first.`
    };
  }
  
  try {
    const chromeTabId = agentTabs[tabId].chromeTabId;
    updateAgentTabActivity(tabId);

    // Inject the bundled DOM processor script first
    await chrome.scripting.executeScript({
      target: { tabId: chromeTabId },
      files: ['dist/dom-processor.bundle.js'], // Path relative to extension root
      world: 'MAIN'
    });

    // Now, execute a small function to *call* the globally available function from the bundle
    const scriptResults = await chrome.scripting.executeScript<[DomProcessingOptions], DomProcessingResult | DomProcessingError>({
        target: { tabId: chromeTabId },
        func: (options: DomProcessingOptions): DomProcessingResult | DomProcessingError => { // Add return type annotation
            // Access the function exposed by the IIFE bundle
            // Use type assertion to inform TypeScript about the expected global
            const processorUtil = (window as any).__MagiDomProcessorUtil; 
            // Ensure the global name matches the one used in esbuild config
            if (typeof processorUtil?.processDomForLLM === 'function') {
                return processorUtil.processDomForLLM(options);
            } else {
                // Throw an error if the function isn't found, which executeScript will catch
                throw new Error('__MagiDomProcessorUtil.processDomForLLM function not found after injection.');
            }
        },
        args: [{ includeAllContent: !!params.allContent }],
        world: 'MAIN' // Execute in the same world where the bundle was injected
    });

    // Check for script execution errors (including the error thrown above if function not found)
    if (!scriptResults || scriptResults.length === 0 || !scriptResults[0].result) {
      const error = chrome.runtime.lastError?.message || "Failed to execute content script or get result.";
      return {
        status: 'error',
        error: `DOM processing failed: ${error}`
      };
    }
    
    // Handle the result
    const rawResult = scriptResults[0].result;
    
    // Perform type check to narrow the type
    if ('error' in rawResult && rawResult.error) {
      // Process as DomProcessingError
      const errorResult = rawResult as DomProcessingError;
      return {
        status: 'error',
        error: `DOM processing error: ${errorResult.message}`,
        details: errorResult.stack
      };
    }
    
    // If we reach here, rawResult is a DomProcessingResult
    const domResult = rawResult as DomProcessingResult;
    
    // Convert the ID map array back to a Map and ensure proper typing
    const idMap = new Map<number, ElementInfo>(
      domResult.idMapArray.map(([id, info]) => [id, info])
    );
    
    // Store the element map for later use
    await storeElementMap(tabId, idMap);
    
    return {
      status: 'ok',
      result: {
        simplifiedText: domResult.simplifiedText,
        idMapSize: idMap.size,
        warnings: domResult.warnings
      }
    };
  } catch (error) {
    console.error(`[content-commands] DOM processing failed for ${tabId}:`, error);
    return {
      status: 'error',
      error: `DOM processing failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
