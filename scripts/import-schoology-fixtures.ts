#!/usr/bin/env tsx
/**
 * Imports a local Schoology capture into sanitized, committable fixtures.
 *
 *   npm run schoology:import
 *
 * Reads raw browser-saved Schoology pages from `.local-schoology/raw/`
 * (gitignored) and writes sanitized fixtures to `tests/fixtures/schoology/`.
 *
 * The import refuses to write anything if the verification pass finds a
 * potential leak, so a mistake in the rewriter fails the build rather than
 * quietly publishing a student's data.
 *
 * Raw captures are never required to build, test or run Better Schoology --
 * the sanitized fixtures are committed. This script only needs to run when new
 * Schoology surfaces are captured.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import * as cheerio from 'cheerio';
import { scanCaptures } from './sanitizer/registry';
import { sanitizePage } from './sanitizer/sanitize';
import { formatLeakReport, verifyNoLeaks } from './sanitizer/verify';
import type { SanitizerConfig } from './sanitizer/types';

const ROOT = resolve(import.meta.dirname, '..');
const RAW_DIR = join(ROOT, '.local-schoology', 'raw');
const CONFIG_PATH = join(ROOT, '.local-schoology', 'sanitizer-map.json');
const PAGES_OUT = join(ROOT, 'tests', 'fixtures', 'schoology', 'pages');
const API_OUT = join(ROOT, 'tests', 'fixtures', 'schoology', 'api');

/**
 * Maps a captured file to the fixture it becomes.
 *
 * Matching is on the page's own structure rather than its filename, because
 * saved-page filenames contain the real course name.
 */
interface PageSpec {
  /** Output fixture basename. */
  id: string;
  /** Title used in the sanitized `<head>`. */
  title: string;
  /** Identifies the surface from the captured DOM. */
  match(page: cheerio.CheerioAPI): boolean;
  /**
   * Builds the route from IDs read out of the *sanitized* page.
   *
   * Routes are never hardcoded: the sanitizer assigns synthetic IDs in
   * discovery order, so which course or assignment a fixture ends up
   * describing is only known after it has been written.
   */
  route(ids: FixtureIds): string;
}

interface FixtureIds {
  courseId: string | null;
  assignmentId: string | null;
  folderId: string | null;
}

const PAGE_SPECS: PageSpec[] = [
  {
    id: 'home',
    title: 'Home',
    route: () => '/home',
    match: ($) => $('#todo').length > 0 && $('#home-feed-container').length > 0,
  },
  {
    id: 'global-grades',
    title: 'Grades',
    route: () => '/grades/grades',
    match: ($) => $('.gradebook-course').length > 1 && $('#menu-s-main').length === 0,
  },
  {
    id: 'calendar',
    title: 'Calendar',
    route: () => '/user-calendar',
    match: ($) => $('#fcalendar').length > 0,
  },
  {
    id: 'course-materials',
    title: 'Course Materials',
    route: (ids) => `/course/${ids.courseId ?? '100001'}/materials`,
    match: ($) => $('#course-profile-materials').length > 0 && $('tr[id^="f-"]').length > 0,
  },
  {
    id: 'course-folder',
    title: 'Course Folder',
    route: (ids) => `/course/${ids.courseId ?? '100001'}/materials?f=${ids.folderId ?? '500001'}`,
    match: ($) => $('#course-profile-materials').length > 0 && $('tr[id^="n-"]').length > 0,
  },
  {
    id: 'course-grades',
    title: 'Course Grades',
    route: (ids) => `/course/${ids.courseId ?? '100001'}/student_grades`,
    match: ($) => $('#menu-s-main').length > 0 && $('.hierarchical-grading-report').length > 0,
  },
  {
    id: 'course-updates',
    title: 'Course Updates',
    route: (ids) => `/course/${ids.courseId ?? '100001'}/updates`,
    match: ($) => $('#course-profile-updates').length > 0,
  },
  {
    id: 'assignment',
    title: 'Assignment',
    route: (ids) => `/assignment/${ids.assignmentId ?? '200001'}/info`,
    match: ($) => $('.submit-assignment').length > 0 || $('.assignment-details').length > 0,
  },
];

