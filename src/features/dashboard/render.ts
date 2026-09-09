import type { HomeAnnouncement, RecentFeedbackItem, ResolvedCourse, SchoologyTask } from '@/src/types';
import type { NotificationSummary } from '@/src/schoology/adapters/dashboard';
import type { BetterSchoologyState, HomeView } from '@/src/types/settings';
import { binder, button, icon } from '@/src/components/dom';
import { ICONS } from '@/src/components/icons';
import { emptyState, note, panel, tabs } from '@/src/components/ui';
import { formatDueLabel, formatLongDate, greetingFor } from '@/src/utils/date';
import { groupTasks } from '@/src/schoology/adapters/todo';
import { renderTodoBody } from '@/src/features/todo/render';
import { renderCourseCard } from './courseCard';
import { renderAnnouncements } from './announcements';
import { renderNotifications, renderRecentFeedback } from './panels';

/**
 * Better Home layout.
 *
 * The hierarchy is the whole point of the feature:
 *
 *   1. what courses do I have   -> the course grid, top of the main column
 *   2. what do I need to do     -> To Do, directly beneath it
 *   3. how am I doing           -> the grade tile, first in the rail
 *   4. what happened            -> notifications, feedback and announcements,
 *                                  in the rail, small, out of the way
 *
 * Two decisions worth keeping: the course grid sits directly on the page rather
 * than inside its own card (a grid of cards inside a card reads as clutter),
 * and the summary counts live in the header line instead of a row of tiles that
 * repeated what the To Do list says two inches below.
 *
 * Schoology's own feed is not removed to achieve any of this. It is one tab
 * away, still rendered by Schoology itself.
 */
export interface DashboardData {
  view: HomeView;
  courses: ResolvedCourse[];
  /** Null when no To Do source was available -- the native rail then stays. */
  tasks: SchoologyTask[] | null;
  events: SchoologyTask[];
  announcements: HomeAnnouncement[];
  notifications: NotificationSummary;
  feedback: RecentFeedbackItem[];
  feedbackStatus: 'loading' | 'loaded' | 'unavailable';
  degraded: boolean;
  state: BetterSchoologyState;
  /** The rotating heading, when splash text is on. */
  heading?: string;
  displayName?: string;
  now?: Date;
}

export interface DashboardCallbacks {
  onSelectView(view: HomeView): void;
  onCustomize(): void;
  onHideTask?(task: SchoologyTask): void;
  renderGpaSlot?(doc: Document): HTMLElement | null;
  renderSwitcher?(doc: Document): HTMLElement | null;
}

export function renderDashboard(
  doc: Document,
  data: DashboardData,
  callbacks: DashboardCallbacks,
): HTMLElement[] {
  const e = binder(doc);
  const now = data.now ?? new Date();

  const header = e('header', {
    className: 'bs-home__header',
    children: [
      e('div', {
        className: 'bs-home__greeting',
        children: [
          e('h2', {
            className: 'bs-home__title',
            text: data.heading ?? defaultHeading(now, data.displayName),
          }),
          renderHeaderLine(doc, data, now),
        ],
      }),
      e('div', {
        className: 'bs-home__controls',
        children: [
          callbacks.renderSwitcher?.(doc) ?? null,
          tabs(
            doc,
            [
              { id: 'dashboard' as const, label: 'Dashboard', icon: 'chart' },
              { id: 'feed' as const, label: 'Feed', icon: 'megaphone' },
            ],
            data.view,
            callbacks.onSelectView,
            'Home view',
          ),
        ],
      }),
    ],
  });

  if (data.view === 'feed') {
    return [header, note(doc, 'Showing Schoology’s own Recent Activity feed below.', 'bs-home__feed-note')];
  }

  const rail = renderRail(doc, data, callbacks);

  return [
    header,
    e('div', {
      // With every rail panel switched off there is no rail, so the grid must
      // stop reserving a column for it rather than leaving dead space.
      className: `bs-home__grid${rail ? '' : ' bs-home__grid--solo'}`,
      children: [
        e('div', {
          className: 'bs-home__main',
          children: [renderCourses(doc, data, callbacks, now), renderTodo(doc, data, callbacks, now)],
        }),
        rail,
      ],
    }),
  ];
}

function defaultHeading(now: Date, displayName?: string): string {
  return displayName ? `${greetingFor(now)}, ${displayName}` : greetingFor(now);
}

/**
 * The date, plus what is actually pressing.
 *
 * These counts come from the same grouping the To Do list uses, so the line and
 * the headings below it can never disagree.
 */
function renderHeaderLine(doc: Document, data: DashboardData, now: Date): HTMLElement {
  const e = binder(doc);
  const groups = groupTasks(data.tasks ?? [], now);
  const countIn = (...buckets: string[]): number =>
    groups
      .filter((group) => buckets.includes(group.bucket))
      .reduce((total, group) => total + group.tasks.length, 0);

  const overdue = countIn('overdue');
  const soon = countIn('today', 'tomorrow');

  const parts: Array<Node | null> = [e('span', { text: formatLongDate(now) })];
  if (overdue > 0) {
    parts.push(
      e('span', {
        className: 'bs-home__count bs-home__count--overdue',
        children: [
          icon(doc, ICONS.alert, 'bs-icon bs-icon--sm'),
          e('span', { text: `${overdue} overdue` }),
        ],
      }),
    );
  }
  if (soon > 0) {
    parts.push(
      e('span', {
        className: 'bs-home__count',
        children: [
          icon(doc, ICONS.clock, 'bs-icon bs-icon--sm'),
          e('span', { text: `${soon} due soon` }),
        ],
      }),
    );
  }

  return e('p', { className: 'bs-home__date', children: parts });
}

