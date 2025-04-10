// background.js - Chrome Extension Service Worker

// --- Configuration ---
const NATIVE_HOST_NAME = "com.withmagi.magi_native_host"; // IMPORTANT: Match this in your native host manifest
const DEBUGGER_VERSION = "1.3";
const TAB_INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const TAB_GROUP_NAME = "Magi";
const TAB_GROUP_COLOR = "blue";
const TAB_GROUP_COLLAPSED = true;

// --- State ---
let nativePort = null;
// Track agent tabs: { tabId: { chromeTabId, lastActive: timestamp, groupId } }
let agentTabs = {};
// In-memory store for element maps { tabId: { map: Map<number, SimplifiedElementInfo>, simplifiedText: string } }
let tabIdMapStore = {};
let attachedDebuggerTabs = new Set(); // Keep track of tabs we've attached the debugger to

// --- Types (for clarity) ---
// interface SimplifiedElementInfo { id: number; description: string; selector: string; tagName: string; }

// --- Utility Functions ---
function sendResponse(response) {
    // Ensure requestId is included, as the bridge relies on it
    if (response?.requestId === undefined) {
        console.error("INTERNAL ERROR: sendResponse called without requestId!", response);
        // Attempt to find a fallback or log more context if possible
        return; // Cannot send response without ID
    }
    if (nativePort) {
        console.log(`Sending response to native host (Req ID: ${response.requestId}, Status: ${response.status}):`, response.result || response.error || 'OK');
        try {
            nativePort.postMessage(response);
        } catch (error) {
            console.error(`Failed to send response to native host (Req ID: ${response.requestId}):`, error);
            // Connection might be broken, trigger cleanup
            cleanupConnection();
        }
    } else {
        console.warn(`Cannot send response (Req ID: ${response.requestId}), native port not connected.`);
    }
}

function sendErrorResponse(requestId, error, message) {
    const errorMessage = message || (error instanceof Error ? error.message : String(error));
    const errorDetails = error instanceof Error ? error.stack : null;
    console.error(`Error processing request ${requestId}: ${errorMessage}`, error);
    sendResponse({
        requestId: requestId,
        status: "error",
        error: errorMessage,
        details: errorDetails,
    });
}

function cleanupConnection() {
    console.log("Cleaning up native messaging connection and related state...");
    if (nativePort) {
        // Remove listeners to prevent errors during disconnect
        nativePort.onDisconnect.removeListener(onDisconnected);
        nativePort.onMessage.removeListener(onNativeMessage);
        try {
            nativePort.disconnect();
            console.log("Native port disconnected.");
        } catch (e) {
            console.warn("Error disconnecting native port (might already be disconnected):", e);
        }
        nativePort = null;
    } else {
        console.log("Cleanup called but native port was already null.");
    }

    // Detach debugger from all tracked tabs on disconnect
    const tabsToDetach = Array.from(attachedDebuggerTabs); // Avoid modifying set while iterating
    if (tabsToDetach.length > 0) {
        console.log(`Detaching debugger from ${tabsToDetach.length} tracked tabs...`);
        tabsToDetach.forEach(tabId => detachDebugger(tabId)); // detachDebugger handles removing from the set
    }

    // Clear the element map store on disconnect to prevent stale data
    console.log("Clearing tab element map store.");
    tabIdMapStore = {};
}

// Get a specific tab, or create a new one if needed
async function getAgentTab(tabId) {
    if (!tabId) {
        throw new Error("Tab ID is required");
    }

    // Update the last active timestamp if the tab exists
    if (agentTabs[tabId] && agentTabs[tabId].chromeTabId) {
        const chromeTabId = agentTabs[tabId].chromeTabId;

        // Check if tab still exists
        try {
            const tab = await chrome.tabs.get(chromeTabId);
            agentTabs[tabId].lastActive = Date.now();
            return chromeTabId;
        } catch (e) {
            // Tab was closed or doesn't exist
            console.log(`Tab for ID ${tabId} no longer exists. Creating a new one.`);
            delete agentTabs[tabId];
        }
    }

    // Create a new tab for this ID
    console.log(`Creating new tab for ID ${tabId}`);
    const tab = await chrome.tabs.create({
        url: 'about:blank',
        active: false // Don't focus the new tab
    });

    // Add to tab group or create a new one if needed
    let groupId;
    if (chrome.tabGroups) {
        try {
            // Find existing MAGI group or create new one
            const groups = await chrome.tabGroups.query({title: TAB_GROUP_NAME});
            if (groups.length > 0) {
                groupId = groups[0].id;
            } else {
                const group = await chrome.tabs.group({
                    tabIds: [tab.id]
                });
                await chrome.tabGroups.update(group, {
                    title: TAB_GROUP_NAME,
                    color: TAB_GROUP_COLOR,
                    collapsed: TAB_GROUP_COLLAPSED
                });
                groupId = group;
            }

            // If we found an existing group, add this tab to it
            if (groups.length > 0) {
                await chrome.tabs.group({
                    tabIds: [tab.id],
                    groupId: groupId
                });
            }
        } catch (e) {
            console.error("Error managing tab groups:", e);
            // Don't fail the whole operation if tab grouping fails
        }
    }

    // Store the new tab info
    agentTabs[tabId] = {
        chromeTabId: tab.id,
        lastActive: Date.now(),
        groupId: groupId
    };

    return tab.id;
}

