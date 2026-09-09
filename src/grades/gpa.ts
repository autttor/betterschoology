import type { CourseGpaSettings, GpaConfig, GradeBand } from '@/src/types/settings';
import { roundTo } from './rounding';

/**
 * GPA.
 *
 * Schoology does not publish a GPA, a grading scale, or course credits, and
 * schools differ on all three -- weighted and unweighted scales, 4.0 and 5.0
 * ceilings, different letter boundaries, half-credit courses, AP boosts.
 *
 * So every input here is the student's, stored locally, and the UI says so.
 * Better Schoology computes arithmetic on grades it can see; it does not
 * reproduce an official transcript and must never be presented as one.
 */
export interface GpaCourseInput {
  courseId: string;
  courseName: string;
  /** The course percentage Better Schoology computed or Schoology displayed. */
  percentage?: number;
}

export interface GpaCourseResult extends GpaCourseInput {
  letter?: string;
  /** Grade points before any boost. */
  basePoints?: number;
  /** Grade points after the student's honors/AP boost. */
  points?: number;
  credits: number;
  boost: number;
  included: boolean;
  /** Why a course did not count, when it did not. */
  excludedReason?: 'no-grade' | 'excluded-by-student' | 'no-credit';
}

export interface GpaResult {
  /** Undefined when nothing countable was found. */
  gpa?: number;
  /** Unweighted: the same calculation with every boost set to zero. */
  unweightedGpa?: number;
  courses: GpaCourseResult[];
  countedCourses: number;
  totalCredits: number;
}

/** Highest band whose threshold the percentage reaches. */
export function bandFor(percentage: number, scale: GradeBand[]): GradeBand | undefined {
  return [...scale]
    .sort((a, b) => b.minPercentage - a.minPercentage)
    .find((band) => percentage >= band.minPercentage);
}

export function letterFor(percentage: number | undefined, scale: GradeBand[]): string | undefined {
  if (percentage === undefined || !Number.isFinite(percentage)) return undefined;
  return bandFor(percentage, scale)?.letter;
}

/** Per-course settings with the defaults filled in. Schoology supplies none of these. */
export function courseSettings(
  courseId: string,
  config: GpaConfig,
): Required<CourseGpaSettings> {
  const stored = config.courses[courseId] ?? {};
  return {
    included: stored.included ?? true,
    // Schoology does not expose course credits. One local credit per course is
    // Better Schoology's default, not a value read from anywhere.
    credits: stored.credits ?? 1,
    boost: stored.boost ?? 0,
  };
}

export function calculateGpa(courses: GpaCourseInput[], config: GpaConfig): GpaResult {
  const results: GpaCourseResult[] = courses.map((course) => {
    const settings = courseSettings(course.courseId, config);
    const letter = letterFor(course.percentage, config.scale);
    const band = course.percentage !== undefined ? bandFor(course.percentage, config.scale) : undefined;

    const excludedReason: GpaCourseResult['excludedReason'] | undefined =
      !settings.included
        ? 'excluded-by-student'
        : band === undefined
          ? 'no-grade'
          : settings.credits <= 0
            ? 'no-credit'
            : undefined;

    return {
      ...course,
      ...(letter ? { letter } : {}),
      ...(band ? { basePoints: band.points, points: band.points + settings.boost } : {}),
      credits: settings.credits,
      boost: settings.boost,
      included: excludedReason === undefined,
      ...(excludedReason ? { excludedReason } : {}),
    };
  });

  const counted = results.filter((result) => result.included);
  const totalCredits = counted.reduce((total, result) => total + result.credits, 0);

  if (counted.length === 0 || totalCredits <= 0) {
    return { courses: results, countedCourses: 0, totalCredits: 0 };
  }

  const weighted = counted.reduce((total, result) => total + result.points! * result.credits, 0);
  const unweighted = counted.reduce(
    (total, result) => total + result.basePoints! * result.credits,
    0,
  );

  return {
    gpa: roundTo(weighted / totalCredits, 2),
    unweightedGpa: roundTo(unweighted / totalCredits, 2),
    courses: results,
    countedCourses: counted.length,
    totalCredits: roundTo(totalCredits, 2),
  };
}

/** A scale is only usable if it has a band reachable from any percentage. */
export function isUsableScale(scale: GradeBand[]): boolean {
  return scale.length > 0 && scale.some((band) => band.minPercentage <= 0);
}
