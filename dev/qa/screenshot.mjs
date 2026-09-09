#!/usr/bin/env node
/**
 * Visual QA harness.
 *
 *   npm run schoology:dev            # in one terminal
 *   npm run build:firefox:dev
 *   npm run qa:shots -- home         # or: all
 *
 * Loads the *built* content-script bundle into a real browser over the local
 * Schoology reconstruction and writes a screenshot per scene into
 * `.qa/`, so a milestone can be reviewed at a glance -- light and dark, wide
 * and narrow, with and without Better Schoology.
 *
 * This is a review aid, not a test: nothing here asserts. Behavioural coverage
 * lives in `tests/`, and Firefox verification is still manual (docs/testing.md).
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES } from './scenes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE = join(ROOT, '.output', 'firefox-mv3-dev', 'content-scripts');
const OUT = process.env.QA_OUT ?? join(ROOT, '.qa');
const BASE = process.env.QA_BASE_URL ?? 'http://localhost:4173';

if (!existsSync(join(BUNDLE, 'content.js'))) {
  console.error('No development bundle found. Run: npm run build:firefox:dev');
  process.exit(1);
}

const js = readFileSync(join(BUNDLE, 'content.js'), 'utf8');
const css = existsSync(join(BUNDLE, 'content.css'))
  ? readFileSync(join(BUNDLE, 'content.css'), 'utf8')
  : '';

const filter = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));
const scenes = SCENES.filter(
  (scene) => filter.length === 0 || filter.includes('all') || filter.some((name) => scene.name.startsWith(name)),
);

if (scenes.length === 0) {
  console.error(`No scenes matched. Available: ${SCENES.map((scene) => scene.name).join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

/** The same storage/runtime stub the bundle e2e test uses. */
function stub(initial) {
  const store = { betterSchoologyState: initial };
  const listeners = [];
  const api = {
    storage: {
      local: {
        get: async (key) => (key in store ? { [key]: store[key] } : {}),
        set: async (items) => {
          Object.assign(store, items);
          for (const listener of listeners) {
            listener({ betterSchoologyState: { newValue: items.betterSchoologyState } }, 'local');
          }
        },
      },
      onChanged: {
        addListener: (listener) => listeners.push(listener),
        removeListener: () => {},
      },
    },
    runtime: {
      id: 'qa',
      getManifest: () => ({ version: 'qa' }),
      onMessage: { addListener: () => {} },
      sendMessage: async () => {},
    },
  };
  window.browser = api;
  window.chrome = api;
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_BROWSERS_PATH
    ? { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` }
    : {},
);

for (const scene of scenes) {
  const context = await browser.newContext({
    viewport: scene.viewport ?? { width: 1440, height: 1000 },
    colorScheme: scene.state?.settings?.theme === 'dark' ? 'dark' : 'light',
  });
  const page = await context.newPage();

  await page.addInitScript(stub, scene.state);
  await page.goto(`${BASE}${scene.url}`, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: css });
  /*
   * Page CSS added *after* ours, so a scene can reproduce a tenant stylesheet
   * that outranks Better Schoology's own rules. The fixture shell does not
   * style Schoology's header the way a real tenant does, and that difference
   * is exactly where the compact switcher rendered wrongly in the wild.
   */
  if (scene.pageCss) await page.addStyleTag({ content: scene.pageCss });
  await page.evaluate((source) => {
    const script = document.createElement('script');
    script.textContent = source;
    document.documentElement.appendChild(script);
  }, js);

  // The lifecycle debounces its first pass and the To Do read is async.
  await page.waitForTimeout(2200);

  for (const selector of scene.click ?? []) {
    await page.locator(selector).first().click();
    await page.waitForTimeout(400);
  }

  /*
   * Markup that only exists once a native control is open -- a portalled
   * header menu. Injected after the first pass on purpose: the enhancement has
   * to find it through its own observer, exactly as it would in the wild.
   */
  if (scene.inject) {
    await page.evaluate(({ html, expand }) => {
      // Schoology opens a menu by marking its trigger and rendering the panel
      // in the same tick. Both, in that order, or the scene is not the case.
      if (expand) document.querySelector(expand)?.setAttribute('aria-expanded', 'true');
      document.body.insertAdjacentHTML('beforeend', html);
    }, scene.inject);
    await page.waitForTimeout(900);
  }

  const file = join(OUT, `${scene.name}.png`);
  await page.screenshot({ path: file, fullPage: scene.fullPage ?? false });
  console.log(`  ${scene.name}  ->  ${file}`);
  await context.close();
}

await browser.close();
