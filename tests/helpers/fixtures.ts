import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';

/**
 * Loads sanitized Schoology fixtures for tests.
 *
 * Tests run against the real captured DOM (sanitized), not hand-written
 * markup. That is the point: a hand-written fixture only proves the parser
 * agrees with whoever wrote the fixture.
 */
const FIXTURE_ROOT = resolve(import.meta.dirname, '..', 'fixtures', 'schoology');

export type FixtureName =
  | 'home'
  | 'global-grades'
  | 'calendar'
  | 'course-materials'
  | 'course-folder'
  | 'course-grades'
  | 'course-updates'
  | 'assignment';

export function fixtureHtml(name: FixtureName): string {
  return readFileSync(join(FIXTURE_ROOT, 'pages', `${name}.html`), 'utf8');
}

export function apiFixture(name: string): { html: string } {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, 'api', `${name}.json`), 'utf8')) as {
    html: string;
  };
}

export interface LoadedFixture {
  dom: JSDOM;
  document: Document;
  window: Window;
}

/**
 * Parses a fixture into a JSDOM document at a given Schoology URL.
 *
 * The URL matters: the router reads `location.pathname`, so a fixture loaded
 * at the wrong path would be classified wrongly.
 */
export function loadFixture(name: FixtureName, url: string): LoadedFixture {
  const dom = new JSDOM(fixtureHtml(name), {
    url: `http://localhost:4173${url}`,
    runScripts: 'outside-only',
  });

  return {
    dom,
    document: dom.window.document,
    window: dom.window as unknown as Window,
  };
}

interface FixtureManifest {
  pages: Array<{
    id: string;
    route: string;
    courseId: string | null;
    assignmentId: string | null;
    folderId: string | null;
  }>;
}

/**
 * The fixture manifest, written by `npm run schoology:import`.
 *
 * Tests read IDs from here rather than hardcoding them: the sanitizer
 * allocates synthetic IDs in discovery order, so re-importing a different
 * capture legitimately changes which ID a fixture carries. A test that
 * hardcoded `200001` would fail for a reason that has nothing to do with the
 * code under test.
 */
export const MANIFEST: FixtureManifest = JSON.parse(
  readFileSync(join(FIXTURE_ROOT, 'manifest.json'), 'utf8'),
) as FixtureManifest;

export function fixtureRoute(name: FixtureName): string {
  const page = MANIFEST.pages.find((entry) => entry.id === name);
  if (!page) throw new Error(`No manifest entry for fixture "${name}"`);
  return page.route;
}

export function fixtureIds(name: FixtureName) {
  const page = MANIFEST.pages.find((entry) => entry.id === name);
  if (!page) throw new Error(`No manifest entry for fixture "${name}"`);
  return page;
}

/** Loads a fixture at exactly the route the manifest says it represents. */
export function loadFixtureAtRoute(name: FixtureName): LoadedFixture {
  return loadFixture(name, fixtureRoute(name));
}
