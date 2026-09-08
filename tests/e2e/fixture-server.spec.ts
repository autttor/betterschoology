import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MANIFEST = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '..', 'fixtures', 'schoology', 'manifest.json'),
    'utf8',
  ),
) as {
  pages: Array<{ id: string; route: string; courseId: string | null; assignmentId: string | null }>;
};

function route(id: string): string {
  const page = MANIFEST.pages.find((entry) => entry.id === id);
  if (!page) throw new Error(`no manifest entry for ${id}`);
  return page.route;
}

test.describe('fixture routes', () => {
  test('home serves the To Do panel, feed and right rail', async ({ page }) => {
    await page.goto('/home');

    await expect(page.locator('#todo')).toBeVisible();
    await expect(page.locator('#home-feed-container')).toBeVisible();
    await expect(page.locator('#right-column')).toBeVisible();
    await expect(page.locator('.sgy-tabbed-navigation')).toBeVisible();
  });

  test('global grades serves every course report', async ({ page }) => {
    await page.goto('/grades/grades');

    await expect(page.locator('.gradebook-course')).toHaveCount(18);
    expect(await page.locator('.report-row').count()).toBeGreaterThan(100);
  });

  test('course materials serves the folder table', async ({ page }) => {
    await page.goto(route('course-materials'));

    await expect(page.locator('#course-profile-materials')).toBeVisible();
    await expect(page.locator('#folder-contents-table')).toBeAttached();
    await expect(page.locator('#menu-s-main')).toBeVisible();
  });

  test('course folder serves material rows', async ({ page }) => {
    await page.goto(route('course-folder'));

    expect(await page.locator('tr[id^="n-"]').count()).toBeGreaterThan(0);
    await expect(page.locator('.type-assignment').first()).toBeAttached();
  });

  test('assignment serves details and preserves the native submit link', async ({ page }) => {
    await page.goto(route('assignment'));

    await expect(page.locator('h1.page-title')).toBeVisible();
    await expect(page.locator('.assignment-details .due-date')).toBeVisible();

    const submit = page.locator('.submit-assignment .dropbox-submit');
    await expect(submit).toBeVisible();
    await expect(submit).toHaveAttribute(
      'href',
      `/assignment/${MANIFEST.pages.find((p) => p.id === 'assignment')!.assignmentId}/dropbox/submit`,
    );
  });

  test('calendar serves the FullCalendar root', async ({ page }) => {
    await page.goto('/user-calendar');

    await expect(page.locator('#fcalendar')).toBeVisible();
    expect(await page.locator('.fc-event').count()).toBeGreaterThan(0);
  });

  test('an uncaptured route answers with an honest 404', async ({ page }) => {
    const response = await page.goto('/some/unknown/schoology/page');
    expect(response?.status()).toBe(404);
  });
});

test.describe('fixture scenarios', () => {
  test('empty removes To Do rows', async ({ page }) => {
    await page.goto('/home?fixture=empty');
    await expect(page.locator('.upcoming-event')).toHaveCount(0);
  });

  test('many-tasks multiplies To Do rows', async ({ page }) => {
    await page.goto('/home');
    const base = await page.locator('.upcoming-event').count();

    await page.goto('/home?fixture=many-tasks');
    expect(await page.locator('.upcoming-event').count()).toBeGreaterThan(base * 2);
  });

  test('overdue moves everything into the overdue block', async ({ page }) => {
    await page.goto('/home?fixture=overdue');

    await expect(page.locator('.upcoming-submissions-wrapper .upcoming-event')).toHaveCount(0);
    expect(
      await page.locator('.overdue-submissions-wrapper .upcoming-event').count(),
    ).toBeGreaterThan(0);
  });

  test('long-name stretches course titles', async ({ page }) => {
    await page.goto('/grades/grades?fixture=long-name');

    const title = await page.locator('.gradebook-course-title a').first().textContent();
    expect(title!.length).toBeGreaterThan(60);
  });

  test('ungraded replaces grade values', async ({ page }) => {
    await page.goto(`${route('course-grades')}?fixture=ungraded`);
    expect(await page.locator('.no-grade').count()).toBeGreaterThan(0);
  });
});

test.describe('mocked Schoology fragment endpoints', () => {
  /** Paths and envelope shape come from machine/endpoints.json (observed source). */
  const endpoints = [
    '/home/overdue_submissions_ajax',
    '/home/upcoming_submissions_ajax',
    '/home/upcoming_ajax',
    '/home/recently_completed_ajax',
  ];

  for (const endpoint of endpoints) {
    test(`${endpoint} returns the documented { html } envelope`, async ({ request }) => {
      const response = await request.get(endpoint);

      expect(response.status()).toBe(200);
      const payload = (await response.json()) as { html?: unknown };
      expect(typeof payload.html).toBe('string');
    });
  }

  test('the To Do fragment carries parseable rows', async ({ request }) => {
    const payload = (await (await request.get('/home/upcoming_submissions_ajax')).json()) as {
      html: string;
    };

    expect(payload.html).toContain('upcoming-event');
    expect(payload.html).toContain('data-start');
  });

  test('an undocumented endpoint is not invented', async ({ request }) => {
    expect((await request.get('/home/made_up_ajax')).status()).toBe(404);
  });

  /**
   * The fixture bootstrap reproduces s_home's deferred fragment load, so the
   * page genuinely mutates after load -- which is what makes the extension's
   * idempotency and MutationObserver paths meaningful.
   */
  test('the To Do panel is repopulated after load, as Schoology does', async ({ page }) => {
    const loaded = page.waitForEvent('console', { timeout: 5000 }).catch(() => null);
    await page.goto('/home');

    await page.waitForFunction(
      () =>
        document.querySelectorAll('.upcoming-event.sEventUpcoming-processed').length > 0,
      undefined,
      { timeout: 5000 },
    );

    await loaded;
    expect(await page.locator('.upcoming-event').count()).toBeGreaterThan(0);
  });
});

test.describe('fixture privacy', () => {
  /** A last check in a real browser: the served DOM carries no tenant host. */
  test('no page references a Schoology tenant host', async ({ page }) => {
    for (const entry of MANIFEST.pages) {
      await page.goto(entry.route);
      const html = await page.content();
      expect(html, `${entry.route} references a tenant host`).not.toMatch(
        /https?:\/\/[a-z0-9-]+\.schoology\.com/i,
      );
    }
  });
});
