/**
 * Input-related command handlers (JavaScript execution, typing, key presses).
 */

import {
    JsEvaluateParams,
    PressParams,
    TypeParams,
    ResponseMessage,
} from '../types';
import { agentTabs, updateAgentTabActivity } from '../state/state';
import { evaluateJavaScriptWithDebugger } from '../debugger/debugger-control';

/**
 * Executes arbitrary JavaScript in a tab's context using the chrome.debugger API.
 * Requires the "debugger" permission in manifest.json.
 *
 * @param tabId The agent's tab identifier.
 * @param params JavaScript evaluation parameters containing the code string.
 * @returns Promise resolving to a response message with the result or error.
 */
export async function jsEvaluateHandler(
    tabId: string,
    params: JsEvaluateParams
): Promise<ResponseMessage> {
    console.log(
        `[input-commands] jsEvaluateHandler entered for tab ${tabId} with code: ${params.code.substring(0, 100)}${params.code.length > 100 ? '...' : ''}`
    );

    // --- Input Validation ---
    if (
        !params ||
        typeof params.code !== 'string' ||
        params.code.trim() === ''
    ) {
        console.error(
            `[input-commands] jsEvaluateHandler validation failed: Invalid code parameter.`
        );
        return {
            status: 'error',
            error: 'Valid, non-empty JavaScript code string is required.',
        };
    }

    const agentTabInfo = agentTabs[tabId];
    if (!agentTabInfo) {
        console.error(
            `[input-commands] jsEvaluateHandler failed: No tab info found for agent ${tabId}.`
        );
        return {
            status: 'error',
            error: `No tab found for agent ${tabId}. Initialize a tab first.`,
        };
    }

    const chromeTabId = agentTabInfo.chromeTabId;
    updateAgentTabActivity(tabId); // Update activity timestamp

    // --- Execution via Debugger API ---
    // This is the primary method for executing arbitrary code strings in MV3
    // when chrome.scripting.executeScript is insufficient due to CSP/eval restrictions.
    console.log(
        `[input-commands] Attempting JavaScript execution via Debugger API for tab ${chromeTabId}. Requires 'debugger' permission.`
    );
    try {
        // Call the dedicated function to handle debugger interaction
        const result = await evaluateJavaScriptWithDebugger(
            chromeTabId,
            params.code
        );

        console.log(
            `[input-commands] jsEvaluateHandler (debugger) success for tab ${tabId}. Result:`,
            result
        );
        return {
            status: 'ok',
            result:
                typeof result === 'undefined'
                    ? 'Run without error'
                    : JSON.stringify(result, null, 2), // Pass the result obtained from the debugger
        };
    } catch (debuggerError: unknown) {
        // Catch errors from evaluateJavaScriptWithDebugger (attach failure, command failure, code execution exception)
        const errorMessage =
            debuggerError instanceof Error
                ? debuggerError.message
                : String(debuggerError);
        console.error(
            `[input-commands] jsEvaluateHandler (debugger) caught error for tab ${tabId}:`,
            errorMessage
        );

        // Provide a structured error response
        return {
            status: 'error',
            error: `JavaScript execution via debugger failed: ${errorMessage}`,
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
            error: 'Text to type is required.',
        };
    }

    if (!agentTabs[tabId]) {
        return {
            status: 'error',
            error: `No tab found for agent ${tabId}. Initialize a tab first.`,
        };
    }

    try {
        const chromeTabId = agentTabs[tabId].chromeTabId;
        updateAgentTabActivity(tabId);

        // Inject script to simulate typing
        type TypeResult = { success: boolean; error?: string };
        const injectionResults: chrome.scripting.InjectionResult<TypeResult>[] =
            await chrome.scripting.executeScript({
                target: { tabId: chromeTabId },
                func: (textToType: string): Promise<TypeResult> => {
                    // Use a regular Promise with non-async executor and handle typing sequentially
                    return new Promise(resolve => {
                        try {
                            const element = document.activeElement as
                                | HTMLInputElement
                                | HTMLTextAreaElement
                                | HTMLElement;
                            if (
                                !element ||
                                !(
                                    element instanceof HTMLInputElement ||
                                    element instanceof HTMLTextAreaElement ||
                                    element.isContentEditable
                                )
                            ) {
                                return resolve({
                                    success: false,
                                    error: 'No suitable active element found for typing (input, textarea, or contenteditable).',
                                });
                            }

                            element.focus(); // Ensure focus

                            // Type characters sequentially using setTimeout instead of await
                            const typeNextChar = (index: number) => {
                                if (index >= textToType.length) {
                                    resolve({ success: true });
                                    return;
                                }

                                const char = textToType[index];
                                const currentValue =
                                    element instanceof HTMLInputElement ||
                                    element instanceof HTMLTextAreaElement
                                        ? element.value
                                        : element.textContent || '';
                                const newValue = currentValue + char;

                                if (
                                    element instanceof HTMLInputElement ||
                                    element instanceof HTMLTextAreaElement
                                ) {
                                    element.value = newValue;
                                } else {
                                    element.textContent = newValue;
                                }

                                // Dispatch events
                                element.dispatchEvent(
                                    new Event('input', {
                                        bubbles: true,
                                        cancelable: true,
                                    })
                                );
                                element.dispatchEvent(
                                    new Event('change', {
                                        bubbles: true,
                                        cancelable: false,
                                    })
                                );

                                // Random delay between 10-50ms
                                const delay =
                                    10 + Math.floor(Math.random() * 40);
                                setTimeout(
                                    () => typeNextChar(index + 1),
                                    delay
                                );
                            };

                            // Start typing the first character
                            typeNextChar(0);
                        } catch (err: unknown) {
                            const errorMessage =
                                err instanceof Error
                                    ? err.message
                                    : String(err);
                            resolve({ success: false, error: errorMessage });
                        }
                    });
                },
                args: [params.text],
            });

        const result = injectionResults[0].result;
        if (!result || !result.success) {
            return {
                status: 'error',
                error: `Typing failed: ${result?.error || 'Unknown error'}`,
            };
        }

        return {
            status: 'ok',
            result: `Successfully typed text: ${params.text.substring(0, 20)}${params.text.length > 20 ? '...' : ''}`,
        };
    } catch (error) {
        console.error(`[input-commands] Typing failed for ${tabId}:`, error);
        return {
            status: 'error',
            error: `Typing failed: ${error instanceof Error ? error.message : String(error)}`,
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
    console.log(
        `[input-commands] Pressing keys in tab ${tabId}: ${params.keys}`
    );

    if (!params.keys || typeof params.keys !== 'string') {
        return {
            status: 'error',
            error: 'Keys to press are required.',
        };
    }

    if (!agentTabs[tabId]) {
        return {
            status: 'error',
            error: `No tab found for agent ${tabId}. Initialize a tab first.`,
        };
    }

    try {
        const chromeTabId = agentTabs[tabId].chromeTabId;
        updateAgentTabActivity(tabId);

        // Inject script to dispatch keyboard events
        type PressResult = { success: boolean; error?: string };
        const injectionResults: chrome.scripting.InjectionResult<PressResult>[] =
            await chrome.scripting.executeScript({
                target: { tabId: chromeTabId },
                func: (keysToPress: string): PressResult => {
                    try {
                        const element = document.activeElement || document.body; // Target active element or body
                        if (
                            !element ||
                            typeof (element as HTMLElement).focus !== 'function'
                        ) {
                            return {
                                success: false,
                                error: 'No focusable active element found.',
                            };
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
                                if (mod === 'control' || mod === 'ctrl')
                                    ctrlKey = true;
                                else if (mod === 'alt') altKey = true;
                                else if (mod === 'shift') shiftKey = true;
                                else if (
                                    mod === 'meta' ||
                                    mod === 'command' ||
                                    mod === 'cmd'
                                )
                                    metaKey = true;
                            }
                        }

                        const keyMap: Record<
                            string,
                            { code: string; key: string }
                        > = {
                            enter: { code: 'Enter', key: 'Enter' },
                            return: { code: 'Enter', key: 'Enter' },
                            tab: { code: 'Tab', key: 'Tab' },
                            space: { code: 'Space', key: ' ' },
                            backspace: { code: 'Backspace', key: 'Backspace' },
                            delete: { code: 'Delete', key: 'Delete' },
                            escape: { code: 'Escape', key: 'Escape' },
                            esc: { code: 'Escape', key: 'Escape' },
                            arrowup: { code: 'ArrowUp', key: 'ArrowUp' },
                            arrowdown: { code: 'ArrowDown', key: 'ArrowDown' },
                            arrowleft: { code: 'ArrowLeft', key: 'ArrowLeft' },
                            arrowright: {
                                code: 'ArrowRight',
                                key: 'ArrowRight',
                            },
                            home: { code: 'Home', key: 'Home' },
                            end: { code: 'End', key: 'End' },
                            pageup: { code: 'PageUp', key: 'PageUp' },
                            pagedown: { code: 'PageDown', key: 'PageDown' },
                            // Add other keys as needed
                        };

                        const normalizedKey = key.trim().toLowerCase();
                        const keyInfo = keyMap[normalizedKey] || {
                            code:
                                key.length === 1
                                    ? `Key${key.toUpperCase()}`
                                    : key, // Guess code for single chars
                            key: key,
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
                            metaKey: metaKey,
                        };

                        // Dispatch keydown
                        const keyDownEvent = new KeyboardEvent(
                            'keydown',
                            eventOptions
                        );
                        element.dispatchEvent(keyDownEvent);

                        // Dispatch keyup
                        const keyUpEvent = new KeyboardEvent(
                            'keyup',
                            eventOptions
                        );
                        element.dispatchEvent(keyUpEvent);

                        // Note: We can't easily check if the default action was prevented like the debugger could.
                        // We assume success if events dispatched without error.
                        return { success: true };
                    } catch (err: unknown) {
                        const errorMessage =
                            err instanceof Error ? err.message : String(err);
                        return { success: false, error: errorMessage };
                    }
                },
                args: [params.keys],
            });

        const result = injectionResults[0].result;
        if (!result || !result.success) {
            return {
                status: 'error',
                error: `Key press failed: ${result?.error || 'Unknown error'}`,
            };
        }

        return {
            status: 'ok',
            result: `Successfully pressed: ${params.keys}`,
        };
    } catch (error) {
        console.error(`[input-commands] Key press failed for ${tabId}:`, error);
        return {
            status: 'error',
            error: `Key press failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
