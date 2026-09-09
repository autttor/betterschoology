/**
 * Date helpers for Better Schoology's own grouping and labelling.
 *
 * All comparisons are done in the *student's* local timezone, because that is
 * the timezone the due date on a Schoology page is rendered in. Nothing here
 * parses Schoology's textual dates -- rows carry `data-start` (Unix seconds),
 * which is unambiguous, and any surface without one is reported as undated
 * rather than guessed at.
 */

/** Buckets Better To Do groups tasks into, in display order. */
export const TASK_BUCKETS = ['overdue', 'today', 'tomorrow', 'week', 'later', 'undated'] as const;

export type TaskBucket = (typeof TASK_BUCKETS)[number];

export const BUCKET_LABELS: Record<TaskBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  undated: 'No due date',
};

export function startOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole days between two calendar days, ignoring the time of day. */
export function daysBetween(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  // Divide before rounding so a DST transition cannot produce 0.958 days.
  return Math.round((b - a) / 86_400_000);
}

/**
 * Chooses the bucket for a due date.
 *
 * `isOverdue` is passed in rather than derived, because Schoology's own DOM is
 * the authority on whether something counts as overdue: an item can be past
 * its due date and still accepted, and the overdue wrapper is what says so.
 */
export function bucketFor(dueAt: Date | undefined, now: Date, isOverdue: boolean): TaskBucket {
  if (isOverdue) return 'overdue';
  if (!dueAt) return 'undated';

  const days = daysBetween(now, dueAt);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'week';
  return 'later';
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatWeekday(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long' });
}

/**
 * Short, human due label for a task row.
 *
 * Deliberately relative near the present ("Today, 11:59 PM") and absolute
 * further out, which is how a student reads a to-do list.
 */
export function formatDueLabel(dueAt: Date | undefined, now: Date): string {
  if (!dueAt) return 'No due date';

  const days = daysBetween(now, dueAt);
  const time = formatTime(dueAt);

  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days <= 6) return `${formatWeekday(dueAt)}, ${time}`;
  return `${formatShortDate(dueAt)}, ${time}`;
}

/** "Good morning" / "Good afternoon" / "Good evening". */
export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
