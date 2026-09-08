import { SGY, queryFirst } from '../selectors';

/**
 * Calendar surface detection.
 *
 * 0.0.1 themes the native FullCalendar instance rather than replacing it: the
 * captured client's calendar feed response contract was not characterized, so
 * a Better Calendar would have to guess at its data layer. Styling `.fc-*` is
 * both lower risk and reversible.
 */
export function findCalendarRoot(root: ParentNode): HTMLElement | null {
  return queryFirst(root, SGY.calendar.root);
}

export function isCalendarRendered(root: ParentNode): boolean {
  return findCalendarRoot(root) !== null;
}
