/**
 * URL handling for student-supplied values.
 *
 * Course image URLs are typed by the student and are treated as untrusted
 * strings: they are rendered as image sources and nothing else. `javascript:`,
 * `data:` and every other scheme is rejected rather than sanitized, because a
 * rejected image is a cosmetic failure while an executed one is not.
 */
const ALLOWED_IMAGE_PROTOCOLS = new Set(['https:', 'http:']);

export function isSafeImageUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    return ALLOWED_IMAGE_PROTOCOLS.has(url.protocol);
  } catch {
    // Relative URLs (Schoology's own asset paths) are resolved against the page.
    return trimmed.startsWith('/') && !trimmed.startsWith('//');
  }
}

/** Returns the URL when it is safe to use as an image source, otherwise undefined. */
export function safeImageUrl(value: string | undefined | null): string | undefined {
  return isSafeImageUrl(value) ? value!.trim() : undefined;
}

/**
 * Accepts `#rgb`, `#rrggbb` and `#rrggbbaa`. Colors are interpolated into CSS
 * custom properties, so anything looser would allow declaration injection.
 */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isSafeCssColor(value: string | undefined | null): boolean {
  return typeof value === 'string' && HEX_COLOR.test(value.trim());
}

export function safeCssColor(value: string | undefined | null): string | undefined {
  return isSafeCssColor(value) ? value!.trim().toLowerCase() : undefined;
}
