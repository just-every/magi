import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        // Global test settings
        globals: true,
        environment: 'node', // Default environment
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/test/**',
                '**/*.d.ts',
                '**/*.config.ts',
            ],
        },
        include: [
            // Paths for all test files across the monorepo
            'ensemble/**/*.{test,spec}.{ts,tsx}',
            'magi/src/**/*.{test,spec}.{ts,tsx}',
            'controller/src/**/*.{test,spec}.{ts,tsx}',
            'browser/extension/src/**/*.{test,spec}.{ts,tsx}',
            'browser/bridge/**/*.{test,spec}.{ts,tsx}',
            'setup/**/*.{test,spec}.{ts,tsx}',
        ],
        // Test aliasing and resolution configuration
        alias: {
            '@ensemble': path.resolve(__dirname, './ensemble'),
            '@magi': path.resolve(__dirname, './magi/src'),
            '@controller': path.resolve(__dirname, './controller/src'),
            '@browser': path.resolve(__dirname, './browser'),
        },
        // Set up environments for different test scenarios
        environmentMatchGlobs: [
            // For React components in controller client
            ['controller/src/client/**/*.{test,spec}.{ts,tsx}', 'jsdom'],
            // For browser extension tests
            ['browser/extension/src/**/*.{test,spec}.{ts,tsx}', 'jsdom'],
        ],
    },
});
