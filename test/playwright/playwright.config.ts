import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the main project .env file
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [['html'], ['list']],
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'api-tests',
            testMatch: /api\/.*\.spec\.ts/,
        },
        {
            name: 'models-tests',
            testMatch: /models\/.*\.spec\.ts/,
        },
        {
            name: 'agents-tests',
            testMatch: /agents\/.*\.spec\.ts/,
        },
        {
            name: 'runner-tests',
            testMatch: /runner\/.*\.spec\.ts/,
        },
        {
            name: 'e2e-tests',
            testMatch: /e2e\/.*\.spec\.ts/,
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],
    webServer: {
        command: 'cd ../../controller && npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
