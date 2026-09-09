import type { CourseGradeReport, GradeNode } from '@/src/types';
import { normalizeWeight, percentageOf } from './rounding';

/**
 * The normalized grade model.
 *
 * Schoology renders its grade report as a flat table whose rows point at each
 * other through `data-id` / `data-parent-id`. The adapter layer turns that into
 * this tree, and everything above it -- the UI, the calculators, the GPA
 * widget -- works only from here. Nothing above this file reads grade DOM.
 */
export interface GradeItem {
  id: string;
  assignmentId?: string;
  title: string;
  href?: string;

  earned?: number;
  possible?: number;
  /** Percentage the row itself displayed, for rows that show one. */
  percentage?: number;

  dueText?: string;

  /** Not counted toward the grade. Schoology's own captures do not expose this. */
  excused?: boolean;
  /** True when Schoology showed a grade for the row. */
  hasGrade: boolean;
}

export interface GradeCategory {
  id: string;
  title: string;
  /** Weight as a percentage, only when Schoology actually rendered one. */
  weight?: number;
  percentage?: number;
  items: GradeItem[];
}

export interface GradePeriod {
  id: string;
  title: string;
  weight?: number;
  percentage?: number;
  categories: GradeCategory[];
  /** Schoology nests periods: a year contains quarters. */
  periods: GradePeriod[];
}

export interface CourseGrade {
  courseId: string;
  courseName?: string;
  /** The course-row percentage Schoology displayed, when it displayed one. */
  currentPercentage?: number;
  periods: GradePeriod[];
}

/** `(16.67%)` -> 16.67. Anything else -> undefined. */
export function parseWeight(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!match) return undefined;
  return normalizeWeight(Number(match[1]));
}

/**
 * Builds the tree from a parsed report.
 *
 * Structure comes entirely from Schoology's own parent pointers, never from
 * row order or indentation classes: a report with an unexpected nesting depth
 * still comes out correct, and an orphaned row is dropped rather than attached
 * to whatever happened to precede it.
 */
export function buildCourseGrade(report: CourseGradeReport): CourseGrade {
  const byParent = new Map<string, GradeNode[]>();
  for (const node of report.nodes) {
    const key = node.parentId ?? '';
    const list = byParent.get(key);
    if (list) list.push(node);
    else byParent.set(key, [node]);
  }

  const courseRow = report.nodes.find((node) => node.kind === 'course');
  const rootId = courseRow?.nodeId ?? report.courseId;

  return {
    courseId: report.courseId,
    ...(report.courseTitle ? { courseName: report.courseTitle } : {}),
    ...(courseRow?.percentage !== undefined ? { currentPercentage: courseRow.percentage } : {}),
    periods: (byParent.get(rootId) ?? [])
      .filter((node) => node.kind === 'period' || node.kind === 'category')
      .map((node) => buildPeriod(node, byParent)),
  };
}

function buildPeriod(node: GradeNode, byParent: Map<string, GradeNode[]>): GradePeriod {
  const children = byParent.get(node.nodeId) ?? [];

  return {
    id: node.nodeId,
    title: node.title,
    ...(parseWeight(node.contributionText) !== undefined
      ? { weight: parseWeight(node.contributionText)! }
      : {}),
    ...(node.percentage !== undefined ? { percentage: node.percentage } : {}),
    categories: children
      .filter((child) => child.kind === 'category')
      .map((child) => buildCategory(child, byParent)),
    periods: children
      .filter((child) => child.kind === 'period')
      .map((child) => buildPeriod(child, byParent)),
  };
}

function buildCategory(node: GradeNode, byParent: Map<string, GradeNode[]>): GradeCategory {
  return {
    id: node.nodeId,
    title: node.title,
    ...(parseWeight(node.contributionText) !== undefined
      ? { weight: parseWeight(node.contributionText)! }
      : {}),
    ...(node.percentage !== undefined ? { percentage: node.percentage } : {}),
    items: (byParent.get(node.nodeId) ?? [])
      .filter((child) => child.kind === 'item')
      .map(buildItem),
  };
}

function buildItem(node: GradeNode): GradeItem {
  return {
    id: node.nodeId,
    ...(node.assignmentId ? { assignmentId: node.assignmentId } : {}),
    title: node.title,
    ...(node.href ? { href: node.href } : {}),
    ...(node.earned !== undefined ? { earned: node.earned } : {}),
    ...(node.possible !== undefined ? { possible: node.possible } : {}),
    ...(node.percentage !== undefined
      ? { percentage: node.percentage }
      : node.earned !== undefined && node.possible !== undefined
        ? withPercentage(node.earned, node.possible)
        : {}),
    ...(node.dueText ? { dueText: node.dueText } : {}),
    hasGrade: node.hasGrade,
  };
}

function withPercentage(earned: number, possible: number) {
  const percentage = percentageOf(earned, possible);
  return percentage === undefined ? {} : { percentage };
}

/** Every category in a period tree, including those inside nested periods. */
export function allCategories(period: GradePeriod): GradeCategory[] {
  return [...period.categories, ...period.periods.flatMap(allCategories)];
}

/** Every item in a period tree. */
export function allItems(period: GradePeriod): GradeItem[] {
  return allCategories(period).flatMap((category) => category.items);
}

/** The period a student is most likely looking at: the deepest, most recent one. */
export function defaultPeriod(course: CourseGrade): GradePeriod | undefined {
  const leaves: GradePeriod[] = [];

  const walk = (period: GradePeriod): void => {
    if (period.periods.length === 0) leaves.push(period);
    else period.periods.forEach(walk);
  };
  course.periods.forEach(walk);

  // A leaf with graded work beats one without; otherwise the last one, which is
  // the most recent grading period in Schoology's own order.
  const graded = leaves.filter((period) => allItems(period).some((item) => item.hasGrade));
  return graded.at(-1) ?? leaves.at(-1) ?? course.periods.at(-1);
}
