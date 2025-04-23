/// <reference types="chrome" />

/**
 * Debugger control for JavaScript evaluation.
 * Used only when necessary to replace eval() functionality.
 */

import { attachedDebuggerTabs } from '../state/state';

// Set up a global listener for debugger detach events to keep our state in sync with Chrome
if (chrome?.debugger?.onDetach) {
    chrome.debugger.onDetach.addListener((source, reason) => {
        if (source.tabId !== undefined) {
            attachedDebuggerTabs.delete(source.tabId);
            tabsWithViewportSet.delete(source.tabId);
            console.log(
                `[debugger-control] onDetach: debugger removed from tab ${source.tabId} (${reason})`
            );
        }
    });
}

/**
 * Attaches the debugger to a specific tab if not already tracked as attached.
 * Uses the shared 'attachedDebuggerTabs' Set for state.
 * @param chromeTabId The target Chrome tab ID.
 * @returns Promise resolving to true if attached successfully or already attached, false on failure.
 */
export async function attachDebugger(chromeTabId: number): Promise<boolean> {
    if (attachedDebuggerTabs.has(chromeTabId)) {
        console.log(
            `[debugger-control] Debugger already attached to tab ${chromeTabId} (tracked in state).`
        );
        return true; // Already attached according to our state
    }

    try {
        // First, ensure any existing debugger is detached
        try {
            await chrome.debugger.detach({ tabId: chromeTabId });
            console.log(
                `[debugger-control] Successfully detached any existing debugger from tab ${chromeTabId}.`
            );
        } catch (detachError) {
            // Ignore errors when detaching, as there might not be one attached
            if (
                !(detachError instanceof Error) ||
                !detachError.message.includes('No debugger')
            ) {
                console.log(
                    `[debugger-control] No active debugger to detach from tab ${chromeTabId} or already detached.`
                );
            }
        }

        // Attempt to attach using the Chrome Debugger API
        await chrome.debugger.attach({ tabId: chromeTabId }, '1.3');

        // If successful, update our state
        attachedDebuggerTabs.add(chromeTabId);
        console.log(
            `[debugger-control] Debugger successfully attached to tab ${chromeTabId} and state updated.`
        );
        return true;
    } catch (error) {
        // Log the specific error from chrome.debugger.attach
        console.error(
            `[debugger-control] Failed to attach debugger API to tab ${chromeTabId}:`,
            error
        );
        // Ensure state reflects failure
        attachedDebuggerTabs.delete(chromeTabId); // Remove if partially added or ensure it's not there
        return false; // Indicate failure
    }
}

/**
 * Sends a command to the debugger attached to a specific tab.
 * Assumes the debugger is already attached (use attachDebugger first).
 * @param chromeTabId The target Chrome tab ID.
 * @param method The debugger protocol method name (e.g., 'Input.dispatchMouseEvent').
 * @param commandParams Optional parameters for the command.
 * @returns Promise resolving to the command result.
 * @throws Error if sending the command fails.
 */
export async function sendDebuggerCommand<T = unknown>(
    chromeTabId: number,
    method: string,
    commandParams?: object
): Promise<T> {
    if (!attachedDebuggerTabs.has(chromeTabId)) {
        console.warn(
            `[debugger-control] Attempted to send command "${method}" to tab ${chromeTabId} but debugger is not tracked as attached.`
        );
        // Decide whether to throw or try anyway. Let's try anyway but log warning.
        // throw new Error(`Debugger not attached to tab ${chromeTabId}. Cannot send command.`);
    }

    try {
        console.log(
            `[debugger-control] Sending command "${method}" to tab ${chromeTabId}`
        );
        const result = await chrome.debugger.sendCommand(
            { tabId: chromeTabId },
            method,
            commandParams
        );
        // Cast the result to the expected type T
        return result as T;
    } catch (error) {
        // Check if the error is about the debugger not being attached
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('Debugger is not attached')) {
            console.warn(
                `[debugger-control] Detected detached debugger for tab ${chromeTabId}. Re-attaching and retrying "${method}"...`
            );
            // Update our state and reattach
            attachedDebuggerTabs.delete(chromeTabId);
            await attachDebugger(chromeTabId);

            // Retry the command once
            try {
                const retryResult = await chrome.debugger.sendCommand(
                    { tabId: chromeTabId },
                    method,
                    commandParams
                );
                console.log(
                    `[debugger-control] Command "${method}" successfully retried after reattaching debugger`
                );
                return retryResult as T;
            } catch (retryError) {
                console.error(
                    `[debugger-control] Retry failed for command "${method}" to tab ${chromeTabId}:`,
                    retryError
                );
                throw retryError;
            }
        }

        console.error(
            `[debugger-control] Failed to send command "${method}" to tab ${chromeTabId}:`,
            error
        );
        // Re-throw the error to be handled by the caller
        throw error;
    }
}

