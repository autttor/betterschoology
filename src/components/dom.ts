import { BS_OWNED_ATTR } from '@/src/schoology/selectors';

/**
 * Tiny DOM builders for Better Schoology's own components.
 *
 * Content-script UI is built with plain DOM rather than React on purpose: the
 * page already runs jQuery, Drupal behaviors, React, PDS and Neon, and adding
 * another framework runtime to every Schoology page would be a lot of weight
 * for a handful of nodes. React is used in the popup and options pages, where
 * it owns the whole document.
 *
 * Text is always set through `textContent`, never `innerHTML`, so course names
 * and task titles cannot smuggle markup into the page.
 */
export interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: Array<Node | null | undefined>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);

  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;

  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }

  for (const child of options.children ?? []) {
    if (child) node.appendChild(child);
  }

  return node;
}

/**
 * A document-bound `el`, so render code reads as `e('div', { ... })` instead of
 * repeating the document on every line.
 */
export function binder(doc: Document) {
  return function bound<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: ElementOptions = {},
  ): HTMLElementTagNameMap[K] {
    return el(doc, tag, options);
  };
}

export type Bound = ReturnType<typeof binder>;

/**
 * A button with a click handler, created in one step.
 *
 * Always a real `<button type="button">`: Better Schoology never ships a
 * click-only `div`, because a div is invisible to the keyboard and to screen
 * readers.
 */
export function button(
  doc: Document,
  options: ElementOptions & { onClick?: (event: MouseEvent) => void } = {},
): HTMLButtonElement {
  const { onClick, ...rest } = options;
  const node = el(doc, 'button', {
    ...rest,
    attrs: { type: 'button', ...(rest.attrs ?? {}) },
  });
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

/**
 * An inline SVG icon.
 *
 * Path data is supplied by Better Schoology's own icon table, never by page
 * content, and is written with `setAttribute` rather than `innerHTML`.
 */
export function icon(doc: Document, path: string, className = 'bs-icon'): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);

  const node = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  node.setAttribute('d', path);
  svg.appendChild(node);
  return svg;
}

/** Root of a Better Schoology component, tagged so it can be found and removed. */
export function ownedRoot<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  name: string,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = el(doc, tag, options);
  node.setAttribute(BS_OWNED_ATTR, name);
  return node;
}

/** Finds a previously created owned root by name. */
export function findOwned(root: ParentNode, name: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${BS_OWNED_ATTR}="${name}"]`);
}

/** Removes every owned root with a given name. Used when a feature is turned off. */
export function removeOwned(root: ParentNode, name: string): void {
  for (const node of Array.from(root.querySelectorAll(`[${BS_OWNED_ATTR}="${name}"]`))) {
    node.remove();
  }
}

/**
 * Moves a native Schoology element into one of our containers, reversibly.
 *
 * This is how Better Schoology reorganizes a page without rebuilding it: the
 * real element -- with every handler Schoology bound to it -- is relocated, and
 * where it came from is recorded so `restoreNative` can put it back exactly.
 *
 * Elements containing an `<iframe>` are refused. Reparenting an iframe reloads
 * its document, which would wipe an in-progress rich-text submission, and no
 * layout improvement is worth that.
 */
export const NATIVE_HOME_ATTR = 'data-bs-native-home';

const homes = new Map<string, { parent: Node; next: Node | null }>();
let homeCount = 0;

export function canMoveNative(element: Element): boolean {
  return element.querySelector('iframe') === null;
}

export function moveNative(element: HTMLElement, target: Element): boolean {
  if (element.parentElement === target) return true;
  if (!canMoveNative(element)) return false;

  if (!element.hasAttribute(NATIVE_HOME_ATTR)) {
    const key = `bs-home-${(homeCount += 1)}`;
    const parent = element.parentNode;
    if (!parent) return false;
    homes.set(key, { parent, next: element.nextSibling });
    element.setAttribute(NATIVE_HOME_ATTR, key);
  }

  target.appendChild(element);
  return true;
}

/** Puts a moved element back where Schoology had it. */
export function restoreNative(element: Element): void {
  const key = element.getAttribute(NATIVE_HOME_ATTR);
  if (!key) return;

  const home = homes.get(key);
  element.removeAttribute(NATIVE_HOME_ATTR);
  homes.delete(key);
  if (!home) return;

  try {
    home.parent.insertBefore(element, home.next && home.next.parentNode === home.parent ? home.next : null);
  } catch {
    // A home that no longer exists (Schoology replaced the fragment) leaves the
    // element where it is rather than throwing; the page stays usable.
  }
}

/** Restores every element this document moved. Used when a feature reverts. */
export function restoreAllNative(root: ParentNode): void {
  for (const element of Array.from(root.querySelectorAll(`[${NATIVE_HOME_ATTR}]`))) {
    restoreNative(element);
  }
}

/** Replaces a node's children in one step. */
export function replaceChildren(node: Element, children: Array<Node | null | undefined>): void {
  while (node.firstChild) node.removeChild(node.firstChild);
  for (const child of children) {
    if (child) node.appendChild(child);
  }
}
