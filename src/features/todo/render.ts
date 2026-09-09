import type { SchoologyTask } from '@/src/types';
import { binder, button, icon } from '@/src/components/dom';
import { ICONS } from '@/src/components/icons';
import { emptyState, note, panel, pill } from '@/src/components/ui';
import { BUCKET_LABELS, formatDueLabel, type TaskBucket } from '@/src/utils/date';
import { groupTasks } from '@/src/schoology/adapters/todo';
import { taskKey } from './visibility';

/**
 * Better To Do rendering.
 *
 * Tasks are *action items*: title, course, when it is due, and nothing else.
 * Announcements and calendar events are rendered elsewhere on purpose -- mixing
 * "read this" into "do this" is exactly what makes the native home page hard to
 * act on.
 *
 * Every task title is a link carrying Schoology's own href, untouched.
 */

const BUCKET_TONE: Record<TaskBucket, 'danger' | 'warning' | 'accent' | 'neutral'> = {
  overdue: 'danger',
  today: 'warning',
  tomorrow: 'accent',
  week: 'neutral',
  later: 'neutral',
  undated: 'neutral',
};

export interface TodoRenderOptions {
  now?: Date;
  degraded?: boolean;
  /**
   * Hides a row from Better To Do only. Offered exclusively for tasks with a
   * stable identity -- hiding by title would hide every assignment that shares
   * one, in every course.
   */
  onHide?: (task: SchoologyTask) => void;
  /** Caps each group; the rest stay one click away in Schoology's own list. */
  maxPerGroup?: number;
  /** Shown under the title, e.g. "12 items". */
  subtitle?: string;
  headingLevel?: 'h2' | 'h3';
}

export function renderTaskRow(
  doc: Document,
  task: SchoologyTask,
  now: Date,
  bucket?: TaskBucket,
  onHide?: (task: SchoologyTask) => void,
): HTMLElement {
  const e = binder(doc);
  // A row reads as late when Schoology says so *or* when it landed in the
  // overdue bucket because its due date has passed. Otherwise the group
  // heading and the row would tell the student two different things.
  const overdue = task.status === 'overdue' || bucket === 'overdue';

  const title = task.href
    ? e('a', {
        className: 'bs-task__title',
        text: task.title,
        // Schoology's own href, carried through untouched.
        attrs: { href: task.href },
      })
    : e('span', { className: 'bs-task__title', text: task.title });

  const meta: Array<Node | null> = [];
  if (task.courseName) {
    meta.push(e('span', { className: 'bs-task__course', text: task.courseName }));
  }
  meta.push(
    e('span', {
      className: 'bs-task__due',
      children: [
        icon(doc, overdue ? ICONS.alert : ICONS.clock, 'bs-icon bs-icon--sm'),
        e('span', { text: formatDueLabel(task.dueAt, now) }),
      ],
    }),
  );
  // The type is only worth showing when it is not the default "an assignment".
  if (task.source === 'assessment') meta.push(pill(doc, 'Test', 'neutral'));
  if (task.source === 'discussion') meta.push(pill(doc, 'Discussion', 'neutral'));

  // Only a task Schoology gave a stable identity can be hidden: a title is not
  // an identity, and hiding by one would hide its namesakes everywhere.
  const hideable = onHide && taskKey(task) !== undefined;

  return e('li', {
    className: `bs-task${overdue ? ' bs-task--overdue' : ''}`,
    ...(task.courseId ? { attrs: { 'data-bs-course-id': task.courseId } } : {}),
    children: [
      e('span', { className: 'bs-task__rail', attrs: { 'aria-hidden': 'true' } }),
      e('div', {
        className: 'bs-task__body',
        children: [title, e('div', { className: 'bs-task__meta', children: meta })],
      }),
      hideable
        ? button(doc, {
            className: 'bs-task__hide',
            text: '×',
            attrs: { 'aria-label': `Hide ${task.title} from Better To Do`, title: 'Hide from Better To Do' },
            onClick: () => onHide?.(task),
          })
        : null,
    ],
  });
}

/** One bucket: a heading, a count, and its rows. */
export function renderTaskGroup(
  doc: Document,
  bucket: TaskBucket,
  tasks: SchoologyTask[],
  options: TodoRenderOptions,
): HTMLElement {
  const e = binder(doc);
  const now = options.now ?? new Date();
  const max = options.maxPerGroup ?? tasks.length;
  const shown = tasks.slice(0, max);
  const hidden = tasks.length - shown.length;

  return e('section', {
    className: `bs-task-group bs-task-group--${bucket}`,
    children: [
      e('div', {
        className: 'bs-task-group__head',
        children: [
          e('h4', { className: 'bs-task-group__title', text: BUCKET_LABELS[bucket] }),
          pill(doc, String(tasks.length), BUCKET_TONE[bucket]),
        ],
      }),
      e('ul', {
        className: 'bs-task-list',
        children: shown.map((task) => renderTaskRow(doc, task, now, bucket, options.onHide)),
      }),
      hidden > 0
        ? note(doc, `${hidden} more in this group`, 'bs-task-group__more')
        : null,
    ],
  });
}

/**
 * The Better To Do panel body: every bucket that has something in it.
 *
 * An empty list is a legitimate, good state ("Nothing due"). It is only ever
 * reached when a task source *was* available -- when none was, the caller
 * leaves Schoology's own panel alone instead of calling this.
 */
export function renderTodoBody(
  doc: Document,
  tasks: SchoologyTask[],
  options: TodoRenderOptions = {},
): HTMLElement[] {
  const e = binder(doc);
  const now = options.now ?? new Date();
  const groups = groupTasks(tasks, now);

  if (groups.length === 0) {
    return [emptyState(doc, 'Nothing due right now.', 'New work appears here as teachers post it.')];
  }

  const children: HTMLElement[] = groups.map((group) =>
    renderTaskGroup(doc, group.bucket, group.tasks, { ...options, now }),
  );

  if (options.degraded) {
    children.push(
      e('p', {
        className: 'bs-note bs-note--warn',
        text: 'Some items could not be loaded. Schoology’s own To Do is still available under Feed.',
      }),
    );
  }

  return children;
}

/** The whole panel, for surfaces that mount To Do on its own. */
export function renderTodoPanel(
  doc: Document,
  tasks: SchoologyTask[],
  options: TodoRenderOptions = {},
): HTMLElement {
  const now = options.now ?? new Date();
  // Counted through the same grouping the body uses, so the subtitle and the
  // "Overdue" heading always agree.
  const overdue =
    groupTasks(tasks, now).find((group) => group.bucket === 'overdue')?.tasks.length ?? 0;

  return panel(
    doc,
    {
      title: 'To Do',
      icon: 'check',
      className: 'bs-todo',
      headingLevel: options.headingLevel ?? 'h2',
      subtitle:
        options.subtitle ??
        (overdue > 0 ? `${overdue} overdue · ${tasks.length} items` : `${tasks.length} items`),
    },
    renderTodoBody(doc, tasks, { ...options, now }),
  );
}
