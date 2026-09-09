import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { ResolvedCourse } from '@/src/types';
import { SGY, markEnhanced, queryFirst } from '@/src/schoology/selectors';
import { isHomeRoute } from '@/src/schoology/router';
import { findHomeSurfaces, isRecognizableHome } from '@/src/schoology/adapters/home';
import { resolveAllCourses } from '@/src/storage/courses';
import { el, findOwned, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { safeImageUrl } from '@/src/utils/url';
import { log } from '@/src/utils/log';
import { browser } from 'wxt/browser';
import type { RecentFeedbackItem, SchoologyTask } from '@/src/types';
import type { BetterSchoologyState } from '@/src/types/settings';
import { defaultState, rememberSplash } from '@/src/storage';
import { getDisplayName } from '@/src/features/navigation';
import { getDashboardTasks } from '@/src/features/todo';
import { selectSplash, isSplashIdEligible, type SplashContext, type SplashSelection } from '@/src/features/splash';
import { parseAnnouncements, parseNotifications, parseRecentFeedback } from '@/src/schoology/adapters/dashboard';
import { fetchRecentFeedback } from '@/src/schoology/endpoints/feedback';
import { renderAnnouncements, renderNotifications, renderRecentFeedback } from './panels';

/**
 * Better Home: Dashboard / Feed.
 *
 * Course cards and optional panels consume normalized native data. Two native
 * behavior guarantees are preserved throughout:
 *
 *  1. the native feed is *hidden*, never removed. `#home-feed-container` keeps
 *     its jQuery handlers, its Drupal behaviors and its position in the DOM;
 *     switching to Feed just drops a class.
 *  2. the native home tabs are left untouched, so Recent Activity, Course
 *     Dashboard and Assignments remain one click away even if this feature
 *     breaks entirely.
 *
 * The capture set has no native course-card page, so cards use the existing
 * locally discovered course registry rather than guessing native card markup.
 */
const FEATURE_ID = 'better-dashboard';
const COMPONENT_NAME = 'better-dashboard';
const HIDDEN_CLASS = 'better-schoology-hidden-by-dashboard';
interface DashboardCache {
  feedback: RecentFeedbackItem[];
  feedbackStatus: 'loading' | 'loaded' | 'unavailable';
  feedbackStarted: boolean;
  gradeDataLoadedAt?: Date;
  splash?: SplashSelection | null;
  splashSettings?: string;
  signature?: string;
}
const caches = new WeakMap<Document, DashboardCache>();
const timers = new WeakMap<Document, ReturnType<typeof setTimeout>>();

export type HomeView = 'dashboard' | 'feed';

/** Per-tab view choice. Not persisted: it is a momentary preference, not a setting. */
let activeView: HomeView = 'dashboard';

export function setActiveView(view: HomeView): void {
  activeView = view;
}

export function getActiveView(): HomeView {
  return activeView;
}

export function dashboardCounts(tasks: SchoologyTask[], courses: ResolvedCourse[], now: Date) {
  const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - ((now.getDay() + 6) % 7)));
  return {
    dueThisWeek: tasks.filter((task) => task.dueAt && task.dueAt >= now && task.dueAt < endOfWeek && task.status !== 'overdue').length,
    overdue: tasks.filter((task) => task.status === 'overdue' || (task.dueAt && task.dueAt < now)).length,
    courses: courses.filter((course) => !course.hidden).length,
  };
}

interface DashboardOptions {
  state?: BetterSchoologyState;
  tasks?: SchoologyTask[];
  now?: Date;
  heading?: string;
  feedback?: RecentFeedbackItem[];
  feedbackStatus?: DashboardCache['feedbackStatus'];
}

function renderCourseCard(doc: Document, course: ResolvedCourse): HTMLElement {
  const card = el(doc, 'li', { className: 'better-schoology-course-card' });

  for (const [property, value] of [
    ['--bs-course-accent', course.accentColor],
    ['--bs-course-bg', course.backgroundColor],
    ['--bs-course-text', course.textColor],
    ['--bs-course-muted', course.mutedTextColor],
  ] as const) {
    if (value) card.style.setProperty(property, value);
  }

  // Student-supplied image URLs are validated before use and rendered only as
  // a background image -- never injected as markup.
  const imageUrl = safeImageUrl(course.displayImageUrl);
  if (imageUrl) {
    const image = el(doc, 'div', { className: 'better-schoology-course-card__image' });
    image.style.backgroundImage = `url("${encodeURI(imageUrl)}")`;
    card.appendChild(image);
  }

  card.appendChild(
    el(doc, 'div', {
      className: 'better-schoology-course-card__name',
      children: [
        el(doc, 'a', {
          text: course.displayShortName,
          // Always the original Schoology href: a renamed course still
          // navigates to the real course.
          attrs: { href: course.href },
        }),
      ],
    }),
  );

  const meta = [course.sectionName, course.pinned ? 'Pinned' : ''].filter(Boolean).join(' · ');
  if (meta) {
    card.appendChild(el(doc, 'div', { className: 'better-schoology-course-card__meta', text: meta }));
  }

  return card;
}

