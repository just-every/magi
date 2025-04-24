/**
 * CDP (Chrome DevTools Protocol) utility for Controller
 */

import CDP from 'chrome-remote-interface';

/**
 * Connects to the browser via CDP and opens the controller UI
 * @param url The URL of the controller UI
 */
export async function openUI(url: string): Promise<void> {
    const cdpClient = await CDP({
        host: 'host.docker.internal',
        port: process.env.HOST_CDP_PORT || '9001',
    });

    try {
        // Get list of all tabs/targets
        const { targetInfos } = await cdpClient.Target.getTargets();

        // Find if there's a tab with our URL
        const existingTab = targetInfos.find(
            target => target.type === 'page' && target.url === url
        );

        if (existingTab) {
            // If tab exists, activate it
            await cdpClient.Target.activateTarget({
                targetId: existingTab.targetId,
            });
            console.log(`Focused existing tab with URL: ${url}`);
        } else {
            // If tab doesn't exist, create a new one
            const { targetId } = await cdpClient.Target.createTarget({
                url: url,
            });
            console.log(`Opened new tab with URL: ${url}`);

            // Activate the new tab
            await cdpClient.Target.activateTarget({ targetId });
        }
    } catch (error) {
        console.error('Error while handling browser tabs:', error);
    } finally {
        // Close the CDP client connection
        await cdpClient.close();
    }
}
