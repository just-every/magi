import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['test/**/*.test.ts'],
        env: {
            OPENAI_API_KEY: 'test-api-key',
            ANTHROPIC_API_KEY: 'test-api-key',
            GOOGLE_API_KEY: 'test-api-key',
            DEEPSEEK_API_KEY: 'test-api-key',
            XAI_API_KEY: 'test-api-key',
            OPENROUTER_API_KEY: 'test-api-key',
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/*.d.ts',
                '**/*.config.ts',
                '**/test/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@magi-system/ensemble': path.resolve(__dirname, './dist'),
        },
    },
});