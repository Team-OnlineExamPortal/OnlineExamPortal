import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '.local/**', 'server/.runtime-check.cjs', 'server/review-repro.cjs'] },
  js.configs.recommended,
  { files: ['**/*.{js,cjs,mjs}'], languageOptions: { globals: { ...globals.node, ...globals.jest, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] } },
  { files: ['client/**/*.{js,jsx}'], ...react.configs.flat.recommended,
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser, ...globals.node } },
    settings: { react: { version: 'detect' } },
    rules: { ...react.configs.flat.recommended.rules, 'react/react-in-jsx-scope': 'off', 'react/prop-types': 'off' } },
  { files: ['server/**/*.js', 'scripts/**/*.{js,cjs}'], languageOptions: { sourceType: 'commonjs' } },
];
