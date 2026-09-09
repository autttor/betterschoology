import { defineConfig } from '@playwright/test';

/**
 * Browser tests against the local Schoology fixture server.
 *
 * These validate the reconstruction itself: routes resolve, scenarios apply,
 * the documented fragment endpoints answer, and the DOM the extension depends
 * on is present in a real browser rather than only in jsdom.
 *
 * They do not install a Firefox extension. The bundle test executes the emitted
 * content script with a storage shim and intercepted sanitized fixture requests.
 * Firefox installation and native IPC still need separate verification via
 * `npm run dev:firefox`. See docs/testing.md.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'npm run schoology:dev',
    url: 'http://localhost:4173/__fixtures',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        // Chromium is what the sandboxed CI image provides. The fixture server
        // is plain HTML, so the reconstruction is engine-independent.
        browserName: 'chromium',
        // Use an already-installed browser locally without downloading another.
        channel: process.env.PLAYWRIGHT_CHANNEL,
        launchOptions: process.env.PLAYWRIGHT_BROWSERS_PATH
          ? { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` }
          : {},
      },
    },
  ],
});
