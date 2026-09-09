import type { ResolvedCourse } from '@/src/types';
import { binder, button, icon } from '@/src/components/dom';
import { ICONS } from '@/src/components/icons';
import { decorativeCourseAccent } from '@/src/utils/url';

/**
 * The compact course switcher.
 *
 * Schoology's own Courses menu renders a grid of large cards; this is the same
 * information as a searchable list you can drive from the keyboard. It never
 * replaces or disables the native menu -- the native trigger stays exactly
 * where Schoology put it and keeps working, so if this control fails to mount
 * nothing is lost.
 *
 * Keyboard model:
 *   Enter/Space/ArrowDown on the trigger  open, focus the search box
 *   ArrowDown / ArrowUp                   move through results
 *   Enter                                 follow the focused course
 *   Escape                                close, focus returns to the trigger
 */
export interface CourseSwitcherOptions {
  /** Locally hidden courses are omitted unless the student searches for one. */
  courses: ResolvedCourse[];
  onCustomize?: () => void;
  /** Route for the "all courses" link. Defaults to Schoology's course dashboard. */
  allCoursesHref?: string;
  label?: string;
}

export interface CourseSwitcher {
  root: HTMLElement;
  trigger: HTMLButtonElement;
  panel: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

let switcherCount = 0;

export function renderCourseSwitcher(
  doc: Document,
  options: CourseSwitcherOptions,
): CourseSwitcher {
  const e = binder(doc);
  const id = `bs-course-switcher-${(switcherCount += 1)}`;

  const trigger = button(doc, {
    className: 'bs-switcher__trigger',
    attrs: {
      'aria-expanded': 'false',
      'aria-haspopup': 'true',
      'aria-controls': id,
    },
    children: [
      icon(doc, ICONS.book, 'bs-icon bs-icon--sm'),
      e('span', { text: options.label ?? 'My courses' }),
      icon(doc, ICONS.chevronDown, 'bs-icon bs-icon--sm bs-switcher__chevron'),
    ],
  });

  const search = e('input', {
    className: 'bs-switcher__search',
    attrs: {
      type: 'search',
      placeholder: 'Search courses…',
      'aria-label': 'Search courses',
      autocomplete: 'off',
    },
  });

  const list = e('ul', {
    className: 'bs-switcher__list',
    attrs: { role: 'listbox', 'aria-label': 'Courses' },
  });

  const empty = e('p', { className: 'bs-switcher__empty', text: 'No matching courses.' });
  empty.hidden = true;

  const footer = e('div', {
    className: 'bs-switcher__footer',
    children: [
      e('a', {
        className: 'bs-switcher__footer-link',
        text: 'View all courses',
        attrs: { href: options.allCoursesHref ?? '/home/course-dashboard' },
      }),
      options.onCustomize
        ? button(doc, {
            className: 'bs-switcher__footer-link',
            text: 'Customize courses',
            onClick: () => options.onCustomize?.(),
          })
        : null,
    ],
  });

  const panel = e('div', {
    className: 'bs-switcher__panel',
    attrs: { id, role: 'group', 'aria-label': 'Course switcher' },
    children: [
      e('div', {
        className: 'bs-switcher__search-wrap',
        children: [icon(doc, ICONS.search, 'bs-icon bs-icon--sm'), search],
      }),
      list,
      empty,
      footer,
    ],
  });
  panel.hidden = true;

  const root = e('div', { className: 'bs-switcher', children: [trigger, panel] });

  // ------------------------------------------------------------- rendering
  const visible = options.courses.filter((course) => !course.hidden);

  const rowFor = (course: ResolvedCourse): HTMLElement =>
    e('li', {
      className: 'bs-switcher__item',
      attrs: { role: 'none' },
      children: [
        e('a', {
          className: 'bs-switcher__link',
          // Always Schoology's own course href.
          attrs: { href: course.href, role: 'option', tabindex: '-1' },
          children: [
            course.pinned
              ? icon(doc, ICONS.star, 'bs-icon bs-icon--sm bs-switcher__pin')
              : e('span', { className: 'bs-switcher__pin-space', attrs: { 'aria-hidden': 'true' } }),
            e('span', { className: 'bs-switcher__accent', attrs: { 'aria-hidden': 'true' } }),
            e('span', {
              className: 'bs-switcher__labels',
              children: [
                e('span', { className: 'bs-switcher__name', text: course.displayShortName }),
                course.sectionName
                  ? e('span', { className: 'bs-switcher__section', text: course.sectionName })
                  : null,
              ],
            }),
          ],
        }),
      ],
    });

  const rows = new Map<HTMLElement, ResolvedCourse>();

  const paint = (query: string): void => {
    const needle = query.trim().toLowerCase();
    // A search reaches hidden courses too: hiding is a tidiness preference,
    // not an attempt to make a course unreachable.
    const pool = needle ? options.courses : visible;
    const matches = pool.filter((course) =>
      !needle ||
      course.displayName.toLowerCase().includes(needle) ||
      course.displayShortName.toLowerCase().includes(needle) ||
      course.originalName.toLowerCase().includes(needle) ||
      (course.sectionName ?? '').toLowerCase().includes(needle),
    );

    while (list.firstChild) list.removeChild(list.firstChild);
    rows.clear();

    for (const course of matches) {
      const row = rowFor(course);
      const link = row.querySelector<HTMLElement>('.bs-switcher__link');
      link?.style.setProperty(
        '--bs-course-accent',
        course.accentColor ?? decorativeCourseAccent(course.id),
      );
      if (link) rows.set(link, course);
      list.appendChild(row);
    }

    empty.hidden = matches.length > 0;
  };

  paint('');

  // ------------------------------------------------------------- behaviour
  const links = (): HTMLElement[] => Array.from(rows.keys());

  const moveFocus = (delta: number): void => {
    const items = links();
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === doc.activeElement);
    const next = current === -1 ? (delta > 0 ? 0 : items.length - 1) : current + delta;
    items[(next + items.length) % items.length]?.focus();
  };

  const isOpen = (): boolean => !panel.hidden;

  const close = (focusTrigger = true): void => {
    if (!isOpen()) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (focusTrigger) trigger.focus();
  };

  const open = (): void => {
    if (isOpen()) return;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    search.value = '';
    paint('');
    search.focus();
  };

  trigger.addEventListener('click', () => (isOpen() ? close() : open()));
  trigger.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open();
    }
  });

  search.addEventListener('input', () => paint(search.value));
  search.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  list.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') moveFocus(1);
    else if (event.key === 'ArrowUp') moveFocus(-1);
    else if (event.key === 'Escape') close();
    else if (event.key === 'Home') links()[0]?.focus();
    else if (event.key === 'End') links().at(-1)?.focus();
    else return;
    event.preventDefault();
  });

  // Clicking anywhere else closes the panel, but never steals the click.
  root.addEventListener('focusout', () => {
    // `relatedTarget` is null when focus leaves the document entirely; only a
    // move to a node outside the switcher should close it.
    setTimeout(() => {
      if (isOpen() && !root.contains(doc.activeElement)) close(false);
    }, 0);
  });

  return { root, trigger, panel, open, close: () => close(), isOpen };
}
