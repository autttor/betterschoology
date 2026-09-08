import type { SchoologyAssignment } from '@/src/types';
import { SGY, queryAll, queryFirst } from '../selectors';
import { assignmentIdFromPath } from '../router';
import { textWithoutHiddenNodes } from './course';

/**
 * Assignment detail parsing.
 *
 * Read-only. The native submission control (`.submit-assignment .dropbox-submit`)
 * is detected but never recreated: submitting coursework is the one interaction
 * where a Better Schoology bug would cost a student a grade, so 0.0.1 does not
 * touch the transaction at all.
 */
export function parseAssignmentPage(
  root: ParentNode,
  pathname: string,
): SchoologyAssignment | null {
  /*
   * `h1.page-title` exists on many Schoology pages, so it alone does not make
   * a page an assignment. Require a surface that only assignments have: the
   * details container, or the native submission control.
   */
  const isAssignmentSurface =
    queryFirst(root, SGY.assignment.details) !== null ||
    queryFirst(root, SGY.assignment.submitWrapper) !== null;
  if (!isAssignmentSurface) return null;

  const titleEl = queryFirst(root, SGY.assignment.pageTitle);
  if (!titleEl) return null;

  // The title element also contains the lesson-plan button; strip child
  // elements so only the assignment's own text survives.
  const title = directTextOf(titleEl) || textWithoutHiddenNodes(titleEl);
  if (!title) return null;

  const gradeHeader = queryFirst(root, SGY.assignment.gradeHeader);
  const received = gradeHeader ? queryFirst(gradeHeader, SGY.assignment.receivedGrade) : null;
  const max = gradeHeader ? queryFirst(gradeHeader, SGY.assignment.maxPoints) : null;
  const category = gradeHeader ? queryFirst(gradeHeader, SGY.assignment.gradingCategory) : null;
  const period = gradeHeader ? queryFirst(gradeHeader, SGY.assignment.gradingPeriod) : null;

  // `.assignment-details .due-date` is the body due date. A second, often empty
  // `.due-date` also exists in the grade header, so scope matters here.
  const due = queryFirst(root, SGY.assignment.dueDate);
  const dueText = due ? textWithoutHiddenNodes(due) : '';

  return {
    id: assignmentIdFromPath(pathname),
    title,
    ...(dueText ? { dueText } : {}),
    ...(numberFrom(received) !== undefined ? { earned: numberFrom(received)! } : {}),
    ...(numberFrom(max) !== undefined ? { possible: numberFrom(max)! } : {}),
    ...(category ? { category: stripParamName(category) } : {}),
    ...(period ? { gradingPeriod: stripParamName(period) } : {}),
    hasSubmitControl: queryFirst(root, SGY.assignment.submitLink) !== null,
    attachmentCount: queryAll(root, SGY.assignment.attachmentFile).length,
  };
}

/** Text of an element's own text nodes, ignoring nested elements. */
function directTextOf(element: Element): string {
  let text = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) text += node.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Drops the `Category: ` / `Period: ` label span, leaving the value. */
function stripParamName(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const label of Array.from(clone.querySelectorAll('.param-name'))) label.remove();
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function numberFrom(element: Element | null): number | undefined {
  if (!element) return undefined;
  const cleaned = textWithoutHiddenNodes(element).replace(/[/\s]/g, '');
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}
