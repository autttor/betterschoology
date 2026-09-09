import type { BetterSchoologyState } from '@/src/types/settings';
import type { CourseGrade } from '@/src/grades';
import { calculateGpa, formatPercent, letterFor, type GpaCourseInput } from '@/src/grades';
import { binder, button, icon } from '@/src/components/dom';
import { ICONS } from '@/src/components/icons';
import { note, panel, pill } from '@/src/components/ui';
import { roundTo } from '@/src/grades/rounding';

/**
 * The GPA widget.
 *
 * Two disclosures are non-negotiable and appear wherever this renders:
 * Better Schoology calculated it, and it is not an official GPA. Schoology
 * publishes no GPA, no grading scale and no course credits; every input here is
 * the student's own, stored locally, and a number presented without that
 * context would be actively misleading.
 */
export interface GpaWidgetData {
  courses: GpaCourseInput[];
  state: BetterSchoologyState;
}

/** The compact dashboard tile. */
export function renderGpaTile(
  doc: Document,
  data: GpaWidgetData,
  onOpen?: () => void,
): HTMLElement | null {
  const e = binder(doc);
  const result = calculateGpa(data.courses, data.state.gpa);

  if (result.gpa === undefined) {
    return e('div', {
      className: 'bs-stat bs-stat--gpa',
      children: [
        icon(doc, ICONS.chart, 'bs-icon bs-stat__icon'),
        e('div', {
          className: 'bs-stat__text',
          children: [
            e('span', { className: 'bs-stat__value', text: '—' }),
            e('span', { className: 'bs-stat__label', text: 'GPA' }),
            e('span', {
              className: 'bs-stat__hint',
              text: 'Open your Grades page once',
            }),
          ],
        }),
      ],
    });
  }

  const tile = e('div', {
    className: 'bs-stat bs-stat--gpa',
    attrs: {
      title:
        'Calculated by Better Schoology from the grades it can see, using your own grading scale and credits. This is not an official GPA.',
    },
    children: [
      icon(doc, ICONS.chart, 'bs-icon bs-stat__icon'),
      e('div', {
        className: 'bs-stat__text',
        children: [
          e('span', { className: 'bs-stat__value', text: result.gpa.toFixed(2) }),
          e('span', { className: 'bs-stat__label', text: 'GPA (yours)' }),
          e('span', {
            className: 'bs-stat__hint',
            text: `${result.countedCourses} ${result.countedCourses === 1 ? 'course' : 'courses'} · not official`,
          }),
        ],
      }),
    ],
  });

  if (onOpen) {
    tile.appendChild(
      button(doc, {
        className: 'bs-btn bs-btn--quiet bs-stat__action',
        text: 'GPA calculator',
        onClick: onOpen,
      }),
    );
  }

  return tile;
}

/** The full panel, shown on the global grades page. */
export function renderGpaPanel(doc: Document, data: GpaWidgetData): HTMLElement {
  const e = binder(doc);
  const result = calculateGpa(data.courses, data.state.gpa);

  // Courses that count come first; the rest are summarized in one line rather
  // than filling the panel with rows of dashes.
  const counted = result.courses.filter((course) => course.included);
  const uncounted = result.courses.filter((course) => !course.included);

  const rows = counted.map((course) =>
    e('li', {
      className: 'bs-gpa-row',
      children: [
        e('span', { className: 'bs-gpa-row__name', text: course.courseName }),
        e('span', {
          className: 'bs-gpa-row__grade',
          text: course.percentage === undefined ? '—' : `${formatPercent(course.percentage)}%`,
        }),
        e('span', { className: 'bs-gpa-row__letter', text: course.letter ?? '—' }),
        e('span', {
          className: 'bs-gpa-row__points',
          text: course.points === undefined ? '—' : roundTo(course.points, 2).toFixed(2),
        }),
        e('span', {
          className: 'bs-gpa-row__credits',
          text: `${course.credits} cr`,
        }),
      ],
    }),
  );

  return panel(
    doc,
    {
      title: 'GPA',
      icon: 'chart',
      className: 'bs-gpa',
      actions: [pill(doc, 'Calculated by Better Schoology', 'warning')],
    },
    [
      e('div', {
        className: 'bs-gpa__headline',
        children: [
          e('span', {
            className: 'bs-gpa__value',
            text: result.gpa === undefined ? '—' : result.gpa.toFixed(2),
          }),
          e('div', {
            className: 'bs-gpa__facts',
            children: [
              e('p', {
                className: 'bs-gpa__count',
                text:
                  result.gpa === undefined
                    ? 'No countable course grades yet'
                    : `${result.countedCourses} courses · ${result.totalCredits} credits`,
              }),
              result.unweightedGpa !== undefined && result.unweightedGpa !== result.gpa
                ? e('p', {
                    className: 'bs-note',
                    text: `Without your honors/AP boosts: ${result.unweightedGpa.toFixed(2)}`,
                  })
                : null,
            ],
          }),
        ],
      }),
      rows.length > 0 ? e('ul', { className: 'bs-gpa-rows', children: rows }) : null,
      uncounted.length > 0
        ? note(
            doc,
            `${uncounted.length} ${uncounted.length === 1 ? 'course is' : 'courses are'} not counted — no grade yet, or excluded in your settings.`,
          )
        : null,
      note(
        doc,
        'This is not an official GPA. Schoology publishes no GPA, no grading scale and no course credits — the scale, the credits and any honors/AP boost are yours, set in Better Schoology’s settings and stored on this device.',
      ),
    ],
  );
}

/** Course percentages ready for the GPA calculator. */
export function gpaInputsFrom(
  grades: CourseGrade[],
  state: BetterSchoologyState,
  computed: Map<string, number | undefined>,
): GpaCourseInput[] {
  return grades.map((course) => {
    const customization = state.customizations[course.courseId];
    const stored = state.courses[course.courseId];
    const percentage = course.currentPercentage ?? computed.get(course.courseId);

    return {
      courseId: course.courseId,
      courseName:
        customization?.shortName?.trim() ||
        customization?.customName?.trim() ||
        course.courseName ||
        stored?.originalName ||
        `Course ${course.courseId}`,
      ...(percentage !== undefined ? { percentage } : {}),
    };
  });
}

/** The letter Better Schoology would give a percentage, on the student's scale. */
export function letterOnScale(
  percentage: number | undefined,
  state: BetterSchoologyState,
): string | undefined {
  return letterFor(percentage, state.gpa.scale);
}
