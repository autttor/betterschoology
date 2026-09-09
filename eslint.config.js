import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import autoImports from './.wxt/eslint-auto-imports.mjs';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.output/**',
      '.wxt/**',
      '.local-schoology/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      // Fixture pages are generated, sanitized Schoology markup.
      'tests/fixtures/**',
      // Served verbatim to the fixture browser; not part of the extension build.
      'dev/schoology/assets/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  autoImports,

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      /*
       * `any` is banned rather than warned. The Schoology adapter layer is
       * exactly where it would be tempting and exactly where it would hurt:
       * an untyped parse result propagates straight into feature code.
       */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'smart'],
    },
  },

  {
    files: ['entrypoints/**/*.tsx', 'src/components/**/*.ts?(x)'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  {
    // Development tooling runs in Node and is expected to talk to the console.
    files: ['dev/**/*.{ts,mjs}', 'scripts/**/*.{ts,mjs}', '*.config.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        // The QA harness evaluates a stub inside the page it drives.
        window: 'readonly',
        document: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
);
