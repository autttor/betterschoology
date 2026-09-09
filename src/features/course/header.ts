import type { ResolvedCourse } from '@/src/types';
import type { CourseNavLink } from '@/src/schoology/adapters/courseNav';
import { binder, icon } from '@/src/components/dom';
import { ICONS } from '@/src/components/icons';
import { decorativeCourseAccent, safeImageUrl } from '@/src/utils/url';

/**
 * The Better course header.
 *
 * One line that answers "which course am I in, and where can I go": the name
 * the student chose, Schoology's own name underneath it, and the course's core
 * pages as a compact nav.
 *
 * The native left menu is left in place and untouched. This is an additional,
 * clearer path to the same hrefs -- if it fails to render, every native link
 * is still exactly where Schoology put it.
 */
export interface CourseHeaderData {
  course: ResolvedCourse;
  nav: CourseNavLink[];
}

export function renderCourseHeader(doc: Document, data: CourseHeaderData): HTMLElement {
  const e = binder(doc);
  const { course } = data;

  const header = e('div', {
    className: 'bs-course-header',
    attrs: { 'data-bs-course-id': course.id },
  });
  header.style.setProperty(
    '--bs-course-accent',
    course.accentColor ?? decorativeCourseAccent(course.id),
  );

  const image = safeImageUrl(course.displayImageUrl);
  if (image) {
    const badge = e('span', {
      className: 'bs-course-header__image',
      attrs: { 'aria-hidden': 'true' },
    });
    badge.style.backgroundImage = `url("${encodeURI(image)}")`;
    header.appendChild(badge);
  }

  /*
   * Schoology's own school-name link stays where it is on the page, so it is
   * deliberately not repeated here -- the subtitle carries only what our
   * header replaced: the original course name (when renamed) and the section.
   */
  const subtitleParts = [
    course.displayName !== course.originalName ? course.originalName : '',
    course.sectionName,
  ].filter(Boolean) as string[];

  header.appendChild(
    e('div', {
      className: 'bs-course-header__identity',
      children: [
        e('h1', { className: 'bs-course-header__name', text: course.displayName }),
        subtitleParts.length > 0
          ? e('p', {
              className: 'bs-course-header__subtitle',
              text: subtitleParts.join(' · '),
            })
          : null,
      ],
    }),
  );

  if (data.nav.length > 0) {
    header.appendChild(
      e('nav', {
        className: 'bs-course-header__nav',
        attrs: { 'aria-label': 'Course sections' },
        children: data.nav.map((link) =>
          e('a', {
            className: `bs-course-nav-link${link.active ? ' is-active' : ''}`,
            // Schoology's own href, copied verbatim from the native menu item.
            attrs: { href: link.href, ...(link.active ? { 'aria-current': 'page' } : {}) },
            children: [
              icon(doc, NAV_ICONS[link.kind] ?? ICONS.book, 'bs-icon bs-icon--sm'),
              e('span', { text: link.label }),
            ],
          }),
        ),
      }),
    );
  }

  return header;
}

const NAV_ICONS: Record<string, string> = {
  materials: ICONS.book,
  updates: ICONS.megaphone,
  grades: ICONS.chart,
  members: ICONS.check,
};
