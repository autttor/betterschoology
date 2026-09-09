import type { AppsVisibility } from '@/src/types/settings';
import type { CourseApp } from '@/src/schoology/adapters/courseNav';
import { binder, button, findOwned, icon, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { dropClasses } from '@/src/schoology/selectors';
import { ICONS } from '@/src/components/icons';

/**
 * Third-party app links in the course sidebar.
 *
 * A course can carry a dozen installed apps above the fold, pushing Materials
 * and Grades off the screen. Better Courses collapses that list behind a
 * disclosure button by default.
 *
 * Nothing about the apps themselves changes: no URL is rewritten, no handler is
 * rebound, no element is cloned or moved. The list is hidden with a class and
 * the button toggles it, so "Show apps" restores exactly what Schoology
 * rendered.
 */
export const APPS_COLLAPSED_CLASS = 'bs-apps-collapsed';
export const APPS_HIDDEN_CLASS = 'bs-apps-hidden';
const COMPONENT_NAME = 'course-apps-toggle';

/** Per-page-load expansion state. A momentary preference, not a setting. */
let expanded = false;

export function setAppsExpanded(value: boolean): void {
  expanded = value;
}

export function areAppsExpanded(): boolean {
  return expanded;
}

export function applyAppsVisibility(
  doc: Document,
  root: HTMLElement,
  list: HTMLElement,
  apps: CourseApp[],
  visibility: AppsVisibility,
  onToggle: () => void,
): void {
  if (visibility === 'hide') root.classList.add(APPS_HIDDEN_CLASS);
  else dropClasses(root, APPS_HIDDEN_CLASS);

  if (visibility !== 'collapse' || apps.length === 0) {
    removeOwned(root, COMPONENT_NAME);
    dropClasses(list, APPS_COLLAPSED_CLASS);
    return;
  }

  if (expanded) dropClasses(list, APPS_COLLAPSED_CLASS);
  else list.classList.add(APPS_COLLAPSED_CLASS);
  list.id ||= 'bs-course-apps-list';

  const host =
    findOwned(root, COMPONENT_NAME) ??
    ownedRoot(doc, 'div', COMPONENT_NAME, { className: 'better-schoology bs-apps-toggle' });

  const e = binder(doc);
  replaceChildren(host, [
    button(doc, {
      className: 'bs-apps-toggle__button',
      attrs: { 'aria-expanded': String(expanded), 'aria-controls': list.id },
      children: [
        icon(doc, expanded ? ICONS.chevronDown : ICONS.chevronRight, 'bs-icon bs-icon--sm'),
        e('span', { text: `Apps (${apps.length})` }),
      ],
      onClick: () => {
        setAppsExpanded(!expanded);
        onToggle();
      },
    }),
  ]);

  if (!host.isConnected) root.insertBefore(host, list);
}

export function revertApps(doc: Document): void {
  removeOwned(doc, COMPONENT_NAME);
  for (const node of Array.from(
    doc.querySelectorAll(`.${APPS_COLLAPSED_CLASS}, .${APPS_HIDDEN_CLASS}`),
  )) {
    dropClasses(node, APPS_COLLAPSED_CLASS, APPS_HIDDEN_CLASS);
  }
  setAppsExpanded(false);
}
