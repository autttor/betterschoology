import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { HomeView } from '@/src/types/settings';
import { SGY, markEnhanced, queryFirst } from '@/src/schoology/selectors';
import { isHomeRoute } from '@/src/schoology/router';
import { findHomeSurfaces, isRecognizableHome, parseAnnouncements } from '@/src/schoology/adapters/home';
import { resolveAllCourses } from '@/src/storage/courses';
import { findOwned, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { needsRender } from '@/src/components/memo';
import { loadTasks, withCourseIdentity } from '@/src/features/todo/store';
import { findHeaderMount, renderCourseSwitcher } from '@/src/features/courseSwitcher';
import { openCustomizer } from '@/src/utils/messaging';
import { log } from '@/src/utils/log';
import { renderDashboard } from './render';

/**
 * Better Home: Dashboard / Feed.
 *
 * Two rules govern everything here:
 *
 *  1. native surfaces are *hidden*, never removed. `#home-feed-container` and
 *     `#right-column` keep their jQuery handlers, their Drupal behaviors and
 *     their position in the DOM; switching to Feed drops a class.
 *  2. the native home tabs are left untouched underneath, so Recent Activity,
 *     Course Dashboard and Assignments remain one click away even if this
 *     feature breaks entirely.
 *
 * The native right rail is only hidden once Better To Do actually has a task
 * source. If it does not, the rail stays exactly where it is -- a student must
 * never lose their To Do list to a Better Schoology parse failure.
 */
const FEATURE_ID = 'better-dashboard';
const COMPONENT_NAME = 'better-dashboard';
const HIDDEN_CLASS = 'bs-hidden-by-dashboard';
const DASHBOARD_ATTR = 'data-bs-home-dashboard';

/** Per-tab view choice. Not persisted: it is a momentary preference. */
let activeView: HomeView | null = null;

export function setActiveView(view: HomeView | null): void {
  activeView = view;
}

export function getActiveView(): HomeView | null {
  return activeView;
}

export { renderDashboard } from './render';
export { renderCourseCard } from './courseCard';
export { renderAnnouncements } from './announcements';

function setHidden(element: Element | null, hidden: boolean): void {
  element?.classList.toggle(HIDDEN_CLASS, hidden);
}

export const betterDashboardEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: (context) =>
    context.state.settings.betterDashboard && isHomeRoute(context.route.type),

  async apply(context: EnhancementContext) {
    const doc = context.document;

    // If Home does not look like the Home we know, do nothing at all rather
    // than half-enhance an unfamiliar layout.
    if (!isRecognizableHome(doc)) {
      log.info('dashboard: unrecognized home layout, leaving native page alone');
      return;
    }

    const surfaces = findHomeSurfaces(doc);
    const mount = surfaces.mainInner ?? surfaces.main;
    if (!mount) return;

    const view: HomeView = activeView ?? context.state.settings.defaultHomeView;
    const result = await loadTasks(context);
    const tasks = result ? withCourseIdentity(context, result.tasks) : null;
    const events = result ? withCourseIdentity(context, result.events) : [];

    const root =
      findOwned(doc, COMPONENT_NAME) ??
      ownedRoot(doc, 'section', COMPONENT_NAME, {
        className: 'better-schoology bs-home',
        attrs: { 'aria-label': 'Better Schoology home' },
      });

    const courses = resolveAllCourses(context.state);
    const announcements = context.state.settings.showAnnouncements ? parseAnnouncements(doc) : [];

    /*
     * Passes are frequent; rebuilding the whole dashboard on each one would
     * discard focus and scroll position for no gain. The signature covers
     * everything the render actually reads.
     */
    const signature = [
      view,
      context.state.settings.courseCardDensity,
      context.state.settings.showAnnouncements,
      context.state.settings.showGpaWidget,
      courses.map((course) => `${course.id}:${course.displayShortName}:${course.pinned}:${course.hidden}:${course.accentColor ?? ''}:${course.displayImageUrl ?? ''}`).join(','),
      tasks === null ? 'no-tasks' : tasks.map((task) => `${task.id ?? task.title}:${task.status}`).join(','),
      events.length,
      announcements.length,
      result?.degraded ?? false,
    ].join('|');

    if (needsRender(root, signature)) {
      const children = renderDashboard(
        doc,
        {
          view,
          courses,
          tasks,
          events,
          announcements,
          degraded: result?.degraded ?? false,
          state: context.state,
        },
        {
          onSelectView: (next) => {
            setActiveView(next);
            context.requestPass();
          },
          onCustomize: () => void openCustomizer(),
          // The switcher lives in the header when the header is one we know.
          // Only when it is not is one offered here, so Home never shows two.
          renderSwitcher: (document) => {
            if (!context.state.settings.compactCourseSwitcher) return null;
            if (findHeaderMount(document) || courses.length === 0) return null;
            return renderCourseSwitcher(document, {
              courses,
              onCustomize: () => void openCustomizer(),
            }).root;
          },
        },
      );

      replaceChildren(root, children);
    }

    root.classList.toggle('bs-home--feed', view === 'feed');

    if (!root.isConnected) {
      mount.insertBefore(root, mount.firstChild);
      markEnhanced(mount, FEATURE_ID);
    }

    const dashboardActive = view === 'dashboard';
    setHidden(surfaces.feedContainer, dashboardActive);
    // Only take over the rail once we actually have something to put in its
    // place. `tasks === null` means every To Do read failed.
    const railReplaced = dashboardActive && tasks !== null;
    setHidden(surfaces.rightColumn, railReplaced);

    if (dashboardActive) doc.documentElement.setAttribute(DASHBOARD_ATTR, '');
    else doc.documentElement.removeAttribute(DASHBOARD_ATTR);
  },

  revert(context: EnhancementContext) {
    const doc = context.document;
    // Restoring native surfaces comes first: even if removing our own node
    // failed, the student must not be left staring at a hidden homepage.
    const surfaces = findHomeSurfaces(doc);
    setHidden(surfaces.feedContainer, false);
    setHidden(surfaces.rightColumn, false);
    doc.documentElement.removeAttribute(DASHBOARD_ATTR);

    // Belt and braces: any node still carrying the class, whatever it is.
    for (const node of Array.from(doc.querySelectorAll(`.${HIDDEN_CLASS}`))) {
      node.classList.remove(HIDDEN_CLASS);
    }

    removeOwned(doc, COMPONENT_NAME);
    setActiveView(null);
  },
};

/** Exposed for tests: the class the dashboard hides native surfaces with. */
export { HIDDEN_CLASS, DASHBOARD_ATTR };

/** Kept for callers that only need to know whether the surface is present. */
export function dashboardMounted(doc: Document): boolean {
  return findOwned(doc, COMPONENT_NAME) !== null;
}

/** Used by tests and the content script to find the native feed container. */
export function nativeFeed(doc: Document): HTMLElement | null {
  return queryFirst<HTMLElement>(doc, SGY.home.feedContainer);
}
