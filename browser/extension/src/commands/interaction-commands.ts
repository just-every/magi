/**
 * Element interaction command handlers.
 */

import { ResponseMessage, InteractElementParams } from '../types';
import { agentTabs, updateAgentTabActivity } from '../state/state';
import { getElementById } from '../storage/element-storage';
import { querySelectorAcrossShadows } from '../utils/shadow-dom-utils';

/**
 * Interacts with a specific element on the page
 * @param tabId The agent's tab identifier
 * @param params Element interaction parameters
 * @returns Promise resolving to a response message
 */
export async function interactElementHandler(
  tabId: string,
  params: InteractElementParams
): Promise<ResponseMessage> {
  console.log(`[interaction-commands] Interacting with element ${params.elementId} in tab ${tabId} using action: ${params.action}`);
  
  if (!params.elementId || typeof params.elementId !== 'number') {
    return {
      status: 'error',
      error: 'Valid element ID is required.'
    };
  }
  
  if (!agentTabs[tabId]) {
    return {
      status: 'error',
      error: `No tab found for agent ${tabId}. Initialize a tab first.`
    };
  }
  
  try {
    const chromeTabId = agentTabs[tabId].chromeTabId;
    updateAgentTabActivity(tabId);
    
    // Get element info from storage
    const elementInfo = await getElementById(tabId, params.elementId);
    if (!elementInfo) {
      return {
        status: 'error',
        error: `Element with ID ${params.elementId} not found in map.`
      };
    }
    
    // Get element by selector using CDP
    if (!elementInfo.selector) {
      return {
        status: 'error',
        error: `Element with ID ${params.elementId} has no valid selector.`
      };
    }
    
    // Execute different actions based on the action type
    switch (params.action) {
      case 'click': {
        // Get the element and click it
        type ClickResult = { success: boolean; error?: string };
        // Let executeScript infer the result type from the func's Promise resolution
        const injectionResults: chrome.scripting.InjectionResult<ClickResult>[] = await chrome.scripting.executeScript({
          target: { tabId: chromeTabId },
          func: (selector: string): Promise<ClickResult> => {
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
            if (!element) return Promise.resolve({ success: false, error: 'Element not found with selector: ' + selector });

            try {
              // Scroll into view
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });

              // Wait for scroll to complete
              return new Promise(resolve => {
                setTimeout(() => {
                  try {
                    // Use click() method for more reliable clicking
                    (element as HTMLElement).click(); // Cast to HTMLElement for click()
                    resolve({ success: true });
                  } catch (err: any) {
                    resolve({ success: false, error: err.message });
                  }
                }, 100);
              });
            } catch (err: any) {
              return Promise.resolve({ success: false, error: err.message });
            }
          },
          args: [elementInfo.selector]
        });

        // executeScript returns an array of results, one per frame. Assume main frame [0].
        const result = injectionResults[0].result;
        if (!result || !result.success) {
          return {
            status: 'error',
            error: `Failed to click element: ${result.error || 'Unknown error'}` // Access error directly now
          };
        }
        
        return {
          status: 'ok',
          result: `Successfully clicked element ${params.elementId} (${elementInfo.tagName}: ${elementInfo.description}).`
        };
      }
      
      case 'fill': {
        if (typeof params.value !== 'string') {
          return {
            status: 'error',
            error: 'Text value is required for fill action.'
          };
        }
        
        // Get the element and fill it
        type FillResult = { success: boolean; error?: string };
        const injectionResults: chrome.scripting.InjectionResult<FillResult>[] = await chrome.scripting.executeScript({
          target: { tabId: chromeTabId },
          func: (selector: string, value: string): Promise<FillResult> => {
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
            if (!element) return Promise.resolve({ success: false, error: 'Element not found with selector: ' + selector });

            try {
              // Scroll into view
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });

              // Wait for scroll to complete
              return new Promise(resolve => {
                setTimeout(() => {
                  try {
                    // Focus the element
                    if (typeof (element as HTMLElement).focus === 'function') {
                       (element as HTMLElement).focus();
                    }

                    // Clear and set new value
                    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                      element.value = ''; // Clear
                      element.value = value; // Set
                      // Dispatch events
                      element.dispatchEvent(new Event('input', { bubbles: true }));
                      element.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if ((element as HTMLElement).isContentEditable) {
                      // For contenteditable
                      element.textContent = value;
                      element.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                       return resolve({ success: false, error: 'Element is not an input, textarea, or contenteditable' });
                    }

                    resolve({ success: true });
                  } catch (err: any) {
                    resolve({ success: false, error: err.message });
                  }
                }, 100);
              });
            } catch (err: any) {
              return Promise.resolve({ success: false, error: err.message });
            }
          },
          args: [elementInfo.selector, params.value]
        });

        const result = injectionResults[0].result;
        if (!result || !result.success) {
          return {
            status: 'error',
            error: `Failed to fill element: ${result.error || 'Unknown error'}`
          };
        }
        
        return {
          status: 'ok',
          result: `Successfully filled element ${params.elementId} (${elementInfo.tagName}: ${elementInfo.description}) with text: ${params.value.substring(0, 20)}${params.value.length > 20 ? '...' : ''}`
        };
      }
      
      case 'check': {
        if (typeof params.checked !== 'boolean') {
          return {
            status: 'error',
            error: 'Boolean checked value is required for check action.'
          };
        }
        
        // Get the element and check/uncheck it
        type CheckResult = { success: boolean; error?: string };
        const injectionResults: chrome.scripting.InjectionResult<CheckResult>[] = await chrome.scripting.executeScript({
          target: { tabId: chromeTabId },
          func: (selector: string, checked: boolean): Promise<CheckResult> => {
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
            if (!element) return Promise.resolve({ success: false, error: 'Element not found with selector: ' + selector });

            try {
              // Scroll into view
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });

              // Wait for scroll to complete
              return new Promise(resolve => {
                setTimeout(() => {
                  try {
                    const inputElement = element as HTMLInputElement; // Cast for checkable properties
                    // Only proceed if this is a checkbox, radio, or has role="checkbox"
                    const isCheckable = (
                      (inputElement.tagName === 'INPUT' &&
                       (inputElement.type === 'checkbox' || inputElement.type === 'radio')) ||
                      inputElement.getAttribute('role') === 'checkbox' ||
                      inputElement.getAttribute('role') === 'radio'
                    );

                    if (!isCheckable) {
                      return resolve({
                        success: false,
                        error: 'Element is not a checkbox or radio button'
                      });
                    }

                    // Set the checked state
                    if (inputElement.checked !== checked) {
                      inputElement.click(); // Use click to toggle state naturally
                    }

                    // Verify the state was set correctly
                    setTimeout(() => {
                      const isNowChecked = inputElement.checked === checked;
                      resolve({
                        success: isNowChecked,
                        error: isNowChecked ? undefined : 'Failed to set checked state' // Use undefined for no error
                      });
                    }, 50);
                  } catch (err: any) {
                    resolve({ success: false, error: err.message });
                  }
                }, 100);
              });
            } catch (err: any) {
              return Promise.resolve({ success: false, error: err.message });
            }
          },
          args: [elementInfo.selector, params.checked]
        });

        const result = injectionResults[0].result;
        if (!result || !result.success) {
          return {
            status: 'error',
            error: `Failed to ${params.checked ? 'check' : 'uncheck'} element: ${result.error || 'Unknown error'}`
          };
        }
        
        return {
          status: 'ok',
          result: `Successfully ${params.checked ? 'checked' : 'unchecked'} element ${params.elementId} (${elementInfo.tagName}: ${elementInfo.description}).`
        };
      }
      
      case 'hover': {
        // Get the element and hover over it
        type HoverResult = { success: boolean; error?: string };
        const injectionResults: chrome.scripting.InjectionResult<HoverResult>[] = await chrome.scripting.executeScript({
          target: { tabId: chromeTabId },
          func: (selector: string): Promise<HoverResult> => {
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
            if (!element) return Promise.resolve({ success: false, error: 'Element not found with selector: ' + selector });

            try {
              // Scroll into view
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });

              // Wait for scroll to complete
              return new Promise(resolve => {
                setTimeout(() => {
                  try {
                    // Dispatch mouseenter and mouseover events
                    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

                    resolve({ success: true });
                  } catch (err: any) {
                    resolve({ success: false, error: err.message });
                  }
                }, 100);
              });
            } catch (err: any) {
              return Promise.resolve({ success: false, error: err.message });
            }
          },
          args: [elementInfo.selector]
        });

        const result = injectionResults[0].result;
        if (!result || !result.success) {
          return {
            status: 'error',
            error: `Failed to hover over element: ${result.error || 'Unknown error'}`
          };
        }
        
        return {
          status: 'ok',
          result: `Successfully hovered over element ${params.elementId} (${elementInfo.tagName}: ${elementInfo.description}).`
        };
      }
      
      case 'focus': {
        // Get the element and focus it
        type FocusResult = { success: boolean; error?: string };
        const injectionResults: chrome.scripting.InjectionResult<FocusResult>[] = await chrome.scripting.executeScript({
          target: { tabId: chromeTabId },
          func: (selector: string): Promise<FocusResult> => {
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
            
            const element = querySelectorIncludingShadowDOM(document, selector) as HTMLElement; // Cast for focus()
            if (!element) return Promise.resolve({ success: false, error: 'Element not found with selector: ' + selector });

            try {
              // Scroll into view
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });

              // Wait for scroll to complete
              return new Promise(resolve => {
                setTimeout(() => {
                  try {
                    // Focus the element
                    element.focus();

                    // Check if element is now focused
                    const isFocused = document.activeElement === element;

                    resolve({ success: isFocused, error: isFocused ? undefined : 'Element could not be focused' });
                  } catch (err: any) {
                    resolve({ success: false, error: err.message });
                  }
                }, 100);
              });
            } catch (err: any) {
              return Promise.resolve({ success: false, error: err.message });
            }
          },
          args: [elementInfo.selector]
        });

        const result = injectionResults[0].result;
        if (!result || !result.success) {
          return {
            status: 'error',
            error: `Failed to focus element: ${result.error || 'Unknown error'}`
          };
        }
        
        return {
          status: 'ok',
          result: `Successfully focused element ${params.elementId} (${elementInfo.tagName}: ${elementInfo.description}).`
        };
      }
      
      case 'scroll': {
        // Get the element and scroll it into view
        // Note: Even for sync cases, let's return a Promise for consistency.
        type ScrollResult = { success: boolean; error?: string };
        const injectionResults: chrome.scripting.InjectionResult<ScrollResult>[] = await chrome.scripting.executeScript({
          target: { tabId: chromeTabId },
          func: (selector: string): Promise<ScrollResult> => { // Return Promise
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
            if (!element) return Promise.resolve({ success: false, error: 'Element not found with selector: ' + selector });

            try {
              // Scroll into view
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Simple scroll doesn't need async, but we resolve the promise
              return Promise.resolve({ success: true });
            } catch (err: any) {
              return Promise.resolve({ success: false, error: err.message });
            }
          },
          args: [elementInfo.selector]
        });

        const result = injectionResults[0].result;
        if (!result || !result.success) {
          return {
            status: 'error',
            error: `Failed to scroll element into view: ${result.error || 'Unknown error'}` // Keep optional chaining just in case result is null/undefined
          };
        }
        
        return {
          status: 'ok',
          result: `Successfully scrolled element ${params.elementId} (${elementInfo.tagName}: ${elementInfo.description}) into view.`
        };
      }
      
      case 'select_option': {
        if (typeof params.value !== 'string') {
          return {
            status: 'error',
            error: 'Option value or text is required for select_option action.'
          };
        }
        
        // Get the element and select the option
        type SelectResult = { success: boolean; error?: string };
        const injectionResults: chrome.scripting.InjectionResult<SelectResult>[] = await chrome.scripting.executeScript({
          target: { tabId: chromeTabId },
          func: (selector: string, valueToSelect: string): Promise<SelectResult> => {
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
            
            const select = querySelectorIncludingShadowDOM(document, selector) as HTMLSelectElement; // Cast for options/value
            if (!select) return Promise.resolve({ success: false, error: 'Select element not found with selector: ' + selector });

            if (select.tagName !== 'SELECT') {
              return Promise.resolve({ success: false, error: 'Element is not a select element' });
            }

            try {
              // Scroll into view
              select.scrollIntoView({ behavior: 'smooth', block: 'center' });

              // Wait for scroll to complete
              return new Promise(resolve => {
                setTimeout(() => {
                  try {
                    let optionFound = false;

                    // Try to find option matching by value, text, or label
                    for (const option of select.options) {
                      if (
                        option.value === valueToSelect ||
                        option.text === valueToSelect ||
                        option.label === valueToSelect
                      ) {
                        // Set the selected option
                        select.value = option.value;
                        optionFound = true;
                        break;
                      }
                    }

                    if (!optionFound) {
                      return resolve({
                        success: false,
                        error: 'No matching option found with value, text, or label: ' + valueToSelect
                      });
                    }

                    // Dispatch change event
                    select.dispatchEvent(new Event('change', { bubbles: true }));

                    resolve({ success: true });
                  } catch (err: any) {
                    resolve({ success: false, error: err.message });
                  }
                }, 100);
              });
            } catch (err: any) {
              return Promise.resolve({ success: false, error: err.message });
            }
          },
          args: [elementInfo.selector, params.value]
        });

        const result = injectionResults[0].result;
        if (!result || !result.success) {
          return {
            status: 'error',
            error: `Failed to select option: ${result.error || 'Unknown error'}`
          };
        }
        
        return {
          status: 'ok',
          result: `Successfully selected option "${params.value}" in element ${params.elementId} (${elementInfo.tagName}: ${elementInfo.description}).`
        };
      }
      
      default:
        return {
          status: 'error',
          error: `Unsupported action: ${params.action}`
        };
    }
  } catch (error) {
    console.error(`[interaction-commands] Element interaction failed for ${tabId}:`, error);
    return {
      status: 'error',
      error: `Element interaction failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
