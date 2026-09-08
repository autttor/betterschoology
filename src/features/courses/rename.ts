/**
 * Reversible display-text replacement.
 *
 * Only the text node carrying the course name is rewritten. The element, its
 * `href`, its classes and every handler Schoology bound to it are untouched --
 * this is a display override, not a rename, and navigation must keep working
 * exactly as before.
 *
 * The original text is stashed on the element so the change can be undone when
 * the student clears the override or disables Better Schoology.
 */
export const ORIGINAL_TEXT_ATTR = 'data-bs-original-text';
export const ORIGINAL_TITLE_ATTR = 'data-bs-original-title';

/** Longest direct text node of an element, i.e. its own visible label. */
function primaryTextNode(element: Element): Text | null {
  let best: Text | null = null;

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType !== 3) continue;
    const text = node as Text;
    if (!(text.textContent ?? '').trim()) continue;
    if (!best || (text.textContent ?? '').length > (best.textContent ?? '').length) best = text;
  }

  return best;
}

/**
 * Replaces an element's own label text.
 *
 * Returns false when there is no text node to replace, which is the signal to
 * skip this surface rather than restructure it.
 */
export function setDisplayText(element: HTMLElement, nextText: string): boolean {
  const node = primaryTextNode(element);
  if (!node) return false;

  const current = node.textContent ?? '';
  if (current.trim() === nextText.trim()) return true;

  if (!element.hasAttribute(ORIGINAL_TEXT_ATTR)) {
    element.setAttribute(ORIGINAL_TEXT_ATTR, current);

    // Keep the name Schoology gave the course reachable on hover, so a student
    // who renamed a course can still tell which one it is.
    const existingTitle = element.getAttribute('title');
    element.setAttribute(ORIGINAL_TITLE_ATTR, existingTitle ?? '');
    element.setAttribute('title', current.trim());
  }

  node.textContent = nextText;
  return true;
}

/** Restores whatever `setDisplayText` replaced. Safe to call unconditionally. */
export function restoreDisplayText(element: HTMLElement): void {
  const original = element.getAttribute(ORIGINAL_TEXT_ATTR);
  if (original === null) return;

  const node = primaryTextNode(element);
  if (node) node.textContent = original;

  const originalTitle = element.getAttribute(ORIGINAL_TITLE_ATTR);
  if (originalTitle) element.setAttribute('title', originalTitle);
  else element.removeAttribute('title');

  element.removeAttribute(ORIGINAL_TEXT_ATTR);
  element.removeAttribute(ORIGINAL_TITLE_ATTR);
}