function readConfig(): SanitizerConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as SanitizerConfig;
  } catch (error) {
    console.error(`Could not parse ${CONFIG_PATH}:`, error);
    process.exit(1);
  }
}

/** Finds every captured `.htm`/`.html` page under the raw directory. */
function findCaptures(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // `<page>_files` directories hold assets, not pages.
    if (entry.isDirectory() && !entry.name.endsWith('_files')) out.push(...findCaptures(path));
    else if (entry.isFile() && /\.html?$/i.test(entry.name)) out.push(path);
  }

  return out;
}

function main(): void {
  const captures = findCaptures(RAW_DIR);

  if (captures.length === 0) {
    console.log(`No captures found in ${RAW_DIR}`);
    console.log('');
    console.log('To import new Schoology surfaces:');
    console.log('  1. Sign in to Schoology in a browser');
    console.log('  2. Save the page (Ctrl/Cmd+S, "Web Page, Complete")');
    console.log(`  3. Put the .htm file and its _files/ folder in ${RAW_DIR}`);
    console.log('  4. Re-run: npm run schoology:import');
    console.log('');
    console.log('Committed fixtures already exist, so this is only needed for new surfaces.');
    return;
  }

  const config = readConfig();
  const pages = captures.map((path) => ({
    name: basename(path),
    html: readFileSync(path, 'utf8'),
    path,
  }));

  console.log(`Scanning ${pages.length} capture(s)...`);
  const { registry } = scanCaptures(pages, config);
  console.log(
    `  ${registry.ids.size} identifier(s), ${registry.strings.size} string(s), ` +
      `${registry.hosts.size} host(s) will be replaced`,
  );

  mkdirSync(PAGES_OUT, { recursive: true });
  mkdirSync(API_OUT, { recursive: true });

  const written: Array<{ id: string; route: string; bytes: number; ids: FixtureIds }> = [];
  const failures: string[] = [];
  const used = new Set<string>();

  for (const page of pages) {
    const $ = cheerio.load(page.html);
    const spec = PAGE_SPECS.find((candidate) => !used.has(candidate.id) && candidate.match($));

    if (!spec) {
      console.warn(`  ? ${page.name}: no matching fixture spec, skipped`);
      continue;
    }
    used.add(spec.id);

    // Sanitize once to learn the synthetic IDs, then again with the real
    // route recorded in the file's header comment.
    const probe = sanitizePage(page.html, { registry, title: spec.title, route: '' });
    const ids = readFixtureIds(probe, spec.id);
    const route = spec.route(ids);

    const sanitized = sanitizePage(page.html, { registry, title: spec.title, route });

    const leaks = verifyNoLeaks(sanitized, registry, config);
    if (leaks.length > 0) {
      failures.push(`${spec.id}:\n${indent(formatLeakReport(leaks))}`);
      continue;
    }

    const outPath = join(PAGES_OUT, `${spec.id}.html`);
    writeFileSync(outPath, sanitized, 'utf8');
    written.push({ id: spec.id, route, bytes: sanitized.length, ids });
    console.log(`  ✓ ${spec.id}.html  (${(sanitized.length / 1024).toFixed(0)} KB)  ${route}`);
  }

  if (failures.length > 0) {
    console.error('');
    console.error('IMPORT FAILED — potential private data in output. Nothing further was written.');
    console.error('');
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }

  buildApiFixtures(written.map((entry) => entry.id));
  writeManifest(written);

  console.log('');
  console.log(`Wrote ${written.length} page fixture(s) to tests/fixtures/schoology/pages/`);
  console.log('Verification passed: no original identifiers, names, hosts or tokens remain.');
}

