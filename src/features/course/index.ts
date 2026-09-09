import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import {
  SGY,
  clearEnhancedAll,
  dropClasses,
  markEnhanced,
  queryFirst,
} from '@/src/schoology/selectors';
import { isCourseRoute } from '@/src/schoology/router';
import { parseCourseFromCoursePage } from '@/src/schoology/adapters/course';
import {
  coreNav,
  findAppsList,
  findAppsRoot,
  parseCourseApps,
  parseCourseNav,
} from '@/src/schoology/adapters/courseNav';
import { resolveCourse } from '@/src/storage/courses';
import { findOwned, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { needsRender } from '@/src/components/memo';
import { log } from '@/src/utils/log';
import { renderCourseHeader } from './header';
import { applyAppsVisibility, revertApps } from './apps';
import { enhanceMaterials, revertMaterials } from './materials';

/**
 * Better Courses.
 *
 * Three separate, independently reversible improvements to a course page:
 *
 *  1. a clear header in `#center-top` -- the student's own course name, the
 *     Schoology name underneath, and the course's core pages as one compact
 *     nav;
 *  2. third-party apps collapsed behind a disclosure button, so Materials and
 *     Grades are not pushed below the fold;
 *  3. a materials list with real hierarchy, achieved by restyling Schoology's
 *     own table rather than replacing it.
 *
 * Nothing native is removed: the left menu, the app links, the materials table
 * and every href stay exactly where Schoology put them.
 */
const FEATURE_ID = 'better-courses';
const COMPONENT_NAME = 'better-course-header';
const LAYOUT_ATTR = 'data-bs-course-layout';

export { renderCourseHeader } from './header';
export { enhanceMaterials, revertMaterials, MATERIALS_CLASS } from './materials';
export { setAppsExpanded, areAppsExpanded, APPS_COLLAPSED_CLASS, APPS_HIDDEN_CLASS } from './apps';

export const betterCoursesEnhancement: Enhancement = {
  id: FEATURE_ID,

  /*
   * Assignment pages carry the same course sidebar, so the app collapsing
   * applies there too -- but the header does not: Better Assignment already
   * names the course at the top of its own layout.
   */
  appliesTo: (context) =>
    context.state.settings.betterCourses &&
    (isCourseRoute(context.route.type) || context.route.type === 'assignment'),

  apply(context: EnhancementContext) {
    const doc = context.document;

    // An assignment page has no course ID in its path, and needs none: only
    // the app collapsing applies there.
    if (context.route.type === 'assignment') {
      applyApps(context);
      return;
    }

    const courseId = context.route.courseId;
    if (!courseId) return;

    const nav = parseCourseNav(doc);
    const core = coreNav(nav);
    const centerTop = queryFirst<HTMLElement>(doc, SGY.shell.centerTop);

    // No left menu and no page chrome means this is not a course page we
    // recognize. Fail open rather than half-enhance it.
    if (!centerTop || core.length === 0) {
      log.info('better courses: unrecognized course layout, leaving native page alone');
      return;
    }

    const discovered = parseCourseFromCoursePage(doc, context.route.pathname);
    const stored = context.state.courses[courseId];
    const course = resolveCourse(
      discovered ?? stored ?? { id: courseId, originalName: '', href: `/course/${courseId}` },
      context.state.customizations[courseId],
    );

    const host =
      findOwned(doc, COMPONENT_NAME) ??
      ownedRoot(doc, 'div', COMPONENT_NAME, { className: 'better-schoology bs-course-top' });

    const signature = [
      course.id,
      course.displayName,
      course.accentColor ?? '',
      course.displayImageUrl ?? '',
      core.map((link) => `${link.kind}:${link.active}`).join(','),
    ].join('|');

    if (needsRender(host, signature)) {
      replaceChildren(host, [renderCourseHeader(doc, { course, nav: core })]);
    }

    if (!host.isConnected) {
      centerTop.insertBefore(host, centerTop.firstChild);
      markEnhanced(centerTop, FEATURE_ID);
    }

    // The native heading now says the same thing twice; hide it while our
    // header is showing rather than removing it.
    const nativeTitle = queryFirst<HTMLElement>(doc, SGY.shell.pageTitle);
    if (nativeTitle && centerTop.contains(nativeTitle)) {
      nativeTitle.classList.add('bs-native-heading-replaced');
    }

    // The course breadcrumb repeats the name our header now shows, and links
    // to the same place. Hidden while ours is up, restored on revert.
    const breadcrumb = queryFirst<HTMLElement>(doc, SGY.course.breadcrumbCourseTitle);
    if (breadcrumb && centerTop.contains(breadcrumb)) {
      (breadcrumb.closest('nav') ?? breadcrumb).classList.add('bs-native-heading-replaced');
    }

    doc.documentElement.setAttribute(LAYOUT_ATTR, '');

    applyApps(context);

    if (context.route.type === 'course-materials') {
      enhanceMaterials(doc, context.state.settings.materialDensity);
    }
  },

  revert(context: EnhancementContext) {
    const doc = context.document;

    removeOwned(doc, COMPONENT_NAME);
    revertApps(doc);
    revertMaterials(doc);

    for (const node of Array.from(doc.querySelectorAll('.bs-native-heading-replaced'))) {
      dropClasses(node, 'bs-native-heading-replaced');
    }

    clearEnhancedAll(doc, 'better-materials');
    clearEnhancedAll(doc, FEATURE_ID);

    doc.documentElement.removeAttribute(LAYOUT_ATTR);
  },
};

/** Collapses (or shows, or hides) the course's third-party app links. */
function applyApps(context: EnhancementContext): void {
  const doc = context.document;
  const appsRoot = findAppsRoot(doc);
  const appsList = findAppsList(doc);
  if (!appsRoot || !appsList) return;

  applyAppsVisibility(
    doc,
    appsRoot,
    appsList,
    parseCourseApps(doc),
    context.state.settings.appsVisibility,
    () => context.requestPass(),
  );
}

/** Exposed for tests. */
export { LAYOUT_ATTR };
