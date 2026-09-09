import { el } from '@/src/components/dom';
import type { RecentFeedbackItem, SchoologyAnnouncement } from '@/src/types';
import type { NotificationSummary } from '@/src/schoology/adapters/dashboard';
import { openNativeNotifications } from '@/src/schoology/adapters/dashboard';

function section(doc: Document, title: string, name?: string): HTMLElement {
  return el(doc, 'section', { className: 'better-schoology-panel better-schoology-dashboard-section',
    attrs: { 'aria-label': name ? `${title} for ${name}` : title },
    children: [el(doc, 'h2', { className: 'better-schoology-panel__title', text: title })] });
}

export function renderNotifications(doc: Document, summary: NotificationSummary, name?: string): HTMLElement {
  const panel = section(doc, 'Notifications', name);
  panel.dataset.dashboardSection = 'notifications';
  panel.appendChild(el(doc, 'p', { className: 'better-schoology-empty', text: summary.count !== undefined
    ? `${summary.count} new` : summary.available ? 'Check your Schoology notifications.' : 'Use the notification bell in Schoology’s top navigation.' }));
  if (summary.available) {
    if (summary.href) panel.appendChild(el(doc, 'a', { text: 'View all', attrs: { href: summary.href } }));
    else {
      const open = el(doc, 'button', { text: 'Open notifications', attrs: { type: 'button' } });
      open.addEventListener('click', () => openNativeNotifications(doc));
      panel.appendChild(open);
    }
  }
  return panel;
}

export function renderRecentFeedback(doc: Document, items: RecentFeedbackItem[], status: 'loading'|'loaded'|'unavailable', name?: string): HTMLElement {
  const panel = section(doc, 'Recent Feedback', name);
  panel.dataset.dashboardSection = 'feedback';
  if (!items.length) {
    panel.appendChild(el(doc, 'p', { className: 'better-schoology-empty', text: status === 'loading'
      ? 'Loading your grade report…' : status === 'unavailable' ? 'Your grade report could not be loaded.' : 'No graded assignments or feedback available yet.' }));
  } else {
    panel.appendChild(el(doc, 'p', { className: 'better-schoology-panel__note',
      text: 'Available grades from your current report. Schoology does not provide grading dates here.' }));
    panel.appendChild(el(doc, 'ul', { className: 'better-schoology-feedback-list', children: items.slice(0, 5).map((item) => {
      const score = item.percentage !== undefined ? `${item.percentage}%`
        : item.earned !== undefined ? `${item.earned}${item.possible !== undefined ? ` / ${item.possible}` : ''}` : '';
      return el(doc, 'li', { children: [
        el(doc, 'p', { className: 'better-schoology-panel__note', text: item.courseName }),
        item.href ? el(doc, 'a', { text: item.assignmentName, attrs: { href: item.href } }) : el(doc, 'span', { text: item.assignmentName }),
        score ? el(doc, 'strong', { className: 'better-schoology-feedback-score', text: score }) : null,
        item.feedbackPreview ? el(doc, 'p', { className: 'better-schoology-feedback-preview', text: item.feedbackPreview }) : null,
      ] });
    }) }));
  }
  panel.appendChild(el(doc, 'a', { text: 'View grade report', attrs: { href: '/grades/grades' } }));
  return panel;
}

export function renderAnnouncements(doc: Document, items: SchoologyAnnouncement[], onFeed: () => void): HTMLElement {
  const panel = section(doc, 'Announcements');
  panel.dataset.dashboardSection = 'announcements';
  panel.appendChild(items.length ? el(doc, 'ul', { className: 'better-schoology-feedback-list', children: items.map((item) =>
    el(doc, 'li', { children: [
      item.courseHref ? el(doc, 'a', { text: item.courseName, attrs: { href: item.courseHref } }) : el(doc, 'strong', { text: item.courseName }),
      el(doc, 'p', { text: item.preview }),
      item.postedText ? el(doc, 'p', { className: 'better-schoology-panel__note', text: item.postedText }) : null,
    ] })) }) : el(doc, 'p', { className: 'better-schoology-empty', text: 'No updates available in your feed.' }));
  const open = el(doc, 'button', { text: 'Open Feed', attrs: { type: 'button' } });
  open.addEventListener('click', onFeed);
  panel.appendChild(open);
  return panel;
}
