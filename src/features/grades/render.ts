import type { ResolvedCourse } from '@/src/types';
import type { GpaConfig } from '@/src/types/settings';
import type { CourseGrade, GradeCategory, GradeItem, GradePeriod } from '@/src/grades';
import {
  allCategories,
  calculateFromCategories,
  currentPercentage,
  formatFraction,
  formatPercent,
  letterFor,
  projectPeriod,
} from '@/src/grades';
import { binder, button, icon } from '@/src/components/dom';
import { ICONS } from '@/src/components/icons';
import { emptyState, note, panel, pill } from '@/src/components/ui';
import type { CourseUiState } from './state';
import { renderCalculator } from './calculator';

/**
 * Better Grades.
 *
 * The summary answers "how am I doing" in one line, the categories make the
 * weighting visible, and the items are the evidence. Everything it shows is
 * either a value Schoology rendered or a number this extension computed from
 * those values -- and the two are always labelled differently, because a
 * student needs to know which is which.
 */
export interface GradesRenderData {
  course: CourseGrade;
  resolved?: ResolvedCourse;
  ui: CourseUiState;
  gpa: GpaConfig;
}

export interface GradesCallbacks {
  onChange(): void;
}

export function renderCourseGrades(
  doc: Document,
  data: GradesRenderData,
  callbacks: GradesCallbacks,
): HTMLElement {
  const e = binder(doc);
  const { course, ui } = data;

  const leaves = usablePeriods(course);
  const period =
    leaves.find((candidate) => candidate.id === ui.periodId) ?? preferredPeriod(leaves);

  const root = e('div', { className: 'better-schoology bs-grades' });

  if (!period) {
    root.appendChild(
      emptyState(
        doc,
        'No grading periods on this page.',
        'Schoology’s own report is below, unchanged.',
      ),
    );
    return root;
  }

  const categories = allCategories(period);
  const result = calculateFromCategories(categories);
  const computed = currentPercentage(result);
  // Schoology's own course-row percentage is authoritative when it renders
  // one; ours is what fills the gap when it does not.
  const headline = course.currentPercentage ?? computed;
  const letter = letterFor(headline, data.gpa.scale);

  root.appendChild(renderSummary(doc, { data, headline, computed, letter, result }, callbacks));

  if (leaves.length > 1) {
    root.appendChild(renderPeriodTabs(doc, leaves, period, ui, callbacks));
  }

  root.appendChild(renderCategories(doc, categories, result, ui, callbacks));

  if (ui.whatIfOpen) root.appendChild(renderWhatIfSummary(doc, period, ui));
  if (ui.calculatorOpen) {
    root.appendChild(renderCalculator(doc, { categories, result, ui }, callbacks));
  }

  return root;
}

interface SummaryInput {
  data: GradesRenderData;
  headline?: number;
  computed?: number;
  letter?: string;
  result: ReturnType<typeof calculateFromCategories>;
}

function renderSummary(
  doc: Document,
  input: SummaryInput,
  callbacks: GradesCallbacks,
): HTMLElement {
  const e = binder(doc);
  const { data, headline, computed, letter, result } = input;
  const { ui } = data;

  const source =
    data.course.currentPercentage !== undefined
      ? 'Shown by Schoology'
      : 'Calculated by Better Schoology from currently visible grades';

  const modelLabel =
    result.model === 'weighted'
      ? `Weighted categories · ${formatPercent(result.countedWeight, 0)}% of the weight has graded work`
      : result.model === 'points'
        ? `Total points · ${formatFraction(result.earned, result.possible)}`
        : 'Not enough graded work to compute a grade';

  return e('div', {
    className: 'bs-grades__summary',
    children: [
      e('div', {
        className: 'bs-grades__headline',
        children: [
          e('div', {
            className: 'bs-grades__value',
            text: headline === undefined ? '—' : `${formatPercent(headline)}%`,
          }),
          letter
            ? e('div', {
                className: 'bs-grades__letter',
                text: letter,
                attrs: { title: 'From your grading scale in Better Schoology settings' },
              })
            : null,
        ],
      }),
      e('div', {
        className: 'bs-grades__facts',
        children: [
          e('p', { className: 'bs-grades__source', text: source }),
          e('p', { className: 'bs-note', text: modelLabel }),
          headline !== undefined && computed !== undefined && Math.abs(headline - computed) > 0.05
            ? note(
                doc,
                `Better Schoology computes ${formatPercent(computed)}% from the grades on this page.`,
              )
            : null,
          letter
            ? note(doc, 'The letter comes from your own grading scale, not from Schoology.')
            : null,
        ],
      }),
      e('div', {
        className: 'bs-grades__actions',
        children: [
          button(doc, {
            className: `bs-btn${ui.whatIfOpen ? ' bs-btn--primary' : ''}`,
            text: ui.whatIfOpen ? 'Exit what-if' : 'What if…',
            attrs: { 'aria-pressed': String(ui.whatIfOpen) },
            onClick: () => {
              ui.whatIfOpen = !ui.whatIfOpen;
              if (!ui.whatIfOpen) ui.whatIf = {};
              callbacks.onChange();
            },
          }),
          button(doc, {
            className: `bs-btn${ui.calculatorOpen ? ' bs-btn--primary' : ''}`,
            text: 'What do I need?',
            attrs: { 'aria-pressed': String(ui.calculatorOpen) },
            onClick: () => {
              ui.calculatorOpen = !ui.calculatorOpen;
              callbacks.onChange();
            },
          }),
        ],
      }),
    ],
  });
}