async function closeInactiveTabs() {
    const now = Date.now();
    const tabIds = Object.keys(agentTabs);

    for (const tabId of tabIds) {
        const agentTab = agentTabs[tabId];

        // Skip if tab is not old enough
        if (now - agentTab.lastActive < TAB_INACTIVITY_TIMEOUT) continue;

        try {
            // Check if tab is active before closing
            const tab = await chrome.tabs.get(agentTab.chromeTabId);

            // Don't close active tabs
            if (tab.active) {
                console.log(`Tab for ID ${tabId} is active, not closing despite inactivity`);
                // Update the last active timestamp to prevent future checks until inactive again
                agentTab.lastActive = now;
                continue;
            }

            // Close the tab if it's not active
            console.log(`Closing inactive tab for ID ${tabId} after ${(now - agentTab.lastActive) / 1000 / 60} minutes`);
            await chrome.tabs.remove(agentTab.chromeTabId);
            delete agentTabs[tabId];

            // Also clean up any data for this tab
            delete tabIdMapStore[agentTab.chromeTabId];
        } catch (e) {
            // Tab might already be closed
            console.log(`Failed to close tab for ID ${tabId}, may already be closed:`, e);
            delete agentTabs[tabId];
        }
    }
}

// --- Debugger Control ---
async function attachDebugger(tabId) {
    if (attachedDebuggerTabs.has(tabId)) {
        // console.log(`Debugger already attached to tab ${tabId}`);
        return true; // Already attached
    }
    console.log(`Attaching debugger to tab ${tabId}...`);
    return new Promise((resolve) => {
        chrome.debugger.attach({ tabId: tabId }, DEBUGGER_VERSION, () => {
            if (chrome.runtime.lastError) {
                // **Enhanced Log:** Provide more context on failure
                const errorMsg = `Failed to attach debugger to tab ${tabId}: ${chrome.runtime.lastError.message}`;
                console.error(errorMsg);
                // Attempt to get tab info for more context
                chrome.tabs.get(tabId).catch(() => null).then(tabInfo => {
                    if (!tabInfo) console.error(`Attach failed: Tab ${tabId} may no longer exist.`);
                    else console.error(`Attach failed: Tab ${tabId} status: ${tabInfo.status}, URL: ${tabInfo.url}`);
                });
                resolve(false); // Resolve with false on failure
            } else {
                console.log(`Debugger attached successfully to tab ${tabId}`);
                attachedDebuggerTabs.add(tabId);
                // Add listener for debugger detachment events (only once per attach/session)
                // Ensure listener isn't added multiple times if attach/detach happens rapidly
                if (!chrome.debugger.onDetach.hasListener(debuggerDetachListener)) {
                    chrome.debugger.onDetach.addListener(debuggerDetachListener);
                }
                resolve(true); // Resolve with true on success
            }
        });
    });
}

const debuggerDetachListener = (source, reason) => {
    // source: {tabId: number}, reason: string (e.g., "target_closed", "canceled_by_user")
    if (source.tabId && attachedDebuggerTabs.has(source.tabId)) {
        console.warn(`Debugger detached from tab ${source.tabId}. Reason: ${reason}`);
        attachedDebuggerTabs.delete(source.tabId);
        // Consider removing the listener if attachedDebuggerTabs becomes empty,
        // but adding it back on next attach handles this simply.
    }
};


async function detachDebugger(tabId) {
    if (!attachedDebuggerTabs.has(tabId)) {
        // console.log(`Debugger not attached to tab ${tabId}, skipping detach.`);
        return; // Not attached or already detached
    }
    console.log(`Detaching debugger from tab ${tabId}...`);
    return new Promise((resolve) => {
        chrome.debugger.detach({ tabId: tabId }, () => {
            if (chrome.runtime.lastError) {
                // Don't treat "target not found" or "Target closed" as critical errors if tab was likely closed
                const msg = chrome.runtime.lastError.message?.toLowerCase() || "";
                if (!msg.includes("no target with given id found") &&
                    !msg.includes("target closed")) {
                    console.error(`Error detaching debugger from tab ${tabId}:`, chrome.runtime.lastError.message);
                } else {
                    // console.log(`Note: Detach failed likely because tab ${tabId} was already closed.`);
                }
                chrome.runtime.lastError = null; // Clear error anyway
            } else {
                console.log(`Debugger detached successfully from tab ${tabId}`);
            }
            // Always remove from the set after attempting detach
            attachedDebuggerTabs.delete(tabId);
            resolve();
        });
    });
}

