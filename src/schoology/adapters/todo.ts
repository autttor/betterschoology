import type { SchoologyTask, TaskSource, TaskStatus } from '@/src/types';
import { SGY, queryAll, queryFirst } from '../selectors';
import { textWithoutHiddenNodes } from './course';

/**
 * To Do parsing.
 *
 * Native Schoology renders every row it fetched but then *hides* most of them:
 * `s_event_upcoming_home` shows at most 7 upcoming events grouped by day and 3
 * overdue ones inline. Parsing the DOM rather than reading the visible list
 * therefore gives Better Schoology strictly more than the native panel shows.
 *
 * Row shape (observed):
 *   .upcoming-event[data-start][data-locked][data-exception]
 *     .upcoming-item-content
 *       span.<type>-icon.submission-event-icon
 *       .event-title
 *         a[href="/assignment/<id>"]
 *         span > .event-subtitle (due text), .event-subtitle (course), tooltip
 *     .submission-infotip
 */

/** `data-exception="3"` is treated as "missing" by the native module. */
const EXCEPTION_MISSING = '3';

const ASSIGNMENT_HREF_RE = /\/assignment\/(\d+)/;

/**
 * Maps Schoology's icon class to a normalized task source.
 *
 * Observed on captured To Do rows: `grade-item-icon`, `common-assessment-icon`,
 * `external-tool-icon`. Discussion and event icons are documented material
 * types but were not present in the capture, so they are mapped defensively
 * rather than assumed.
 */
function sourceFromIcon(row: Element): TaskSource {
  const icon = row.querySelector('[class*="-icon"]');
  const className = icon?.getAttribute('class') ?? '';

  if (className.includes('grade-item-icon')) return 'assignment';
  if (className.includes('assessment-icon')) return 'assessment';
  if (className.includes('discussion-icon')) return 'discussion';
  if (className.includes('event-icon') && !className.includes('submission-event-icon')) {
    return 'event';
  }
  return 'unknown';
}

/** Reads the course identity Schoology renders inside the row's tooltip. */
function courseFromTooltip(row: Element): { courseName?: string; schoolName?: string } {
  const realm = queryFirst(row, SGY.home.realmTitleCourse);
  if (!realm) return {};

  const building = queryFirst(realm, SGY.home.realmBuilding);
  const schoolName = building ? textWithoutHiddenNodes(building) : '';

  const titles = queryFirst(realm, SGY.home.realmMainTitles);
  let courseTitle = '';
  if (titles) {
    // The building name is nested inside `.realm-main-titles`; remove it before
    // reading the course line, or the two run together.
    const clone = titles.cloneNode(true) as Element;
    for (const nested of Array.from(clone.querySelectorAll('.realm-title-building'))) {
      nested.remove();
    }
    courseTitle = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  // The tooltip renders `Name : Section`; the second `.event-subtitle` already
  // carries the plain name, so only fall back to trimming here.
  const courseName = courseTitle.replace(/\s*:\s*[^:]*$/, '').trim() || courseTitle;

  return {
    ...(courseName ? { courseName } : {}),
    ...(schoolName ? { schoolName } : {}),
  };
}

/** Parses one `.upcoming-event` row into a normalized task. */
export function parseTaskRow(row: Element, status: TaskStatus): SchoologyTask | null {
  const link = queryFirst<HTMLAnchorElement>(row, SGY.home.eventLink);
  const titleEl = queryFirst(row, SGY.home.readonlyEventTitle) ?? queryFirst(row, SGY.home.eventTitle);

  // Without a title there is nothing worth showing; skip rather than invent one.
  const title = link ? textWithoutHiddenNodes(link) : titleEl ? textWithoutHiddenNodes(titleEl) : '';
  if (!title) return null;

  const href = link?.getAttribute('href') ?? undefined;
  const id = href?.match(ASSIGNMENT_HREF_RE)?.[1];

  const subtitles = queryAll(row, SGY.home.eventSubtitle).map((el) => textWithoutHiddenNodes(el));
  // Observed order: [due text, course short title].
  const courseFromSubtitle = subtitles.length > 1 ? subtitles[subtitles.length - 1] : undefined;
  const tooltip = courseFromTooltip(row);

  const startSeconds = Number(row.getAttribute('data-start') ?? '');
  const dueAt = Number.isFinite(startSeconds) && startSeconds > 0
    ? new Date(startSeconds * 1000)
    : undefined;

  const exception = row.getAttribute('data-exception') ?? '';
  const resolvedStatus: TaskStatus = exception === EXCEPTION_MISSING ? 'overdue' : status;

  const courseName = courseFromSubtitle || tooltip.courseName;

  return {
    ...(id ? { id } : {}),
    title,
    ...(href ? { href } : {}),
    ...(courseName ? { courseName } : {}),
    ...(dueAt ? { dueAt } : {}),
    status: resolvedStatus,
    source: sourceFromIcon(row),
  };
}

/** Parses every row inside a wrapper, tagging them with the wrapper's status. */
export function parseTaskRows(root: ParentNode, status: TaskStatus): SchoologyTask[] {
  const tasks: SchoologyTask[] = [];
  for (const row of queryAll(root, SGY.home.upcomingEvent)) {
    const task = parseTaskRow(row, status);
    if (task) tasks.push(task);
  }
  return tasks;
}

/**
 * Parses the native `#todo` panel.
 *
 * Overdue and upcoming live in separate wrappers, which is the only reliable
 * status signal in the DOM -- the row itself carries a timestamp but not a
 * verdict, and the native client's own comparison is against `Date.now()`.
 */
export function parseTodoPanel(root: ParentNode): SchoologyTask[] {
  const todo = queryFirst(root, SGY.home.todo);
  if (!todo) return [];

  const tasks: SchoologyTask[] = [];

  const overdue = queryFirst(todo, SGY.home.overdueWrapper);
  if (overdue) tasks.push(...parseTaskRows(overdue, 'overdue'));

  const upcoming = queryFirst(todo, SGY.home.upcomingWrapper);
  if (upcoming) tasks.push(...parseTaskRows(upcoming, 'upcoming'));

  return tasks;
}

/** Sorts by due date, undated last, so a merged list reads chronologically. */
export function sortTasksByDue(tasks: SchoologyTask[]): SchoologyTask[] {
  return [...tasks].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });
}
