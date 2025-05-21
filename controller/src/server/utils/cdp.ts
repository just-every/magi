/**
 * CDP (Chrome DevTools Protocol) utility for Controller
 */

import CDP from 'chrome-remote-interface';

/**
 * Connects to the browser via CDP and opens the controller UI
 * @param url The URL of the controller UI
 */
export async function openUI(url: string): Promise<void> {
    // Helper to safely parse URLs
    function safeParse(urlStr: string): URL | null {
        try {
            return new URL(urlStr);
        } catch {
            return null;
        }
    }

    let cdpClient: CDP.Client | null = null; // Use Client type and allow null
    const host = 'host.docker.internal';
    const port = parseInt(process.env.HOST_CDP_PORT || '9001', 10); // Ensure port is a number

    try {
        // Attempt initial connection
        console.log(`Attempting to connect to CDP at ${host}:${port}`);
        cdpClient = await CDP({ host, port });
        console.log('CDP connection successful.');

        // Get list of all tabs/targets
        const { targetInfos } = await cdpClient.Target.getTargets();
        const pageTargets = targetInfos.filter(
            target => target.type === 'page'
        );
        console.log(`Found ${pageTargets.length} existing page targets.`);

        // 1. Try to find a tab matching host, port, and path; then host & port; then just host
        let targetToActivate: typeof pageTargets[0] | undefined;

        const requestedUrlObj = safeParse(url);

        if (requestedUrlObj) {
            // 1. Match host, port, and path
            targetToActivate = pageTargets.find(target => {
                const targetUrlObj = safeParse(target.url);
                return (
                    targetUrlObj &&
                    targetUrlObj.hostname === requestedUrlObj.hostname &&
                    targetUrlObj.port === requestedUrlObj.port &&
                    targetUrlObj.pathname === requestedUrlObj.pathname
                );
            });

            // 2. If not found, match host and port
            if (!targetToActivate) {
                targetToActivate = pageTargets.find(target => {
                    const targetUrlObj = safeParse(target.url);
                    return (
                        targetUrlObj &&
                        targetUrlObj.hostname === requestedUrlObj.hostname &&
                        targetUrlObj.port === requestedUrlObj.port
                    );
                });
            }

            // 3. If still not found, match just host
            if (!targetToActivate) {
                targetToActivate = pageTargets.find(target => {
                    const targetUrlObj = safeParse(target.url);
                    return (
                        targetUrlObj &&
                        targetUrlObj.hostname === requestedUrlObj.hostname
                    );
                });
            }
        }

        // 4. Fallback: If URL parsing fails or no match, use original exact check
        if (!targetToActivate) {
            targetToActivate = pageTargets.find(target => target.url === url);
        }

        if (targetToActivate) {
            // If exact match exists, activate it
            console.log(
                `Found existing tab with matching URL: ${url}. Activating targetId: ${targetToActivate.targetId}`
            );
            await cdpClient.Target.activateTarget({
                targetId: targetToActivate.targetId,
            });
            console.log(`Focused existing tab with URL: ${url}`);
        } else {
            // 2. If no exact match, find an 'about:blank' tab
            const blankTab = pageTargets.find(
                target => target.url === 'about:blank'
            );

            if (blankTab) {
                // If 'about:blank' tab exists, navigate it
                console.log(
                    `Found 'about:blank' tab (targetId: ${blankTab.targetId}). Navigating to: ${url}`
                );
                let attachedClient: CDP.Client | null = null;
                try {
                    // Attach to the blank tab to control its page
                    attachedClient = await CDP({
                        target: blankTab.targetId,
                        host: cdpClient.host, // Use host/port from the main client
                        port: cdpClient.port,
                    });
                    await attachedClient.Page.navigate({ url });
                    console.log(`Navigated 'about:blank' tab to URL: ${url}`);
                    // Activate the navigated tab using the main client
                    await cdpClient.Target.activateTarget({
                        targetId: blankTab.targetId,
                    });
                    targetToActivate = blankTab; // Mark as handled
                } catch (navError) {
                    console.error(
                        `Error navigating blank tab ${blankTab.targetId}: ${navError}`
                    );
                    // Fallback: Create a new tab if navigation fails
                    console.log(
                        'Fallback: Creating a new tab due to navigation error.'
                    );
                    const { targetId } = await cdpClient.Target.createTarget({
                        url,
                    });
                    await cdpClient.Target.activateTarget({ targetId });
                    console.log(`Opened new tab with URL: ${url}`);
                    targetToActivate = { targetId } as any; // Mark as handled
                } finally {
                    if (attachedClient) {
                        console.log(
                            `Closing attached client for targetId: ${blankTab.targetId}`
                        );
                        await attachedClient.close();
                    }
                }
            } else {
                // 3. If no suitable existing tab, create a new one using the connected client
                console.log(
                    'No suitable existing tab found (exact match or about:blank). Creating a new tab.'
                );
                const { targetId } = await cdpClient.Target.createTarget({
                    url,
                });
                await cdpClient.Target.activateTarget({ targetId });
                console.log(
                    `Opened new tab (targetId: ${targetId}) with URL: ${url}`
                );
                targetToActivate = { targetId } as any; // Mark as handled
            }
        }
        // Optional: Could do something with targetToActivate here if needed
    } catch (error: any) {
        // Handle errors during the *initial* CDP connection attempt
        if (error.message?.includes('No inspectable targets')) {
            console.log(
                'Initial connection failed: No inspectable targets found. This is expected if Chrome started with --no-startup-window.'
            );
            console.log(
                `Attempting to create a new window/tab directly using CDP.New() at ${host}:${port} with URL: ${url}`
            );
            try {
                // Use CDP.New() to create the first target
                const newTarget = await CDP.New({ host, port, url });
                console.log(
                    `Successfully created new target/window via CDP.New(): ${JSON.stringify(newTarget)}`
                );
                // No need to connect or activate, CDP.New handles creation.
            } catch (newError) {
                console.error(
                    'Failed to create a new window/tab using CDP.New():',
                    newError
                );
            }
        } else {
            // Handle other initial connection errors or target interaction errors
            console.error('Unhandled error during CDP interaction:', error);
        }
        // If the initial connection failed, cdpClient remains null.
    } finally {
        // Close the main CDP client connection *only if* it was successfully established
        if (cdpClient) {
            try {
                console.log('Closing main CDP client.');
                await cdpClient.close();
            } catch (closeError: any) {
                // Ignore errors during close, e.g., if already disconnected.
                if (!closeError.message?.includes('WebSocket is not open')) {
                    console.warn('Error closing main CDP client:', closeError);
                } else {
                    console.log('Main CDP client was already closed.');
                }
            }
        }
    }
}
