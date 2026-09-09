import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { ResolvedCourse, SchoologyCourse } from '@/src/types';
import { SGY, markEnhanced, queryAll, queryFirst } from '@/src/schoology/selectors';
import {
  courseAnchorIn,
  parseCourseFromCoursePage,
  parseCoursesFromFeed,
  parseCoursesFromGradebook,
} from '@/src/schoology/adapters/course';
import { isHomeRoute } from '@/src/schoology/router';
import { resolveCourse } from '@/src/storage/courses';
import { recordCourses } from '@/src/storage';
import { log } from '@/src/utils/log';
import { restoreDisplayText, setDisplayText } from './rename';

/**
 * Course discovery and the personal-override engine.
 *
 * Overrides are keyed by the numeric course ID Schoology puts in its own hrefs
 * and panel IDs -- never by display text. Only surfaces where an ID is proven
 * are touched; a broad string replacement over `document.body` would corrupt
 * unrelated content the first time a course was named something like "Grades".
 */
const FEATURE_ID = 'course-overrides';
const COURSE_ID_ATTR = 'data-bs-course-id';

/** Reads every course the current page can prove the identity of. */
export function discoverCourses(context: EnhancementContext): SchoologyCourse[] {
  const { document: doc, route } = context;
  const found = new Map<string, SchoologyCourse>();

  // Global grades is the richest source: one panel per enrolled course, each
  // carrying both its ID and its full name.
  for (const course of parseCoursesFromGradebook(doc)) found.set(course.id, course);

  // Recent Activity names the courses a student is actually active in, which
  // is what makes the dashboard useful on Home before Grades has been visited.
  if (isHomeRoute(route.type) || route.type === 'course-updates') {
    for (const course of parseCoursesFromFeed(doc)) {
      if (!found.has(course.id)) found.set(course.id, course);
    }
  }

  if (route.courseId) {
    const current = parseCourseFromCoursePage(doc, route.pathname);
    if (current) found.set(current.id, current);
  }

  return Array.from(found.values());
}

/**
 * Applies a course's colors as scoped custom properties.
 *
 * Written as CSS variables on the element rather than inline colors so the
 * stylesheet decides what each one means, and so removing them restores
 * Schoology's own presentation exactly.
 */
function applyPalette(element: HTMLElement, course: ResolvedCourse): void {
  const pairs: Array<[string, string | undefined]> = [
    ['--bs-course-accent', course.accentColor],
    ['--bs-course-bg', course.backgroundColor],
    ['--bs-course-text', course.textColor],
    ['--bs-course-muted', course.mutedTextColor],
  ];

  for (const [property, value] of pairs) {
    if (value) element.style.setProperty(property, value);
    else element.style.removeProperty(property);
  }

  if (course.accentColor) element.style.setProperty('border-left-color', course.accentColor);
  else element.style.removeProperty('border-left-color');
}

function clearPalette(element: HTMLElement): void {
  for (const property of [
    '--bs-course-accent',
    '--bs-course-bg',
    '--bs-course-text',
    '--bs-course-muted',
  ]) {
    element.style.removeProperty(property);
  }
  element.style.removeProperty('border-left-color');
}

/**
 * Enhances the global grades page: one panel per course.
 *
 * The panel ID proves the course, so both the name override and the palette
 * can be applied here with no guessing.
 */
function enhanceGradebookPanels(context: EnhancementContext): number {
  const { document: doc, state } = context;
  let count = 0;

  for (const panel of queryAll<HTMLElement>(doc, SGY.grades.gradebookCourse)) {
    const courseId = panel.id.match(/^s-js-gradebook-course-(\d+)$/)?.[1];
    if (!courseId) continue;

    const stored = state.courses[courseId];
    const customization = state.customizations[courseId];
    if (!stored && !customization) continue;

    const course = resolveCourse(
      stored ?? { id: courseId, originalName: '', href: `/course/${courseId}` },
      customization,
    );

    panel.setAttribute(COURSE_ID_ATTR, courseId);
    applyPalette(panel, course);

    const titleAnchor = queryFirst<HTMLElement>(panel, SGY.grades.gradebookCourseTitle)
      ?.querySelector<HTMLElement>('a');

    if (titleAnchor && course.hasCustomizations && customization?.customName) {
      setDisplayText(titleAnchor, course.displayName);
    } else if (titleAnchor) {
      restoreDisplayText(titleAnchor);
    }

    markEnhanced(panel, FEATURE_ID);
    count += 1;
  }

  return count;
}

/**
 * Enhances a course page's breadcrumb title.
 *
 * The course ID comes from the URL, so this is safe on every `/course/<id>/*`
 * route regardless of which sub-page is showing.
 */
function enhanceCourseBreadcrumb(context: EnhancementContext): boolean {
  const { document: doc, route, state } = context;
  const courseId = route.courseId;
  if (!courseId) return false;

  const breadcrumb = queryFirst<HTMLElement>(doc, SGY.course.breadcrumbCourseTitle);
  // Only ever rewrite an anchor that links to the course itself; on an
  // assignment page the heading fallback would otherwise match the
  // assignment's own title.
  const anchor = courseAnchorIn(breadcrumb);
  if (!breadcrumb || !anchor) return false;

  const stored = state.courses[courseId];
  const customization = state.customizations[courseId];
  const course = resolveCourse(
    stored ?? { id: courseId, originalName: '', href: `/course/${courseId}` },
    customization,
  );

  breadcrumb.setAttribute(COURSE_ID_ATTR, courseId);
  applyPalette(breadcrumb, course);

  if (customization?.customName) setDisplayText(anchor, course.displayName);
  else restoreDisplayText(anchor);

  markEnhanced(breadcrumb, FEATURE_ID);
  return true;
}

/**
 * Reverts every override this feature applied.
 *
 * Runs when the feature stops applying, so disabling Better Schoology returns
 * the page to exactly what Schoology rendered.
 */
function revertOverrides(doc: Document): void {
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>(`[${COURSE_ID_ATTR}]`))) {
    clearPalette(element);
    element.removeAttribute(COURSE_ID_ATTR);
    for (const anchor of Array.from(element.querySelectorAll<HTMLElement>('a'))) {
      restoreDisplayText(anchor);
    }
  }
}

export const courseOverridesEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: () => true,

  async apply(context: EnhancementContext) {
    // Discovery runs first so a course seen for the first time is available to
    // the customizer even before any override exists for it.
    const discovered = discoverCourses(context);
    if (discovered.length > 0) {
      const updated = await recordCourses(discovered);
      if (updated) {
        // Use the freshly written registry for this pass rather than waiting
        // for the storage-change round trip.
        context.state.courses = updated.courses;
      }
      log.info('discovered courses:', discovered.length);
    }

    const panels = enhanceGradebookPanels(context);
    const breadcrumb = enhanceCourseBreadcrumb(context);
    if (panels || breadcrumb) log.info('course overrides applied:', { panels, breadcrumb });

    /*
     * Not applied here, deliberately:
     *
     * Custom course *images* have no documented native target. The capture set
     * has no `/home/course-dashboard` page and no course-card markup, so there
     * is no selector to trust. Custom images are therefore applied only on
     * Better Schoology's own dashboard cards until a course-card fixture
     * exists. See docs/schoology-integration-assumptions.md.
     */
  },

  revert(context: EnhancementContext) {
    revertOverrides(context.document);
  },
};
