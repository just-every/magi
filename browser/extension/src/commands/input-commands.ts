/**
 * Input-related command handlers (JavaScript execution, typing, key presses).
 */

import { JsEvaluateParams, PressParams, TypeParams, ResponseMessage } from '../types';
import { agentTabs, updateAgentTabActivity } from '../state/state';
// Removed: import { sendDebuggerCommand } from '../debugger/debugger-control';

/**
 * Executes JavaScript in a tab's context
 * @param tabId The agent's tab identifier
 * @param params JavaScript evaluation parameters
 * @returns Promise resolving to a response message with the result
 */
export async function jsEvaluateHandler(
  tabId: string,
  params: JsEvaluateParams
): Promise<ResponseMessage> {
  console.log(`[input-commands] Executing JavaScript in tab ${tabId}`);
  
  if (!params.code || typeof params.code !== 'string') {
    return {
      status: 'error',
      error: 'Valid JavaScript code is required.'
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

    // Execute the code using scripting API
    type EvalResult = any; // The result can be anything
    const injectionResults: chrome.scripting.InjectionResult<EvalResult>[] = await chrome.scripting.executeScript({
      target: { tabId: chromeTabId },
      func: (codeToRun: string) => {
        // Wrap in an async function to handle Promises naturally
        return (async () => {
          try {
            // Use indirect eval in the page context. Be cautious with untrusted code.
            // eslint-disable-next-line no-eval
            const indirectEval = (function() { return eval; })();
            const result = await indirectEval(codeToRun);
            // Basic serialization for non-JSON types
            if (typeof result === 'function') {
              return `[Function: ${result.name || 'anonymous'}]`;
            }
            if (typeof result === 'undefined') {
              return undefined;
            }
            // Attempt to return the value directly; complex objects might not serialize.
            return result;
          } catch (error: any) {
            // Rethrow to capture the error in the extension context
            throw new Error(error.message || String(error));
          }
        })();
      },
      args: [params.code]
    });

    // Check for errors after the call completes
    if (chrome.runtime.lastError) {
      // This catches injection errors or synchronous errors thrown in the func,
      // including those re-thrown from async catch blocks.
      return { status: 'error', error: `JavaScript execution failed: ${chrome.runtime.lastError.message}` };
    }

    // If injectionResults is empty or first result is missing, something unexpected happened
    if (!injectionResults || injectionResults.length === 0 || !injectionResults[0]) {
      // This case might occur if the target frame/tab was invalid
      return { status: 'error', error: 'JavaScript execution failed: No result returned from script injection.' };
    }

    // The actual result from the script (or undefined if it resolved void)
    const finalResult = injectionResults[0].result;
    
    return {
      status: 'ok',
      result: finalResult
    };
  } catch (error) {
    console.error(`[input-commands] JavaScript execution failed for ${tabId}:`, error);
    return {
      status: 'error',
      error: `JavaScript execution failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Types text in the currently focused element
 * @param tabId The agent's tab identifier
 * @param params Typing parameters
 * @returns Promise resolving to a response message
 */
export async function typeHandler(
  tabId: string,
  params: TypeParams
): Promise<ResponseMessage> {
  console.log(`[input-commands] Typing text in tab ${tabId}`);
  
  if (!params.text || typeof params.text !== 'string') {
    return {
      status: 'error',
      error: 'Text to type is required.'
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

    // Inject script to simulate typing
    type TypeResult = { success: boolean; error?: string };
    const injectionResults: chrome.scripting.InjectionResult<TypeResult>[] = await chrome.scripting.executeScript({
      target: { tabId: chromeTabId },
      func: (textToType: string): Promise<TypeResult> => {
        return new Promise(async (resolve) => {
          try {
            const element = document.activeElement as HTMLInputElement | HTMLTextAreaElement | HTMLElement;
            if (!element || !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element.isContentEditable)) {
              return resolve({ success: false, error: 'No suitable active element found for typing (input, textarea, or contenteditable).' });
            }

            element.focus(); // Ensure focus

            for (const char of textToType) {
              const currentValue = (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) ? element.value : element.textContent || '';
              const newValue = currentValue + char;

              if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                element.value = newValue;
              } else {
                element.textContent = newValue;
              }

              // Dispatch events
              element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
              element.dispatchEvent(new Event('change', { bubbles: true, cancelable: false })); // Change typically doesn't bubble or cancel

              // Optional: Dispatch key events (less reliable than debugger)
              // element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
              // element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

              // Small delay
              const delay = 10 + Math.floor(Math.random() * 40); // 10-50ms delay
              await new Promise(r => setTimeout(r, delay));
            }
            resolve({ success: true });
          } catch (err: any) {
            resolve({ success: false, error: err.message });
          }
        });
      },
      args: [params.text]
    });

    const result = injectionResults[0].result;
    if (!result || !result.success) {
      return {
        status: 'error',
        error: `Typing failed: ${result?.error || 'Unknown error'}`
      };
    }
    
    return {
      status: 'ok',
      result: `Successfully typed text: ${params.text.substring(0, 20)}${params.text.length > 20 ? '...' : ''}`
    };
  } catch (error) {
    console.error(`[input-commands] Typing failed for ${tabId}:`, error);
    return {
      status: 'error',
      error: `Typing failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Presses special keys (Enter, Tab, arrows, etc.)
 * @param tabId The agent's tab identifier
 * @param params Key press parameters
 * @returns Promise resolving to a response message
 */
export async function pressHandler(
  tabId: string,
  params: PressParams
): Promise<ResponseMessage> {
  console.log(`[input-commands] Pressing keys in tab ${tabId}: ${params.keys}`);
  
  if (!params.keys || typeof params.keys !== 'string') {
    return {
      status: 'error',
      error: 'Keys to press are required.'
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

    // Inject script to dispatch keyboard events
    type PressResult = { success: boolean; error?: string };
    const injectionResults: chrome.scripting.InjectionResult<PressResult>[] = await chrome.scripting.executeScript({
        target: { tabId: chromeTabId },
        func: (keysToPress: string): PressResult => {
            try {
                const element = document.activeElement || document.body; // Target active element or body
                if (!element || typeof (element as HTMLElement).focus !== 'function') {
                    return { success: false, error: 'No focusable active element found.' };
                }
                (element as HTMLElement).focus(); // Ensure focus

                // --- Logic moved from background script ---
                let key = keysToPress;
                let ctrlKey = false;
                let altKey = false;
                let shiftKey = false;
                let metaKey = false;

                if (keysToPress.includes('+')) {
                    const parts = keysToPress.split('+');
                    key = parts.pop()?.trim() || '';
                    for (const modifier of parts) {
                        const mod = modifier.trim().toLowerCase();
                        if (mod === 'control' || mod === 'ctrl') ctrlKey = true;
                        else if (mod === 'alt') altKey = true;
                        else if (mod === 'shift') shiftKey = true;
                        else if (mod === 'meta' || mod === 'command' || mod === 'cmd') metaKey = true;
                    }
                }

                const keyMap: Record<string, { code: string, key: string }> = {
                    'enter': { code: 'Enter', key: 'Enter' },
                    'return': { code: 'Enter', key: 'Enter' },
                    'tab': { code: 'Tab', key: 'Tab' },
                    'space': { code: 'Space', key: ' ' },
                    'backspace': { code: 'Backspace', key: 'Backspace' },
                    'delete': { code: 'Delete', key: 'Delete' },
                    'escape': { code: 'Escape', key: 'Escape' },
                    'esc': { code: 'Escape', key: 'Escape' },
                    'arrowup': { code: 'ArrowUp', key: 'ArrowUp' },
                    'arrowdown': { code: 'ArrowDown', key: 'ArrowDown' },
                    'arrowleft': { code: 'ArrowLeft', key: 'ArrowLeft' },
                    'arrowright': { code: 'ArrowRight', key: 'ArrowRight' },
                    'home': { code: 'Home', key: 'Home' },
                    'end': { code: 'End', key: 'End' },
                    'pageup': { code: 'PageUp', key: 'PageUp' },
                    'pagedown': { code: 'PageDown', key: 'PageDown' }
                    // Add other keys as needed
                };

                const normalizedKey = key.trim().toLowerCase();
                const keyInfo = keyMap[normalizedKey] || {
                    code: key.length === 1 ? `Key${key.toUpperCase()}` : key, // Guess code for single chars
                    key: key
                };
                // --- End moved logic ---

                const eventOptions = {
                    key: keyInfo.key,
                    code: keyInfo.code,
                    bubbles: true,
                    cancelable: true,
                    ctrlKey: ctrlKey,
                    altKey: altKey,
                    shiftKey: shiftKey,
                    metaKey: metaKey
                };

                // Dispatch keydown
                const keyDownEvent = new KeyboardEvent('keydown', eventOptions);
                const dispatchedDown = element.dispatchEvent(keyDownEvent);

                // Dispatch keyup
                const keyUpEvent = new KeyboardEvent('keyup', eventOptions);
                element.dispatchEvent(keyUpEvent);

                // Note: We can't easily check if the default action was prevented like the debugger could.
                // We assume success if events dispatched without error.
                return { success: true };

            } catch (err: any) {
                return { success: false, error: err.message };
            }
        },
        args: [params.keys]
    });

    const result = injectionResults[0].result;
    if (!result || !result.success) {
      return {
        status: 'error',
        error: `Key press failed: ${result?.error || 'Unknown error'}`
      };
    }
    
    return {
      status: 'ok',
      result: `Successfully pressed: ${params.keys}`
    };
  } catch (error) {
    console.error(`[input-commands] Key press failed for ${tabId}:`, error);
    return {
      status: 'error',
      error: `Key press failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
