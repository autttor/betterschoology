import type { RecentFeedbackItem } from '@/src/types';
import type { NotificationSummary } from '@/src/schoology/adapters/dashboard';
import { openNativeNotifications } from '@/src/schoology/adapters/dashboard';
import { binder, button } from '@/src/components/dom';
import { emptyState, linkButton, note, panel, pill } from '@/src/components/ui';
import { formatFraction, formatPercent } from '@/src/grades';

/**
 * The dashboard's information panels.
 *
 * Notifications and recent feedback are *information*, so they live in the
 * rail rather than competing with the course grid and To Do. Both delegate to
 * Schoology for anything interactive: the notifications panel clicks
 * Schoology's own control rather than reimplementing a notifications popover,
 * and every feedback row links to the real assignment.
 */
export function renderNotifications(
  doc: Document,
  summary: NotificationSummary,
): HTMLElement {
  const e = binder(doc);

  const body: Array<Node | null> = [];

  if (summary.count !== undefined) {
    body.push(
      e('div', {
        className: 'bs-notify',
        children: [
          e('span', { className: 'bs-notify__count', text: String(summary.count) }),
          e('span', {
            className: 'bs-notify__label',
            text: summary.count === 1 ? 'new notification' : 'new notifications',
          }),
        ],
      }),
    );
  } else if (summary.available) {
    body.push(note(doc, 'Schoology does not say how many are unread.'));
  } else {
    body.push(emptyState(doc, 'Notifications live in Schoology’s top bar.'));
  }

  if (summary.available) {
    body.push(
      summary.href
        ? linkButton(doc, 'Open notifications', summary.href)
        : button(doc, {
            className: 'bs-btn bs-btn--quiet',
            text: 'Open notifications',
            // Schoology's own control, clicked -- not a reimplementation of it.
            onClick: () => openNativeNotifications(doc),
          }),
    );
  }

  return panel(
    doc,
    { title: 'Notifications', icon: 'alert', headingLevel: 'h3', className: 'bs-notify-panel' },
    body,
  );
}

/**
 * Recently graded work.
 *
 * Schoology's grade report has no "graded on" date, so this is *what is graded*
 * rather than *what changed*, and the panel says exactly that instead of
 * implying a recency it cannot know.
 */
export function renderRecentFeedback(
  doc: Document,
  items: RecentFeedbackItem[],
  status: 'loading' | 'loaded' | 'unavailable',
): HTMLElement {
  const e = binder(doc);

  const body: Array<Node | null> =
    items.length === 0
      ? [
          emptyState(
            doc,
            status === 'loading'
              ? 'Reading your grade report…'
              : status === 'unavailable'
                ? 'Your grade report could not be read.'
                : 'Nothing graded yet.',
          ),
        ]
      : [
          e('ul', {
            className: 'bs-feedback-list',
            children: items.slice(0, 5).map((item) => {
              const score =
                item.percentage !== undefined
                  ? `${formatPercent(item.percentage)}%`
                  : item.earned !== undefined
                    ? formatFraction(item.earned, item.possible)
                    : '';

              return e('li', {
                className: 'bs-feedback',
                children: [
                  e('div', {
                    className: 'bs-feedback__head',
                    children: [
                      item.href
                        ? e('a', {
                            className: 'bs-feedback__title',
                            text: item.assignmentName,
                            attrs: { href: item.href },
                          })
                        : e('span', { className: 'bs-feedback__title', text: item.assignmentName }),
                      score ? e('span', { className: 'bs-feedback__score', text: score }) : null,
                    ],
                  }),
                  e('span', { className: 'bs-feedback__course', text: item.courseName }),
                  item.feedbackPreview
                    ? e('p', { className: 'bs-feedback__comment', text: item.feedbackPreview })
                    : null,
                ],
              });
            }),
          }),
          note(doc, 'From your current grade report. Schoology does not publish grading dates.'),
        ];

  return panel(
    doc,
    {
      title: 'Recent feedback',
      icon: 'chart',
      headingLevel: 'h3',
      className: 'bs-feedback-panel',
      actions: status === 'loading' ? [pill(doc, 'Loading', 'neutral')] : [],
    },
    body,
  );
}
