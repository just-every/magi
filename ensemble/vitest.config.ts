import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/*.d.ts',
                '**/*.config.ts',
            ],
        },
    },
    resolve: {
        alias: {
            '@magi-system/ensemble': path.resolve(__dirname, './dist'),
        },
    },
});