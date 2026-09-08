import type { CourseGradeReport, GradeNode } from '@/src/types';
import { SGY, queryAll, queryFirst } from '../selectors';
import { textWithoutHiddenNodes, splitCourseTitle } from './course';

/**
 * Hierarchical grade report parsing.
 *
 * Schoology exposes the whole grade tree in the DOM through `data-id` and
 * `data-parent-id`, so the tree can be reconstructed without simulating any
 * clicks or expanding anything -- collapsed rows are present, just hidden.
 *
 * Observed identifier conventions (treated as conventions, not contracts):
 *   course row    data-id="<courseId>"            data-parent-id=""
 *   period row    data-id="<periodId>"            periods can nest
 *   category row  data-id="<periodId>-<catId>"
 *   item row      data-id="I-<assignmentId>"
 */

const ITEM_ID_RE = /^I-(\d+)$/;
const GRADEBOOK_ID_RE = /^s-js-gradebook-course-(\d+)$/;

function rowKind(row: Element): GradeNode['kind'] {
  const className = row.className;
  if (typeof className !== 'string') return 'unknown';
  if (className.includes('course-row')) return 'course';
  if (className.includes('period-row')) return 'period';
  if (className.includes('category-row')) return 'category';
  if (className.includes('item-row')) return 'item';
  return 'unknown';
}

/**
 * Parses a displayed grade value.
 *
 * `.rounded-grade` holds both `5` (points) and `100%` (percentage) depending on
 * the row kind, and ungraded rows render an em dash under `.no-grade`. Anything
 * that does not parse to a finite number is reported as "no grade" rather than
 * coerced to zero -- a missing grade and a zero are very different to a student.
 */
function parseNumber(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[%,\s]/g, '').replace(/^\/+/, '');
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

function parseRow(row: Element): GradeNode | null {
  const nodeId = row.getAttribute('data-id');
  if (!nodeId) return null;

  const parentAttr = row.getAttribute('data-parent-id');
  const kind = rowKind(row);

  const titleEl = queryFirst(row, SGY.grades.title);
  const anchor = titleEl?.querySelector<HTMLAnchorElement>('a[href]') ?? null;
  const title = titleEl ? textWithoutHiddenNodes(titleEl) : '';

  const gradeColumn = queryFirst(row, SGY.grades.gradeColumn);
  const rounded = gradeColumn ? queryFirst(gradeColumn, SGY.grades.roundedGrade) : null;
  const roundedText = rounded ? textWithoutHiddenNodes(rounded) : '';
  const isPercentage = roundedText.includes('%');
  const hasNoGrade = gradeColumn ? queryAll(gradeColumn, SGY.grades.noGrade).length > 0 : false;

  const maxEl = gradeColumn ? queryFirst(gradeColumn, SGY.grades.maxGrade) : null;
  const possible = parseNumber(maxEl ? textWithoutHiddenNodes(maxEl) : undefined);

  const numeric = parseNumber(roundedText);
  const contribution = queryFirst(row, SGY.grades.contribution);
  const dueDate = queryFirst(row, SGY.grades.dueDate);

  const assignmentId = nodeId.match(ITEM_ID_RE)?.[1];
  const contributionText = contribution ? textWithoutHiddenNodes(contribution) : '';
  const dueText = dueDate ? textWithoutHiddenNodes(dueDate) : '';

  return {
    nodeId,
    parentId: parentAttr ? parentAttr : null,
    kind,
    title,
    ...(anchor?.getAttribute('href') ? { href: anchor.getAttribute('href')! } : {}),
    ...(assignmentId ? { assignmentId } : {}),
    ...(numeric !== undefined && !isPercentage ? { earned: numeric } : {}),
    ...(possible !== undefined ? { possible } : {}),
    ...(numeric !== undefined && isPercentage ? { percentage: numeric } : {}),
    ...(contributionText ? { contributionText } : {}),
    ...(dueText ? { dueText } : {}),
    hasGrade: !hasNoGrade && numeric !== undefined,
  };
}

/** Parses one `.hierarchical-grading-report` into a flat, tree-shaped node list. */
export function parseGradeReport(reportRoot: Element): CourseGradeReport | null {
  const courseId = reportRoot.id.match(GRADEBOOK_ID_RE)?.[1] ?? findCourseRowId(reportRoot);
  if (!courseId) return null;

  const nodes: GradeNode[] = [];
  for (const row of queryAll(reportRoot, SGY.grades.row)) {
    const node = parseRow(row);
    if (node) nodes.push(node);
  }

  const titleEl = queryFirst(reportRoot, SGY.grades.gradebookCourseTitle);
  const heading = titleEl ? textWithoutHiddenNodes(titleEl) : '';

  return {
    courseId,
    ...(heading ? { courseTitle: splitCourseTitle(heading).name } : {}),
    nodes,
  };
}

function findCourseRowId(root: ParentNode): string | null {
  const courseRow = queryFirst(root, SGY.grades.courseRow);
  return courseRow?.getAttribute('data-id') ?? null;
}

/** Parses every course report on a page (one on a course page, many on `/grades/grades`). */
export function parseAllGradeReports(root: ParentNode): CourseGradeReport[] {
  const reports: CourseGradeReport[] = [];
  for (const reportRoot of queryAll(root, SGY.grades.report)) {
    const report = parseGradeReport(reportRoot);
    if (report) reports.push(report);
  }
  return reports;
}

/** Course-level percentage, i.e. the value on the root `.course-row`. */
export function courseGradePercentage(report: CourseGradeReport): number | undefined {
  return report.nodes.find((node) => node.kind === 'course')?.percentage;
}

/** Direct children of a node, using Schoology's own parent pointers. */
export function childrenOf(report: CourseGradeReport, nodeId: string): GradeNode[] {
  return report.nodes.filter((node) => node.parentId === nodeId);
}
