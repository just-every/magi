/**
 * Screenshot-related command handlers.
 */

import { ResponseMessage, ScreenshotParams } from '../types';
import { agentTabs, updateAgentTabActivity } from '../state/state';
// Removed: import { sendDebuggerCommand } from '../debugger/debugger-control';
import { getElementById } from '../storage/element-storage';

/**
 * Takes a screenshot of a tab
 * @param tabId The agent's tab identifier
 * @param params Screenshot parameters
 * @returns Promise resolving to a response message with screenshot data
 */
export async function screenshotHandler(
  tabId: string,
  params: ScreenshotParams
): Promise<ResponseMessage> {
  const screenshotType = params.type || 'viewport';
  console.log(`[screenshot-commands] Taking ${screenshotType} screenshot for tab ${tabId}`);
  
  if (!agentTabs[tabId]) {
    return {
      status: 'error',
      error: `No tab found for agent ${tabId}. Initialize a tab first.`
    };
  }
  
  try {
    const chromeTabId = agentTabs[tabId].chromeTabId;
    updateAgentTabActivity(tabId);
    
    // Remember the previous active tab if we need to preserve focus
    let previousActiveTab: number | undefined;
    if (params.preserveFocus) {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0 && activeTabs[0].id !== chromeTabId) {
        previousActiveTab = activeTabs[0].id!;
      }
    }
    
    // Make the tab active (required for proper screenshots)
    await chrome.tabs.update(chromeTabId, { active: true });
    
    // Wait a moment for the tab to become fully visible
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let imageDataUrl: string;
    
    if (screenshotType === 'viewport') {
      // Take a screenshot of the viewport
      // Omit the window ID to use the current window
      imageDataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
    }
    else if (screenshotType === 'page') {
      // ** Limitation: Full page screenshots using debugger are removed. **
      // ** Falling back to viewport screenshot. **
      console.warn('[screenshot-commands] Full page screenshot requested, but debugger is removed. Capturing visible tab instead.');
      imageDataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
    }
    else if (screenshotType === 'element') {
      // Screenshot a specific element
      if (!params.elementId || typeof params.elementId !== 'number') {
        return {
          status: 'error',
          error: 'Element ID is required for element screenshots.'
        };
      }
      
      // Get element info from storage
      const elementInfo = await getElementById(tabId, params.elementId);
      if (!elementInfo) {
        return {
          status: 'error',
          error: `Element with ID ${params.elementId} not found in map.`
        };
      }
      
      // Scroll the element into view if it has a valid selector
      if (elementInfo.selector) {
        try {
          // Use scripting API to scroll
          type ScrollResult = { success: boolean; error?: string };
          // Type the result array, let executeScript infer from the func
          const injectionResults: chrome.scripting.InjectionResult<ScrollResult>[] = await chrome.scripting.executeScript({
            target: { tabId: chromeTabId },
            func: (selector: string): Promise<ScrollResult> => {
              // Define shadow DOM query function inside the injected script
              function querySelectorIncludingShadowDOM(root: Document | Element | ShadowRoot, selector: string): Element | null {
                // Try in the current root
                let element = root.querySelector(selector);
                if (element) return element;
                
                // Search through all shadow roots
                const elements = root.querySelectorAll('*');
                for (const el of elements) {
                  if (el.shadowRoot) {
                    element = querySelectorIncludingShadowDOM(el.shadowRoot, selector);
                    if (element) return element;
                  }
                }
                return null;
              }
              
              const element = querySelectorIncludingShadowDOM(document, selector);
              if (element) {
                element.scrollIntoView({ behavior: 'instant', block: 'center' });
                return Promise.resolve({ success: true });
              }
              return Promise.resolve({ success: false, error: 'Element not found with selector: ' + selector });
            },
            args: [elementInfo.selector]
          });

          // Wait for scroll to complete
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          // Check runtime error as well
          const lastError = chrome.runtime.lastError?.message;
          console.warn(`[screenshot-commands] Error scrolling element into view: ${lastError || error.message || error}`);
          // Continue anyway, we'll try to capture what we can
        }
      }
      
      // ** Limitation: Element clipping using debugger is removed. **
      // ** Always capture the visible tab for element screenshots now. **
      console.warn('[screenshot-commands] Element screenshot requested, but debugger is removed. Capturing visible tab instead.');
      imageDataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
    } else {
      return {
        status: 'error',
        error: `Unsupported screenshot type: ${screenshotType}`
      };
    }
    
    // Restore previous active tab if needed
    if (params.preserveFocus && previousActiveTab) {
      await chrome.tabs.update(previousActiveTab, { active: true });
    }
    
    return {
      status: 'ok',
      result: {
        imageDataUrl,
        screenshotType,
        elementId: params.elementId,
        message: `Successfully captured ${screenshotType} screenshot.`
      }
    };
  } catch (error) {
    console.error(`[screenshot-commands] Screenshot failed for ${tabId}:`, error);
    return {
      status: 'error',
      error: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
