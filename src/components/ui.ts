import type { ElementOptions } from './dom';
import { binder, button, el, icon } from './dom';
import { ICONS, type IconName } from './icons';

/**
 * Better Schoology's shared visual vocabulary.
 *
 * One place decides what a panel, a section heading, a pill and a tab bar look
 * like, so Home, Courses and Grades read as one product rather than three
 * separately-styled features. Everything here is plain DOM: the content script
 * deliberately ships no framework runtime (see `components/dom.ts`).
 */

export interface PanelOptions {
  title?: string;
  /** Small muted line under the title. */
  subtitle?: string;
  /** Controls rendered on the right of the header row. */
  actions?: Array<Node | null | undefined>;
  icon?: IconName;
  className?: string;
  headingLevel?: 'h2' | 'h3';
  /** Rendered in `aria-label` when the panel has no visible title. */
  label?: string;
}

/** A titled card. The building block for every Better Schoology surface. */
export function panel(
  doc: Document,
  options: PanelOptions,
  children: Array<Node | null | undefined>,
): HTMLElement {
  const e = binder(doc);
  const heading = options.headingLevel ?? 'h2';

  const titleGroup = options.title
    ? e('div', {
        className: 'bs-panel__titles',
        children: [
          e(heading, {
            className: 'bs-panel__title',
            children: [
              options.icon ? icon(doc, ICONS[options.icon], 'bs-icon bs-panel__icon') : null,
              e('span', { text: options.title }),
            ],
          }),
          options.subtitle ? e('p', { className: 'bs-panel__subtitle', text: options.subtitle }) : null,
        ],
      })
    : null;

  const header =
    titleGroup || (options.actions && options.actions.length > 0)
      ? e('div', {
          className: 'bs-panel__head',
          children: [
            titleGroup,
            options.actions && options.actions.length > 0
              ? e('div', { className: 'bs-panel__actions', children: options.actions })
              : null,
          ],
        })
      : null;

  return e('section', {
    className: ['bs-panel', options.className].filter(Boolean).join(' '),
    ...(options.label && !options.title ? { attrs: { 'aria-label': options.label } } : {}),
    children: [header, e('div', { className: 'bs-panel__body', children })],
  });
}

export type PillTone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success';

/** A small status chip. Text plus tone -- never colour alone. */
export function pill(doc: Document, text: string, tone: PillTone = 'neutral'): HTMLElement {
  return el(doc, 'span', { className: `bs-pill bs-pill--${tone}`, text });
}

/** Muted explanatory line, used for every "calculated by Better Schoology" note. */
export function note(doc: Document, text: string, className = ''): HTMLElement {
  return el(doc, 'p', { className: `bs-note ${className}`.trim(), text });
}

export function emptyState(doc: Document, text: string, hint?: string): HTMLElement {
  const e = binder(doc);
  return e('div', {
    className: 'bs-empty',
    children: [
      e('p', { className: 'bs-empty__text', text }),
      hint ? e('p', { className: 'bs-empty__hint', text: hint }) : null,
    ],
  });
}

export interface TabDefinition<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
}

/**
 * A keyboard-operable tab bar.
 *
 * Implements the ARIA tabs pattern: one tab stop for the whole bar, arrow keys
 * to move, Home/End to jump. This is what makes the Dashboard/Feed switch
 * usable without a mouse.
 */
export function tabs<T extends string>(
  doc: Document,
  definitions: ReadonlyArray<TabDefinition<T>>,
  active: T,
  onSelect: (id: T) => void,
  label: string,
): HTMLElement {
  const e = binder(doc);
  const buttons: HTMLButtonElement[] = [];

  const focusAt = (index: number): void => {
    const next = buttons[(index + buttons.length) % buttons.length];
    next?.focus();
    next?.click();
  };

  definitions.forEach((definition, index) => {
    const selected = definition.id === active;
    const node = button(doc, {
      className: 'bs-tab',
      attrs: {
        role: 'tab',
        'aria-selected': String(selected),
        tabindex: selected ? '0' : '-1',
        'data-bs-tab': definition.id,
      },
      children: [
        definition.icon ? icon(doc, ICONS[definition.icon], 'bs-icon bs-tab__icon') : null,
        e('span', { text: definition.label }),
      ],
      onClick: () => onSelect(definition.id),
    });

    node.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') focusAt(index + 1);
      else if (event.key === 'ArrowLeft') focusAt(index - 1);
      else if (event.key === 'Home') focusAt(0);
      else if (event.key === 'End') focusAt(definitions.length - 1);
      else return;
      event.preventDefault();
    });

    buttons.push(node);
  });

  return e('div', {
    className: 'bs-tabs',
    attrs: { role: 'tablist', 'aria-label': label },
    children: buttons,
  });
}

/** A text link styled as one of our own controls, pointing at a native href. */
export function linkButton(
  doc: Document,
  text: string,
  href: string,
  options: ElementOptions = {},
): HTMLAnchorElement {
  return el(doc, 'a', {
    ...options,
    className: ['bs-link-btn', options.className].filter(Boolean).join(' '),
    text,
    attrs: { href, ...(options.attrs ?? {}) },
  });
}
