// Import the recommended rules from eslint and @typescript-eslint
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
    // Base configuration with ESLint defaults
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    // Add Prettier config to disable conflicting rules
    eslintConfigPrettier,

    // Project-specific configuration
    {
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2022,
            sourceType: 'module',
            parserOptions: {
                project: [
                    './tsconfig.json',
                    './controller/tsconfig.json',
                    './magi/tsconfig.json',
                    'browser/bridge/tsconfig.json',
                ],
            },
        },
        plugins: {
            '@typescript-eslint': tseslint.plugin,
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-namespace': [
                'error',
                { allowDeclarations: true },
            ],
            'no-console': 'off',
            quotes: ['error', 'single', { avoidEscape: true }],
        },
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            'setup/**',
            '**/*.js',
            '**/*.js.map',
        ],
        files: ['controller/src/**/*.ts', 'magi/src/**/*.ts'],
    },
    // Add Prettier plugin rules
    {
        plugins: {
            prettier: eslintPluginPrettier,
        },
        rules: {
            'prettier/prettier': 'error',
        },
    },
];
