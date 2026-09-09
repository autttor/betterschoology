import { SGY, queryAll, queryFirst } from '../selectors';

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

/** ARIA ownership covers portalled menus without guessing generated class names. */
export function readHeaderPopovers(doc: Document): HTMLElement[] {
  const found = new Set<HTMLElement>();
  for (const trigger of queryAll(doc, SGY.navigation.controlledTriggers)) {
    for (const id of (trigger.getAttribute('aria-controls') ?? '').split(/\s+/)) {
      const controlled = id && doc.getElementById(id);
      if (controlled) found.add(controlled);
    }
  }
  return [...found];
}
