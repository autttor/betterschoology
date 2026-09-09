import type { HomeAnnouncement } from '@/src/types';
import type { BetterSchoologyState } from '@/src/types/settings';
import { binder } from '@/src/components/dom';
import { emptyState, panel } from '@/src/components/ui';

/**
 * The announcements panel.
 *
 * Announcements are *information*, not action items, so they get a small panel
 * rather than the centre of the page, and they never enter the To Do list.
 * Each entry links back to the native feed item rather than re-hosting the post
 * -- Schoology renders attachments, polls, comments and rich text, and a
 * summary that tried to reproduce all of that would be lying by omission.
 */
const EXCERPT_LENGTH = 140;

export function renderAnnouncements(
  doc: Document,
  announcements: HomeAnnouncement[],
  state: BetterSchoologyState,
  options: { limit?: number; onViewAll?: () => void } = {},
): HTMLElement {
  const e = binder(doc);
  const limit = options.limit ?? 4;
  const shown = announcements.slice(0, limit);

  const body =
    shown.length > 0
      ? [
          e('ul', {
            className: 'bs-announcements',
            children: shown.map((announcement) => renderAnnouncement(doc, announcement, state)),
          }),
        ]
      : [emptyState(doc, 'No recent announcements.')];

  return panel(
    doc,
    {
      title: 'Announcements',
      icon: 'megaphone',
      headingLevel: 'h3',
      className: 'bs-announcements-panel',
      subtitle:
        announcements.length > shown.length
          ? `Showing ${shown.length} of ${announcements.length}`
          : undefined,
    },
    body,
  );
}

function renderAnnouncement(
  doc: Document,
  announcement: HomeAnnouncement,
  state: BetterSchoologyState,
): HTMLElement {
  const e = binder(doc);

  // A custom course name applies here because the feed post carries a real
  // `/course/<id>` link, so the course identity is proven rather than guessed.
  const customization = announcement.courseId
    ? state.customizations[announcement.courseId]
    : undefined;
  const courseName =
    customization?.shortName?.trim() || customization?.customName?.trim() || announcement.courseName;

  const meta = [announcement.author, courseName].filter(Boolean).join(' · ');

  return e('li', {
    className: 'bs-announcement',
    ...(announcement.courseId ? { attrs: { 'data-bs-course-id': announcement.courseId } } : {}),
    children: [
      e('div', {
        className: 'bs-announcement__head',
        children: [
          e('span', { className: 'bs-announcement__meta', text: meta }),
          announcement.createdText
            ? e('span', { className: 'bs-announcement__time', text: announcement.createdText })
            : null,
        ],
      }),
      announcement.excerpt
        ? e('p', { className: 'bs-announcement__excerpt', text: truncate(announcement.excerpt) })
        : null,
      announcement.href
        ? e('a', {
            className: 'bs-announcement__link',
            text: 'Read in feed',
            attrs: { href: announcement.href },
          })
        : null,
    ],
  });
}

/** Trims on a word boundary so an excerpt never ends mid-word. */
export function truncate(text: string, length = EXCERPT_LENGTH): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= length) return clean;

  const cut = clean.slice(0, length);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
