import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Route table for the local Schoology fixture server.
 *
 * Paths mirror real Schoology exactly (`machine/routes.json`) so that the
 * extension's router, host guard and adapters see the same shapes locally that
 * they will see in production. Serving fixtures over HTTP rather than from
 * `file://` matters: route matching, relative asset resolution, same-origin
 * fetch behaviour and extension host permissions all differ under `file://`.
 */

export interface FixtureRoute {
  /** Regular expression matched against the request pathname. */
  pattern: RegExp;
  /** Fixture basename in `tests/fixtures/schoology/pages/`. */
  fixture: string;
  /** Human label, shown on the fixture index page. */
  label: string;
}

/**
 * Synthetic IDs, read from the manifest the importer writes.
 *
 * These are never hardcoded: the sanitizer allocates IDs in discovery order,
 * so which synthetic assignment a fixture describes depends on the capture.
 * The fallbacks only matter before the first import has run.
 */
interface FixtureManifest {
  pages: Array<{
    id: string;
    route: string;
    courseId: string | null;
    assignmentId: string | null;
    folderId: string | null;
  }>;
}

const MANIFEST_PATH = resolve(
  import.meta.dirname,
  '..',
  '..',
  'tests',
  'fixtures',
  'schoology',
  'manifest.json',
);

export const MANIFEST: FixtureManifest = existsSync(MANIFEST_PATH)
  ? (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as FixtureManifest)
  : { pages: [] };

function manifestPage(id: string) {
  return MANIFEST.pages.find((page) => page.id === id);
}

export const FIXTURE_COURSE_ID = manifestPage('course-materials')?.courseId ?? '100001';
export const FIXTURE_ASSIGNMENT_ID = manifestPage('assignment')?.assignmentId ?? '200001';
export const FIXTURE_FOLDER_ID = manifestPage('course-folder')?.folderId ?? '500001';

export const ROUTES: FixtureRoute[] = [
  { pattern: /^\/$/, fixture: 'home', label: 'Root' },
  { pattern: /^\/home\/recent-activity\/?$/, fixture: 'home', label: 'Home · Recent Activity' },
  // `/home/course-dashboard` and `/home/assignments` were never captured, so
  // they intentionally serve the Home fixture: the route must resolve, but the
  // markup is not a claim about what those pages really contain.
  { pattern: /^\/home\/course-dashboard\/?$/, fixture: 'home', label: 'Home · Course Dashboard (not captured)' },
  { pattern: /^\/home\/assignments\/?$/, fixture: 'home', label: 'Home · Assignments (not captured)' },
  { pattern: /^\/home(?:\/)?$/, fixture: 'home', label: 'Home' },

  { pattern: /^\/grades\/grades\/?$/, fixture: 'global-grades', label: 'Global Grades' },
  { pattern: /^\/user-calendar\/?$/, fixture: 'calendar', label: 'Calendar' },
  { pattern: /^\/calendar\/?$/, fixture: 'calendar', label: 'Calendar (alias)' },

  { pattern: /^\/course\/\d+\/materials\/?$/, fixture: 'course-materials', label: 'Course Materials' },
  { pattern: /^\/course\/\d+\/student_grades\/?$/, fixture: 'course-grades', label: 'Course Grades' },
  { pattern: /^\/course\/\d+\/updates\/?$/, fixture: 'course-updates', label: 'Course Updates' },
  { pattern: /^\/course\/\d+\/members\/?$/, fixture: 'course-materials', label: 'Course Members (not captured)' },
  { pattern: /^\/course\/\d+\/?$/, fixture: 'course-materials', label: 'Course Profile (not captured)' },

  { pattern: /^\/assignment\/\d+(?:\/info)?\/?$/, fixture: 'assignment', label: 'Assignment' },
];

/**
 * Materials pages switch to folder contents when `?f=<id>` is present, which is
 * a different fixture but the same route.
 */
export function resolveFixture(pathname: string, search: URLSearchParams): FixtureRoute | null {
  const route = ROUTES.find((candidate) => candidate.pattern.test(pathname));
  if (!route) return null;

  if (route.fixture === 'course-materials' && search.has('f')) {
    return { ...route, fixture: 'course-folder', label: 'Course Folder Contents' };
  }

  return route;
}

/** Links shown on the fixture index page at `/`. */
export const INDEX_LINKS: Array<{ href: string; label: string }> = [
  { href: '/home', label: 'Home (To Do, feed, right rail)' },
  { href: '/home/recent-activity', label: 'Home · Recent Activity' },
  { href: '/grades/grades', label: 'Global Grades (18 courses)' },
  { href: '/user-calendar', label: 'Calendar' },
  { href: `/course/${FIXTURE_COURSE_ID}/materials`, label: 'Course Materials' },
  {
    href: `/course/${FIXTURE_COURSE_ID}/materials?f=${FIXTURE_FOLDER_ID}`,
    label: 'Course Folder Contents',
  },
  { href: `/course/${FIXTURE_COURSE_ID}/student_grades`, label: 'Course Grades' },
  { href: `/course/${FIXTURE_COURSE_ID}/updates`, label: 'Course Updates' },
  { href: `/assignment/${FIXTURE_ASSIGNMENT_ID}/info`, label: 'Assignment' },
];
