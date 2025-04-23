/**
 * E2E Tests for basic user interactions with the Controller UI
 */
import { test, expect } from '../../utils/test-utils';

// Define the base URL for the Controller UI
const CONTROLLER_URL = process.env.CONTROLLER_URL || 'http://localhost:3000';

test.describe('Basic Controller Interaction E2E', () => {
    test('should load the controller UI and allow starting a simple task', async ({
        page,
    }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);

        // Wait for the main UI elements to be visible (adjust selectors as needed)
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 }); // Basic check
        // TODO: Add more specific checks for UI elements like input fields, buttons

        // Find the task input field (assuming an input with a specific placeholder or ID)
        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        await expect(taskInput).toBeVisible();

        // Enter a simple task
        const simpleTask = 'List files in the root directory';
        await taskInput.fill(simpleTask);

        // Find and click the submit button (assuming a button with specific text or ID)
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // Wait for the task output to appear (assuming output appears in a specific container)
        // This requires knowing how results are displayed. Let's assume a div with class 'output-container'
        const outputContainer = page.locator('.output-container'); // Adjust selector
        await expect(outputContainer).toBeVisible({ timeout: 30000 }); // Wait longer for task execution

        // Verify the output contains expected content (e.g., a common file name)
        // This is a basic check; more specific checks might be needed
        await expect(outputContainer).toContainText('package.json', {
            timeout: 15000,
        });
        await expect(outputContainer).toContainText('README.md', {
            timeout: 15000,
        });

        // Optional: Add checks for task status indicators (e.g., "Completed")
    });

    test('should display a message or prevent submission for an empty task', async ({
        page,
    }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        // Find the task input field and submit button
        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        await expect(taskInput).toBeVisible();
        await expect(submitButton).toBeVisible();

        // Ensure the input is empty
        await taskInput.fill('');

        // Attempt to submit
        // Option 1: Check if the button is disabled
        // await expect(submitButton).toBeDisabled();

        // Option 2: Click the button and check for a validation message
        await submitButton.click();
        // Assuming an error message appears near the input or in a general notification area
        const errorMessage = page.locator('.error-message, .validation-error'); // Adjust selector
        await expect(errorMessage).toContainText('Task cannot be empty', {
            timeout: 5000,
        }); // Adjust expected text

        // Ensure no task output was generated
        const outputContainer = page.locator('.output-container'); // Adjust selector
        await expect(outputContainer).not.toBeVisible();
    });

    test('should handle tasks that result in an error', async ({ page }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        // Find the task input field and submit button
        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        await expect(taskInput).toBeVisible();
        await expect(submitButton).toBeVisible();

        // Enter a task designed to fail (e.g., invalid command or non-existent file)
        const errorTask = 'Read a non-existent file named foobar123.txt';
        await taskInput.fill(errorTask);
        await submitButton.click();

        // Wait for the output/error container
        const outputContainer = page.locator(
            '.output-container, .error-container'
        ); // Adjust selector
        await expect(outputContainer).toBeVisible({ timeout: 30000 });

        // Verify an error message is displayed
        // This depends on how errors are presented in the UI
        await expect(outputContainer).toContainText('Error', {
            ignoreCase: true,
            timeout: 15000,
        });
        await expect(outputContainer).toContainText('foobar123.txt', {
            timeout: 15000,
        }); // Check if the error mentions the file
        // TODO: Add more specific checks for error formatting or codes if available
    });

    test('should handle file operations (create, read, delete)', async ({
        page,
    }) => {
        const testFileName = `test-e2e-file-${Date.now()}.txt`;
        const testFileContent = 'Hello from E2E test!';
        const createFileTask = `Create a file named ${testFileName} with content '${testFileContent}'`;
        const readFileTask = `Read the file named ${testFileName}`;
        const deleteFileTask = `Delete the file named ${testFileName}`; // Assuming a command or tool exists

        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // --- 1. Create File ---
        await taskInput.fill(createFileTask);
        await submitButton.click();
        // Wait for confirmation - adjust selector/text based on actual success message
        await expect(outputContainer).toContainText(
            `Successfully saved to ${testFileName}`,
            { timeout: 30000 }
        );

        // Clear input for next task (assuming UI clears it, otherwise add clear step)
        // await taskInput.fill(''); // Uncomment if needed

        // --- 2. Read File ---
        await taskInput.fill(readFileTask);
        await submitButton.click();
        // Wait for the file content to appear in the output
        await expect(outputContainer).toContainText(testFileContent, {
            timeout: 30000,
        });

        // Clear input for next task
        // await taskInput.fill(''); // Uncomment if needed

        // --- 3. Delete File (Cleanup) ---
        await taskInput.fill(deleteFileTask);
        await submitButton.click();
        // Wait for confirmation of deletion - adjust selector/text
        await expect(outputContainer).toContainText(
            `Successfully deleted ${testFileName}`,
            { timeout: 30000 }
        ); // Adjust expected text
    });

    test('should execute a shell command via a task', async ({ page }) => {
        // Navigate to the Controller UI
        await page.goto(CONTROLLER_URL);
        await expect(page.locator('body')).toBeVisible({ timeout: 10000 });

        const taskInput = page.locator(
            'textarea[placeholder*="Enter your task"]'
        ); // Adjust selector
        const submitButton = page.locator('button:has-text("Run")'); // Adjust selector
        const outputContainer = page.locator('.output-container'); // Adjust selector

        // Task to execute a simple echo command
        const command = "echo 'Hello from execute_command test!'";
        const executeCommandTask = `Execute the command: ${command}`; // Phrasing might need adjustment based on agent understanding

        await taskInput.fill(executeCommandTask);
        await submitButton.click();

        // Wait for the command's output to appear.
        // This assumes the output of execute_command is displayed directly.
        await expect(outputContainer).toContainText(
            'Hello from execute_command test!',
            { timeout: 30000 }
        );

        // Also check for confirmation that the command executed (if provided)
        // await expect(outputContainer).toContainText('Command executed successfully', { timeout: 10000 }); // Adjust expected text
    });

    test('should display status updates during and after task execution', async ({
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
        // Assume status is shown in a specific element, e.g., a div with class 'task-status'
        const statusIndicator = page.locator('.task-status'); // Adjust selector

        // Enter a task that takes a moment (e.g., list files)
        const task = 'List all files in the current directory recursively';
        await taskInput.fill(task);
        await submitButton.click();

        // Immediately check for a "Running" or "Processing" status
        // Use a short timeout as it should appear quickly
        await expect(statusIndicator).toContainText(/Running|Processing/i, {
            timeout: 5000,
        }); // Adjust expected text/regex

        // Wait for the task to complete by checking the output
        await expect(outputContainer).toBeVisible({ timeout: 60000 }); // Wait longer for recursive list
        await expect(outputContainer).toContainText('package.json', {
            timeout: 15000,
        }); // Check for some expected output

        // Check for a "Completed" or "Finished" status
        await expect(statusIndicator).toContainText(
            /Completed|Finished|Done/i,
            { timeout: 5000 }
        ); // Adjust expected text/regex
    });

    // TODO: Add more tests for:
    // - Interaction with other UI elements (settings, history, etc.)
});
