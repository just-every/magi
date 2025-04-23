/**
 * Utility functions for testing MAGI System
 */
import { test as base, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import {
    testProviderConfig,
    resetTestProviderConfig,
} from '../../../magi/src/model_providers/test_provider.js';

// Extend the test context with custom functions
export const test = base.extend({
    // Setup test provider configuration for the test
    configureTestProvider: async ({}, use) => {
        // Reset the test provider to defaults before each test
        resetTestProviderConfig();

        // Expose the configuration function
        await use((config: Partial<typeof testProviderConfig>) => {
            Object.assign(testProviderConfig, config);
        });

        // Reset after each test
        resetTestProviderConfig();
    },

    // Utility to create a temporary test file
    createTempFile: async ({}, use) => {
        const tempFiles: string[] = [];

        // Function to create a temporary file
        const createFile = (content: string, extension = '.txt'): string => {
            const filename = path.join(
                process.cwd(),
                `temp_${Date.now()}${extension}`
            );
            fs.writeFileSync(filename, content);
            tempFiles.push(filename);
            return filename;
        };

        // Provide the function to the test
        await use(createFile);

        // Clean up temp files after the test
        for (const file of tempFiles) {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }
    },

    // Wait for a file output to appear
    waitForOutput: async ({}, use) => {
        // Function to wait for output to appear in a file
        const waitForFileOutput = async (
            filepath: string,
            expectedContent: string | RegExp,
            timeout = 10000
        ): Promise<boolean> => {
            const startTime = Date.now();

            while (Date.now() - startTime < timeout) {
                if (fs.existsSync(filepath)) {
                    const content = fs.readFileSync(filepath, 'utf8');

                    if (
                        typeof expectedContent === 'string' &&
                        content.includes(expectedContent)
                    ) {
                        return true;
                    } else if (
                        expectedContent instanceof RegExp &&
                        expectedContent.test(content)
                    ) {
                        return true;
                    }
                }

                // Wait a short time before checking again
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            return false;
        };

        await use(waitForFileOutput);
    },
});

export { expect } from '@playwright/test';
