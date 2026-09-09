import type { ResolvedCourse, SchoologyTask } from '@/src/types';
import { binder, icon } from '@/src/components/dom';
import { ICONS } from '@/src/components/icons';
import { pill } from '@/src/components/ui';
import { formatDueLabel } from '@/src/utils/date';
import { decorativeCourseAccent, safeImageUrl } from '@/src/utils/url';

/**
 * A course card.
 *
 * Everything a card shows comes from a resolved course (student overrides over
 * Schoology's own values) plus data that was actually parsed from the page.
 * Nothing is invented: a course with no grade shows no grade line, and a course
 * with no upcoming work shows no task list rather than an encouraging blank.
 *
 * Every link is Schoology's own route, built from the course ID -- a renamed
 * course still navigates to the real course.
 */
export interface CourseCardData {
  course: ResolvedCourse;
  /** Upcoming and overdue work matched to this course, already sorted. */
  tasks?: SchoologyTask[];
  /** Current course grade, when a grade surface has actually been parsed. */
  grade?: { percentage?: number; letter?: string };
  /** How many task rows to show. */
  taskLimit?: number;
  now?: Date;
}

const QUICK_LINKS: Array<{ label: string; path: string }> = [
  { label: 'Materials', path: 'materials' },
  { label: 'Updates', path: 'updates' },
  { label: 'Grades', path: 'student_grades' },
];

export function renderCourseCard(doc: Document, data: CourseCardData): HTMLElement {
  const e = binder(doc);
  const { course } = data;
  const now = data.now ?? new Date();
  const tasks = data.tasks ?? [];
  const overdue = tasks.filter((task) => task.status === 'overdue');
  const upcoming = tasks.slice(0, data.taskLimit ?? 3);

  const card = e('li', {
    className: 'bs-course-card',
    attrs: { 'data-bs-course-id': course.id },
  });

  for (const [property, value] of [
    // A student accent wins; otherwise a stable decorative hue keeps a grid of
    // cards distinguishable instead of a wall of identical blue.
    ['--bs-course-accent', course.accentColor ?? decorativeCourseAccent(course.id)],
    ['--bs-course-bg', course.backgroundColor],
    ['--bs-course-text', course.textColor],
    ['--bs-course-muted', course.mutedTextColor],
  ] as const) {
    if (value) card.style.setProperty(property, value);
  }

  // Student-supplied image URLs are validated before use and rendered only as
  // a background image -- never injected as markup.
  const imageUrl = safeImageUrl(course.displayImageUrl);
  if (imageUrl) {
    const image = e('a', {
      className: 'bs-course-card__image',
      attrs: { href: course.href, tabindex: '-1', 'aria-hidden': 'true' },
    });
    image.style.backgroundImage = `url("${encodeURI(imageUrl)}")`;
    card.appendChild(image);
  }

  const badges: Array<Node | null> = [];
  if (overdue.length > 0) {
    badges.push(pill(doc, `${overdue.length} overdue`, 'danger'));
  }
  if (data.grade?.percentage !== undefined) {
    badges.push(
      e('span', {
        className: 'bs-course-card__grade',
        children: [
          e('span', {
            className: 'bs-course-card__grade-value',
            text: `${formatPercentage(data.grade.percentage)}%`,
          }),
          data.grade.letter
            ? e('span', { className: 'bs-course-card__grade-letter', text: data.grade.letter })
            : null,
        ],
      }),
    );
  }

  card.appendChild(
    e('div', {
      className: 'bs-course-card__head',
      children: [
        e('div', {
          className: 'bs-course-card__identity',
          children: [
            e('h3', {
              className: 'bs-course-card__name',
              children: [
                e('a', { text: course.displayShortName, attrs: { href: course.href } }),
              ],
            }),
            // The original Schoology name stays visible whenever a rename hides
            // it, so a student can always tell which course a card really is.
            subtitleFor(course)
              ? e('p', { className: 'bs-course-card__subtitle', text: subtitleFor(course)! })
              : null,
          ],
        }),
        badges.length > 0 ? e('div', { className: 'bs-course-card__badges', children: badges }) : null,
      ],
    }),
  );

  if (upcoming.length > 0) {
    card.appendChild(
      e('ul', {
        className: 'bs-course-card__tasks',
        children: upcoming.map((task) =>
          e('li', {
            className: `bs-course-card__task${task.status === 'overdue' ? ' is-overdue' : ''}`,
            children: [
              task.href
                ? e('a', { text: task.title, attrs: { href: task.href } })
                : e('span', { text: task.title }),
              e('span', {
                className: 'bs-course-card__task-due',
                text: formatDueLabel(task.dueAt, now),
              }),
            ],
          }),
        ),
      }),
    );
  }

  card.appendChild(
    e('nav', {
      className: 'bs-course-card__links',
      attrs: { 'aria-label': `${course.displayShortName} quick links` },
      children: QUICK_LINKS.map((link) =>
        e('a', {
          className: 'bs-course-card__link',
          text: link.label,
          attrs: { href: `/course/${course.id}/${link.path}` },
        }),
      ),
    }),
  );

  if (course.pinned) {
    card.classList.add('bs-course-card--pinned');
    card.appendChild(
      e('span', {
        className: 'bs-course-card__pin',
        attrs: { title: 'Pinned', 'aria-label': 'Pinned course' },
        children: [icon(doc, ICONS.star, 'bs-icon bs-icon--sm')],
      }),
    );
  }

  return card;
}

/**
 * The line under the card's name.
 *
 * When the course has been renamed this is Schoology's own name (so the card
 * stays identifiable); otherwise it is the section, which is what Schoology
 * itself shows next to a course name.
 */
function subtitleFor(course: ResolvedCourse): string | undefined {
  const renamed = course.displayShortName !== course.originalName;
  if (renamed && course.originalName) {
    return course.sectionName
      ? `${course.originalName}: ${course.sectionName}`
      : course.originalName;
  }
  return course.sectionName;
}

/** One decimal place, and no trailing `.0`. */
export function formatPercentage(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
