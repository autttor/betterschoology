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
  await expect(page.locator('.bs-home__title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Classes', exact: true })).toBeVisible();
  await expect(page.locator('[data-sgy-sitenav="header-my-account-menu"]')).toContainText('Alex');

  // Action on the left, information on the right -- the whole point of the layout.
  const main = page.locator('.bs-home__main');
  const rail = page.locator('.bs-home__rail');
  await expect(main.locator('.bs-section--courses')).toBeVisible();
  await expect(main.locator('.bs-todo')).toBeVisible();
  await expect(rail.locator('.bs-notify-panel')).toContainText('2');
  await expect(rail.locator('.bs-feedback__score').first()).toBeVisible();
  await expect(page.locator('.bs-course-card').first()).toBeVisible();
  await expect(page.locator('#home-feed-container')).toBeHidden();

  const tasks = page.locator('.bs-todo .bs-task');
  const count = await tasks.count();
  expect(count).toBeGreaterThan(0);
  const href = await tasks.first().locator('a').getAttribute('href');
  // The hide control is hover-revealed, so hover first -- exactly as a student would.
  await tasks.first().hover();
  await tasks.first().locator('.bs-task__hide').click();
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

  /*
   * Schoology's own Courses mega-menu: React-portalled to `body`, no
   * `aria-controls`, plain divs with tenant-white inline backgrounds. It has to
   * be found and themed after the fact, by the running bundle.
   */
  await page.evaluate(() => {
    document.querySelector('#header [data-sgy-sitenav="nav-trigger"]')
      ?.setAttribute('aria-expanded', 'true');
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="portalled-menu" style="background:#ffffff;color:#111">' +
        '<ul style="background:#ffffff"><li style="background:#ffffff">' +
        '<a href="/course/100001" style="color:#0677ba">Example Government</a>' +
        '</li></ul></div>',
    );
  });
  const menu = page.locator('#portalled-menu');
  await expect(menu).toHaveAttribute('data-bs-native-nav-popover', '');
  await expect(menu).toHaveCSS('background-color', 'rgb(27, 31, 36)');
  await expect(menu.locator('ul')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(menu.locator('a')).toHaveCSS('color', 'rgb(232, 234, 237)');
  await page.evaluate(() => {
    document.getElementById('portalled-menu')?.remove();
    document.querySelector('#header [data-sgy-sitenav="nav-trigger"]')
      ?.setAttribute('aria-expanded', 'false');
  });
  await page.getByRole('tab', { name: 'Feed', exact: true }).click();
  await expect(page.locator('#home-feed-container')).toBeVisible();
  // Feed hands the page back to Schoology: its own rail returns, themed.
  await expect(page.locator('#right-column')).toBeVisible();
  await expect(page.locator('#todo')).toHaveCSS('background-color', 'rgb(27, 31, 36)');
  await page.screenshot({ path: testInfo.outputPath('feed-dark.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Dashboard', exact: true }).click();
  const courseHref = await page.locator('.bs-course-card a').first().getAttribute('href');
  expect(courseHref).toMatch(/^\/course\/\d+/);
  // Navigate to a real captured course structure and run the same emitted bundle.
  await page.goto(`https://fixture.schoology.com${courseHref}/materials`);
  await page.addStyleTag({ content: readFileSync(resolve(build, 'content.css'), 'utf8') });
  await page.addScriptTag({ content: readFileSync(resolve(build, 'content.js'), 'utf8') });
  await expect(page.getByRole('button', { name: 'Classes', exact: true })).toHaveCSS('background-color', 'rgb(27, 31, 36)');
  await page.screenshot({ path: testInfo.outputPath('course-dark.png'), fullPage: true });
  expect(errors).toEqual([]);
});