async function sendDebuggerCommand(tabId, method, commandParams = {}) {
    console.log(`Sending debugger command to tab ${tabId}: ${method}`, commandParams);
    // Ensure debugger is actually attached before sending
    if (!attachedDebuggerTabs.has(tabId)) {
        console.error(`Attempted to send debugger command ${method} to tab ${tabId}, but debugger is not attached.`);
        throw new Error(`Debugger not attached to tab ${tabId}. Cannot send command ${method}.`);
    }
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ tabId: tabId }, method, commandParams, (result) => {
            if (chrome.runtime.lastError) {
                const errorMsg = `Debugger command ${method} failed for tab ${tabId}: ${chrome.runtime.lastError.message}`;
                console.error(errorMsg);
                // Check for common detachment errors
                if (chrome.runtime.lastError.message?.includes("Cannot access a chrome:// URL") ||
                    chrome.runtime.lastError.message?.includes("No target with given id found") ||
                    chrome.runtime.lastError.message?.includes("Target closed")) {
                    console.warn(`Debugger likely detached or target became invalid for tab ${tabId}. Cleaning up.`);
                    attachedDebuggerTabs.delete(tabId); // Update state
                }
                reject(new Error(errorMsg)); // Reject the promise
            } else {
                // console.log(`Debugger command ${method} successful for tab ${tabId}. Result:`, result);
                resolve(result); // Resolve with the result
            }
        });
    });
}


// --- Native Messaging Handlers ---
function onDisconnected() {
    // Log the error if available
    const errorMsg = chrome.runtime.lastError?.message;
    if (errorMsg) {
        console.error("Native host disconnected unexpectedly:", errorMsg);
    } else {
        console.log("Native host disconnected."); // Normal disconnect or unknown reason
    }
    // Perform cleanup actions
    cleanupConnection();
}

