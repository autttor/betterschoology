import type { GradeCategory } from '@/src/grades';
import type { GradeResult } from '@/src/grades';
import {
  formatPercent,
  requiredForPointItem,
  requiredForWeightedFinal,
  type TargetResult,
} from '@/src/grades';
import { binder, button } from '@/src/components/dom';
import { note, panel, pill } from '@/src/components/ui';
import type { CourseUiState } from './state';

/**
 * "What do I need on the final?"
 *
 * Two shapes, because finals come in two shapes: a point item inside a
 * category, and a separately-weighted slice of the course grade. Which one
 * applies is the student's to say -- Better Schoology does not go looking for
 * an assignment called "Final Exam" and assume, because a course with a
 * "Final Project" and a "Final Exam Review" would answer the wrong question
 * with total confidence.
 *
 * Every number here is derived from the course's own parsed model. When it
 * cannot be, the panel says so instead of printing a plausible figure.
 */
export interface CalculatorInput {
  categories: GradeCategory[];
  result: GradeResult;
  ui: CourseUiState;
}

export function renderCalculator(
  doc: Document,
  input: CalculatorInput,
  callbacks: { onChange(): void },
): HTMLElement {
  const e = binder(doc);
  const { ui, categories, result } = input;

  const gradedCategories = categories.filter((category) => category.items.length > 0);
  if (!ui.finalCategoryId) ui.finalCategoryId = gradedCategories[0]?.id;

  const body: Array<Node | null> = [
    e('div', {
      className: 'bs-calc__row',
      children: [
        numberField(doc, 'Target grade', ui.target, '%', (value) => {
          ui.target = value;
          callbacks.onChange();
        }),
        e('div', {
          className: 'bs-calc__mode',
          attrs: { role: 'group', 'aria-label': 'How the final counts' },
          children: [
            modeButton(doc, 'points', 'Final is worth points', ui, callbacks),
            modeButton(doc, 'weight', 'Final has its own weight', ui, callbacks),
          ],
        }),
      ],
    }),
  ];

  if (ui.finalMode === 'points') {
    body.push(
      e('div', {
        className: 'bs-calc__row',
        children: [
          numberField(doc, 'Final is out of', ui.finalPoints, 'points', (value) => {
            ui.finalPoints = value;
            callbacks.onChange();
          }),
          gradedCategories.length > 0
            ? selectField(
                doc,
                'Counts in category',
                gradedCategories.map((category) => ({ value: category.id, label: category.title })),
                ui.finalCategoryId ?? '',
                (value) => {
                  ui.finalCategoryId = value;
                  callbacks.onChange();
                },
              )
            : null,
        ],
      }),
    );
  } else {
    body.push(
      e('div', {
        className: 'bs-calc__row',
        children: [
          numberField(doc, 'Final is worth', ui.finalWeight, '% of the course', (value) => {
            ui.finalWeight = value;
            callbacks.onChange();
          }),
        ],
      }),
    );
  }

  body.push(renderOutcome(doc, computeTarget(input), ui.target));
  body.push(
    note(
      doc,
      'Calculated by Better Schoology from the grades on this page. Schoology does not publish how much of a course is left, so the final’s size is yours to enter.',
    ),
  );

  return panel(
    doc,
    {
      title: 'What do I need?',
      icon: 'chart',
      headingLevel: 'h3',
      className: 'bs-calc',
      actions: [pill(doc, 'Estimate', 'neutral')],
    },
    body,
  );

  function computeTarget(calculatorInput: CalculatorInput): TargetResult {
    if (ui.finalMode === 'weight') {
      if (result.percentage === undefined) return { achievable: false, unavailable: 'insufficient-data' };
      return requiredForWeightedFinal({
        currentPercentage: result.percentage,
        weight: ui.finalWeight,
        target: ui.target,
      });
    }

    if (!ui.finalCategoryId) return { achievable: false, unavailable: 'insufficient-data' };
    return requiredForPointItem({
      categories: calculatorInput.categories,
      categoryId: ui.finalCategoryId,
      possible: ui.finalPoints,
      target: ui.target,
    });
  }
}

function renderOutcome(doc: Document, target: TargetResult, wanted: number): HTMLElement {
  const e = binder(doc);

  if (target.unavailable === 'insufficient-data') {
    return e('p', {
      className: 'bs-calc__outcome bs-calc__outcome--unavailable',
      text: 'Projection unavailable for this course — the grades on this page cannot answer that.',
    });
  }

  if (target.unavailable === 'no-effect') {
    return e('p', {
      className: 'bs-calc__outcome bs-calc__outcome--unavailable',
      text: 'That final would not change this course’s grade, so no score is required.',
    });
  }

  const needed = formatPercent(target.requiredPercentage);

  const children: Array<Node | null> = [
    e('p', {
      className: 'bs-calc__outcome-lead',
      text: 'You need approximately',
    }),
    e('p', { className: 'bs-calc__outcome-value', text: `${needed}%` }),
    e('p', {
      className: 'bs-calc__outcome-lead',
      text: `to finish with ${formatPercent(wanted)}%`,
    }),
  ];

  if (target.requiredPoints !== undefined && target.requiredPercentage !== undefined) {
    children.push(
      e('p', {
        className: 'bs-note',
        text: `That is about ${formatPercent(target.requiredPoints)} points.`,
      }),
    );
  }

  if (!target.achievable) {
    children.push(
      e('p', {
        className: 'bs-calc__outcome-warning',
        text: 'That target is not reachable with the current weighting — even a perfect score falls short.',
      }),
    );
  }

  return e('div', {
    className: `bs-calc__outcome${target.achievable ? '' : ' bs-calc__outcome--unreachable'}`,
    children,
  });
}

function modeButton(
  doc: Document,
  mode: CourseUiState['finalMode'],
  label: string,
  ui: CourseUiState,
  callbacks: { onChange(): void },
): HTMLElement {
  return button(doc, {
    className: 'bs-chip',
    text: label,
    attrs: { 'aria-pressed': String(ui.finalMode === mode) },
    onClick: () => {
      ui.finalMode = mode;
      callbacks.onChange();
    },
  });
}

function numberField(
  doc: Document,
  label: string,
  value: number,
  suffix: string,
  onChange: (value: number) => void,
): HTMLElement {
  const e = binder(doc);
  const input = e('input', {
    className: 'bs-field__input',
    attrs: { type: 'number', step: 'any', min: '0', inputmode: 'decimal', value: String(value) },
  }) as HTMLInputElement;

  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });

  return e('label', {
    className: 'bs-field',
    children: [
      e('span', { className: 'bs-field__label', text: label }),
      e('span', {
        className: 'bs-field__control',
        children: [input, e('span', { className: 'bs-field__suffix', text: suffix })],
      }),
    ],
  });
}

function selectField(
  doc: Document,
  label: string,
  options: Array<{ value: string; label: string }>,
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const e = binder(doc);
  const select = e('select', { className: 'bs-field__input' }) as HTMLSelectElement;

  for (const option of options) {
    const node = e('option', { text: option.label, attrs: { value: option.value } });
    if (option.value === value) node.setAttribute('selected', 'selected');
    select.appendChild(node);
  }

  select.addEventListener('change', () => onChange(select.value));

  return e('label', {
    className: 'bs-field',
    children: [
      e('span', { className: 'bs-field__label', text: label }),
      e('span', { className: 'bs-field__control', children: [select] }),
    ],
  });
}