/**
 * Reads the IDs a sanitized fixture actually describes.
 *
 * The sanitizer allocates synthetic IDs in discovery order, so a fixture's own
 * course and assignment IDs are only knowable after it has been rewritten.
 * Everything downstream -- the fixture server's index, the docs, the tests --
 * reads these rather than assuming.
 */
function readFixtureIds(html: string, fixtureId: string): FixtureIds {
  const $ = cheerio.load(html);

  const courseHref =
    $('#menu-s-main a[href^="/course/"]').first().attr('href') ??
    $('#center-top a[href^="/course/"]').first().attr('href') ??
    $('a[href^="/course/"]').first().attr('href') ??
    '';

  // On an assignment page the canonical ID is the one the native submit
  // control points at; elsewhere the first assignment link will do.
  const assignmentHref =
    (fixtureId === 'assignment'
      ? $('.submit-assignment a[href*="/assignment/"]').first().attr('href')
      : undefined) ?? $('a[href^="/assignment/"]').first().attr('href') ?? '';

  const folderHref = $('a[href*="materials?f="]').first().attr('href') ?? '';

  return {
    courseId: courseHref.match(/\/course\/(\d+)/)?.[1] ?? null,
    assignmentId: assignmentHref.match(/\/assignment\/(\d+)/)?.[1] ?? null,
    folderId: folderHref.match(/[?&]f=(\d+)/)?.[1] ?? null,
  };
}

/**
 * Writes the fixture manifest consumed by the dev server and the tests, so no
 * synthetic ID is hardcoded in more than one place.
 */
function writeManifest(
  entries: Array<{ id: string; route: string; ids: FixtureIds }>,
): void {
  const manifest = {
    generatedBy: 'scripts/import-schoology-fixtures.ts',
    note: 'All IDs are synthetic. Regenerate with: npm run schoology:import',
    pages: entries.map((entry) => ({
      id: entry.id,
      route: entry.route,
      courseId: entry.ids.courseId,
      assignmentId: entry.ids.assignmentId,
      folderId: entry.ids.folderId,
    })),
  };

  write(join(ROOT, 'tests', 'fixtures', 'schoology', 'manifest.json'), manifest);
  console.log('  ✓ manifest.json');
}

/**
 * Derives To Do fragment fixtures from the sanitized home page.
 *
 * The endpoints return `{ "html": "<fragment>" }` (observed source, see
 * `machine/endpoints.json`), so the mocks reuse the real row markup rather than
 * inventing a shape.
 */
function buildApiFixtures(writtenIds: string[]): void {
  if (!writtenIds.includes('home')) return;

  const homePath = join(PAGES_OUT, 'home.html');
  if (!existsSync(homePath)) return;

  const $ = cheerio.load(readFileSync(homePath, 'utf8'));

  const capture = (selector: string): string => {
    const wrapper = $(selector).first();
    if (!wrapper.length) return '';
    const list = wrapper.find('.upcoming-list').first();
    return list.length ? (list.html() ?? '') : '';
  };

  const overdue = capture('.overdue-submissions-wrapper');
  const upcoming = capture('.upcoming-submissions-wrapper');

  write(join(API_OUT, 'overdue-submissions.json'), { html: wrapList(overdue) });
  write(join(API_OUT, 'upcoming-submissions.json'), { html: wrapList(upcoming) });
  write(join(API_OUT, 'upcoming-events.json'), { html: '<div class="upcoming-list"></div>' });
  write(join(API_OUT, 'recently-completed.json'), { html: '<div class="upcoming-list"></div>' });

  // Scenario variants, so tests can drive empty and error-ish states.
  write(join(API_OUT, 'overdue-submissions.empty.json'), { html: '' });
  write(join(API_OUT, 'upcoming-submissions.empty.json'), { html: '' });

  console.log(`  ✓ 6 API fragment fixture(s) in tests/fixtures/schoology/api/`);
}

function wrapList(inner: string): string {
  return `<div class="upcoming-list">${inner}</div>`;
}

function write(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function indent(value: string): string {
  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

main();
