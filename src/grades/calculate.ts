import type { GradeCategory, GradeItem, GradePeriod } from './model';
import { allCategories } from './model';
import { percentageOf, roundTo } from './rounding';

/**
 * Grade calculation.
 *
 * Pure functions over the normalized model: same input, same output, no DOM,
 * no storage, no clock. That is what makes the projections testable, and it is
 * why every calculator in this milestone shares one implementation instead of
 * each rolling its own arithmetic.
 *
 * There is deliberately no single formula. A course is graded either by total
 * points or by weighted categories, and using the wrong one produces a number
 * that looks precise and is wrong. The model is *determined from the parsed
 * data*, and when the data cannot support a projection the answer is
 * "unavailable" rather than a confident guess.
 */
export type GradingModel = 'points' | 'weighted' | 'unknown';

export interface CategoryResult {
  category: GradeCategory;
  earned: number;
  possible: number;
  /** Undefined when the category has nothing graded to compute from. */
  percentage?: number;
  weight?: number;
  /** True when this category contributed to the course grade. */
  counted: boolean;
  gradedCount: number;
}

export interface GradeResult {
  model: GradingModel;
  /** Undefined when the data cannot support a projection. */
  percentage?: number;
  earned: number;
  possible: number;
  categories: CategoryResult[];
  /** Sum of the weights that actually counted, for the "out of" explanation. */
  countedWeight: number;
  gradedCount: number;
}

/** An item counts when it has a grade, is not excused, and has points to weigh. */
export function counts(item: GradeItem): boolean {
  if (item.excused) return false;
  if (!item.hasGrade) return false;
  return item.earned !== undefined && item.possible !== undefined;
}

/**
 * Chooses the grading model.
 *
 * Weighted wins only when Schoology actually rendered weights for the
 * categories that have graded work -- a course where one category out of five
 * shows a weight is not a weighted course, it is a points course with one
 * oddity, and treating it as weighted would silently rescale the grade.
 */
export function detectModel(categories: GradeCategory[]): GradingModel {
  const withGradedWork = categories.filter((category) => category.items.some(counts));
  if (withGradedWork.length === 0) return 'unknown';

  const weighted = withGradedWork.filter((category) => category.weight !== undefined);
  if (weighted.length === withGradedWork.length) return 'weighted';
  if (weighted.length > 0) return 'points';
  return 'points';
}

function summarize(category: GradeCategory): { earned: number; possible: number; graded: number } {
  let earned = 0;
  let possible = 0;
  let graded = 0;

  for (const item of category.items) {
    if (!counts(item)) continue;
    earned += item.earned!;
    possible += item.possible!;
    graded += 1;
  }

  return { earned, possible, graded };
}

/**
 * Computes a grade from a set of categories.
 *
 * Points model: every graded point in the period, over every possible point.
 * Weighted model: each category's own percentage, weighted, with categories
 * that have nothing graded dropped and the remaining weights renormalized --
 * which is what Schoology itself does, and why a course's grade can move when
 * a new category gets its first assignment.
 */
export function calculateFromCategories(categories: GradeCategory[]): GradeResult {
  const model = detectModel(categories);

  const results: CategoryResult[] = categories.map((category) => {
    const { earned, possible, graded } = summarize(category);
    const percentage = percentageOf(earned, possible);

    return {
      category,
      earned,
      possible,
      ...(percentage !== undefined ? { percentage } : {}),
      ...(category.weight !== undefined ? { weight: category.weight } : {}),
      // A category with no graded work, or with only zero-point work, cannot
      // contribute a percentage and is left out rather than counted as zero.
      counted: graded > 0 && percentage !== undefined,
      gradedCount: graded,
    };
  });

  const totals = results.reduce(
    (accumulator, result) => ({
      earned: accumulator.earned + result.earned,
      possible: accumulator.possible + result.possible,
      graded: accumulator.graded + result.gradedCount,
    }),
    { earned: 0, possible: 0, graded: 0 },
  );

  if (model === 'weighted') {
    const counted = results.filter((result) => result.counted && result.weight !== undefined);
    const weightSum = counted.reduce((total, result) => total + result.weight!, 0);

    return {
      model,
      ...(weightSum > 0
        ? {
            percentage: counted.reduce(
              (total, result) => total + result.weight! * result.percentage!,
              0,
            ) / weightSum,
          }
        : {}),
      earned: totals.earned,
      possible: totals.possible,
      categories: results,
      countedWeight: weightSum,
      gradedCount: totals.graded,
    };
  }

  const percentage = percentageOf(totals.earned, totals.possible);

  return {
    model,
    ...(percentage !== undefined ? { percentage } : {}),
    earned: totals.earned,
    possible: totals.possible,
    categories: results,
    countedWeight: 0,
    gradedCount: totals.graded,
  };
}

/** The same calculation for a whole grading period, nested periods included. */
export function calculatePeriod(period: GradePeriod): GradeResult {
  return calculateFromCategories(allCategories(period));
}

/**
 * The number Better Schoology shows as "current grade".
 *
 * Rounded once, here, so the course header, the GPA widget and the what-if
 * panel can never disagree about the same course by a hundredth of a point.
 */
export function currentPercentage(result: GradeResult, decimals = 2): number | undefined {
  return result.percentage === undefined ? undefined : roundTo(result.percentage, decimals);
}
