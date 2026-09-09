import type { GradeCategory } from './model';
import { calculateFromCategories } from './calculate';
import { applyWhatIf } from './whatIf';
import { roundTo } from './rounding';

/**
 * Target-grade arithmetic.
 *
 * "What do I need on the final?" is one question with two shapes, depending on
 * how the course is graded, and both are answered by the same trick: a course
 * grade is a *linear* function of any single unscored item's points. Compute
 * the grade with that item at zero and at full marks, and the score needed for
 * any target follows directly -- with no formula duplicated per grading model,
 * and no assumption about which model is in play.
 *
 * Every result says whether it is achievable. A target that would need 108% on
 * the final is reported as exactly that, not rounded down to something
 * reassuring.
 */
export interface TargetResult {
  /** Score needed on the item, in points. */
  requiredPoints?: number;
  /** The same score as a percentage of the item. */
  requiredPercentage?: number;
  /** True when the required score is within the item's own range. */
  achievable: boolean;
  /** Set when the model cannot answer the question at all. */
  unavailable?: 'insufficient-data' | 'no-effect';
  /** The grade the course would end on if the item were left unscored. */
  gradeWithoutItem?: number;
  /** The grade with full marks on the item. */
  gradeWithFullMarks?: number;
}

export interface FinalByPointsInput {
  categories: GradeCategory[];
  /** Category the final belongs to. */
  categoryId: string;
  /** Points the final is out of. */
  possible: number;
  /** Target course percentage. */
  target: number;
  title?: string;
}

/**
 * The score needed on a final worth a known number of points.
 *
 * Works for point-based and weighted courses alike: the final is added as a
 * hypothetical item in its category, and the course grade is evaluated twice.
 */
export function requiredForPointItem(input: FinalByPointsInput): TargetResult {
  const { categories, categoryId, possible, target } = input;
  if (!(possible > 0)) return { achievable: false, unavailable: 'insufficient-data' };

  const gradeAt = (earned: number): number | undefined =>
    calculateFromCategories(
      applyWhatIf(categories, {
        added: [{ categoryId, title: input.title ?? 'Final', earned, possible }],
      }),
    ).percentage;

  const low = gradeAt(0);
  const high = gradeAt(possible);
  if (low === undefined || high === undefined) {
    return { achievable: false, unavailable: 'insufficient-data' };
  }

  // A final that cannot move the grade (a zero-weight category, say) makes the
  // question unanswerable rather than trivially satisfied.
  if (Math.abs(high - low) < 1e-9) {
    return {
      achievable: target <= low,
      unavailable: 'no-effect',
      gradeWithoutItem: low,
      gradeWithFullMarks: high,
    };
  }

  const requiredPoints = (possible * (target - low)) / (high - low);
  const requiredPercentage = (requiredPoints / possible) * 100;

  return {
    requiredPoints: roundTo(requiredPoints, 2),
    requiredPercentage: roundTo(requiredPercentage, 2),
    achievable: requiredPoints <= possible + 1e-9 && requiredPoints >= -1e-9,
    gradeWithoutItem: roundTo(low, 2),
    gradeWithFullMarks: roundTo(high, 2),
  };
}

export interface FinalByWeightInput {
  /** The grade earned so far, as a percentage. */
  currentPercentage: number;
  /** The final's share of the course grade, as a percentage (e.g. 20). */
  weight: number;
  /** Target course percentage. */
  target: number;
}

/**
 * The score needed on a final that carries its own weight.
 *
 * `target = current * (1 - w) + final * w`, solved for `final`. The current
 * grade is treated as covering the rest of the course, which is what a
 * separately-weighted final means.
 */
export function requiredForWeightedFinal(input: FinalByWeightInput): TargetResult {
  const weight = input.weight / 100;
  if (!(weight > 0) || weight > 1) {
    return { achievable: false, unavailable: 'insufficient-data' };
  }

  const required = (input.target - input.currentPercentage * (1 - weight)) / weight;

  return {
    requiredPercentage: roundTo(required, 2),
    requiredPoints: roundTo(required, 2),
    achievable: required <= 100 + 1e-9,
    gradeWithoutItem: roundTo(input.currentPercentage * (1 - weight), 2),
    gradeWithFullMarks: roundTo(input.currentPercentage * (1 - weight) + 100 * weight, 2),
  };
}

/**
 * The general "what do I need to reach X?" for a points-based course.
 *
 * `remainingPoints` is supplied by the student: Schoology does not publish how
 * many points a course has left, and pretending to know would be a guess about
 * their teacher's plans.
 */
export function requiredOnRemainingPoints(input: {
  earned: number;
  possible: number;
  remainingPoints: number;
  target: number;
}): TargetResult {
  const { earned, possible, remainingPoints, target } = input;
  if (!(remainingPoints > 0)) return { achievable: false, unavailable: 'insufficient-data' };

  const requiredPoints = (target / 100) * (possible + remainingPoints) - earned;
  const requiredPercentage = (requiredPoints / remainingPoints) * 100;
  const without = possible + remainingPoints > 0
    ? (earned / (possible + remainingPoints)) * 100
    : undefined;

  return {
    requiredPoints: roundTo(requiredPoints, 2),
    requiredPercentage: roundTo(requiredPercentage, 2),
    achievable: requiredPoints <= remainingPoints + 1e-9,
    ...(without !== undefined ? { gradeWithoutItem: roundTo(without, 2) } : {}),
    gradeWithFullMarks: roundTo(
      ((earned + remainingPoints) / (possible + remainingPoints)) * 100,
      2,
    ),
  };
}
