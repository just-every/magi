/**
 * Native messaging communication for the MAGI browser extension.
 */

import { NativeMessage, ResponseMessage } from '../types';
import { NATIVE_HOST_NAME } from '../config/config';
import { nativePort, setNativePort } from '../state/state';
import { processCommand } from '../commands/command-processor';

// Handle incoming message from the native host
export function onNativeMessage(message: NativeMessage): void {
    console.log(`[messaging] Received message from native host:`, message);

    if (!message || typeof message !== 'object') {
        console.error(
            '[messaging] Invalid message received from native host:',
            message
        );
        return;
    }

    const { requestId, command, params, tabId } = message;

    if (requestId === undefined || !command) {
        console.error('[messaging] Message missing required fields:', message);
        return;
    }

    // Process the command
    processCommand(command, tabId || '', params || {})
        .then((response: ResponseMessage) => {
            sendResponse(requestId, response);
        })
        .catch((error: Error) => {
            console.error(
                `[messaging] Error processing command '${command}':`,
                error
            );
            sendErrorResponse(
                requestId,
                `Failed to process command '${command}': ${error.message}`,
                error.stack
            );
        });
}

// Send a response back to the native host
export function sendResponse(
    requestId: number,
    response: ResponseMessage
): void {
    if (!nativePort) {
        console.error(
            '[messaging] Cannot send response: No connection to native host.'
        );
        return;
    }

    try {
        nativePort.postMessage({
            requestId,
            status: response.status,
            result: response.result,
            error: response.error,
            details: response.details,
            tabId: response.tabId,
        });
    } catch (error) {
        console.error(
            '[messaging] Failed to send response to native host:',
            error
        );
    }
}

// Send an error response back to the native host
export function sendErrorResponse(
    requestId: number,
    errorMessage: string,
    details?: string
): void {
    console.error(
        `[messaging] Sending error response for request ${requestId}:`,
        errorMessage,
        details || ''
    );
    sendResponse(requestId, {
        status: 'error',
        error: errorMessage,
        details: details,
    });
}

// Connect to the native messaging host
export function connectNativeHost(): void {
    try {
        console.log(
            `[messaging] Connecting to native messaging host: ${NATIVE_HOST_NAME}`
        );
        const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

        port.onMessage.addListener(onNativeMessage);
        port.onDisconnect.addListener(onDisconnected);

        setNativePort(port);
        console.log('[messaging] Connected to native messaging host.');
    } catch (error) {
        console.error(
            '[messaging] Failed to connect to native messaging host:',
            error
        );
        setNativePort(null);
    }
}

// Handle native host disconnection
export function onDisconnected(): void {
    const error = chrome.runtime.lastError;
    if (error) {
        console.error(
            '[messaging] Native host disconnected with error:',
            error
        );
    } else {
        console.warn('[messaging] Native host disconnected.');
    }

    setNativePort(null);

    // Attempt to reconnect after a short delay
    setTimeout(() => {
        console.log('[messaging] Attempting to reconnect to native host...');
        connectNativeHost();
    }, 5000);
}

// Check and reconnect to the native host if disconnected
export function checkAndReconnectNativeHost(): void {
    if (!nativePort) {
        console.log(
            '[messaging] No native host connection, attempting to connect...'
        );
        connectNativeHost();
    }
}
