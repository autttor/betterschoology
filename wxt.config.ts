import { defineConfig } from 'wxt';

/**
 * Better Schoology build configuration.
 *
 * Firefox is the only target we actively build and test for 0.0.1. Chromium
 * support is deliberately left to a later milestone, so nothing here encodes
 * Chrome-only assumptions -- `targetBrowser` is read from WXT rather than
 * hard-coded, and everything browser-specific lives in this one file.
 */
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  outDir: '.output',

  // Firefox has supported MV3 since 109; WXT emits an event page rather than a
  // service worker for it. Nothing here needs MV2, so we ship the current
  // manifest version rather than the deprecated one WXT still defaults Firefox to.
  manifestVersion: 3,

  manifest: ({ browser, mode }) => {
    const isDev = mode === 'development';

    return {
      name: 'Better Schoology',
      short_name: 'Better Schoology',
      description:
        'Makes Schoology more customizable and student-focused. Independent project, not affiliated with PowerSchool or Schoology.',
      homepage_url: 'https://github.com/autttor/betterschoology',

      // `storage` is the only permission 0.0.1 needs: every customization is
      // kept locally in the browser. No history/downloads/bookmarks/webRequest.
      permissions: ['storage'],

      // Production stays scoped to Schoology-hosted tenants. The local fixture
      // server is added in development only so `npm run dev` can drive the
      // reconstructed Schoology pages on localhost.
      host_permissions: isDev
        ? ['*://*.schoology.com/*', 'http://localhost:4173/*', 'http://127.0.0.1:4173/*']
        : ['*://*.schoology.com/*'],

      ...(browser === 'firefox'
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'better-schoology@betterschoology.dev',
                /*
                 * 115 is the oldest Firefox that runs everything this
                 * extension actually uses (MV3 event pages, storage, the
                 * content script). `web-ext lint` warns that 115 predates
                 * `data_collection_permissions` (Firefox 142) -- that warning
                 * is expected and accepted. The key is additive metadata that
                 * older Firefox ignores harmlessly, and raising the minimum to
                 * 142 purely to silence a warning would lock out ESR users,
                 * which schools commonly run.
                 */
                strict_min_version: '115.0',
                // Better Schoology collects nothing and talks to no backend.
                data_collection_permissions: {
                  required: ['none'],
                },
              },
            },
          }
        : {}),
    };
  },
});