function renderViewToggle(doc: Document, onSelect: (view: HomeView) => void): HTMLElement {
  const make = (view: HomeView, label: string): HTMLElement => {
    const button = el(doc, 'button', {
      text: label,
      attrs: { type: 'button', 'aria-pressed': String(activeView === view) },
    });
    button.addEventListener('click', () => onSelect(view));
    return button;
  };

  return el(doc, 'div', {
    className: 'better-schoology-view-toggle',
    attrs: { role: 'group', 'aria-label': 'Home view' },
    children: [make('dashboard', 'Dashboard'), make('feed', 'Feed')],
  });
}

/** Builds the dashboard shell. Exported so tests can render it without a lifecycle. */
export function renderDashboard(
  doc: Document,
  courses: ResolvedCourse[],
  onSelectView: (view: HomeView) => void,
  options: DashboardOptions = {},
): HTMLElement {
  const state = options.state ?? defaultState();
  const now = options.now ?? new Date();
  const name = getDisplayName(doc, state.settings.displayNameOverride);
  const existing = findOwned(doc, COMPONENT_NAME);
  const root =
    existing ??
    ownedRoot(doc, 'section', COMPONENT_NAME, {
      className: 'better-schoology-dashboard better-schoology-panel',
      attrs: { 'aria-label': 'Better Schoology dashboard' },
    });

  const visible = courses.filter((course) => !course.hidden);

  const header = el(doc, 'div', {
    className: 'better-schoology-panel__header',
    children: [
      el(doc, 'div', { children: [
        el(doc, 'h1', { className: 'better-schoology-splash', text: options.heading ?? (name ? `Hey, ${name}!` : 'Your dashboard') }),
        el(doc, 'p', { className: 'better-schoology-date', text: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) }),
      ] }),
      renderViewToggle(doc, onSelectView),
    ],
  });

  const body =
    visible.length > 0
      ? el(doc, 'ul', {
          className: 'better-schoology-course-grid',
          children: visible.map((course) => renderCourseCard(doc, course)),
        })
      : el(doc, 'p', {
          className: 'better-schoology-empty',
          text: courses.length ? 'All courses are hidden. Restore them in Customize.' : 'No courses discovered yet. Open your Grades page once so Better Schoology can list them.',
        });

  const counts = dashboardCounts(options.tasks ?? [], courses, now);
  const summary = el(doc, 'dl', { className: 'better-schoology-summary', children:
    [['Due this week', String(counts.dueThisWeek)], ['Overdue', String(counts.overdue)], ['Courses', String(counts.courses)], ['GPA', '—']]
      .map(([label, value]) => el(doc, 'div', { children: [el(doc, 'dt', { text: label }), el(doc, 'dd', { text: value,
        attrs: label === 'GPA' ? { title: 'GPA is not provided by the available Schoology data.' } : {} })] })) });
  const customize = el(doc, 'button', { text: 'Customize', attrs: { type: 'button' } });
  customize.addEventListener('click', () => { void browser.runtime?.openOptionsPage(); });
  const switcher = el(doc, 'details', { className: 'better-schoology-course-switcher', children: [
    el(doc, 'summary', { text: 'Switch course' }),
    el(doc, 'ul', { children: visible.map((course) => el(doc, 'li', { children: [el(doc, 'a', { text: course.displayShortName, attrs: { href: course.href } })] })) }),
  ] });
  const courseHeading = el(doc, 'div', { className: 'better-schoology-panel__header', children: [
    el(doc, 'h2', { className: 'better-schoology-panel__title', text: 'Your Courses' }), switcher, customize,
  ] });
  const todo = ownedRoot(doc, 'div', 'dashboard-todo-slot');
  const existingTodo = findOwned(doc, 'better-todo');
  if (existingTodo && activeView === 'dashboard') todo.appendChild(existingTodo);
  const sections = el(doc, 'div', { className: 'better-schoology-dashboard-sections', children: [
    state.settings.betterTodo && state.settings.dashboard.showTodo ? todo : null,
    state.settings.dashboard.showNotifications ? renderNotifications(doc, parseNotifications(doc), name) : null,
    state.settings.dashboard.showRecentFeedback ? renderRecentFeedback(doc, options.feedback ?? [], options.feedbackStatus ?? 'loaded', name) : null,
    state.settings.dashboard.showAnnouncements ? renderAnnouncements(doc, parseAnnouncements(doc), () => onSelectView('feed')) : null,
  ] });
  replaceChildren(root, [header, el(doc, 'div', { className: 'better-schoology-dashboard-content', children: [summary, courseHeading, body, sections] })]);

  return root;
}

