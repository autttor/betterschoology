import type { WhatIfInput } from '@/src/grades';

/**
 * Per-page-load interaction state for Better Grades.
 *
 * Hypothetical scores are *not* persisted, deliberately. A what-if is a
 * question a student asks in the moment; storing it would invite the answer to
 * be mistaken later for a real grade, which is the one outcome this feature
 * must never produce.
 */
export interface CourseUiState {
  /** Grading period the student is looking at. */
  periodId?: string;
  whatIfOpen: boolean;
  calculatorOpen: boolean;
  whatIf: WhatIfInput;
  /** Categories the student has expanded. */
  expanded: Set<string>;
  target: number;
  /** Category the final belongs to, for the points-based calculator. */
  finalCategoryId?: string;
  finalPoints: number;
  finalWeight: number;
  finalMode: 'points' | 'weight';
}

const states = new Map<string, CourseUiState>();

export function uiStateFor(courseId: string): CourseUiState {
  const existing = states.get(courseId);
  if (existing) return existing;

  const fresh: CourseUiState = {
    whatIfOpen: false,
    calculatorOpen: false,
    whatIf: {},
    expanded: new Set(),
    target: 90,
    finalPoints: 100,
    finalWeight: 20,
    finalMode: 'points',
  };
  states.set(courseId, fresh);
  return fresh;
}

export function resetGradesUi(): void {
  states.clear();
}