async function onNativeMessage(message) {
    console.log("Received message from native host:", message);
    const { requestId, command, params, tabId } = message;

    // Validate basic message structure
    if (!command || requestId === undefined) {
        console.error("Invalid message format received from native host (missing command or requestId):", message);
        // Cannot send an error response without a requestId
        return;
    }

    // Special handling for initialize_agent since it requires tabId
    if (command === "initialize_agent") {
        if (!tabId) {
            sendErrorResponse(requestId, new Error("Missing 'tabId' parameter for initialize_agent command."));
            return;
        }

        try {
            console.log(`Initializing tab session for ${tabId}`);
            const chromeTabId = await getAgentTab(tabId);
            sendResponse({ requestId, status: "ok", result: { tabId: chromeTabId } });
        } catch (error) {
            sendErrorResponse(requestId, error, `Error initializing tab session for ${tabId}`);
        }
        return;
    }

    let targetTab; // Store the tab object
    let targetTabId;
    let needsDebugger = ['type', 'press']; // Commands requiring debugger

    try {
        // Get the tab-specific chrome tab
        if (tabId) {
            targetTabId = await getAgentTab(tabId);
            targetTab = await chrome.tabs.get(targetTabId);
        } else {
            // Fallback to active tab if tabId is not provided (for backward compatibility)
            console.warn(`Command ${command} received without tabId, using active tab as fallback`);
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                throw new Error("Could not determine active tab and no tabId provided");
            }
            targetTab = tab;
            targetTabId = tab.id;
        }

        // Ensure debugger is attached *before* executing commands that need it
        if (needsDebugger.includes(command)) {
            const attached = await attachDebugger(targetTabId); // Handles already attached case
            if (!attached) {
                // If attach failed, throw an error before proceeding
                throw new Error(`Failed to attach debugger to tab ${targetTabId}. Cannot execute command '${command}'.`);
            }
        }

        // --- Command Processing Switch ---
        switch (command) {
            case "navigate":
                if (!params?.url) throw new Error("Missing 'url' parameter for navigate command.");
                console.log(`Navigating tab ${targetTabId} to ${params.url}`);
                let tabStatus = { url: params.url };
                if(params?.takeFocus) {
                    // Activate the tab if requested
                    tabStatus.active = true;
                }
                await chrome.tabs.update(targetTabId, tabStatus);
                // Wait briefly for navigation to likely start rendering/processing
                await new Promise(resolve => setTimeout(resolve, 1000));
                const updatedTab = await chrome.tabs.get(targetTabId); // Get updated tab info
                // Clear stored map for this tab after successful navigation
                if (tabIdMapStore[targetTabId]) {
                    console.log(`Clearing element map for tab ${targetTabId} after navigation.`);
                    delete tabIdMapStore[targetTabId];
                }
                sendResponse({ requestId, status: "ok", result: `Navigated to ${params.url}. Tab status: ${updatedTab.status}, Title: "${updatedTab.title}"` });
                break;

            case "get_page_content":
                console.log(`Executing content script dom_processor.js on tab ${targetTabId}`);
                const scriptResults = await chrome.scripting.executeScript({
                    target: { tabId: targetTabId },
                    files: ['dom_processor.js'], // Inject the processing script
                    // world: 'ISOLATED' // Consider ISOLATED world if not interacting with page's JS directly
                });

                if (chrome.runtime.lastError || !scriptResults || scriptResults.length === 0 || !scriptResults[0].result) {
                    throw new Error(chrome.runtime.lastError?.message || "Failed to execute content script or get result.");
                }
                const { simplifiedText, idMapArray, error: scriptError } = scriptResults[0].result;
                if (scriptError) {
                    // Propagate error from the content script
                    throw new Error(`Error in dom_processor.js: ${scriptError.message || scriptError}`);
                }
                // Convert array back to Map for storage (JSON doesn't support Maps directly)
                const idMap = new Map(idMapArray);
                tabIdMapStore[targetTabId] = { map: idMap, simplifiedText: simplifiedText };
                console.log(`Stored map for tab ${targetTabId} with ${idMap.size} elements.`);
                // Only send text and size back to bridge/client for brevity
                sendResponse({ requestId, status: "ok", result: { simplifiedText, idMapSize: idMap.size } });
                break;

            case "get_url":
                // Already fetched the tab above
                sendResponse({ requestId, status: "ok", result: targetTab.url });
                break;

            case "screenshot":
                console.log(`Capturing screenshot for tab ${targetTabId}`);

                // Track if we need to preserve focus
                const preserveFocus = params?.preserveFocus === true;
                let previousActiveTabId = null;

                try {
                    // If preserveFocus, store current active tab
                    if (preserveFocus) {
                        const [currentActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (currentActiveTab && currentActiveTab.id !== targetTabId) {
                            previousActiveTabId = currentActiveTab.id;
                            console.log(`Temporarily switching from tab ${previousActiveTabId} to ${targetTabId} for screenshot`);

                            // Activate our target tab
                            await chrome.tabs.update(targetTabId, { active: true });

                            // Small delay to ensure tab activation and rendering
                            await new Promise(resolve => setTimeout(resolve, 150));
                        }
                    }

                    // Handle element-specific screenshot if elementId is provided
                    if (params?.type === 'element' && params?.elementId) {
                        const elementIdNum = parseInt(params.elementId, 10);
                        const storedData = tabIdMapStore[targetTabId];
                        if (!storedData || !storedData.map) {
                            throw new Error(`Interaction map not found for tab ${targetTabId}. Call get_page_content first.`);
                        }

                        const elementInfo = storedData.map.get(elementIdNum);
                        if (!elementInfo) {
                            throw new Error(`Element ID ${elementIdNum} not found in map for tab ${targetTabId}.`);
                        }

                        // Get element dimensions via script
                        const scriptResult = await chrome.scripting.executeScript({
                            target: { tabId: targetTabId },
                            func: (selector) => {
                                const el = document.querySelector(selector);
                                if (!el) return null;
                                const rect = el.getBoundingClientRect();
                                return {
                                    x: rect.left,
                                    y: rect.top,
                                    width: rect.width,
                                    height: rect.height
                                };
                            },
                            args: [elementInfo.selector]
                        });

                        if (!scriptResult?.[0]?.result) {
                            throw new Error(`Failed to locate element ${elementIdNum} for screenshot`);
                        }

                        const rect = scriptResult[0].result;
                        // Take full page screenshot and crop in a separate step
                        const imageDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 85 });

                        // Crop is handled on client side or in native host
                        sendResponse({
                            requestId,
                            status: "ok",
                            result: {
                                imageDataUrl,
                                elementBounds: rect
                            }
                        });
                    }
                    // Handle full page screenshot
                    else if (params?.type === 'page') {
                        // To properly capture full page, we need to:
                        // 1. Get scroll height
                        // 2. Scroll and capture sections
                        // This is simplified - full implementation would stitch images
                        const imageDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 85 });
                        sendResponse({
                            requestId,
                            status: "ok",
                            result: {
                                imageDataUrl,
                                isFullPage: true
                            }
                        });
                    }
                    // Default viewport screenshot
                    else {
                        const imageDataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 85 });
                        sendResponse({ requestId, status: "ok", result: { imageDataUrl } });
                    }
                } finally {
                    // Restore previous active tab if needed
                    if (preserveFocus && previousActiveTabId) {
                        try {
                            // Check if the tab still exists
                            await chrome.tabs.get(previousActiveTabId);

                            // Restore the previous tab
                            await chrome.tabs.update(previousActiveTabId, { active: true });
                            console.log(`Restored focus to previous tab ${previousActiveTabId}`);
                        } catch (e) {
                            console.warn(`Failed to restore previous tab ${previousActiveTabId}, it may have been closed: ${e.message}`);
                        }
                    }
                }
                break;

            case "js_evaluate":
                if (!params?.code) throw new Error("Missing 'code' parameter for js_evaluate command.");
                console.log(`Evaluating JS code on tab ${targetTabId}:`, params.code);
                const evalResults = await chrome.scripting.executeScript({
                    target: { tabId: targetTabId },
                    func: (codeToRun) => {
                        try {
                            // Use Function constructor for slightly safer evaluation than direct eval
                            const result = new Function(codeToRun)();
                            // Handle non-serializable results gracefully
                            if (result instanceof Node || result instanceof Window) return "[Non-serializable DOM element]";
                            if (typeof result === 'function') return "[Function]";
                            // Attempt to stringify, but catch errors for complex/circular objects
                            try {
                                // Ensure undefined becomes null for JSON compatibility
                                return JSON.parse(JSON.stringify(result === undefined ? null : result));
                            } catch (stringifyError) {
                                // Fallback for unserializable objects
                                return `[Unserializable object: ${stringifyError.message}]`;
                            }
                        } catch (e) {
                            // Return error details if evaluation fails
                            return { __error: true, message: e.message, stack: e.stack };
                        }
                    },
                    args: [params.code],
                    world: 'MAIN' // Execute in the page's main world context
                });

                if (chrome.runtime.lastError || !evalResults || evalResults.length === 0) {
                    throw new Error(chrome.runtime.lastError?.message || "Failed to execute script for evaluation.");
                }
                const evalResult = evalResults[0].result;
                // Check for errors returned from the executed function
                if (evalResult && evalResult.__error) {
                    throw new Error(`JavaScript evaluation error: ${evalResult.message}\n${evalResult.stack}`);
                }
                // Result should now be serializable or an error string
                sendResponse({ requestId, status: "ok", result: evalResult });
                break;

            case "type": // Uses debugger
                if (!params?.text) throw new Error("Missing 'text' parameter for type command.");
                console.log(`Typing text on tab ${targetTabId}: "${params.text}"`);
                for (const char of params.text) {
                    // Send 'char' type event via debugger
                    await sendDebuggerCommand(targetTabId, 'Input.dispatchKeyEvent', { type: 'char', text: char, unmodifiedText: char, key: char });
                    // Small delay between characters for more realistic typing
                    await new Promise(resolve => setTimeout(resolve, 30)); // Adjusted delay
                }
                sendResponse({ requestId, status: "ok", result: `Typed text: ${params.text}` });
                break;

            case "press": // Uses debugger
                if (!params?.keys) throw new Error("Missing 'keys' parameter for press command.");
                const keyToPress = params.keys;
                console.log(`Pressing key on tab ${targetTabId}: "${keyToPress}"`);
                // Basic mapping (Needs expansion for modifiers, function keys, etc.)
                // See CDP Input.dispatchKeyEvent 'key' and 'code' definitions
                let keyEventParams = { type: '', key: '', code: '', text: '', unmodifiedText: '', windowsVirtualKeyCode: 0, nativeVirtualKeyCode: 0, macCharCode: 0, modifiers: 0 }; // Added modifiers

                // Simple mapping - expand as needed
                switch (keyToPress.toLowerCase()) {
                    case 'enter': Object.assign(keyEventParams, { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); break;
                    case 'tab': Object.assign(keyEventParams, { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 }); break;
                    case 'arrowdown': Object.assign(keyEventParams, { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 }); break;
                    case 'arrowup': Object.assign(keyEventParams, { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 }); break;
                    case 'arrowleft': Object.assign(keyEventParams, { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 }); break;
                    case 'arrowright': Object.assign(keyEventParams, { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 }); break;
                    case 'escape': Object.assign(keyEventParams, { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); break;
                    case 'backspace': Object.assign(keyEventParams, { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 }); break;
                    case 'delete': Object.assign(keyEventParams, { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 }); break;
                    // Add F-keys, PageUp/Down, Home, End etc. if needed
                    default:
                        // For single printable characters, treat it like 'type' but with keydown/up
                        if (keyToPress.length === 1) {
                            Object.assign(keyEventParams, { key: keyToPress, code: `Key${keyToPress.toUpperCase()}`, text: keyToPress, unmodifiedText: keyToPress });
                            // Attempt to map charCode (less reliable across platforms)
                            keyEventParams.macCharCode = keyToPress.charCodeAt(0);
                        } else {
                            throw new Error(`Unsupported key/combination for 'press': ${keyToPress}. Requires specific CDP mapping or modifier handling.`);
                        }
                }

                // Send keyDown, wait briefly, then send keyUp
                await sendDebuggerCommand(targetTabId, 'Input.dispatchKeyEvent', { ...keyEventParams, type: 'keyDown' });
                await new Promise(resolve => setTimeout(resolve, 40)); // Slightly longer delay for key press
                await sendDebuggerCommand(targetTabId, 'Input.dispatchKeyEvent', { ...keyEventParams, type: 'keyUp' });

                sendResponse({ requestId, status: "ok", result: `Pressed key: ${keyToPress}` });
                break;

            case "get_element_info":
                if (!params?.elementId) throw new Error("Missing 'elementId' parameter for get_element_info command.");
                const elementIdNum = parseInt(params.elementId, 10);
                console.log(`Retrieving info for element ID ${elementIdNum} from map for tab ${targetTabId}`);
                const storedData = tabIdMapStore[targetTabId];
                if (!storedData || !storedData.map) {
                    throw new Error(`Interaction map not found for tab ${targetTabId}. Call get_page_content first.`);
                }
                const elementInfo = storedData.map.get(elementIdNum);
                if (!elementInfo) {
                    throw new Error(`Element ID ${elementIdNum} not found in map for tab ${targetTabId}. Map size: ${storedData.map.size}.`);
                }
                sendResponse({ requestId, status: "ok", result: elementInfo });
                break;

            case "interact_element":
                const { elementId, action, value, checked } = params ?? {};
                if (elementId === undefined) throw new Error("Missing 'elementId' for interact_element.");
                if (!action) throw new Error("Missing 'action' for interact_element.");
                const interactElementIdNum = parseInt(elementId, 10);
                console.log(`Interacting with element ID ${interactElementIdNum} on tab ${targetTabId} (Action: ${action})`);

                // Get selector from stored map
                const interactionMapData = tabIdMapStore[targetTabId];
                if (!interactionMapData || !interactionMapData.map) {
                    throw new Error(`Interaction map not found for tab ${targetTabId}. Call get_page_content first.`);
                }
                const targetElementInfo = interactionMapData.map.get(interactElementIdNum);
                if (!targetElementInfo) {
                    throw new Error(`Element ID ${interactElementIdNum} not found in map for tab ${targetTabId}. Map size: ${interactionMapData.map.size}.`);
                }
                const selector = targetElementInfo.selector;
                if (!selector) {
                    throw new Error(`Element ID ${interactElementIdNum} has no valid CSS selector stored. Cannot interact.`);
                }

                // Prepare function to execute in page context
                let interactionFunc;
                let interactionArgs = [selector, value, checked, interactElementIdNum]; // Pass selector, params, and ID for error messages

                // Define interaction functions within the scope where they are used
                switch (action) {
                    case 'click':
                        interactionFunc = (sel, _val, _chk, elId) => {
                            const el = document.querySelector(sel);
                            if (!el) throw new Error(`Element [${elId}] not found with selector: ${sel}`);
                            if (typeof el.click === 'function') {
                                el.click(); // Standard click
                                return `Clicked element [${elId}]`;
                            } else {
                                // Fallback for elements without a .click() method (e.g., some SVGs)
                                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                                return `Dispatched click event to element [${elId}]`;
                            }
                        };
                        interactionArgs = [selector, null, null, interactElementIdNum]; // Only need selector and ID
                        break;
                    case 'fill':
                        if (value === undefined || value === null) throw new Error("Missing 'value' for 'fill' action.");
                        interactionFunc = (sel, val, _chk, elId) => {
                            const el = document.querySelector(sel);
                            if (!el) throw new Error(`Element [${elId}] not found with selector: ${sel}`);
                            // Check if element is interactable (visible, enabled)
                            if (el.disabled) throw new Error(`Element [${elId}] is disabled.`);
                            if (el.readOnly) throw new Error(`Element [${elId}] is read-only.`);
                            // Focus before filling (if possible)
                            if (typeof el.focus === 'function') el.focus();
                            el.value = val; // Set the value
                            // Dispatch events to trigger framework reactivity (React, Vue, etc.)
                            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
                            // Blur after filling (optional, depends on desired behavior)
                            // if (typeof el.blur === 'function') el.blur();
                            return `Filled element [${elId}]`;
                        };
                        // interactionArgs already set correctly
                        break;
                    case 'check': // Handles checkboxes and radio buttons
                        if (checked === undefined || checked === null) throw new Error("Missing 'checked' state (true/false) for 'check' action.");
                        interactionFunc = (sel, _val, checkState, elId) => {
                            const el = document.querySelector(sel);
                            if (!el || (el.type !== 'checkbox' && el.type !== 'radio')) throw new Error(`Element [${elId}] not found or not a checkbox/radio: ${sel}`);
                            if (el.disabled) throw new Error(`Element [${elId}] is disabled.`);
                            if (el.checked === checkState) {
                                return `${checkState ? 'Checked' : 'Unchecked'} element [${elId}] (already in correct state)`;
                            }
                            el.checked = checkState;
                            // Dispatch events for reactivity
                            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
                            // Also dispatch click for radio buttons to handle group deselection
                            if (el.type === 'radio' && checkState) {
                                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                            }
                            return `${checkState ? 'Checked' : 'Unchecked'} element [${elId}]`;
                        };
                        // interactionArgs already set correctly
                        break;
                    case 'select_option': // Handles <select> dropdowns
                        if (value === undefined || value === null) throw new Error("Missing 'value' (option value, text, or label) for 'select_option' action.");
                        interactionFunc = (sel, val, _chk, elId) => {
                            const el = document.querySelector(sel);
                            if (!el || el.tagName !== 'SELECT') throw new Error(`Element [${elId}] not found or not a <select>: ${sel}`);
                            if (el.disabled) throw new Error(`Element [${elId}] is disabled.`);
                            let foundOption = false;
                            // Try matching by value, then text content, then label
                            for (let i = 0; i < el.options.length; i++) {
                                const opt = el.options[i];
                                if (opt.value === val || opt.textContent?.trim() === val || opt.label === val) {
                                    if (el.selectedIndex === i) { // Already selected
                                        return `Selected option matching "${val}" for element [${elId}] (already selected)`;
                                    }
                                    el.selectedIndex = i;
                                    foundOption = true;
                                    break;
                                }
                            }
                            if (!foundOption) throw new Error(`Option matching "${val}" not found in <select> [${elId}]`);
                            // Dispatch events for reactivity
                            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }));
                            return `Selected option matching "${val}" for element [${elId}]`;
                        };
                        // interactionArgs already set correctly
                        break;
                    case 'hover': // Basic hover simulation
                        interactionFunc = (sel, _val, _chk, elId) => {
                            const el = document.querySelector(sel);
                            if (!el) throw new Error(`Element [${elId}] not found with selector: ${sel}`);
                            // Dispatch mouseenter/mouseover events
                            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, composed: true }));
                            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, composed: true }));
                            // Note: This won't trigger CSS :hover styles directly in some cases,
                            // but might trigger JS listeners.
                            return `Simulated hover on element [${elId}]`;
                        };
                        interactionArgs = [selector, null, null, interactElementIdNum];
                        break;
                    case 'focus':
                        interactionFunc = (sel, _val, _chk, elId) => {
                            const el = document.querySelector(sel);
                            if (!el) throw new Error(`Element [${elId}] not found with selector: ${sel}`);
                            if (typeof el.focus === 'function') {
                                el.focus();
                                return `Focused element [${elId}]`;
                            } else {
                                throw new Error(`Element [${elId}] does not support focus().`);
                            }
                        };
                        interactionArgs = [selector, null, null, interactElementIdNum];
                        break;
                    case 'scroll': // Scroll element into view
                        interactionFunc = (sel, _val, _chk, elId) => {
                            const el = document.querySelector(sel);
                            if (!el) throw new Error(`Element [${elId}] not found with selector: ${sel}`);
                            if (typeof el.scrollIntoView === 'function') {
                                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                                return `Scrolled element [${elId}] into view`;
                            } else {
                                throw new Error(`Element [${elId}] does not support scrollIntoView().`);
                            }
                        };
                        interactionArgs = [selector, null, null, interactElementIdNum];
                        break;
                    default:
                        throw new Error(`Unsupported action type '${action}' for interact_element.`);
                }

                // Execute the interaction function in the page context
                const interactionResults = await chrome.scripting.executeScript({
                    target: { tabId: targetTabId },
                    func: interactionFunc, // The function defined in the switch case
                    args: interactionArgs, // Arguments for the function
                    world: 'MAIN' // Interact with the main page context
                });

                // Error handling after script execution
                if (chrome.runtime.lastError || !interactionResults || interactionResults.length === 0) {
                    let baseError = `Failed to execute interaction script for action '${action}'.`;
                    if (chrome.runtime.lastError) baseError += ` Error: ${chrome.runtime.lastError.message}`;
                    // Check if target might have been invalidated (e.g., navigation during interaction)
                    const currentTab = await chrome.tabs.get(targetTabId).catch(() => null);
                    if (!currentTab || currentTab.url !== targetTab.url) {
                        baseError += ` Target tab may have navigated or closed during interaction.`;
                    }
                    throw new Error(baseError);
                }
                // Check for errors returned *from* the injected function itself
                const interactionResult = interactionResults[0].result;
                if (interactionResult && interactionResult.__error) { // Check if our injected func returned an error object
                    throw new Error(`Interaction '${action}' failed in page for element [${interactElementIdNum}]: ${interactionResult.message}`);
                } else if (interactionResult instanceof Error) { // Check if the injected func threw an error directly
                    throw new Error(`Interaction '${action}' failed in page for element [${interactElementIdNum}]: ${interactionResult.message}`);
                }

                // If successful, return the message from the interaction function
                sendResponse({ requestId, status: "ok", result: interactionResult || `Action '${action}' completed on element [${interactElementIdNum}]` });
                break;

            case "switch_tab":
                const { type, tabId } = params ?? {};
                console.log(`Switching tab (type: ${type}, tabId: ${tabId})`);
                switch (type) {
                    case 'active':
                        const [currentActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        targetTabId = currentActiveTab.id;
                        break;
                    case 'new':
                        // Create a new tab
                        const newTab = await chrome.tabs.create({ url: params.url || "chrome://newtab" });
                        targetTabId = newTab.id;
                        console.log(`New tab created with ID ${targetTabId}`);
                        break;
                    case 'id':
                        if (!tabId) throw new Error("Missing 'tabId' parameter for switch_tab command.");
                        console.log(`Switching to existing tab with ID ${tabId}`);
                        targetTabId = await getAgentTab(tabId);
                        break;
                }

                sendResponse({ requestId, status: "ok", result: { tabId: targetTabId } });
                break;

            case "close_agent_session":
                if (!tabId) throw new Error("Missing 'tabId' parameter for close_agent_session command.");
                console.log(`Closing session for tab ${tabId}`);

                // Get the Chrome tab ID for this tabId
                if (agentTabs[tabId]) {
                    const chromeTabIdToClose = agentTabs[tabId].chromeTabId;
                    try {
                        // Check if tab is active before closing
                        const tab = await chrome.tabs.get(chromeTabIdToClose);
                        if (tab.active) {
                            console.log(`Tab for ID ${tabId} is active, not closing`);
                            sendResponse({
                                requestId,
                                status: "ok",
                                result: `Tab for ID ${tabId} is active. Cleared association but left tab open.`
                            });
                            // Just remove the association but don't close
                            delete agentTabs[tabId];
                        } else {
                            // Close the tab
                            await chrome.tabs.remove(chromeTabIdToClose);
                            delete agentTabs[tabId];
                            delete tabIdMapStore[chromeTabIdToClose];
                            sendResponse({
                                requestId,
                                status: "ok",
                                result: `Closed tab for ID ${tabId}`
                            });
                        }
                    } catch (e) {
                        // Tab might already be closed
                        console.log(`Failed to close tab for ID ${tabId}, may already be closed:`, e);
                        delete agentTabs[tabId];
                        sendResponse({
                            requestId,
                            status: "ok",
                            result: `Tab for ID ${tabId} may already be closed`
                        });
                    }
                } else {
                    sendResponse({
                        requestId,
                        status: "ok",
                        result: `No tab found for ID ${tabId}`
                    });
                }
                break;

            default:
                // Handle unknown commands gracefully
                console.error(`Unknown command received: ${command}`);
                throw new Error(`Unknown command received: ${command}`);
        }
    } catch (error) {
        // Centralized error handling for the entire message processing block
        sendErrorResponse(requestId, error, `Error processing command '${command}' for tab ${targetTabId || 'unknown'}`);

        // Attempt to detach debugger if an error occurred during a command that required it,
        // but only if we know the targetTabId and the debugger was supposed to be attached.
        if (targetTabId && needsDebugger.includes(command) && attachedDebuggerTabs.has(targetTabId)) {
            console.warn(`Detaching debugger from tab ${targetTabId} due to error during command '${command}'.`);
            // Don't await detach here to avoid delaying the error response
            detachDebugger(targetTabId);
        }
    }
}