function setFeedHidden(doc: Document, hidden: boolean): void {
  const feed = queryFirst<HTMLElement>(doc, SGY.home.feedContainer);
  if (!feed) return;
  feed.classList.toggle(HIDDEN_CLASS, hidden);
}

export const betterDashboardEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: (context) =>
    context.state.settings.betterDashboard && isHomeRoute(context.route.type),

  apply(context: EnhancementContext) {
    const doc = context.document;

    // If Home does not look like the Home we know, do nothing at all rather
    // than half-enhance an unfamiliar layout.
    if (!isRecognizableHome(doc)) {
      log.info('dashboard: unrecognized home layout, leaving native page alone');
      return;
    }

    const surfaces = findHomeSurfaces(doc);
    const mount = surfaces.main ?? queryFirst<HTMLElement>(doc, SGY.shell.mainInner);
    if (!mount) return;

    let cache = caches.get(doc);
    if (!cache) {
      cache = { feedback: parseRecentFeedback(doc), feedbackStatus: 'loading', feedbackStarted: false };
      caches.set(doc, cache);
    }
    if (context.state.settings.dashboard.showRecentFeedback && !cache.feedbackStarted) {
      cache.feedbackStarted = true;
      const current = cache;
      void fetchRecentFeedback(doc).then((feedback) => {
        if (feedback) { current.feedback = feedback; current.gradeDataLoadedAt = new Date(); }
        current.feedbackStatus = feedback ? 'loaded' : 'unavailable';
        context.requestPass();
      });
    }
    const now = new Date();
    const tasks = getDashboardTasks(context).tasks;
    const name = getDisplayName(doc, context.state.settings.displayNameOverride);
    const splashContext: SplashContext = { now, displayName: name, tasks, surface: 'dashboard', gradeDataLoadedAt: cache.gradeDataLoadedAt,
      hasFeedback: cache.feedback.some((item) => !!item.feedbackPreview) };
    const splashSettings = JSON.stringify([context.state.settings.splash, name]);
    if (cache.splashSettings !== splashSettings || cache.splash === undefined || (cache.splash && !isSplashIdEligible(cache.splash.id, splashContext, context.state.settings.splash))) {
      cache.splash = selectSplash(splashContext, context.state.settings.splash, context.state.splashHistory);
      cache.splashSettings = splashSettings;
      if (cache.splash) void rememberSplash(cache.splash.id).catch((error) => log.warn('could not save splash history:', error));
    }
    // Revalidate at clock/deadline minute boundaries without rerolling a valid
    // splash. This prevents a stale countdown claim during the next minute.
    const previousTimer = timers.get(doc);
    if (previousTimer) clearTimeout(previousTimer);
    const boundary = Math.min(60_000 - now.getTime() % 60_000, ...tasks.flatMap((task) => {
      const remaining = task.dueAt ? task.dueAt.getTime() - now.getTime() : 0;
      return remaining > 0 ? [remaining % 60_000 || 60_000] : [];
    }));
    timers.set(doc, setTimeout(() => { timers.delete(doc); context.requestPass(); }, boundary + 20));
    const courses = resolveAllCourses(context.state);
    const feedback = cache.feedback.map((item) => ({ ...item, courseName: context.state.customizations[item.courseId]?.customName || item.courseName }));
    const signature = JSON.stringify([context.state.settings, courses, tasks, feedback, cache.feedbackStatus,
      cache.splash?.text, now.toDateString(), parseNotifications(doc), parseAnnouncements(doc), activeView]);
    if (signature === cache.signature && findOwned(doc, COMPONENT_NAME)) return;

    const dashboard = renderDashboard(doc, courses, (view) => {
      setActiveView(view);
      context.requestPass();
    }, { state: context.state, tasks, now, heading: cache.splash?.text ?? 'Your dashboard', feedback, feedbackStatus: cache.feedbackStatus });
    cache.signature = signature;

    if (!dashboard.isConnected) {
      mount.insertBefore(dashboard, mount.firstChild);
      markEnhanced(mount, FEATURE_ID);
    }

    dashboard.classList.toggle('better-schoology-dashboard--feed', activeView === 'feed');
    setFeedHidden(doc, activeView === 'dashboard');
  },

  revert(context: EnhancementContext) {
    // Restoring the native feed comes first: even if removing our own node
    // failed, the student must not be left staring at a hidden homepage.
    setFeedHidden(context.document, false);
    removeOwned(context.document, COMPONENT_NAME);
    const timer = timers.get(context.document);
    if (timer) clearTimeout(timer);
    timers.delete(context.document);
  },
};
