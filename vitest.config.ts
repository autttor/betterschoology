import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // Playwright specs live under tests/e2e and are run by `npm run test:e2e`.
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
