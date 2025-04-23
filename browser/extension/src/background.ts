/**
 * MAGI Browser Extension Service Worker
 *
 * This is the main entry point for the Chrome extension service worker.
 * It sets up communication with the native messaging host, handles lifecycle events,
 * and maintains tab and debugger state.
 */

import {
    connectNativeHost,
    checkAndReconnectNativeHost,
} from './communication/messaging';
import { closeInactiveTabs } from './tab-management/tab-manager'; // <-- Uncommented
// Note: The import for TAB_INACTIVITY_TIMEOUT from './config/config' was missing in the original read,
// even though closeInactiveTabs might use it. Restoring without it first.

// --- Service Worker Initialization ---
console.log('[background] MAGI Browser Extension Service Worker starting...');

// Connect to native messaging host on startup (delayed)
setTimeout(() => {
    console.log('[background] Attempting initial connection to native host...');
    connectNativeHost(); // Uncommented
}, 100); // Delay slightly (100ms)

// Debugger functionality removed

// --- Alarm Setup for Periodic Tasks ---

// Alarm for checking native host connection
chrome.alarms.create('checkNativeHostConnection', {
    periodInMinutes: 1, // Check once per minute
});

// Alarm for cleaning up inactive tabs
chrome.alarms.create('cleanupInactiveTabs', {
    periodInMinutes: 5, // Check every 5 minutes
});

// Listen for alarms
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'checkNativeHostConnection') {
        checkAndReconnectNativeHost(); // Uncommented
    } else if (alarm.name === 'cleanupInactiveTabs') {
        closeInactiveTabs(); // <-- Uncommented
        // console.log('[background] Received cleanupInactiveTabs alarm (handler commented out)'); // Removed log
    }
});

// --- Runtime Event Listeners ---

// Handle runtime startup events
chrome.runtime.onStartup.addListener(() => {
    console.log(
        '[background] Chrome browser started, initializing extension...'
    );
    connectNativeHost(); // Uncommented
});

// Handle extension installation or update
chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') {
        console.log('[background] Extension installed');
    } else if (details.reason === 'update') {
        console.log(
            `[background] Extension updated from ${details.previousVersion}`
        );
    }
});

// Log service worker activation
console.log(
    '[background] MAGI Browser Extension Service Worker initialized and running.'
);
