k; /**
 * E2E Tests for browser interactions initiated via the Controller UI
 */
import { test, expect } from '../../utils/test-utils';

// Define the base URL for the Controller UI
const CONTROLLER_URL = process.env.CONTROLLER_URL || 'http://localhost:3000';

test.describe('Browser Interaction E2E', () => {
    test('should open a URL in the browser via a task', async ({ page }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Task to open a specific URL
        const targetUrl = 'https://example.com/';
        const openUrlTask = `Open the URL ${targetUrl}`;

        await taskInput.fill(openUrlTask);
        await submitButton.click();

        // Wait for confirmation in the output.
        // The exact confirmation message might vary depending on the BrowserAgent's response.
        // We'll look for text indicating the navigation was successful or the URL was opened.
        await expect(outputContainer).toContainText(
            `Navigated to ${targetUrl}`,
            { timeout: 45000 }
        ); // Adjust expected text and timeout

        // Potential further checks (more complex):
        // - Check if a new browser tab/window controlled by the extension actually opened example.com.
        //   This would require Playwright to potentially connect to or inspect that browser instance,
        //   which might need specific setup in test-utils or the test environment.
    });

    test('should interact with form elements (type and click) via tasks', async ({
        page,
    }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Task sequence: Open login page, type username, type password, click login
        const loginUrl = 'https://the-internet.herokuapp.com/login';
        const username = 'tomsmith'; // Standard username for this test site
        const password = 'SuperSecretPassword!'; // Standard password
        const taskSequence = `
      1. Open the URL ${loginUrl}
      2. Type '${username}' into the input field with id 'username'
      3. Type '${password}' into the input field with id 'password'
      4. Click the button with selector 'button[type="submit"]'
    `; // Assuming the agent can handle multi-step tasks or requires separate tasks

        await taskInput.fill(taskSequence);
        await submitButton.click();

        // Wait for confirmation of the final step (clicking the button)
        // The confirmation might just be the result of the click action.
        // A more robust check would be to verify navigation to the secure area or a success message.
        await expect(outputContainer).toContainText(
            'Clicked element button[type="submit"]',
            { timeout: 60000 }
        ); // Adjust expected text and timeout

        // Optional: Add a subsequent task to read content from the resulting page
        // const readSuccessMessageTask = "Read the text content of the element with id 'flash'";
        // await taskInput.fill(readSuccessMessageTask);
        // await submitButton.click();
        // await expect(outputContainer).toContainText('You logged into a secure area!', { timeout: 30000 });
    });

    test('should read content from a web page via a task', async ({ page }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Task sequence: Open example.com, read the h1 tag
        const targetUrl = 'https://example.com/';
        const readContentTask = `
      1. Open the URL ${targetUrl}
      2. Read the text content of the 'h1' element
    `;

        await taskInput.fill(readContentTask);
        await submitButton.click();

        // Wait for the read content to appear in the output
        await expect(outputContainer).toContainText('Example Domain', {
            timeout: 45000,
        }); // Check for the expected h1 text
    });

    test('should use vision to interact with elements based on visual context', async ({
        page,
    }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Task sequence requiring visual understanding
        const loginUrl = 'https://the-internet.herokuapp.com/login';
        const visionTask = `
      1. Open the URL ${loginUrl}
      2. Click the 'Login' button located below the password input field.
    `; // This phrasing encourages using vision

        await taskInput.fill(visionTask);
        await submitButton.click();

        // Wait for confirmation. Similar to the form test, verifying the result of the click.
        // A successful click on the login button (with empty fields) usually reloads the page
        // or shows an error message on the same page. We'll check for the click confirmation text.
        // The exact selector might be different if vision identifies it differently.
        await expect(outputContainer).toContainText(/Clicked element/i, {
            timeout: 60000,
        }); // General check for click confirmation
        // More specific check if the agent reports the selector it clicked:
        // await expect(outputContainer).toContainText('Clicked element button[type="submit"]', { timeout: 60000 });

        // Optional: Verify the outcome (e.g., error message shown on the login page)
        // const readErrorMessageTask = "Read the text content of the element with id 'flash'";
        // await taskInput.fill(readErrorMessageTask);
        // await submitButton.click();
        // await expect(outputContainer).toContainText('Your username is invalid!', { timeout: 30000 }); // Error for empty fields
    });

    test('should handle errors when interacting with non-existent browser elements', async ({
        page,
    }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator(
            '.output-container, .error-container'
        ); // Adjust selector to include error display

        // Task sequence: Open a page, try to click a non-existent element
        const targetUrl = 'https://example.com/';
        const errorTask = `
      1. Open the URL ${targetUrl}
      2. Click the element with selector '#non-existent-button'
    `;

        await taskInput.fill(errorTask);
        await submitButton.click();

        // Wait for an error message related to the element not being found.
        // The exact error message depends on the browser extension/agent implementation.
        await expect(outputContainer).toContainText(
            /Element not found|Could not find element|selector.*#non-existent-button/i,
            { timeout: 45000 }
        ); // Adjust regex/text
    });

    test('should take a screenshot of a web page via a task', async ({
        page,
    }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Task sequence: Open example.com, take a screenshot
        const targetUrl = 'https://example.com/';
        const screenshotTask = `
      1. Open the URL ${targetUrl}
      2. Take a screenshot of the current page
    `;

        await taskInput.fill(screenshotTask);
        await submitButton.click();

        // Wait for confirmation that a screenshot was taken.
        // The exact message depends on the agent's implementation. It might mention a file path or just confirm the action.
        await expect(outputContainer).toContainText(
            /Screenshot taken|Screenshot saved/i,
            { timeout: 45000 }
        ); // Adjust regex/text

        // Ideally, we'd also check if the output includes an image tag or a link to the screenshot,
        // but verifying the file exists or its content is harder in this E2E context.
        // await expect(outputContainer.locator('img[src*="screenshot"]')).toBeVisible({ timeout: 10000 }); // Example check
    });

    test('should close a browser tab via a task', async ({ page }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Task sequence: Open two URLs (implicitly two tabs), then close one
        const url1 = 'https://example.com/';
        const url2 = 'https://the-internet.herokuapp.com/login';
        const closeTabTask = `
      1. Open the URL ${url1}
      2. Open the URL ${url2}
      3. Close the tab that currently has the URL ${url2}
    `; // Assuming the agent can identify tabs by URL

        await taskInput.fill(closeTabTask);
        await submitButton.click();

        // Wait for confirmation that the tab was closed.
        // The exact message depends on the agent's implementation.
        await expect(outputContainer).toContainText(/Closed tab|Tab closed/i, {
            timeout: 60000,
        }); // Adjust regex/text
        // Optionally check if it mentions the URL or title of the closed tab
        // await expect(outputContainer).toContainText(url2, { timeout: 10000 });

        // A more robust check would involve inspecting the actual browser state,
        // but that's complex for this E2E setup.
    });

    // TODO: Add more browser interaction tests:
});
