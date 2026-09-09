import type { RecentFeedbackItem } from '@/src/types';
import { SGY, queryAll } from '../selectors';
import { parseAllGradeReports } from './grades';

export interface NotificationSummary {
  count?: number;
  available: boolean;
  href?: string;
}

function accessibleLabel(doc: Document, element: Element): string {
  const ids = element.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
  return [element.getAttribute('aria-label'), ...ids.map((id) => doc.getElementById(id)?.textContent),
    element.getAttribute('title'), element.textContent].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function findNotificationControl(doc: Document): HTMLElement | null {
  return queryAll<HTMLElement>(doc, SGY.notifications.controls)
    .find((element) => /\bnotifications?\b/i.test(accessibleLabel(doc, element))) ?? null;
}

/** Accessible count only. Never infer unread state from arbitrary badges/DOM order. */
export function parseNotifications(doc: Document): NotificationSummary {
  const control = findNotificationControl(doc);
  if (!control) return { available: false };
  const label = accessibleLabel(doc, control);
  const match = label.match(/\b(\d+)\s+(?:new|unread)\b/i)
    ?? label.match(/\bnotifications?\s*[,:(]?\s*(\d+)\b/i)
    ?? label.match(/\b(\d+)\s+notifications?\b/i);
  const count = match ? Number(match[1]) : undefined;
  const href = control.getAttribute('href');
  return { available: true, ...(count !== undefined ? { count } : {}), ...(href ? { href } : {}) };
}

/** Delegate explicitly to the original native control, including its handlers. */
export function openNativeNotifications(doc: Document): void {
  const control = findNotificationControl(doc);
  control?.focus();
  control?.click();
}

export function parseRecentFeedback(root: ParentNode): RecentFeedbackItem[] {
  return parseAllGradeReports(root).flatMap((report) => report.nodes
    .filter((node) => node.kind === 'item' && node.hasGrade)
    .map((node) => ({
      assignmentId: node.assignmentId,
      courseId: report.courseId,
      courseName: report.courseTitle ?? report.nodes.find((item) => item.kind === 'course')?.title ?? 'Course',
      assignmentName: node.title,
      href: node.href,
      earned: node.earned,
      possible: node.possible,
      percentage: node.percentage,
      feedbackPreview: node.feedbackPreview,
    })));
}
