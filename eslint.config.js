// eslint.config.js
const typescriptParser = require('@typescript-eslint/parser');
const typescriptPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
];