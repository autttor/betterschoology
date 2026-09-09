import { BS_OWNED_ATTR, SGY, queryAll, queryFirst } from '../selectors';

export type NavigationLabelKey = 'courses' | 'groups' | 'resources' | 'gradeReport';
export interface NativeNavigationLabel {
  key: NavigationLabelKey;
  element: HTMLElement;
  node: Text;
}

/** A single visible text node is safe to edit without replacing native nodes. */
export function visibleLabelNode(element: Element): Text | null {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const candidates: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data.trim() || node.parentElement?.closest(SGY.navigation.excludedLabelContent[0])) continue;
    candidates.push(node);
  }
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

/** Read only the current account trigger, never authors, forms or profile pages. */
export function readHeaderDisplayName(doc: Document): { element: HTMLElement; node: Text } | null {
  const element = queryFirst<HTMLElement>(doc, SGY.navigation.account);
  const node = element && visibleLabelNode(element);
  return element && node ? { element, node } : null;
}

export function readNavigationLabels(
  doc: Document,
  originalLabel: (element: HTMLElement, node: Text) => string = (_element, node) => node.data,
): NativeNavigationLabel[] {
  const group = queryFirst(doc, SGY.navigation.groups);
  const found: NativeNavigationLabel[] = [];
  for (const element of queryAll<HTMLElement>(doc, SGY.navigation.triggers)) {
    const node = visibleLabelNode(element);
    if (!node) continue;
    const href = element.getAttribute('href');
    let path: string | undefined;
    if (href) {
      try {
        const url = new URL(href, doc.baseURI);
        if (url.origin === new URL(doc.baseURI).origin) path = url.pathname.replace(/\/$/, '');
      } catch { /* Invalid native links are left untouched. */ }
    }
    const label = originalLabel(element, node).trim();
    const key = element === group ? 'groups'
      : path === '/resources' ? 'resources'
        : path === '/grades/grades' ? 'gradeReport'
          // The captured Courses button has no identity beyond nav-trigger and
          // its visible label. Do not infer an index among unlabelled buttons.
          : label === 'Courses' && element.tagName === 'BUTTON' ? 'courses' : undefined;
    if (key) found.push({ key, element, node });
  }
  return found;
}

/**
 * Is this an open menu, rather than a hidden one or an empty portal root?
 *
 * `checkVisibility` is the accurate answer when a layout engine is present.
 * The content test that follows it is the one that does the real work: an open
 * menu always offers something to click, and Schoology's always-present
 * singleton/overlay containers never do.
 */
/**
 * `instanceof HTMLElement` is realm-bound and silently false for a node from
 * another document -- which is what a portalled overlay can be, and what every
 * fixture in the tests is. `nodeType` is not.
 */
function asElement(node: Node): HTMLElement | null {
  return node.nodeType === 1 ? (node as HTMLElement) : null;
}

function isOpenPanel(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return false;
  if (element.style.display === 'none' || element.style.visibility === 'hidden') return false;
  if (typeof element.checkVisibility === 'function' && !element.checkVisibility()) return false;
  return element.querySelector('a[href], button, [role="menuitem"], [role="option"], input') !== null;
}

/**
 * The header menus Schoology is currently showing.
 *
 * Three strategies, in order of how much Schoology tells us:
 *
 *  1. `aria-controls` / `aria-owns` on the trigger. Unambiguous, so it is used
 *     whenever it is there -- but the captured header does not set it.
 *  2. The menu rendered inside the trigger's own nav item. React headers
 *     commonly render the panel as a sibling of the button.
 *  3. A rendered element outside the page shell, while a header trigger is
 *     open -- a portalled overlay. Only reached when a trigger is actually
 *     expanded, so nothing is marked on a page with no menu open.
 *
 * None of these reads a generated class name, and every one of them requires
 * the element to be painted, so empty singleton containers are never marked.
 */
export function readHeaderPopovers(doc: Document): HTMLElement[] {
  const found = new Set<HTMLElement>();

  for (const trigger of queryAll(doc, SGY.navigation.controlledTriggers)) {
    for (const attribute of ['aria-controls', 'aria-owns'] as const) {
      for (const id of (trigger.getAttribute(attribute) ?? '').split(/\s+/)) {
        const controlled = id && doc.getElementById(id);
        if (controlled) found.add(controlled);
      }
    }
  }

  const open = queryAll<HTMLElement>(doc, SGY.navigation.expandedTriggers);
  if (open.length === 0) return [...found];

  // (2) The panel rendered beside the button, inside the same nav item.
  for (const trigger of open) {
    const item = trigger.closest('li');
    if (!item) continue;
    for (const child of Array.from(item.children)) {
      const candidate = asElement(child);
      if (!candidate || candidate === trigger || candidate.contains(trigger)) continue;
      if (isOpenPanel(candidate)) found.add(candidate);
    }
  }

  // (3) The portalled panel: outside the page shell, and never our own UI.
  const shell = [
    queryFirst(doc, SGY.shell.wrapper),
    queryFirst(doc, SGY.shell.header),
    queryFirst(doc, SGY.shell.mainContentWrapper),
  ].filter((element): element is HTMLElement => element !== null);

  for (const child of Array.from(doc.body?.children ?? [])) {
    const candidate = asElement(child);
    if (!candidate) continue;
    if (shell.some((root) => candidate === root || candidate.contains(root))) continue;
    if (candidate.hasAttribute(BS_OWNED_ATTR) || candidate.querySelector(`[${BS_OWNED_ATTR}]`)) continue;
    if (isOpenPanel(candidate)) found.add(candidate);
  }

  return [...found];
}