/**
 * Detaches the debugger from a specific tab if tracked as attached.
 * Uses the shared 'attachedDebuggerTabs' Set for state.
 * @param chromeTabId The target Chrome tab ID.
 * @returns Promise resolving to true if detached successfully or already detached, false on failure.
 */
export async function detachDebugger(chromeTabId: number): Promise<boolean> {
    clearViewportSizeTracking(chromeTabId);
    if (!attachedDebuggerTabs.has(chromeTabId)) {
        console.log(
            `[debugger-control] Debugger not attached to tab ${chromeTabId} (tracked in state), skipping detach.`
        );
        return true; // Already detached according to our state
    }

    try {
        // Attempt to detach using the Chrome Debugger API
        await chrome.debugger.detach({ tabId: chromeTabId });
        // If successful, update our state
        attachedDebuggerTabs.delete(chromeTabId);
        console.log(
            `[debugger-control] Debugger successfully detached from tab ${chromeTabId} and state updated.`
        );
        return true;
    } catch (error) {
        // Log the specific error from chrome.debugger.detach
        console.error(
            `[debugger-control] Failed to detach debugger API from tab ${chromeTabId}:`,
            error
        );
        // Optionally, attempt to remove from state even if detach API failed,
        // though it might indicate a deeper issue. For robustness:
        // attachedDebuggerTabs.delete(chromeTabId);
        return false; // Indicate failure
    }
}

/**
 * Evaluates JavaScript code in a tab using the chrome.debugger API.
 * Handles attachment, execution, result parsing, and detachment using helper functions.
 *
 * @param chromeTabId The target Chrome tab ID.
 * @param code The JavaScript code string to evaluate.
 * @returns Promise resolving to the evaluation result.
 * @throws Error if debugger interaction fails or the evaluated code throws an exception.
 */
// Track tabs with viewport already configured
const tabsWithViewportSet = new Set<number>();

/**
 * Ensures a tab has the standard viewport size set
 * @param chromeTabId The target Chrome tab ID
 * @returns Promise resolving to true if successful
 */
export async function ensureViewportSize(
    chromeTabId: number
): Promise<boolean> {
    if (tabsWithViewportSet.has(chromeTabId)) {
        console.log(
            `[debugger-control] Viewport already set for tab ${chromeTabId}`
        );
        return true;
    }

    if (!attachedDebuggerTabs.has(chromeTabId)) {
        console.log(
            `[debugger-control] Debugger not attached to tab ${chromeTabId}, can't set viewport`
        );
        return false;
    }

    try {
        await sendDebuggerCommand(
            chromeTabId,
            'Emulation.setDeviceMetricsOverride',
            {
                width: 1024,
                height: 768,
                deviceScaleFactor: 1,
                mobile: false,
            }
        );

        tabsWithViewportSet.add(chromeTabId);
        console.log(
            `[debugger-control] Viewport size set for tab ${chromeTabId}`
        );
        return true;
    } catch (error) {
        console.error(
            `[debugger-control] Failed to set viewport size for tab ${chromeTabId}:`,
            error
        );
        return false;
    }
}

/**
 * Clears the viewport size tracking for a tab
 * @param chromeTabId The target Chrome tab ID
 */
export function clearViewportSizeTracking(chromeTabId: number): void {
    tabsWithViewportSet.delete(chromeTabId);
}