function renderPeriodTabs(
  doc: Document,
  leaves: GradePeriod[],
  active: GradePeriod,
  ui: CourseUiState,
  callbacks: GradesCallbacks,
): HTMLElement {
  const e = binder(doc);

  return e('div', {
    className: 'bs-grades__periods',
    attrs: { role: 'group', 'aria-label': 'Grading period' },
    children: leaves.map((period) =>
      button(doc, {
        className: 'bs-chip',
        text: period.title,
        attrs: { 'aria-pressed': String(period.id === active.id) },
        onClick: () => {
          ui.periodId = period.id;
          callbacks.onChange();
        },
      }),
    ),
  });
}

function renderCategories(
  doc: Document,
  categories: GradeCategory[],
  result: ReturnType<typeof calculateFromCategories>,
  ui: CourseUiState,
  callbacks: GradesCallbacks,
): HTMLElement {
  const e = binder(doc);

  if (categories.length === 0) {
    return emptyState(doc, 'No categories in this grading period.');
  }

  return e('ul', {
    className: 'bs-grade-categories',
    children: categories.map((category) => {
      const summary = result.categories.find((entry) => entry.category.id === category.id);
      const open = ui.expanded.has(category.id);

      const head = button(doc, {
        className: 'bs-grade-category__head',
        attrs: { 'aria-expanded': String(open) },
        children: [
          icon(doc, open ? ICONS.chevronDown : ICONS.chevronRight, 'bs-icon bs-icon--sm'),
          e('span', { className: 'bs-grade-category__title', text: category.title }),
          // A weight is shown only when Schoology rendered one for it.
          category.weight !== undefined
            ? e('span', { className: 'bs-grade-category__weight', text: `${formatPercent(category.weight)}%` })
            : null,
          e('span', {
            className: 'bs-grade-category__value',
            text:
              summary?.percentage === undefined
                ? '—'
                : `${formatPercent(summary.percentage)}%`,
          }),
        ],
        onClick: () => {
          if (open) ui.expanded.delete(category.id);
          else ui.expanded.add(category.id);
          callbacks.onChange();
        },
      });

      return e('li', {
        className: 'bs-grade-category',
        children: [
          head,
          summary && summary.gradedCount === 0
            ? e('p', { className: 'bs-note bs-grade-category__note', text: 'Nothing graded yet' })
            : null,
          open
            ? e('ul', {
                className: 'bs-grade-items',
                children: category.items.map((item) =>
                  renderItem(doc, item, ui, callbacks),
                ),
              })
            : null,
        ],
      });
    }),
  });
}

function renderItem(
  doc: Document,
  item: GradeItem,
  ui: CourseUiState,
  callbacks: GradesCallbacks,
): HTMLElement {
  const e = binder(doc);
  const override = ui.whatIf.overrides?.[item.id];
  const earned = override?.earned ?? item.earned;

  const score = ui.whatIfOpen
    ? renderScoreInput(doc, item, earned, ui, callbacks)
    : e('span', {
        className: 'bs-grade-item__score',
        text: item.hasGrade ? formatFraction(item.earned, item.possible) : '—',
      });

  return e('li', {
    className: `bs-grade-item${item.hasGrade ? '' : ' is-ungraded'}`,
    children: [
      e('div', {
        className: 'bs-grade-item__identity',
        children: [
          item.href
            ? e('a', { className: 'bs-grade-item__title', text: item.title, attrs: { href: item.href } })
            : e('span', { className: 'bs-grade-item__title', text: item.title }),
          item.dueText
            ? e('span', { className: 'bs-grade-item__due', text: item.dueText })
            : null,
        ],
      }),
      score,
    ],
  });
}