// --- Connect to Native Host ---
function connectNativeHost() {
    // Prevent multiple connection attempts simultaneously
    if (nativePort) {
        console.log("Native port already connected or connection attempt in progress.");
        return;
    }
    console.log(`Attempting to connect to native host: ${NATIVE_HOST_NAME}`);
    try {
        nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
        // Setup listeners immediately after getting the port object
        nativePort.onMessage.addListener(onNativeMessage);
        nativePort.onDisconnect.addListener(onDisconnected);
        console.log("Native port connection initiated successfully. Listening for messages.");
        // REMOVED: Initial ping is not needed and caused issues with the bridge.
        // nativePort.postMessage({ requestId: 0, command: "ping" });
    } catch (error) {
        console.error(`Failed to initiate connection to native host "${NATIVE_HOST_NAME}":`, error);
        // Ensure nativePort is null if connectNative fails immediately
        nativePort = null;
    }
}

// --- Initialization & Keep-alive ---

// Function to check connection and reconnect if needed
function checkAndReconnectNativeHost() {
    if (!nativePort) {
        console.warn("Keep-alive/Check: Native port not connected. Attempting reconnect.");
        connectNativeHost();
    } else {
        // Optional: Add a very lightweight check/ping if the bridge supports it,
        // but be careful not to cause issues like the original ping.
        // console.log("Keep-alive/Check: Native port seems connected.");
    }
}

