/**
 * Test script for grid overlay functionality
 *
 * This script launches a browser window, navigates to a webpage,
 * and captures screenshots with the grid overlay.
 */

import { getAgentBrowserSession } from './src/utils/browser_session.js';
import * as fs from 'fs';
import * as path from 'path';

async function testGridOverlay() {
  console.log('Starting grid overlay test...');

  // Create a unique tab ID for the test
  const tabId = 'grid-test-' + Date.now();

  try {
    // Get a browser session
    const browser = getAgentBrowserSession(tabId);

    // Initialize the browser session
    await browser.initialize();
    console.log('Browser session initialized');

    // Navigate to a test URL
    await browser.navigate('https://example.com');
    console.log('Navigated to example.com');

    // Capture a screenshot with browser status (includes the grid)
    const result = await browser.browserStatus();
    console.log('Screenshot captured with grid overlay');

    // Ensure we have a valid result with a screenshot
    if ('error' in result) {
      throw new Error(`Failed to capture screenshot: ${result.error}`);
    }

    // Save the screenshot with grid to a file
    const outputDir = path.join(process.cwd(), 'test-output');

    // Create the output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Extract the base64 image data (remove the data URL prefix)
    const imageData = result.screenshot.replace(/^data:image\/\w+;base64,/, '');

    // Write the image to a file
    const outputPath = path.join(outputDir, 'screenshot-with-grid.png');
    fs.writeFileSync(outputPath, Buffer.from(imageData, 'base64'));
    console.log(`Screenshot saved to: ${outputPath}`);

    // Close the browser session
    await browser.closeSession();
    console.log('Browser session closed');

    return { success: true, path: outputPath };
  } catch (error) {
    console.error('Error in grid overlay test:', error);
    return { success: false, error };
  }
}

// Run the test
testGridOverlay().then(result => {
  if (result.success) {
    console.log(`Grid overlay test completed successfully!`);
    console.log(`Screenshot saved at: ${result.path}`);
  } else {
    console.error('Grid overlay test failed:', result.error);
    process.exit(1);
  }
});
