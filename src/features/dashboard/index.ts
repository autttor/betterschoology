import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { HomeView } from '@/src/types/settings';
import type { SchoologyTask } from '@/src/types';
import { SGY, clearEnhancedAll, dropClasses, markEnhanced, queryFirst } from '@/src/schoology/selectors';
import { isHomeRoute } from '@/src/schoology/router';
import { findHomeSurfaces, isRecognizableHome, parseAnnouncements } from '@/src/schoology/adapters/home';
import { resolveAllCourses } from '@/src/storage/courses';
import { findOwned, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { needsRender } from '@/src/components/memo';
import { loadTasks, withCourseIdentity } from '@/src/features/todo/store';
import { taskKey } from '@/src/features/todo/visibility';
import { parseNotifications } from '@/src/schoology/adapters/dashboard';
import { fetchRecentFeedback } from '@/src/schoology/endpoints/feedback';
import { selectSplash, isSplashIdEligible, type SplashContext, type SplashSelection } from '@/src/features/splash';
import { hideTask, rememberSplash } from '@/src/storage';
import type { RecentFeedbackItem } from '@/src/types';
import { findHeaderMount, renderCourseSwitcher } from '@/src/features/courseSwitcher';
import { getDisplayName } from '@/src/features/navigation';
import { renderGpaTile } from '@/src/features/grades/gpaWidget';
import { openCustomizer as openSettings } from '@/src/utils/messaging';
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

/**
 * Per-page-load cache for the two things that are expensive or must not
 * flicker: the grade-report read behind Recent feedback, and the chosen splash
 * line. Neither belongs in storage -- one is a network read, the other is a
 * cosmetic choice that should stay put while the page is open.
 */
interface DashboardCache {
  feedback: RecentFeedbackItem[];
  feedbackStatus: 'idle' | 'loading' | 'loaded' | 'unavailable';
  splash?: SplashSelection | null;
  splashKey?: string;
}

let cache: DashboardCache = { feedback: [], feedbackStatus: 'idle' };

export function resetDashboardCache(): void {
  cache = { feedback: [], feedbackStatus: 'idle' };
}

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
  if (!element) return;
  if (hidden) element.classList.add(HIDDEN_CLASS);
  else dropClasses(element, HIDDEN_CLASS);
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
    const { dashboard: panels } = context.state.settings;
    const announcements = panels.showAnnouncements ? parseAnnouncements(doc) : [];
    const notifications = panels.showNotifications
      ? parseNotifications(doc)
      : { available: false };

    const displayName = getDisplayName(doc, context.state.settings.displayNameOverride);
    const heading = chooseSplash(context, tasks, displayName);

    if (panels.showRecentFeedback && cache.feedbackStatus === 'idle') {
      cache.feedbackStatus = 'loading';
      void fetchRecentFeedback(doc)
        .then((items) => {
          cache.feedback = items ?? [];
          cache.feedbackStatus = items ? 'loaded' : 'unavailable';
          context.requestPass();
        })
        .catch(() => {
          cache.feedbackStatus = 'unavailable';
        });
    }

    /*
     * Passes are frequent; rebuilding the whole dashboard on each one would
     * discard focus and scroll position for no gain. The signature covers
     * everything the render actually reads.
     */
    const signature = [
      view,
      context.state.settings.courseCardDensity,
      JSON.stringify(panels),
      heading ?? '',
      notifications.count ?? (notifications.available ? 'available' : 'none'),
      `${cache.feedbackStatus}:${cache.feedback.length}`,
      courses.map((course) => `${course.id}:${course.displayShortName}:${course.pinned}:${course.hidden}:${course.accentColor ?? ''}:${course.displayImageUrl ?? ''}`).join(','),
      Object.values(context.state.gradeSnapshots)
        .map((snapshot) => `${snapshot.courseId}:${snapshot.percentage}`)
        .join(','),
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
          notifications,
          feedback: cache.feedback,
          feedbackStatus: cache.feedbackStatus === 'idle' ? 'loading' : cache.feedbackStatus,
          degraded: result?.degraded ?? false,
          state: context.state,
          ...(heading ? { heading } : {}),
          ...(displayName ? { displayName } : {}),
        },
        {
          onSelectView: (next) => {
            setActiveView(next);
            context.requestPass();
          },
          onCustomize: () => void openCustomizer(),
          /*
           * Hiding is Better Schoology's own list only. Schoology's task, its
           * due date and its link are untouched, and the customizer lists
           * everything hidden with a Restore button.
           */
          onHideTask: (task) => {
            const key = taskKey(task);
            if (!key) return;
            void hideTask({
              id: key,
              title: task.title,
              ...(task.href ? { href: task.href } : {}),
            }).then(() => context.requestPass());
          },
          /*
           * The GPA tile only appears once grades have actually been seen.
           * Better Schoology keeps one percentage per course locally for
           * exactly this, and shows nothing at all until it has some.
           */
          renderGpaSlot: (document) => {
            if (!panels.showGpa || !context.state.settings.gpaEnabled) return null;

            const snapshots = Object.values(context.state.gradeSnapshots);
            if (snapshots.length === 0) return null;

            return renderGpaTile(
              document,
              {
                courses: snapshots.map((snapshot) => ({
                  courseId: snapshot.courseId,
                  courseName:
                    context.state.customizations[snapshot.courseId]?.shortName?.trim() ||
                    context.state.customizations[snapshot.courseId]?.customName?.trim() ||
                    context.state.courses[snapshot.courseId]?.originalName ||
                    `Course ${snapshot.courseId}`,
                  percentage: snapshot.percentage,
                })),
                state: context.state,
              },
              () => void openSettings(),
            );
          },
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
      dropClasses(node, HIDDEN_CLASS);
    }

    clearEnhancedAll(doc, FEATURE_ID);

    removeOwned(doc, COMPONENT_NAME);
    setActiveView(null);
    resetDashboardCache();
  },
};

/**
 * Picks the rotating heading, and remembers it so it does not change under the
 * student mid-session.
 *
 * A splash is re-chosen only when the settings, the name, or the eligibility of
 * the current line changes -- a line claiming "due in 10 minutes" must stop
 * claiming it once that is no longer true.
 */
function chooseSplash(
  context: EnhancementContext,
  tasks: SchoologyTask[] | null,
  displayName?: string,
): string | undefined {
  const { splash } = context.state.settings;
  if (!splash.enabled) return undefined;

  const now = new Date();
  const splashContext: SplashContext = {
    now,
    ...(displayName ? { displayName } : {}),
    tasks: tasks ?? [],
    surface: 'dashboard',
  };

  const key = JSON.stringify([splash, displayName ?? '']);
  const stale =
    cache.splashKey !== key ||
    cache.splash === undefined ||
    (cache.splash && !isSplashIdEligible(cache.splash.id, splashContext, splash));

  if (stale) {
    cache.splash = selectSplash(splashContext, splash, context.state.splashHistory);
    cache.splashKey = key;
    if (cache.splash) {
      void rememberSplash(cache.splash.id).catch((error) =>
        log.warn('could not save splash history:', error),
      );
    }
  }

  return cache.splash?.text;
}

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
