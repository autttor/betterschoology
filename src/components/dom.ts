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

/** Replaces a node's children in one step. */
export function replaceChildren(node: Element, children: Array<Node | null | undefined>): void {
  while (node.firstChild) node.removeChild(node.firstChild);
  for (const child of children) {
    if (child) node.appendChild(child);
  }
}
