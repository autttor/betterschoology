import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { SchoologyTask } from '@/src/types';
import { SGY, markEnhanced, queryFirst } from '@/src/schoology/selectors';
import { parseTodoPanel, sortTasksByDue } from '@/src/schoology/adapters/todo';
import { fetchTasks } from '@/src/schoology/endpoints/home';
import { hideTask } from '@/src/storage';
import { taskKey, visibleTasks } from './visibility';
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
interface TaskCache { tasks: SchoologyTask[] | null; started: boolean; degraded: boolean }
let caches = new WeakMap<Document, TaskCache>();

export function resetTodoCache(): void {
  caches = new WeakMap();
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

function renderTask(doc: Document, task: SchoologyTask, now: Date, onHide?: (task: SchoologyTask) => void): HTMLElement {
  const status = task.status === 'overdue' ? 'overdue' : 'upcoming';

  const titleNode = task.href
    ? el(doc, 'a', {
        text: task.title,
        // The href is Schoology's own, carried through untouched.
        attrs: { href: task.href },
      })
    : el(doc, 'span', { text: task.title });

  const metaParts = [formatDue(task, now), task.courseName].filter(Boolean) as string[];

  const actions = onHide && taskKey(task) ? el(doc, 'details', {
    className: 'better-schoology-task__actions',
    children: [el(doc, 'summary', { text: '•••', attrs: { 'aria-label': `Actions for ${task.title}` } })],
  }) : null;
  if (actions) {
    const hide = el(doc, 'button', { text: 'Hide from dashboard', attrs: { type: 'button' } });
    hide.addEventListener('click', () => onHide?.(task));
    actions.appendChild(hide);
  }
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
      actions,
    ],
  });
}

/** Builds (or refreshes) the Better To Do panel. */
export function renderTodoPanel(
  doc: Document,
  tasks: SchoologyTask[],
  options: { degraded?: boolean; now?: Date; onHide?: (task: SchoologyTask) => void } = {},
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
          children: sorted.map((task) => renderTask(doc, task, now, options.onHide)),
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
export function getDashboardTasks(context: EnhancementContext): { tasks: SchoologyTask[]; degraded: boolean } {
  const doc = context.document;
  let cache = caches.get(doc);
  if (!cache) {
    cache = { tasks: null, started: false, degraded: false };
    caches.set(doc, cache);
  }
  const domTasks = parseTodoPanel(doc);
  if (!cache.started) {
    cache.started = true;
    const current = cache;
    const Parser = doc.defaultView?.DOMParser;
    void fetchTasks({ origin: doc.location?.origin ?? '', ...(Parser ? { parser: new Parser() } : {}) })
      .then((result) => {
        // Only trust the endpoint result if it actually produced rows; an empty
        // 200 on a page whose DOM has tasks means our parse is the better source.
        if (result) current.tasks = result.tasks;
        current.degraded = !result || result.degraded;
        context.requestPass();
      })
      .catch((error) => log.warn('to do fetch failed:', error))
  }
  // Merge newly inserted native rows with the once-per-page endpoint result.
  // Deduplication and hiding share one path for dashboard counts and the list.
  return { tasks: visibleTasks([...domTasks, ...(cache.tasks ?? [])], context.state), degraded: cache.degraded };
}

/**
 * Attaches course IDs to tasks where possible.
 *
 * To Do rows link to the assignment, not the course, so this matches on the
 * course *name* against the locally discovered registry. It is a display-only
 * convenience -- an ambiguous name resolves to nothing, and no customization is
 * ever written from it.
 */
export const betterTodoEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: (context) =>
    context.state.settings.betterTodo && isHomeRoute(context.route.type) && (
      context.state.settings.dashboard.showTodo || !context.state.settings.betterDashboard ||
      !!findOwned(context.document, 'better-dashboard')?.classList.contains('better-schoology-dashboard--feed')
    ),

  apply(context: EnhancementContext) {
    const rightColumn = queryFirst<HTMLElement>(context.document, SGY.shell.rightColumnInner)
      ?? queryFirst<HTMLElement>(context.document, SGY.shell.rightColumn);
    const nativeTodo = queryFirst<HTMLElement>(context.document, SGY.home.todo);

    // No right rail means this is not a Home layout we recognize. Fail open.
    if (!rightColumn) return;

    const result = getDashboardTasks(context);

    const existing = findOwned(context.document, COMPONENT_NAME);
    const signature = JSON.stringify([result, context.state.hiddenTasks]);
    const panel = existing?.dataset.renderSignature === signature ? existing : renderTodoPanel(context.document, result.tasks, {
      degraded: result.degraded,
      onHide: (task) => {
        const id = taskKey(task);
        if (!id) return;
        void hideTask({ id, title: task.title, href: task.href }).then(() => context.requestPass())
          .catch((error) => log.warn('could not hide task:', error));
      },
    });
    panel.dataset.renderSignature = signature;
    const dashboardSlot = findOwned(context.document, 'dashboard-todo-slot');
    if (dashboardSlot && !dashboardSlot.closest('.better-schoology-dashboard--feed')) {
      if (panel.parentElement !== dashboardSlot) dashboardSlot.appendChild(panel);
      return;
    }

    if (panel.parentElement !== rightColumn) {
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
  },
};
