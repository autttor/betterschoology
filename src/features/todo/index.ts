import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import { SGY, markEnhanced, queryFirst } from '@/src/schoology/selectors';
import { isHomeRoute } from '@/src/schoology/router';
import { findOwned, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { log } from '@/src/utils/log';
import { loadTasks, resetTaskStore, withCourseIdentity } from './store';
import { renderTodoPanel } from './render';

/**
 * Better To Do, mounted in Schoology's right rail.
 *
 * This is the *Feed view* home for Better To Do. When the dashboard is showing
 * it owns To Do placement instead (the rail is hidden there), so the two never
 * render the same list twice.
 *
 * The native To Do panel is never hidden, moved or replaced by this feature --
 * a working native list beats a Better Schoology error box, so it only ever
 * *adds* a panel above it.
 */
const FEATURE_ID = 'better-todo';
const COMPONENT_NAME = 'better-todo';

export { resetTaskStore, loadTasks, withCourseIdentity } from './store';
export { renderTodoPanel, renderTodoBody, renderTaskRow } from './render';

/** True when the dashboard is going to render To Do itself. */
export function dashboardOwnsTodo(context: EnhancementContext): boolean {
  return (
    context.state.settings.betterDashboard &&
    isHomeRoute(context.route.type) &&
    context.document.documentElement.hasAttribute('data-bs-home-dashboard')
  );
}

export const betterTodoEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: (context) => context.state.settings.betterTodo && isHomeRoute(context.route.type),

  async apply(context: EnhancementContext) {
    const doc = context.document;

    if (dashboardOwnsTodo(context)) {
      // The dashboard is showing and has the list; a second copy in the rail
      // would just be noise.
      removeOwned(doc, COMPONENT_NAME);
      return;
    }

    const rightColumn =
      queryFirst<HTMLElement>(doc, SGY.shell.rightColumnInner) ??
      queryFirst<HTMLElement>(doc, SGY.shell.rightColumn);
    const nativeTodo = queryFirst<HTMLElement>(doc, SGY.home.todo);

    // No right rail means this is not a Home layout we recognize. Fail open.
    if (!rightColumn) return;

    const result = await loadTasks(context);
    if (!result) {
      log.info('better to do: no task source available, leaving native panel alone');
      return;
    }

    const tasks = withCourseIdentity(context, result.tasks);
    const root =
      findOwned(doc, COMPONENT_NAME) ??
      ownedRoot(doc, 'div', COMPONENT_NAME, { className: 'better-schoology bs-rail' });

    replaceChildren(root, [
      renderTodoPanel(doc, tasks, { degraded: result.degraded, maxPerGroup: 8 }),
    ]);

    if (root.isConnected) return;

    // Above the native panel, which stays exactly where Schoology put it.
    if (nativeTodo && nativeTodo.parentElement === rightColumn) {
      rightColumn.insertBefore(root, nativeTodo);
    } else {
      rightColumn.insertBefore(root, rightColumn.firstChild);
    }
    markEnhanced(rightColumn, FEATURE_ID);
  },

  revert(context: EnhancementContext) {
    removeOwned(context.document, COMPONENT_NAME);
    resetTaskStore();
  },
};
