import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * End-to-end tests against the BUILT content-script bundle.
 *
 * Everything else tests source modules. This loads the artifact WXT actually
 * ships into a real browser, against the local Schoology reconstruction, with
 * a minimal WebExtension storage stub. It is the layer that catches bundling,
 * manifest-mode and build-configuration problems that module-level tests
 * cannot see — including the production host guard, which is a build-time
 * decision and therefore invisible to jsdom.
 *
 * It is not a substitute for loading the extension in Firefox: there is no
 * real extension runtime here, so popup, options, permissions and the
 * background page are still verified manually (see docs/testing.md).
 */
const ROOT = resolve(import.meta.dirname, '..', '..');

const BUNDLES = {
  development: join(ROOT, '.output', 'firefox-mv3-dev', 'content-scripts'),
  production: join(ROOT, '.output', 'firefox-mv3', 'content-scripts'),
} as const;

function bundle(mode: keyof typeof BUNDLES): { js: string; css: string } | null {
  const dir = BUNDLES[mode];
  const js = join(dir, 'content.js');
  const css = join(dir, 'content.css');
  if (!existsSync(js)) return null;
  return {
    js: readFileSync(js, 'utf8'),
    css: existsSync(css) ? readFileSync(css, 'utf8') : '',
  };
}

const INITIAL_STATE = {
  schemaVersion: 1,
  settings: { enabled: true, theme: 'dark', betterDashboard: true, betterTodo: true },
  customizations: {},
  courses: {},
};

/** Minimal storage/runtime stub, enough for the content script to boot. */
async function installExtensionStub(page: Page, state: unknown): Promise<void> {
  await page.addInitScript((initial) => {
    const store: Record<string, unknown> = { betterSchoologyState: initial };
    const listeners: Array<(changes: unknown, area: string) => void> = [];

    const api = {
      storage: {
        local: {
          get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
          set: async (items: Record<string, unknown>) => {
            Object.assign(store, items);
            for (const listener of listeners) {
              listener({ betterSchoologyState: { newValue: items.betterSchoologyState } }, 'local');
            }
          },
        },
        onChanged: {
          addListener: (l: (changes: unknown, area: string) => void) => listeners.push(l),
          removeListener: () => {},
        },
      },
      runtime: {
        id: 'test',
        getManifest: () => ({ version: '0.0.1' }),
        onMessage: { addListener: () => {} },
      },
    };

    (window as unknown as Record<string, unknown>).browser = api;
    (window as unknown as Record<string, unknown>).chrome = api;
  }, state);
}

async function runBundle(page: Page, mode: keyof typeof BUNDLES): Promise<boolean> {
  const files = bundle(mode);
  if (!files) return false;

  await page.addStyleTag({ content: files.css });
  await page.evaluate((source) => {
    const script = document.createElement('script');
    script.textContent = source;
    document.documentElement.appendChild(script);
  }, files.js);

  // The lifecycle debounces its first pass and Better To Do fetches fragments.
  await page.waitForTimeout(2500);
  return true;
}

