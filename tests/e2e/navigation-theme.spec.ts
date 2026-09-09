import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const styles = readFileSync(resolve(import.meta.dirname, '../../entrypoints/content/style.css'), 'utf8');

/** Runs real CSS cascade/layout checks, rather than searching stylesheet text.
 * No extension injection is claimed here: we apply its stylesheet and theme attrs. */
test('dark native controls, Feed To Do and full footer retain readable surfaces', async ({ page }) => {
  await page.goto('/home?polish=1');
  await page.addStyleTag({ content: styles });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-bs-dark', '');
    document.documentElement.setAttribute('data-better-schoology-theme', 'dark');
  });
  const surface = 'rgb(27, 31, 36)';
  const text = 'rgb(232, 234, 237)';
  const controls = page.locator('#header [data-sgy-sitenav="nav-trigger"]');
  for (const control of await controls.all()) {
    await expect(control).toHaveCSS('background-color', surface);
    await expect(control).toHaveCSS('color', text);
  }
  for (const selector of ['#todo', '#todo aside', '#todo .upcoming-list',
    '#site-navigation-footer', '#site-navigation-footer > div', '#site-navigation-footer footer',
    '#site-navigation-footer footer button', '#site-navigation-footer footer a', 'ul.s-edge-feed > li']) {
    await expect(page.locator(selector).first()).toHaveCSS('background-color', surface);
  }
  await expect(page.locator('#header [aria-label="Search"] circle')).toHaveCSS('fill', 'none');
  await expect(page.locator('#header [aria-label="Search"] circle')).toHaveCSS('stroke', text);
  await expect(page.locator('#header [aria-label="App launcher"] path')).toHaveCSS('fill', text);
  await expect(page.locator('.update-body h1').first()).toHaveCSS('color', text);
  for (const richText of await page.locator('.update-body [style*="color"]:not(a)').all()) {
    await expect(richText).toHaveCSS('color', text);
  }

  const courses = page.getByRole('button', { name: 'Courses', exact: true });
  await courses.focus();
  await expect(courses).toHaveCSS('outline-style', 'solid');
  await courses.press('Enter');
  await expect(courses).toHaveAttribute('aria-expanded', 'true');
  await expect(courses).toHaveCSS('background-color', 'rgb(35, 40, 48)');
  await expect(page.getByRole('menu')).toHaveCSS('background-color', surface);
  await expect(page.getByRole('menuitem', { name: 'My Courses' })).toHaveCSS('background-color', surface);
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.documentElement.removeAttribute('data-bs-dark'));
  await expect(courses).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});
