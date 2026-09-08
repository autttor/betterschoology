import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { SchoologyTask } from '@/src/types';
import { SGY, markEnhanced, queryFirst } from '@/src/schoology/selectors';
import { parseTodoPanel, sortTasksByDue } from '@/src/schoology/adapters/todo';
import { fetchTasks } from '@/src/schoology/endpoints/home';
import { findCourseIdByName } from '@/src/storage/courses';
import { isHomeRoute } from '@/src/schoology/router';
import { el, findOwned, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { log } from '@/src/utils/log';

/**
 * Better To Do.
 *
 * Reads more than the native panel shows: `s_event_upcoming_home` caps the
 * visible list at 7 upcoming and 3 overdue rows, but every fetched row is in
 * the DOM. Two read paths, in order:
 *
 *   1. the documented same-origin fragment endpoints, parsed in an isolated
 *      document (gives the complete set even before Schoology renders it);
 *   2. the native `#todo` panel already on the page.
 *
 * If both fail, nothing is inserted. The native To Do panel is never hidden,
 * moved or replaced -- a working native list beats a Better Schoology error
 * box, so this feature only ever *adds* a panel above it.
 */
const FEATURE_ID = 'better-todo';
const COMPONENT_NAME = 'better-todo';

/** Cache per page load, so re-running a pass does not refetch on every mutation. */
let cachedTasks: SchoologyTask[] | null = null;
let fetchInFlight = false;

export function resetTodoCache(): void {
  cachedTasks = null;
  fetchInFlight = false;
}

function formatDue(task: SchoologyTask, now: Date): string {
  if (!task.dueAt) return 'No due date';

  const due = task.dueAt;
  const sameDay =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate();

  const time = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Due today, ${time}`;

  const date = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `Due ${date}, ${time}`;
}

function renderTask(doc: Document, task: SchoologyTask, now: Date): HTMLElement {
  const status = task.status === 'overdue' ? 'overdue' : 'upcoming';

  const titleNode = task.href
    ? el(doc, 'a', {
        text: task.title,
        // The href is Schoology's own, carried through untouched.
        attrs: { href: task.href },
      })
    : el(doc, 'span', { text: task.title });

  const metaParts = [formatDue(task, now), task.courseName].filter(Boolean) as string[];

  return el(doc, 'li', {
    className: 'better-schoology-task',
    children: [
      el(doc, 'span', {
        className: `better-schoology-task__status better-schoology-task__status--${status}`,
        text: status === 'overdue' ? 'Late' : 'Due',
      }),
      el(doc, 'div', {
        className: 'better-schoology-task__body',
        children: [
          el(doc, 'div', { className: 'better-schoology-task__title', children: [titleNode] }),
          el(doc, 'div', { className: 'better-schoology-task__meta', text: metaParts.join(' · ') }),
        ],
      }),
    ],
  });
}

/** Builds (or refreshes) the Better To Do panel. */
export function renderTodoPanel(
  doc: Document,
  tasks: SchoologyTask[],
  options: { degraded?: boolean; now?: Date } = {},
): HTMLElement {
  const now = options.now ?? new Date();
  const existing = findOwned(doc, COMPONENT_NAME);
  const root =
    existing ??
    ownedRoot(doc, 'section', COMPONENT_NAME, {
      className: 'better-schoology-panel better-schoology-todo',
      attrs: { 'aria-label': 'Better To Do' },
    });

  const sorted = sortTasksByDue(tasks);
  const overdueCount = sorted.filter((task) => task.status === 'overdue').length;

  const header = el(doc, 'div', {
    className: 'better-schoology-panel__header',
    children: [
      el(doc, 'h2', { className: 'better-schoology-panel__title', text: 'Better To Do' }),
      el(doc, 'p', {
        className: 'better-schoology-panel__note',
        text: overdueCount > 0 ? `${overdueCount} overdue` : `${sorted.length} items`,
      }),
    ],
  });

  const body =
    sorted.length > 0
      ? el(doc, 'ul', {
          className: 'better-schoology-task-list',
          children: sorted.map((task) => renderTask(doc, task, now)),
        })
      : el(doc, 'p', { className: 'better-schoology-empty', text: 'Nothing due right now.' });

  const children: Array<Node | null> = [header, body];

  if (options.degraded) {
    children.push(
      el(doc, 'p', {
        className: 'better-schoology-panel__note',
        text: 'Some items could not be loaded. Schoology’s own To Do is below.',
      }),
    );
  }

  replaceChildren(root, children);
  return root;
}

/**
 * Loads tasks, preferring the fragment endpoints and falling back to the DOM.
 *
 * Returns null when neither path yields anything, which the caller treats as
 * "leave the page alone".
 */
async function loadTasks(
  context: EnhancementContext,
): Promise<{ tasks: SchoologyTask[]; degraded: boolean } | null> {
  if (cachedTasks) return { tasks: cachedTasks, degraded: false };

  const domTasks = parseTodoPanel(context.document);

  if (!fetchInFlight) {
    fetchInFlight = true;
    void fetchTasks({ origin: context.document.location?.origin ?? '' })
      .then((result) => {
        // Only trust the endpoint result if it actually produced rows; an empty
        // 200 on a page whose DOM has tasks means our parse is the better source.
        if (result && result.tasks.length > 0) {
          cachedTasks = result.tasks;
          context.requestPass();
        }
      })
      .catch((error) => log.warn('to do fetch failed:', error))
      .finally(() => {
        fetchInFlight = false;
      });
  }

  if (domTasks.length > 0) return { tasks: domTasks, degraded: false };
  return null;
}

/**
 * Attaches course IDs to tasks where possible.
 *
 * To Do rows link to the assignment, not the course, so this matches on the
 * course *name* against the locally discovered registry. It is a display-only
 * convenience -- an ambiguous name resolves to nothing, and no customization is
 * ever written from it.
 */
function attachCourseIds(context: EnhancementContext, tasks: SchoologyTask[]): SchoologyTask[] {
  return tasks.map((task) => {
    const courseId = findCourseIdByName(context.state, task.courseName);
    const customName = courseId ? context.state.customizations[courseId]?.customName : undefined;
    return {
      ...task,
      ...(courseId ? { courseId } : {}),
      ...(customName ? { courseName: customName } : {}),
    };
  });
}

export const betterTodoEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: (context) =>
    context.state.settings.betterTodo && isHomeRoute(context.route.type),

  async apply(context: EnhancementContext) {
    const rightColumn = queryFirst<HTMLElement>(context.document, SGY.shell.rightColumnInner)
      ?? queryFirst<HTMLElement>(context.document, SGY.shell.rightColumn);
    const nativeTodo = queryFirst<HTMLElement>(context.document, SGY.home.todo);

    // No right rail means this is not a Home layout we recognize. Fail open.
    if (!rightColumn) return;

    const result = await loadTasks(context);
    if (!result) {
      log.info('better to do: no task source available, leaving native panel alone');
      return;
    }

    const panel = renderTodoPanel(context.document, attachCourseIds(context, result.tasks), {
      degraded: result.degraded,
    });

    if (!panel.isConnected) {
      // Above the native panel, which stays exactly where Schoology put it.
      if (nativeTodo && nativeTodo.parentElement === rightColumn) {
        rightColumn.insertBefore(panel, nativeTodo);
      } else {
        rightColumn.insertBefore(panel, rightColumn.firstChild);
      }
      markEnhanced(rightColumn, FEATURE_ID);
    }
  },

  revert(context: EnhancementContext) {
    removeOwned(context.document, COMPONENT_NAME);
    resetTodoCache();
  },
};