// Attempt connection on extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log("Extension startup detected.");
    checkAndReconnectNativeHost();
});

// Attempt connection on install/update
chrome.runtime.onInstalled.addListener((details) => {
    console.log(`Extension ${details.reason}. Details:`, details);
    checkAndReconnectNativeHost();
});

// Keep service worker alive mechanism using alarms (preferred)
try {
    if (chrome.alarms) {
        const KEEPALIVE_ALARM_NAME = 'nativeHostKeepAlive';
        const CLEANUP_ALARM_NAME = 'tabInactivityCheck';

        console.log("Setting up keep-alive alarm.");
        // Clear any existing alarm first
        chrome.alarms.clear(KEEPALIVE_ALARM_NAME);
        chrome.alarms.clear(CLEANUP_ALARM_NAME);

        // Create the alarms
        chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: 4.5 });
        chrome.alarms.create(CLEANUP_ALARM_NAME, { periodInMinutes: 5 });

        // Add listener
        chrome.alarms.onAlarm.addListener(alarm => {
            if (alarm.name === KEEPALIVE_ALARM_NAME) {
                // console.log("Keep-alive alarm triggered.");
                checkAndReconnectNativeHost();
            } else if (alarm.name === CLEANUP_ALARM_NAME) {
                // Check for inactive tabs
                closeInactiveTabs();
            }
        });
    } else {
        // Fallback if alarms API is somehow unavailable
        console.warn("chrome.alarms API not available. Using setInterval for keep-alive (less reliable).");
        setInterval(checkAndReconnectNativeHost, 270000); // 4.5 minutes
        setInterval(closeInactiveTabs, 300000); // 5 minutes
    }
} catch (error) {
    console.error("Error setting up keep-alive alarm mechanism:", error);
    // Further fallback (less ideal)
    setTimeout(checkAndReconnectNativeHost, 270000); // 4.5 minutes
}

// Initial connection attempt when the service worker script first loads
// Use a small delay to allow other startup tasks potentially
setTimeout(checkAndReconnectNativeHost, 500);

console.log("MAGI Background Service Worker initialized.");
