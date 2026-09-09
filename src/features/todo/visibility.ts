import type { SchoologyTask } from '@/src/types';
import type { BetterSchoologyState } from '@/src/types/settings';
import { findCourseIdByName } from '@/src/storage/courses';

/** Prefer native IDs; otherwise a native route is stable across title changes. */
export function taskKey(task: SchoologyTask): string | undefined {
  if (task.id) return `${task.href?.includes('/assignment/') ? 'assignment' : task.source}:${task.id}`;
  if (!task.href) {
    // Some observed read-only external-tool rows expose neither ID nor link.
    // A course + exact due timestamp + title composite is the strongest identity
    // available there. Never hide all tasks sharing a title across courses/dates.
    if (!task.dueAt || !Number.isFinite(task.dueAt.getTime()) || !(task.courseId || task.courseName)) return undefined;
    const identity = JSON.stringify([task.source, task.courseId || task.courseName, task.dueAt.toISOString(), task.title]);
    let hash = 0xcbf29ce484222325n;
    for (const char of identity) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 0x100000001b3n);
    return `readonly:${hash.toString(16)}`;
  }
  try {
    const url = new URL(task.href, 'https://schoology.invalid');
    if (!['https:', 'http:'].includes(url.protocol)) return undefined;
    return `href:${url.pathname}${url.search}`;
  } catch { return undefined; }
}

export function visibleTasks(tasks: SchoologyTask[], state: BetterSchoologyState, now = new Date()): SchoologyTask[] {
  const seen = new Set<string>();
  return tasks.flatMap((task) => {
    const key = taskKey(task);
    if (key && (state.hiddenTasks[key] || seen.has(key))) return [];
    if (key) seen.add(key);
    if (task.status === 'completed') return [];
    const courseId = task.courseId ?? findCourseIdByName(state, task.courseName) ?? undefined;
    if (courseId && state.settings.dashboard.hideHiddenCourseTasks && state.customizations[courseId]?.hidden) return [];
    const customName = courseId ? state.customizations[courseId]?.customName : undefined;
    return [{ ...task, courseId, courseName: customName || task.courseName,
      status: task.dueAt && task.dueAt < now ? 'overdue' as const : task.status }];
  });
}
