import type { HomeAnnouncement, ResolvedCourse, SchoologyTask } from '@/src/types';
import type { BetterSchoologyState, HomeView } from '@/src/types/settings';
import { binder, button, icon } from '@/src/components/dom';
import { ICONS } from '@/src/components/icons';
import { emptyState, note, panel, tabs } from '@/src/components/ui';
import { formatDueLabel, formatLongDate, greetingFor } from '@/src/utils/date';
import { groupTasks } from '@/src/schoology/adapters/todo';
import { renderTodoBody } from '@/src/features/todo/render';
import { renderCourseCard } from './courseCard';
import { renderAnnouncements } from './announcements';

/**
 * Better Home layout.
 *
 * The hierarchy is deliberate and is the whole point of the feature:
 *
 *   1. what courses do I have      -> the course grid, which dominates the page
 *   2. what do I need to do        -> To Do, grouped by when it is due
 *   3. how am I doing              -> the grade/GPA strip
 *   4. what happened               -> announcements, small, off to the side
 *
 * Schoology's own feed is not removed to achieve this; it is one tab away and
 * still rendered by Schoology itself.
 */
export interface DashboardData {
  view: HomeView;
  courses: ResolvedCourse[];
  /** Null when no To Do source was available -- the native rail then stays. */
  tasks: SchoologyTask[] | null;
  events: SchoologyTask[];
  announcements: HomeAnnouncement[];
  degraded: boolean;
  state: BetterSchoologyState;
  now?: Date;
}

export interface DashboardCallbacks {
  onSelectView(view: HomeView): void;
  onCustomize(): void;
  /** Rendered into the GPA slot. v0.1 has no grade source, so this may be null. */
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
          e('h2', { className: 'bs-home__title', text: greetingFor(now) }),
          e('p', { className: 'bs-home__date', text: formatLongDate(now) }),
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
    return [
      header,
      note(
        doc,
        'Showing Schoology’s own Recent Activity feed below.',
        'bs-home__feed-note',
      ),
    ];
  }

  return [header, renderStats(doc, data, callbacks, now), renderCourses(doc, data, callbacks, now), renderLower(doc, data, now)];
}

/** The summary strip: what is due, what is late, and the GPA slot. */
function renderStats(
  doc: Document,
  data: DashboardData,
  callbacks: DashboardCallbacks,
  now: Date,
): HTMLElement {
  const e = binder(doc);
  // Counted from the same grouping the list below uses, so the tile and the
  // headings can never disagree about what counts as overdue.
  const groups = groupTasks(data.tasks ?? [], now);
  const countIn = (...buckets: string[]): number =>
    groups
      .filter((group) => buckets.includes(group.bucket))
      .reduce((total, group) => total + group.tasks.length, 0);

  const overdue = countIn('overdue');
  const dueThisWeek = countIn('today', 'tomorrow', 'week');

  const stats: Array<Node | null> = [
    statTile(doc, 'Due this week', String(dueThisWeek), 'clock'),
    statTile(doc, 'Overdue', String(overdue), 'alert', overdue > 0 ? 'danger' : undefined),
    statTile(doc, 'Courses', String(data.courses.filter((course) => !course.hidden).length), 'book'),
  ];

  const gpa = callbacks.renderGpaSlot?.(doc) ?? null;
  if (gpa) stats.push(gpa);

  return e('div', { className: 'bs-home__stats', children: stats });
}

export function statTile(
  doc: Document,
  label: string,
  value: string,
  iconName: keyof typeof ICONS,
  tone?: 'danger',
): HTMLElement {
  const e = binder(doc);
  return e('div', {
    className: `bs-stat${tone ? ` bs-stat--${tone}` : ''}`,
    children: [
      icon(doc, ICONS[iconName], 'bs-icon bs-stat__icon'),
      e('div', {
        className: 'bs-stat__text',
        children: [
          e('span', { className: 'bs-stat__value', text: value }),
          e('span', { className: 'bs-stat__label', text: label }),
        ],
      }),
    ],
  });
}

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
      ? [
          e('ul', {
            className: `bs-course-grid bs-course-grid--${data.state.settings.courseCardDensity}`,
            children: visible.map((course) =>
              renderCourseCard(doc, {
                course,
                tasks: byCourse.get(course.id) ?? [],
                taskLimit: data.state.settings.courseCardDensity === 'compact' ? 2 : 3,
                now,
              }),
            ),
          }),
        ]
      : [
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
        ];

  return panel(
    doc,
    {
      title: 'Your courses',
      icon: 'book',
      className: 'bs-courses-panel',
      actions: [
        button(doc, {
          className: 'bs-btn bs-btn--quiet',
          text: 'Customize',
          onClick: () => callbacks.onCustomize(),
        }),
      ],
    },
    body,
  );
}

/** To Do on the left, announcements and events on the right. */
function renderLower(doc: Document, data: DashboardData, now: Date): HTMLElement {
  const e = binder(doc);
  const tasks = data.tasks;

  const todoPanel =
    tasks === null
      ? panel(doc, { title: 'To Do', icon: 'check', className: 'bs-todo' }, [
          emptyState(
            doc,
            'Schoology’s To Do list could not be read.',
            'Your own To Do panel is still on this page, in the sidebar under Feed.',
          ),
        ])
      : panel(
          doc,
          {
            title: 'To Do',
            icon: 'check',
            className: 'bs-todo',
            subtitle: `${tasks.length} ${tasks.length === 1 ? 'item' : 'items'}`,
          },
          renderTodoBody(doc, tasks, { now, degraded: data.degraded }),
        );

  const side: Array<Node | null> = [];
  if (data.state.settings.showAnnouncements) {
    side.push(renderAnnouncements(doc, data.announcements, data.state));
  }
  if (data.events.length > 0) {
    side.push(renderEvents(doc, data.events, now));
  }

  return e('div', {
    className: 'bs-home__lower',
    children: [
      e('div', { className: 'bs-home__lower-main', children: [todoPanel] }),
      side.length > 0 ? e('div', { className: 'bs-home__lower-side', children: side }) : null,
    ],
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
