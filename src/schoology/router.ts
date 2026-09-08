import type { SchoologyPageType, SchoologyRoute } from '@/src/types';

/**
 * Pathname-based Schoology route detection.
 *
 * Deliberately independent of hostname: the same logic must classify
 * `https://district.schoology.com/course/100001/materials` and the local
 * fixture server's `http://localhost:4173/course/100001/materials` identically.
 * Whether we are *allowed* to run on a host is answered by `utils/hosts.ts`.
 *
 * Route shapes come from the captured client (`machine/routes.json`); the
 * numeric-ID constraint matters because it is what separates `/course/100001`
 * from any future non-numeric `/course/...` sub-route.
 */

const COURSE_ID_RE = /^\/course\/(\d+)(?:\/|$)/;
const ASSIGNMENT_ID_RE = /^\/assignment\/(\d+)(?:\/|$)/;

interface RoutePattern {
  type: SchoologyPageType;
  test: RegExp;
}

/** Ordered most-specific first; the first match wins. */
const ROUTE_PATTERNS: readonly RoutePattern[] = [
  { type: 'home-recent-activity', test: /^\/home\/recent-activity\/?$/ },
  { type: 'home-course-dashboard', test: /^\/home\/course-dashboard\/?$/ },
  { type: 'home-assignments', test: /^\/home\/assignments\/?$/ },
  { type: 'home', test: /^\/home(?:\/.*)?$/ },

  { type: 'global-grades', test: /^\/grades\/grades\/?$/ },
  { type: 'calendar', test: /^\/(?:calendar|user-calendar)\/?$/ },

  { type: 'course-materials', test: /^\/course\/\d+\/materials\/?$/ },
  { type: 'course-grades', test: /^\/course\/\d+\/student_grades\/?$/ },
  { type: 'course-updates', test: /^\/course\/\d+\/updates\/?$/ },
  { type: 'course-members', test: /^\/course\/\d+\/members\/?$/ },
  { type: 'course', test: /^\/course\/\d+\/?$/ },

  { type: 'assignment', test: /^\/assignment\/\d+(?:\/info)?\/?$/ },
];

/** Page types that live under Home, including its tabbed sub-views. */
const HOME_PAGE_TYPES = new Set<SchoologyPageType>([
  'home',
  'home-recent-activity',
  'home-course-dashboard',
  'home-assignments',
]);

const COURSE_PAGE_TYPES = new Set<SchoologyPageType>([
  'course',
  'course-materials',
  'course-grades',
  'course-updates',
  'course-members',
]);

export function isHomeRoute(type: SchoologyPageType): boolean {
  return HOME_PAGE_TYPES.has(type);
}

export function isCourseRoute(type: SchoologyPageType): boolean {
  return COURSE_PAGE_TYPES.has(type);
}

export function courseIdFromPath(pathname: string): string | null {
  return pathname.match(COURSE_ID_RE)?.[1] ?? null;
}

export function assignmentIdFromPath(pathname: string): string | null {
  return pathname.match(ASSIGNMENT_ID_RE)?.[1] ?? null;
}

export function identifySchoologyPage(pathname: string): SchoologyPageType {
  for (const pattern of ROUTE_PATTERNS) {
    if (pattern.test.test(pathname)) return pattern.type;
  }
  return 'other';
}

/**
 * Full route description for a URL.
 *
 * Accepts a `URL`, a string, or nothing (meaning the current location) so the
 * same function serves the content script and the tests.
 */
export function resolveRoute(input?: URL | string): SchoologyRoute {
  const url =
    input instanceof URL
      ? input
      : new URL(typeof input === 'string' ? input : location.href, 'http://localhost');

  const { pathname, search } = url;
  const type = identifySchoologyPage(pathname);

  // `?f=<id>` switches a materials page from the folder listing to a folder's
  // contents without changing the base route, so it is a route field rather
  // than a separate page type.
  const folderId = url.searchParams.get('f');

  return {
    type,
    courseId: courseIdFromPath(pathname),
    assignmentId: assignmentIdFromPath(pathname),
    folderId: folderId && /^\d+$/.test(folderId) ? folderId : null,
    materialsFilter: url.searchParams.get('list_filter'),
    pathname,
    search,
  };
}

/** Human-readable label for the popup's "current page" line. */
export function describeRoute(type: SchoologyPageType): string {
  switch (type) {
    case 'home':
    case 'home-recent-activity':
      return 'Home';
    case 'home-course-dashboard':
      return 'Course Dashboard';
    case 'home-assignments':
      return 'Assignments';
    case 'global-grades':
      return 'Grades';
    case 'calendar':
      return 'Calendar';
    case 'course':
      return 'Course';
    case 'course-materials':
      return 'Course Materials';
    case 'course-grades':
      return 'Course Grades';
    case 'course-updates':
      return 'Course Updates';
    case 'course-members':
      return 'Course Members';
    case 'assignment':
      return 'Assignment';
    case 'other':
      return 'Other Schoology page';
  }
}