/** The one editable control in Better Grades. It changes nothing in Schoology. */
function renderScoreInput(
  doc: Document,
  item: GradeItem,
  earned: number | undefined,
  ui: CourseUiState,
  callbacks: GradesCallbacks,
): HTMLElement {
  const e = binder(doc);

  const input = e('input', {
    className: 'bs-grade-item__input',
    attrs: {
      type: 'number',
      step: 'any',
      min: '0',
      inputmode: 'decimal',
      'aria-label': `Hypothetical score for ${item.title}`,
      ...(earned !== undefined ? { value: String(earned) } : {}),
      ...(item.possible !== undefined ? { max: String(item.possible * 2) } : {}),
    },
  }) as HTMLInputElement;

  input.addEventListener('change', () => {
    const overrides = { ...(ui.whatIf.overrides ?? {}) };
    const raw = input.value.trim();

    if (raw === '') delete overrides[item.id];
    else {
      const value = Number(raw);
      if (Number.isFinite(value)) overrides[item.id] = { earned: value, include: true };
    }

    ui.whatIf = { ...ui.whatIf, overrides };
    callbacks.onChange();
  });

  return e('span', {
    className: 'bs-grade-item__score bs-grade-item__score--editable',
    children: [
      input,
      e('span', {
        className: 'bs-grade-item__possible',
        text: item.possible === undefined ? '' : `/ ${item.possible}`,
      }),
    ],
  });
}

function renderWhatIfSummary(
  doc: Document,
  period: GradePeriod,
  ui: CourseUiState,
): HTMLElement {
  const e = binder(doc);
  const { current, projected, delta } = projectPeriod(period, ui.whatIf);

  const unavailable = projected.percentage === undefined;

  return panel(
    doc,
    {
      title: 'What if',
      icon: 'chart',
      headingLevel: 'h3',
      className: 'bs-whatif',
      actions: [pill(doc, 'Hypothetical', 'warning')],
    },
    unavailable
      ? [note(doc, 'Projection unavailable for this course — there is not enough graded work to compute one.')]
      : [
          e('div', {
            className: 'bs-whatif__figures',
            children: [
              figure(doc, 'Current', current.percentage),
              figure(doc, 'Projected', projected.percentage, 'bs-whatif__figure--projected'),
              delta !== undefined
                ? figure(doc, 'Change', delta, delta >= 0 ? 'bs-whatif__figure--up' : 'bs-whatif__figure--down', true)
                : null,
            ],
          }),
          note(
            doc,
            'Hypothetical — this changes nothing in Schoology and no teacher sees it.',
          ),
        ],
  );
}

function figure(
  doc: Document,
  label: string,
  value: number | undefined,
  className = '',
  signed = false,
): HTMLElement {
  const e = binder(doc);
  const text =
    value === undefined
      ? '—'
      : `${signed && value >= 0 ? '+' : ''}${formatPercent(value)}%`;

  return e('div', {
    className: `bs-whatif__figure ${className}`.trim(),
    children: [
      e('span', { className: 'bs-whatif__figure-value', text }),
      e('span', { className: 'bs-whatif__figure-label', text: label }),
    ],
  });
}

/** Deepest periods, which are the ones a student actually has grades in. */
export function leafPeriods(course: CourseGrade): GradePeriod[] {
  const leaves: GradePeriod[] = [];
  const walk = (period: GradePeriod): void => {
    if (period.periods.length === 0) leaves.push(period);
    else period.periods.forEach(walk);
  };
  course.periods.forEach(walk);
  return leaves;
}

/**
 * The grading periods worth offering.
 *
 * A Schoology course carries every period its school defines -- often eight,
 * most of them empty, plus a "(no grading period)" bucket. Offering all of them
 * makes the student hunt for the one with their grades in it, so periods with
 * no coursework at all are left out. If that leaves nothing, every leaf is
 * offered rather than none.
 */
export function usablePeriods(course: CourseGrade): GradePeriod[] {
  const leaves = leafPeriods(course);
  const withWork = leaves.filter((period) => allCategories(period).some((c) => c.items.length > 0));
  return withWork.length > 0 ? withWork : leaves;
}

/** The period the student most likely wants: the latest one with a grade in it. */
export function preferredPeriod(periods: GradePeriod[]): GradePeriod | undefined {
  const graded = periods.filter((period) =>
    allCategories(period).some((category) => category.items.some((item) => item.hasGrade)),
  );
  return graded.at(-1) ?? periods.at(-1);
}
