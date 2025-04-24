#!/usr/bin/env node
/* eslint-env node */

/**
 * Test CDP Connection Utility
 *
 * A simple script to test that Chrome CDP connections are working properly.
 * This helps debug connection issues between Chrome and the Docker container.
 *
 * Usage:
 *   npm run browser:test-connection
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { launchChrome, shutdownChrome } from './cdp/chrome_cdp_launcher.js';
import CDP from 'chrome-remote-interface';
import type { Client as CDPClient } from 'chrome-remote-interface';

// Get script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '../../..');

// Load port from .env if exists
let cdpPort = 0; // Auto-assign if not found
const envPath = resolve(rootDir, '.env');
if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    const portMatch = envContent.match(/HOST_CDP_PORT=(\d+)/);
    if (portMatch && portMatch[1]) {
        cdpPort = parseInt(portMatch[1], 10);
        console.log(`Found CDP port in .env: ${cdpPort}`);
    }
}

async function testConnection(): Promise<void> {
    let chrome;
    let client: CDPClient | undefined;

    try {
        // Step 1: Launch Chrome if needed or get existing info
        if (cdpPort > 0) {
            console.log(`Using existing Chrome on port ${cdpPort}`);
            chrome = { chrome: { port: cdpPort } };
        } else {
            console.log('Launching Chrome for connection test...');
            chrome = await launchChrome({ headless: false });
            cdpPort = chrome.chrome.port;
            console.log(`Chrome launched on port: ${cdpPort}`);
        }

        // Step 2: Connect to Chrome via CDP
        console.log('Connecting to Chrome via CDP...');
        client = await CDP({ port: cdpPort });
        console.log('✅ Connected to Chrome via CDP');

        // Step 3: Create a new target (tab)
        console.log('Creating a new tab...');
        const { targetId } = await client.Target.createTarget({
            url: 'about:blank',
            newWindow: false,
            background: false,
        });
        console.log(`✅ Created new tab with ID: ${targetId}`);

        // Step 4: Attach to target
        console.log('Attaching to tab...');
        await client.Target.attachToTarget({
            targetId,
            flatten: true,
        });
        console.log('✅ Attached to tab');

        // Step 5: Enable required domains
        console.log('Enabling CDP domains...');
        await Promise.all([
            client.Page.enable(),
            client.DOM.enable(),
            client.Runtime.enable(),
        ]);
        console.log('✅ Enabled CDP domains');

        // Step 6: Navigate to a URL
        console.log('Navigating to example.com...');
        const loadPromise = new Promise<void>(resolve => {
            client!.once('Page.loadEventFired', () => resolve());
        });

        await client.Page.navigate({ url: 'https://example.com' });
        await loadPromise;
        console.log('✅ Navigated to example.com');

        // Step 7: Take a screenshot
        console.log('Taking screenshot...');
        const { data } = await client.Page.captureScreenshot({ format: 'png' });
        console.log(`✅ Screenshot taken (${data.length} bytes)`);

        // Step 8: Get page title
        console.log('Getting page title...');
        const result = await client.Runtime.evaluate({
            expression: 'document.title',
        });
        console.log(`✅ Page title: "${result.result.value}"`);

        console.log(
            '\n🎉 ALL TESTS PASSED! CDP connection is working properly.'
        );

        // Clean up
        if (client) {
            await client.Target.closeTarget({ targetId });
            console.log('🧹 Closed test tab');
        }
    } catch (error) {
        console.error(
            '❌ TEST FAILED:',
            error instanceof Error ? error.message : String(error)
        );
        console.error(error);
    } finally {
        // Close client
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.error(
                    'Error closing CDP client:',
                    e instanceof Error ? e.message : String(e)
                );
            }
        }

        // Only shut down Chrome if we launched it specifically for this test
        if (chrome && !cdpPort) {
            console.log('Shutting down Chrome...');
            try {
                await shutdownChrome();
            } catch (e) {
                console.error(
                    'Error shutting down Chrome:',
                    e instanceof Error ? e.message : String(e)
                );
            }
        }
    }
}

// Docker environment test
function simulateDockerConnection(): void {
    console.log(
        '\n🐳 Testing connection from Docker container to host machine...'
    );
    console.log(
        'Note: This is a simulated test. To fully test this, run this script in the container.'
    );

    const inDocker = process.env.RUNNING_IN_DOCKER === 'true';
    const host = inDocker ? 'host.docker.internal' : 'localhost';

    console.log(`→ Would connect to: ${host}:${cdpPort}`);
    console.log(`→ Environment variables:`);
    console.log(
        `  • RUNNING_IN_DOCKER: ${process.env.RUNNING_IN_DOCKER || 'not set'}`
    );
    console.log(`  • HOST_CDP_PORT: ${process.env.HOST_CDP_PORT || cdpPort}`);

    console.log('\n📝 Connection string in Docker should be:');
    console.log(`  CDP({ host: 'host.docker.internal', port: ${cdpPort} })`);
}

// Run the test
async function main(): Promise<void> {
    console.log('======== CDP CONNECTION TEST ========');
    await testConnection();
    simulateDockerConnection();
    console.log('====================================');
}

main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
