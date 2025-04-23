/**
 * E2E Tests for complex tasks involving multiple steps or tools
 */
import { test, expect } from '../../utils/test-utils';

// Define the base URL for the Controller UI
const CONTROLLER_URL = process.env.CONTROLLER_URL || 'http://localhost:3000';

test.describe('Complex Task E2E', () => {
    test('should handle a multi-step task (write file, execute command)', async ({
        page,
    }) => {
        const scriptFileName = `temp_script_${Date.now()}.py`;
        const scriptContent = "print('Hello from script!')";
        const expectedOutput = 'Hello from script!';

        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Define the complex task
        const complexTask = `
      1. Write the following python code to a file named '${scriptFileName}':
         \`\`\`python
         ${scriptContent}
         \`\`\`
      2. Execute the script using the command: python ./${scriptFileName}
      3. Delete the file '${scriptFileName}'
    `; // Assuming the agent can parse and execute these steps

        await taskInput.fill(complexTask);
        await submitButton.click();

        // Wait for the final output/confirmation. This needs to account for all steps.
        // We expect to see the output from the script execution and confirmation of deletion.
        // Using a longer timeout due to multiple steps.
        await expect(outputContainer).toContainText(expectedOutput, {
            timeout: 90000,
        });
        await expect(outputContainer).toContainText(
            `Successfully saved to ${scriptFileName}`,
            { timeout: 10000 }
        ); // Check file write confirmation
        await expect(outputContainer).toContainText(
            `Successfully deleted ${scriptFileName}`,
            { timeout: 10000 }
        ); // Check deletion confirmation

        // Verify the script output specifically within the command execution context if possible
        // This might require more specific selectors or output formatting checks.
    });

    test('should handle a code modification task (create, modify, read)', async ({
        page,
    }) => {
        const codeFileName = `temp_code_${Date.now()}.js`;
        const initialContent = `function greet() {\n  console.log("Hello, world!");\n}`;
        const modifiedContent = `function greet() {\n  console.log("Hello, modified world!");\n}`;
        const modificationInstruction =
            'In the function greet, change "Hello, world!" to "Hello, modified world!"';

        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Define the multi-step task
        const complexTask = `
      1. Create a file named '${codeFileName}' with the following content:
         \`\`\`javascript
         ${initialContent}
         \`\`\`
      2. Modify the file '${codeFileName}': ${modificationInstruction}
      3. Read the content of the file '${codeFileName}'
      4. Delete the file '${codeFileName}'
    `; // Assuming agent understands modification requests

        await taskInput.fill(complexTask);
        await submitButton.click();

        // Wait for the final output, which should be the modified file content.
        // Also check intermediate confirmations if possible/reliable.
        await expect(outputContainer).toContainText(modifiedContent, {
            timeout: 90000,
        });
        await expect(outputContainer).toContainText(
            `Successfully saved to ${codeFileName}`,
            { timeout: 10000 }
        ); // Initial write
        // Confirmation for modification might be tricky, depends on agent output
        // await expect(outputContainer).toContainText(`Successfully modified ${codeFileName}`, { timeout: 10000 });
        await expect(outputContainer).toContainText(
            `Successfully deleted ${codeFileName}`,
            { timeout: 10000 }
        ); // Deletion
    });

    test('should handle task combining browser read, file write, and command execution', async ({
        page,
    }) => {
        const tempFileName = `web_content_${Date.now()}.txt`;
        const targetUrl = 'https://example.com/';
        const expectedHeading = 'Example Domain'; // The h1 text on example.com

        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Define the complex task combining multiple tool types
        const complexTask = `
      1. Open the URL ${targetUrl}
      2. Read the text content of the 'h1' element.
      3. Write the text you just read to a file named '${tempFileName}'.
      4. Execute the command: echo "The heading read from the website was: ${expectedHeading}"
      5. Read the content of the file '${tempFileName}' to confirm.
      6. Delete the file '${tempFileName}'.
    `; // Note: Step 4 uses the known expected heading directly for simplicity in the test command.
        // A more advanced agent might use a variable or placeholder for the read content.

        await taskInput.fill(complexTask);
        await submitButton.click();

        // Wait for confirmations and final output. Check key parts of the process.
        // Use a long timeout for the multi-step process.
        await expect(outputContainer).toContainText(
            `Navigated to ${targetUrl}`,
            { timeout: 90000 }
        ); // Browser nav
        await expect(outputContainer).toContainText(expectedHeading, {
            timeout: 10000,
        }); // Browser read result / File read result / Echo command output
        await expect(outputContainer).toContainText(
            `Successfully saved to ${tempFileName}`,
            { timeout: 10000 }
        ); // File write
        await expect(outputContainer).toContainText(
            `The heading read from the website was: ${expectedHeading}`,
            { timeout: 10000 }
        ); // Command execution output
        await expect(outputContainer).toContainText(
            `Successfully deleted ${tempFileName}`,
            { timeout: 10000 }
        ); // Deletion
    });

    test('should handle task involving search and reporting results', async ({
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

        // Define the search task
        const searchPattern = 'TODO:';
        const searchDir = 'magi/src'; // Directory to search within
        const searchTask = `Search for the text pattern "${searchPattern}" in all files within the '${searchDir}' directory and list the files containing matches.`;

        await taskInput.fill(searchTask);
        await submitButton.click();

        // Wait for the search results to appear in the output.
        // This assumes the agent will list files found or report the search results.
        // We'll check for a known file that likely contains 'TODO:'. Adjust if needed.
        await expect(outputContainer).toContainText('Found matches for', {
            timeout: 90000,
        }); // General confirmation
        await expect(outputContainer).toContainText(
            'magi/src/magi_agents/common_agents/browser_agent.ts',
            { timeout: 10000 }
        ); // Example file expected to have TODOs
        // Add more specific checks based on expected search output format if known.
    });

    // TODO: Add more complex task tests:
    // - Tasks involving code modification (read, replace, write)
});
