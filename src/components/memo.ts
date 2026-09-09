/**
 * Render memoization.
 *
 * Enhancement passes run on every mutation burst Schoology produces, and a
 * pass that rebuilt its component every time would throw away anything the
 * student was in the middle of: an open course switcher, a focused search box,
 * the scroll position of a long list.
 *
 * So each component stamps a signature describing the data it was built from,
 * and rebuilds only when that signature changes. The attribute is deliberately
 * one the lifecycle does not observe, so writing it cannot trigger a pass.
 */
export const SIGNATURE_ATTR = 'data-bs-signature';

export function needsRender(host: Element, signature: string): boolean {
  if (host.getAttribute(SIGNATURE_ATTR) === signature) return false;
  host.setAttribute(SIGNATURE_ATTR, signature);
  return true;
}

/** Forces the next `needsRender` for this host to return true. */
export function invalidate(host: Element): void {
  host.removeAttribute(SIGNATURE_ATTR);
}
