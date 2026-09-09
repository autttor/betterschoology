import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultState } from '../../src/storage/defaults';

/** Execute the emitted Firefox content bundle in a real layout engine with a
 * storage API shim. This verifies its UI, not Firefox extension installation. */
test('built dashboard, native links, hiding, restore and Feed work together', async ({ page }, testInfo) => {
  const state = defaultState();
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../fixtures/schoology/manifest.json'), 'utf8')) as { pages: Array<{ id: string; courseId: string | null }> };
  const courseId = manifest.pages.find((item) => item.id === 'course-materials')!.courseId!;
  state.courses[courseId] = { id: courseId, originalName: 'Example Government', href: `/course/${courseId}`, lastSeenAt: 0 };
  state.settings.theme = 'dark';
  state.settings.betterDashboard = true;
  state.settings.displayNameOverride = 'Alex';
  state.settings.applyDisplayNameToSchoologyHeader = true;
  state.settings.navLabels.courses = 'Classes';
  state.settings.dashboard.showAnnouncements = true;
  state.settings.splash.contextual = false;
  state.settings.splash.easterEggs = false;
  await page.addInitScript((initialState) => {
    const values: Record<string, unknown> = { betterSchoologyState: initialState };
    const listeners: Array<(changes: Record<string, { newValue: unknown }>, area: string) => void> = [];
    Object.assign(globalThis, { browser: {
      runtime: { id: 'fixture-extension', openOptionsPage: async () => {} },
      storage: {
        local: {
          get: async (key: string) => structuredClone({ [key]: values[key] }),
          set: async (next: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(next)) {
              if (JSON.stringify(values[key]) === JSON.stringify(value)) continue;
              values[key] = structuredClone(value);
              for (const listener of listeners) listener({ [key]: { newValue: structuredClone(value) } }, 'local');
            }
          },
        },
        onChanged: { addListener: (listener: typeof listeners[number]) => listeners.push(listener), removeListener: () => {} },
      },
    } });
  }, state);
  // All requests go to sanitized localhost fixtures; never a real Schoology tenant.
  await page.route('https://fixture.schoology.com/**', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('polish', '1');
    const response = await page.request.get(`http://localhost:4173${url.pathname}${url.search}`);
    await route.fulfill({ response });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('https://fixture.schoology.com/home');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const build = resolve(import.meta.dirname, '../../.output/firefox-mv3/content-scripts');
  await page.addStyleTag({ content: readFileSync(resolve(build, 'content.css'), 'utf8') });
  await page.addScriptTag({ content: readFileSync(resolve(build, 'content.js'), 'utf8') });
  await expect(page.locator('.better-schoology-splash')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Classes', exact: true })).toBeVisible();
  await expect(page.locator('[data-sgy-sitenav="header-my-account-menu"]')).toContainText('Alex');
  await expect(page.locator('[data-dashboard-section="notifications"]')).toContainText('2 new');
  await expect(page.locator('[data-dashboard-section="feedback"] .better-schoology-feedback-score').first()).toBeVisible();
  await expect(page.locator('.better-schoology-course-card').first()).toBeVisible();
  await expect(page.locator('#home-feed-container')).toBeHidden();
  const tasks = page.locator('.better-schoology-todo .better-schoology-task');
  const count = await tasks.count();
  expect(count).toBeGreaterThan(0);
  const href = await tasks.first().locator('a').getAttribute('href');
  await tasks.first().locator('summary').click();
  await tasks.first().getByRole('button', { name: 'Hide from dashboard' }).click();
  await expect(tasks).toHaveCount(count - 1);
  expect(await page.locator(`#todo a[href="${href}"]`).count()).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const api = Reflect.get(globalThis, 'browser') as { storage: { local: {
      get(key: string): Promise<{ betterSchoologyState: { hiddenTasks: Record<string, unknown> } }>;
      set(values: Record<string, unknown>): Promise<void>;
    } } };
    const current = await api.storage.local.get('betterSchoologyState');
    current.betterSchoologyState.hiddenTasks = {};
    await api.storage.local.set(current);
  });
  await expect(tasks).toHaveCount(count);
  await page.screenshot({ path: testInfo.outputPath('dashboard-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.locator('#home-feed-container')).toBeVisible();
  await expect(page.locator('#right-column .better-schoology-todo')).toBeVisible();
  await expect(page.locator('#todo')).toHaveCSS('background-color', 'rgb(27, 31, 36)');
  await page.screenshot({ path: testInfo.outputPath('feed-dark.png'), fullPage: true });
  const courseHref = await page.locator('.better-schoology-course-card a').first().getAttribute('href');
  expect(courseHref).toMatch(/^\/course\/\d+/);
  // Navigate to a real captured course structure and run the same emitted bundle.
  await page.goto(`https://fixture.schoology.com${courseHref}/materials`);
  await page.addStyleTag({ content: readFileSync(resolve(build, 'content.css'), 'utf8') });
  await page.addScriptTag({ content: readFileSync(resolve(build, 'content.js'), 'utf8') });
  await expect(page.getByRole('button', { name: 'Classes', exact: true })).toHaveCSS('background-color', 'rgb(27, 31, 36)');
  await page.screenshot({ path: testInfo.outputPath('course-dark.png'), fullPage: true });
  expect(errors).toEqual([]);
});
