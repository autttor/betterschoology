import type { SchoologyCourse } from '@/src/types';
import { SGY, queryAll, queryFirst } from '../selectors';
import { courseIdFromPath } from '../router';

/**
 * Course discovery.
 *
 * Courses are only ever identified by the numeric ID in a native Schoology
 * href, never by display text -- course names are neither unique nor stable,
 * and a student rename would otherwise silently repoint a customization.
 *
 * Three documented surfaces expose course identity:
 *  1. `/grades/grades` -- `#s-js-gradebook-course-<courseId>` panels (richest:
 *     every enrolled course with its name in one page);
 *  2. any course page -- `#menu-s-main` links plus the `#center-top` breadcrumb;
 *  3. any page -- plain `/course/<id>` anchors, as a last resort.
 */

const GRADEBOOK_ID_RE = /^s-js-gradebook-course-(\d+)$/;

/** Splits Schoology's `Name: Section` course heading into its two parts. */
export function splitCourseTitle(raw: string): { name: string; section?: string } {
  const text = raw.replace(/\s+/g, ' ').trim();
  const separator = text.lastIndexOf(': ');
  if (separator <= 0) return { name: text };

  const name = text.slice(0, separator).trim();
  const section = text.slice(separator + 2).trim();
  if (!name || !section) return { name: text };
  return { name, section };
}

/**
 * Reads every course panel on the global grades page.
 *
 * The panel ID carries the course ID and the title anchor carries the name, so
 * this needs no guessing at all.
 */
export function parseCoursesFromGradebook(root: ParentNode): SchoologyCourse[] {
  const courses: SchoologyCourse[] = [];

  for (const panel of queryAll(root, SGY.grades.gradebookCourse)) {
    const id = panel.id.match(GRADEBOOK_ID_RE)?.[1];
    if (!id) continue;

    const titleEl = queryFirst(panel, SGY.grades.gradebookCourseTitle);
    // `.visually-hidden` holds the screen-reader word "Course"; drop it so it
    // does not end up inside the stored course name.
    const heading = titleEl ? textWithoutHiddenNodes(titleEl) : '';
    if (!heading) continue;

    const { name, section } = splitCourseTitle(heading);
    courses.push({
      id,
      originalName: name,
      ...(section ? { sectionName: section } : {}),
      href: `/course/${id}`,
    });
  }

  return courses;
}

/**
 * Reads the current course from a course page's own chrome.
 *
 * The breadcrumb's `title` attribute holds the unsectioned course name, which
 * is exactly what we want for a display name.
 */
export function parseCourseFromCoursePage(
  root: ParentNode,
  pathname: string,
): SchoologyCourse | null {
  const id = courseIdFromPath(pathname) ?? courseIdFromMenu(root);
  if (!id) return null;

  const breadcrumb = queryFirst(root, SGY.course.breadcrumbCourseTitle);
  // The heading fallback also matches an assignment's own `h1.page-title`, so
  // the anchor must be proven to point at a course before its text is trusted
  // as a course name.
  const anchor = courseAnchorIn(breadcrumb);
  if (!anchor) return null;

  const anchorText = textWithoutHiddenNodes(anchor);
  const titleAttribute = breadcrumb?.getAttribute('title')?.trim() ?? '';

  if (!anchorText && !titleAttribute) return null;

  const parsed = splitCourseTitle(anchorText || titleAttribute);
  const name = titleAttribute || parsed.name;

  return {
    id,
    originalName: name,
    ...(parsed.section ? { sectionName: parsed.section } : {}),
    href: `/course/${id}`,
  };
}

/** The first anchor inside `element` that links to a course, if any. */
export function courseAnchorIn(element: Element | null): HTMLAnchorElement | null {
  if (!element) return null;

  for (const anchor of Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    if (courseIdFromHref(anchor.getAttribute('href'))) return anchor;
  }
  return null;
}

/** Course ID from the legacy course menu, for pages whose path lacks one. */
function courseIdFromMenu(root: ParentNode): string | null {
  const menu = queryFirst(root, SGY.course.menu);
  if (!menu) return null;

  for (const anchor of Array.from(menu.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const id = courseIdFromHref(anchor.getAttribute('href'));
    if (id) return id;
  }
  return null;
}

/**
 * Extracts a course ID from any href shape the captures contain: absolute
 * (`https://district.schoology.com/course/100001`), root-relative, or with
 * trailing sub-routes and query strings.
 */
export function courseIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, 'http://schoology.invalid');
    return courseIdFromPath(url.pathname);
  } catch {
    return null;
  }
}

/**
 * Last-resort discovery: any `/course/<id>` anchor in the document.
 *
 * Names found this way are unreliable (an anchor may read "Materials"), so this
 * only contributes an ID and a link; a better surface fills in the name later.
 */
export function parseCoursesFromLinks(root: ParentNode): SchoologyCourse[] {
  const byId = new Map<string, SchoologyCourse>();

  for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const id = courseIdFromHref(anchor.getAttribute('href'));
    if (!id || byId.has(id)) continue;

    const label = textWithoutHiddenNodes(anchor);
    if (!label) continue;

    byId.set(id, { id, originalName: label, href: `/course/${id}` });
  }

  return Array.from(byId.values());
}

/**
 * Text content with `.visually-hidden` helper nodes removed.
 *
 * Schoology appends screen-reader-only words ("Course", "Grading Period") to
 * many labels. They belong to the accessibility tree, not to our data.
 */
export function textWithoutHiddenNodes(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const hidden of Array.from(clone.querySelectorAll('.visually-hidden'))) {
    hidden.remove();
  }
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}
