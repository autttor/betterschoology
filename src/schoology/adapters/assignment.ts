import type { AssignmentStatus, SchoologyAssignment } from '@/src/types';
import { SGY, queryAll, queryFirst } from '../selectors';
import { assignmentIdFromPath } from '../router';
import { textWithoutHiddenNodes } from './course';

/**
 * Assignment detail parsing.
 *
 * Read-only, and deliberately incurious about submission internals. The native
 * submission control is *located* so Better Assignment can move the real
 * element into its layout; it is never recreated. Submitting coursework is the
 * one interaction where a Better Schoology bug would cost a student a grade.
 */

/** `Due: Thursday, September 3, 2026 at 11:59 pm` */
const DUE_TEXT_RE = /^\s*due:?\s*(.+)$/i;

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
  // `.due-date` lives in the header; the body one is authoritative.
  const dueEl = queryFirst(root, SGY.assignment.dueDate);
  const dueText = dueEl ? textWithoutHiddenNodes(dueEl) : '';

  const earned = parseNumber(received ? textWithoutHiddenNodes(received) : undefined);
  const possible = parseNumber(max ? textWithoutHiddenNodes(max) : undefined);
  const dueAt = parseDueDate(dueText);

  const descriptionEl = queryFirst(root, SGY.assignment.infoText);
  const description = descriptionEl ? textWithoutHiddenNodes(descriptionEl) : '';

  return {
    id: assignmentIdFromPath(pathname),
    title,
    ...(dueText ? { dueText } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(earned !== undefined ? { earned } : {}),
    ...(possible !== undefined ? { possible } : {}),
    ...(category ? { category: stripParamName(category) } : {}),
    ...(period ? { gradingPeriod: stripParamName(period) } : {}),
    ...(description ? { description } : {}),
    status: statusOf(earned, dueAt),
    hasSubmitControl: queryFirst(root, SGY.assignment.submitLink) !== null,
    attachmentCount: queryAll(root, SGY.assignment.attachmentFile).length,
  };
}

/**
 * Assignment status, from proven signals only.
 *
 * Two things the captured DOM actually establishes:
 *   - a numeric received grade means the work has been graded;
 *   - a parsed due date in the past, with no grade, means it is overdue.
 *
 * Schoology's own "Submitted" / "Late" / "Excused" indicators live in the
 * submission panel, which the reference pack does not capture. Rather than
 * inferring them from colours or button labels, Better Schoology shows the
 * native submission block -- moved, not rebuilt -- and says nothing it cannot
 * prove. See docs/schoology-integration-assumptions.md.
 */
export function statusOf(
  earned: number | undefined,
  dueAt: Date | undefined,
  now: Date = new Date(),
): AssignmentStatus {
  if (earned !== undefined) return 'graded';
  if (dueAt && dueAt.getTime() < now.getTime()) return 'overdue';
  if (dueAt) return 'due';
  return 'unknown';
}

/**
 * Parses Schoology's rendered due sentence.
 *
 * The format is a locale string rather than a machine value, so this is
 * best-effort by definition: anything that does not parse cleanly returns
 * undefined and the assignment simply has no due date, rather than a wrong one.
 */
export function parseDueDate(dueText: string, reference: Date = new Date()): Date | undefined {
  const body = dueText.match(DUE_TEXT_RE)?.[1];
  if (!body) return undefined;

  // "Thursday, September 3, 2026 at 11:59 pm" -> a form Date can read.
  const normalized = body
    .replace(/\bat\b/i, '')
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s*(am|pm)\b/i, '$1 $2')
    .trim();

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;

  // A date with no year parses against the current year; reject anything
  // absurdly far from the page's own frame of reference rather than showing it.
  const tenYears = 10 * 365 * 86_400_000;
  return Math.abs(parsed.getTime() - reference.getTime()) > tenYears ? undefined : parsed;
}

/** The native submission block, when the page has one. */
export function findSubmissionBlock(root: ParentNode): HTMLElement | null {
  return queryFirst<HTMLElement>(root, SGY.assignment.dropItems);
}

/** The native submit control on its own, for pages whose block cannot be moved. */
export function findSubmitControl(root: ParentNode): HTMLElement | null {
  return queryFirst<HTMLElement>(root, SGY.assignment.submitWrapper);
}

function stripParamName(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const label of Array.from(clone.querySelectorAll('.param-name'))) label.remove();
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Text belonging to the element itself, ignoring nested elements. */
function directTextOf(element: Element): string {
  let text = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === 3) text += node.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

function parseNumber(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[/\s]/g, '');
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}