test.describe('built content script', () => {
  test('enhances a Schoology page end to end', async ({ page }) => {
    test.skip(
      !bundle('development'),
      'Run `npm run build:firefox:dev` first — this test drives the built bundle.',
    );

    await installExtensionStub(page, INITIAL_STATE);
    await page.goto('/home', { waitUntil: 'networkidle' });
    await runBundle(page, 'development');

    // Dark mode reached the document and actually repainted the page.
    await expect(page.locator('html')).toHaveAttribute('data-bs-dark', '');
    await expect(page.locator('html')).toHaveAttribute('data-better-schoology-theme', 'dark');
    const bodyBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBackground).not.toBe('rgb(255, 255, 255)');

    // The dashboard renders, and it owns the To Do list -- more items than
    // Schoology's own panel ever displays.
    const dashboard = page.locator('[data-better-schoology="better-dashboard"]');
    await expect(dashboard).toBeAttached();
    expect(await dashboard.locator('.bs-task').count()).toBeGreaterThan(7);

    // Native surfaces are hidden, never removed.
    await expect(page.locator('#home-feed-container')).toBeAttached();
    await expect(page.locator('#home-feed-container')).toHaveClass(/bs-hidden-by-dashboard/);
    await expect(page.locator('#right-column')).toBeAttached();

    // The Feed tab brings Schoology's own page straight back.
    await page.locator('.bs-tab[data-bs-tab="feed"]').click();
    await expect(page.locator('#home-feed-container')).not.toHaveClass(/bs-hidden-by-dashboard/);
    await expect(page.locator('#right-column')).not.toHaveClass(/bs-hidden-by-dashboard/);

    // Native Schoology is left intact, markers included.
    await expect(page.locator('#todo .upcoming-event').first()).toBeAttached();
    expect(await page.locator('.sEventUpcoming-processed').count()).toBeGreaterThan(0);
  });

  test('reorganizes a course page without touching the native menu', async ({ page }) => {
    test.skip(!bundle('development'), 'Run `npm run build:firefox:dev` first.');

    await installExtensionStub(page, INITIAL_STATE);
    await page.goto('/course/100001/materials', { waitUntil: 'networkidle' });
    const nativeMenuLinks = await page.locator('#menu-s-main a[href]').count();
    await runBundle(page, 'development');

    await expect(page.locator('.bs-course-header')).toBeAttached();
    await expect(page.locator('.bs-course-nav-link')).toHaveCount(4);

    // Apps are collapsed, not removed.
    await expect(page.locator('#menu-s-apps-list')).toHaveClass(/bs-apps-collapsed/);
    expect(await page.locator('.app-link-wrapper').count()).toBeGreaterThan(0);
    await page.locator('.bs-apps-toggle__button').click();
    await expect(page.locator('#menu-s-apps-list')).not.toHaveClass(/bs-apps-collapsed/);

    // The native menu is exactly as Schoology rendered it.
    expect(await page.locator('#menu-s-main a[href]').count()).toBe(nativeMenuLinks);
  });

  /**
   * The rule the whole assignment feature exists to respect: Schoology's own
   * submission control is relocated, not recreated. If this ever became a copy,
   * a student's submission would go nowhere.
   */
  test('moves the real submit control into the Better Assignment layout', async ({ page }) => {
    test.skip(!bundle('development'), 'Run `npm run build:firefox:dev` first.');

    await installExtensionStub(page, INITIAL_STATE);
    await page.goto('/assignment/200002/info', { waitUntil: 'networkidle' });
    const nativeHref = await page.locator('.dropbox-submit').getAttribute('href');
    await runBundle(page, 'development');

    await expect(page.locator('[data-better-schoology="better-assignment"]')).toBeAttached();
    await expect(page.locator('.dropbox-submit')).toHaveCount(1);
    await expect(page.locator('.dropbox-submit')).toHaveAttribute('href', nativeHref ?? '');
    await expect(
      page.locator('[data-better-schoology="better-assignment"] .dropbox-submit'),
    ).toBeAttached();
    await expect(page.locator('.bs-assignment__grade-points')).toHaveText('5 / 5');
  });

  test('summarizes grades and calculates a GPA', async ({ page }) => {
    test.skip(!bundle('development'), 'Run `npm run build:firefox:dev` first.');

    await installExtensionStub(page, INITIAL_STATE);
    await page.goto('/grades/grades', { waitUntil: 'networkidle' });
    const nativeReports = await page.locator('.hierarchical-grading-report').count();
    await runBundle(page, 'development');

    // One Better Grades panel per course report, native tables hidden but kept.
    expect(await page.locator('[data-better-schoology="better-grades"]').count()).toBe(
      nativeReports,
    );
    expect(await page.locator('.gradebook-course-grades table').count()).toBe(nativeReports);
    await expect(page.locator('.gradebook-course-grades table').first()).toHaveClass(
      /bs-hidden-by-grades/,
    );

    // The GPA panel carries its disclosures.
    const gpa = page.locator('[data-better-schoology="better-gpa"]');
    await expect(gpa).toBeAttached();
    await expect(gpa).toContainText('not an official GPA');
  });

  test('answers what is needed on a final, from the real course model', async ({ page }) => {
    test.skip(!bundle('development'), 'Run `npm run build:firefox:dev` first.');

    await installExtensionStub(page, INITIAL_STATE);
    await page.goto('/course/100001/student_grades', { waitUntil: 'networkidle' });
    await runBundle(page, 'development');

    await page.getByRole('button', { name: 'What do I need?' }).click();
    await expect(page.locator('.bs-calc__outcome-value')).toBeVisible();

    // The captured course is 5/5; a 100-point final for a 90% target needs 89.5.
    await expect(page.locator('.bs-calc__outcome-value')).toHaveText('89.5%');
  });

  test('does nothing when the extension is disabled', async ({ page }) => {
    test.skip(!bundle('development'), 'Run `npm run build:firefox:dev` first.');

    await installExtensionStub(page, {
      ...INITIAL_STATE,
      settings: { ...INITIAL_STATE.settings, enabled: false },
    });
    await page.goto('/home', { waitUntil: 'networkidle' });
    await runBundle(page, 'development');

    await expect(page.locator('html')).not.toHaveAttribute('data-bs-dark', '');
    await expect(page.locator('[data-better-schoology="better-todo"]')).toHaveCount(0);
    await expect(page.locator('[data-better-schoology="better-dashboard"]')).toHaveCount(0);
    await expect(page.locator('#home-feed-container')).not.toHaveClass(
      /bs-hidden-by-dashboard/,
    );
  });

  /**
   * The production host guard is a build-time decision, so this is the only
   * layer that can prove it. A shipped build must refuse to enhance the local
   * fixture server even though the code path exists.
   */
  test('the production build refuses to enhance a non-Schoology host', async ({ page }) => {
    test.skip(!bundle('production'), 'Run `npm run build:firefox` first.');

    await installExtensionStub(page, INITIAL_STATE);
    await page.goto('/home', { waitUntil: 'networkidle' });
    await runBundle(page, 'production');

    await expect(page.locator('html')).not.toHaveAttribute('data-bs-dark', '');
    await expect(page.locator('[data-better-schoology="better-todo"]')).toHaveCount(0);
    await expect(page.locator('#home-feed-container')).toBeAttached();
  });
});