export async function evaluateJavaScriptWithDebugger(
    chromeTabId: number,
    code: string
): Promise<unknown> {
    // Check if the code contains potentially problematic canvas operations
    const containsCanvasOperations =
        /drawImage|createImageBitmap|getImageData|toDataURL/.test(code);
    const containsDomCapture = /captureVisibleTab|captureTab|screenshot/.test(
        code
    );

    if (containsCanvasOperations) {
        console.log(
            `[debugger-control] Note: Code contains canvas operations which may need careful error handling`
        );
    }

    if (containsDomCapture) {
        console.log(
            `[debugger-control] Note: Code contains DOM/tab capture operations which may need permissions`
        );
    }

    let newlyAttached = false;

    try {
        // Only attach if not already attached
        if (!attachedDebuggerTabs.has(chromeTabId)) {
            // Attach debugger using the helper function which manages state
            const attached = await attachDebugger(chromeTabId);
            if (!attached) {
                // If attachDebugger failed (returned false)
                throw new Error(
                    `Failed to attach debugger to tab ${chromeTabId}.`
                );
            }
            newlyAttached = true;
        }

        console.log(
            `[debugger-control] Sending Runtime.evaluate to tab ${chromeTabId}`
        );

        // If the code contains canvas operations, wrap it in try/catch
        let codeToEvaluate = code;
        if (containsCanvasOperations || containsDomCapture) {
            codeToEvaluate = `
        try {
          ${code}
        } catch (e) {
          if (e instanceof TypeError && e.message &&
             (e.message.includes('drawImage') ||
              e.message.includes('HTMLCanvasElement') ||
              e.message.includes('ImageBitmap') ||
              e.message.includes('CSSImageValue'))) {
            return { __error__: true, message: 'Canvas image operation failed: ' + e.message };
          }
          throw e; // Re-throw other errors
        }
      `;
        }

        // Execute the code using Runtime.evaluate
        const commandResult = await chrome.debugger.sendCommand(
            { tabId: chromeTabId },
            'Runtime.evaluate',
            {
                expression: codeToEvaluate,
                returnByValue: true, // Get a serializable value instead of an object reference
                awaitPromise: true, // Wait for promises returned by the expression to resolve
                userGesture: true, // Treat evaluation as user interaction where possible
                silent: false, // Set to true to not report exceptions as console messages in the target
            }
        );

        console.log(
            `[debugger-control] Received result from Runtime.evaluate for tab ${chromeTabId}`
        );

        // --- CRITICAL: Check for exceptions thrown by the evaluated code ---
        // Use 'any' as a workaround for unresolved Runtime types
        type DebuggerEvaluateResult = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result: any; // This holds the successful result
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            exceptionDetails?: any; // This holds error info if the code failed
        };
        const evalResult = commandResult as DebuggerEvaluateResult;

        if (evalResult.exceptionDetails) {
            console.error(
                `[debugger-control] Exception during code evaluation in tab ${chromeTabId}:`,
                evalResult.exceptionDetails
            );
            let errorMessage = 'JavaScript execution failed';

            // Enhanced error reporting for canvas/image errors
            if (evalResult.exceptionDetails.exception?.description) {
                const description =
                    evalResult.exceptionDetails.exception.description;
                errorMessage += `: ${description}`;

                // Special handling for canvas/image type errors
                if (
                    description.includes('drawImage') ||
                    description.includes('HTMLCanvasElement') ||
                    description.includes('ImageBitmap') ||
                    description.includes('CanvasRenderingContext2D')
                ) {
                    errorMessage = `Canvas operation failed: ${description}`;
                }
            } else if (evalResult.exceptionDetails.text) {
                errorMessage += `: ${evalResult.exceptionDetails.text}`;
            }

            throw new Error(errorMessage); // Propagate error
        }

        // --- Process Successful Result ---
        const remoteObject = evalResult.result;
        if (!remoteObject) {
            console.warn(
                `[debugger-control] No result or exception details found for tab ${chromeTabId}.`
            );
            return undefined;
        }

        // Handle special case of our wrapped error for canvas operations
        if (
            remoteObject.type === 'object' &&
            remoteObject.value &&
            remoteObject.value.__error__
        ) {
            console.warn(
                `[debugger-control] Caught and handled canvas error: ${remoteObject.value.message}`
            );
            throw new Error(remoteObject.value.message);
        }

        // Extract the actual value based on the type (remoteObject is now 'any')
        switch (
            remoteObject?.type // Add optional chaining for safety
        ) {
            case 'undefined':
                return undefined;
            case 'object':
                if (remoteObject.subtype === 'null') return null;
                return remoteObject.value; // returnByValue gives the value directly
            case 'function':
                return remoteObject.description || '[Function]';
            case 'string':
            case 'number':
            case 'boolean':
            case 'bigint':
            case 'symbol':
                return remoteObject.value;
            default:
                console.warn(
                    `[debugger-control] Unhandled remote object type: ${remoteObject.type} for tab ${chromeTabId}`
                );
                return remoteObject.description || remoteObject.value; // Fallback
        }
    } catch (error: unknown) {
        // Catch errors from attachDebugger, sendCommand, or the exception check above
        console.error(
            `[debugger-control] Error during debugger operation for tab ${chromeTabId}:`,
            error
        );

        // Only detach if we newly attached and encountered an error
        if (newlyAttached) {
            try {
                await detachDebugger(chromeTabId);
                console.log(
                    `[debugger-control] Detached debugger after error for tab ${chromeTabId}`
                );
            } catch (detachError) {
                console.error(
                    `[debugger-control] Failed to detach debugger after error: ${detachError}`
                );
            }
        }

        throw error; // Re-throw to be handled by jsEvaluateHandler
    }
    // No finally block with detachDebugger - we keep it attached
}