/** The course grid, directly on the page rather than inside another card. */
function renderCourses(
  doc: Document,
  data: DashboardData,
  callbacks: DashboardCallbacks,
  now: Date,
): HTMLElement {
  const e = binder(doc);
  const visible = data.courses.filter((course) => !course.hidden);
  const tasks = data.tasks ?? [];

  const byCourse = new Map<string, SchoologyTask[]>();
  for (const task of tasks) {
    if (!task.courseId) continue;
    const list = byCourse.get(task.courseId);
    if (list) list.push(task);
    else byCourse.set(task.courseId, [task]);
  }

  const body =
    visible.length > 0
      ? e('ul', {
          className: `bs-course-grid bs-course-grid--${data.state.settings.courseCardDensity}`,
          children: visible.map((course) =>
            renderCourseCard(doc, {
              course,
              tasks: byCourse.get(course.id) ?? [],
              taskLimit: data.state.settings.courseCardDensity === 'compact' ? 2 : 3,
              // Only claimable when Schoology's To Do actually parsed.
              ...(data.tasks !== null ? { emptyTaskLabel: 'Nothing due' } : {}),
              now,
            }),
          ),
        })
      : e('div', {
          className: 'bs-panel',
          children: [
            emptyState(
              doc,
              'No courses discovered yet.',
              'Open your Schoology Grades page once and every enrolled course appears here.',
            ),
            e('div', {
              className: 'bs-empty__actions',
              children: [
                e('a', {
                  className: 'bs-btn bs-btn--primary',
                  text: 'Open Grades',
                  attrs: { href: '/grades/grades' },
                }),
              ],
            }),
          ],
        });

  return e('section', {
    className: 'bs-section bs-section--courses',
    children: [
      e('div', {
        className: 'bs-section__head',
        children: [
          e('h3', {
            className: 'bs-section__title',
            children: [
              icon(doc, ICONS.book, 'bs-icon bs-icon--sm'),
              e('span', { text: 'Your courses' }),
            ],
          }),
          button(doc, {
            className: 'bs-btn bs-btn--quiet',
            text: 'Customize',
            onClick: () => callbacks.onCustomize(),
          }),
        ],
      }),
      body,
    ],
  });
}

function renderTodo(
  doc: Document,
  data: DashboardData,
  callbacks: DashboardCallbacks,
  now: Date,
): HTMLElement | null {
  if (!data.state.settings.dashboard.showTodo) return null;
  const { tasks } = data;

  if (tasks === null) {
    return panel(doc, { title: 'To Do', icon: 'check', className: 'bs-todo' }, [
      emptyState(
        doc,
        'Schoology’s To Do list could not be read.',
        'Your own To Do panel is still on this page, in the sidebar under Feed.',
      ),
    ]);
  }

  return panel(
    doc,
    {
      title: 'To Do',
      icon: 'check',
      className: 'bs-todo',
      subtitle: `${tasks.length} ${tasks.length === 1 ? 'item' : 'items'}`,
    },
    renderTodoBody(doc, tasks, {
      now,
      degraded: data.degraded,
      ...(callbacks.onHideTask ? { onHide: callbacks.onHideTask } : {}),
    }),
  );
}

/** Everything that is information rather than action. */
function renderRail(
  doc: Document,
  data: DashboardData,
  callbacks: DashboardCallbacks,
): HTMLElement | null {
  const e = binder(doc);
  const { dashboard } = data.state.settings;
  const panels: Array<Node | null> = [];

  if (dashboard.showGpa) panels.push(callbacks.renderGpaSlot?.(doc) ?? null);
  if (dashboard.showNotifications) panels.push(renderNotifications(doc, data.notifications));
  if (dashboard.showRecentFeedback) {
    panels.push(renderRecentFeedback(doc, data.feedback, data.feedbackStatus));
  }
  if (dashboard.showAnnouncements) {
    panels.push(renderAnnouncements(doc, data.announcements, data.state));
  }
  if (data.events.length > 0) panels.push(renderEvents(doc, data.events, data.now ?? new Date()));

  const present = panels.filter(Boolean);
  if (present.length === 0) return null;

  return e('aside', {
    className: 'bs-home__rail',
    attrs: { 'aria-label': 'Updates' },
    children: present,
  });
}

function renderEvents(doc: Document, events: SchoologyTask[], now: Date): HTMLElement {
  const e = binder(doc);
  return panel(
    doc,
    { title: 'Upcoming events', icon: 'clock', headingLevel: 'h3', className: 'bs-events-panel' },
    [
      e('ul', {
        className: 'bs-event-list',
        children: events.slice(0, 6).map((event) =>
          e('li', {
            className: 'bs-event',
            children: [
              event.href
                ? e('a', { className: 'bs-event__title', text: event.title, attrs: { href: event.href } })
                : e('span', { className: 'bs-event__title', text: event.title }),
              e('span', { className: 'bs-event__when', text: formatDueLabel(event.dueAt, now) }),
            ],
          }),
        ),
      }),
    ],
  );
}
