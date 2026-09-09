import type { EnhancementContext } from '@/src/schoology/lifecycle';
import type { SchoologyTask } from '@/src/types';
import { dedupeTasks, parseTodoPanel, parseUpcomingEvents } from '@/src/schoology/adapters/todo';
import { fetchTasks } from '@/src/schoology/endpoints/home';
import { findCourseIdByName } from '@/src/storage/courses';
import { log } from '@/src/utils/log';

/**
 * The single source of To Do data for the whole extension.
 *
 * Both Better To Do and the dashboard read from here, so the fragment
 * endpoints are called once per page load rather than once per consumer, and
 * both surfaces always agree about what is due.
 *
 * Read order:
 *   1. the documented same-origin fragment endpoints, parsed in an isolated
 *      document (gives the complete set -- the native panel caps its own
 *      rendering at 7 upcoming and 3 overdue rows);
 *   2. the native `#todo` panel already on the page.
 *
 * If both fail the result is `null`, which every caller treats as "leave the
 * native panel alone" rather than "render an empty list".
 */
export interface TaskLoadResult {
  tasks: SchoologyTask[];
  /** Calendar events from `#upcoming-events`. Information, not action items. */
  events: SchoologyTask[];
  /** True when one of the two reads failed and the list may be incomplete. */
  degraded: boolean;
  source: 'endpoint' | 'dom';
}

let cached: TaskLoadResult | null = null;
let fetchInFlight = false;

export function resetTaskStore(): void {
  cached = null;
  fetchInFlight = false;
}

/** Test seam: lets a test provide a task set without a fetch or a DOM. */
export function primeTaskStore(result: TaskLoadResult | null): void {
  cached = result;
}

export async function loadTasks(context: EnhancementContext): Promise<TaskLoadResult | null> {
  const events = parseUpcomingEvents(context.document);
  if (cached) return { ...cached, events };

  const domTasks = parseTodoPanel(context.document);

  if (!fetchInFlight) {
    fetchInFlight = true;
    void fetchTasks({ origin: context.document.location?.origin ?? '' })
      .then((result) => {
        // Only trust the endpoint result if it actually produced rows; an empty
        // 200 on a page whose DOM has tasks means our parse is the better source.
        if (result && result.tasks.length > 0) {
          cached = {
            tasks: dedupeTasks(result.tasks),
            events: [],
            degraded: result.degraded,
            source: 'endpoint',
          };
          context.requestPass();
        }
      })
      .catch((error) => log.warn('to do fetch failed:', error))
      .finally(() => {
        fetchInFlight = false;
      });
  }

  if (domTasks.length > 0) {
    return { tasks: dedupeTasks(domTasks), events, degraded: false, source: 'dom' };
  }
  return null;
}

/**
 * Attaches course IDs to tasks where possible, and applies custom course names.
 *
 * To Do rows link to the assignment, not the course, so this matches on the
 * course *name* against the locally discovered registry. It is a display-only
 * convenience -- an ambiguous name resolves to nothing, and no customization is
 * ever written from it.
 */
export function withCourseIdentity(
  context: EnhancementContext,
  tasks: SchoologyTask[],
): SchoologyTask[] {
  return tasks.map((task) => {
    const courseId = task.courseId ?? findCourseIdByName(context.state, task.courseName);
    const customization = courseId ? context.state.customizations[courseId] : undefined;
    const displayName = customization?.shortName?.trim() || customization?.customName?.trim();

    return {
      ...task,
      ...(courseId ? { courseId } : {}),
      ...(displayName ? { courseName: displayName } : {}),
    };
  });
}
