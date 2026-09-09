import { SGY, queryAll, queryFirst } from '../selectors';
import { textWithoutHiddenNodes } from './course';

/**
 * Course navigation.
 *
 * Schoology renders a course's own pages and its installed third-party apps in
 * two separate containers (`#menu-s-main` and `#menu-s-apps`), each link
 * carrying a semantic class naming what it is. Better Courses reads those
 * classes to decide what is *core* navigation and what is an app -- it never
 * rewrites a link, changes an app URL, or removes a menu item.
 */
export interface CourseNavLink {
  /** `materials`, `updates`, `grades`, `members`, `profile` or `other`. */
  kind: CourseNavKind;
  label: string;
  href: string;
  active: boolean;
  element: HTMLAnchorElement;
}

export type CourseNavKind =
  | 'profile'
  | 'materials'
  | 'updates'
  | 'grades'
  | 'members'
  | 'other';

/** Display order Better Courses uses: what a student actually opens, first. */
export const CORE_NAV_ORDER: readonly CourseNavKind[] = [
  'materials',
  'updates',
  'grades',
  'members',
];

const KIND_BY_CLASS: Array<[string, CourseNavKind]> = [
  ['course-materials-left-menu', 'materials'],
  ['course-updates-left-menu', 'updates'],
  ['course-student-grade-left-menu', 'grades'],
  ['course-member-left-menu', 'members'],
  ['course-profile-left-menu', 'profile'],
];

export function parseCourseNav(root: ParentNode): CourseNavLink[] {
  const menu = queryFirst(root, SGY.course.menu);
  if (!menu) return [];

  const links: CourseNavLink[] = [];

  for (const anchor of Array.from(menu.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const className = anchor.getAttribute('class') ?? '';
    const kind = KIND_BY_CLASS.find(([marker]) => className.includes(marker))?.[1] ?? 'other';
    const label = textWithoutHiddenNodes(anchor);
    const href = anchor.getAttribute('href') ?? '';
    if (!label || !href) continue;

    links.push({
      kind,
      label,
      href,
      active: className.includes('active') || anchor.getAttribute('aria-current') === 'page',
      element: anchor,
    });
  }

  return links;
}

/** The core navigation, in Better Schoology's order, de-duplicated by kind. */
export function coreNav(links: CourseNavLink[]): CourseNavLink[] {
  const byKind = new Map<CourseNavKind, CourseNavLink>();
  for (const link of links) {
    if (link.kind === 'other' || byKind.has(link.kind)) continue;
    byKind.set(link.kind, link);
  }

  return CORE_NAV_ORDER.map((kind) => byKind.get(kind)).filter(
    (link): link is CourseNavLink => link !== undefined,
  );
}

export interface CourseApp {
  title: string;
  href: string;
  element: HTMLElement;
}

/** Third-party app links installed on the course. Never modified, only counted. */
export function parseCourseApps(root: ParentNode): CourseApp[] {
  const apps: CourseApp[] = [];

  for (const wrapper of queryAll<HTMLElement>(root, SGY.course.appLink)) {
    const anchor = wrapper.querySelector<HTMLAnchorElement>('a[href]');
    const titleEl = queryFirst(wrapper, SGY.course.appTitle);
    const title = titleEl ? textWithoutHiddenNodes(titleEl) : '';
    if (!anchor || !title) continue;

    apps.push({ title, href: anchor.getAttribute('href') ?? '', element: wrapper });
  }

  return apps;
}

export function findAppsList(root: ParentNode): HTMLElement | null {
  return queryFirst<HTMLElement>(root, SGY.course.appsList);
}

export function findAppsRoot(root: ParentNode): HTMLElement | null {
  return queryFirst<HTMLElement>(root, SGY.course.appsRoot);
}
