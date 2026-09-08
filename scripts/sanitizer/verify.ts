import { entityVariants } from './sanitize';
import type { Registry, SanitizerConfig } from './types';

/**
 * The last line of defence before anything is written to the repository.
 *
 * The rewriter is thorough, but "thorough" is not a guarantee. This scans the
 * finished output for anything that must never be committed and refuses the
 * import outright if it finds any. A failed verification is a build failure,
 * not a warning -- there is no partial success here.
 */
export interface Leak {
  kind: string;
  detail: string;
  /** Surrounding text, itself redacted, purely to locate the problem. */
  context: string;
}

const SECRET_SIGNATURES: Array<{ kind: string; re: RegExp }> = [
  { kind: 'jwt', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./g },
  { kind: 'csrf-token', re: /csrf[_-]?(?:key|token)"?\s*[:=]\s*"[^"]{8,}/gi },
  { kind: 'logout-token', re: /logout_token"?\s*[:=]\s*"[^"]{8,}/gi },
  { kind: 'session-id', re: /\bSESS[a-f0-9]{10,}\b/gi },
  { kind: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._-]{16,}/gi },
  { kind: 'long-hex-digest', re: /\b[A-Fa-f0-9]{32,}\b/g },
  { kind: 'api-key-like', re: /\b[A-Za-z0-9_-]{40,}\b/g },
];

export function verifyNoLeaks(
  html: string,
  registry: Registry,
  config: SanitizerConfig = {},
): Leak[] {
  const leaks: Leak[] = [];

  const push = (kind: string, detail: string, index: number): void => {
    leaks.push({
      kind,
      detail,
      // Never echo the value itself into a log that might be pasted publicly.
      context: html.slice(Math.max(0, index - 40), index + 40).replace(/\s+/g, ' '),
    });
  };

  // 1. Original identifiers must all be gone.
  for (const raw of registry.ids.keys()) {
    const index = html.search(new RegExp(`(?<![0-9])${raw}(?![0-9])`));
    if (index !== -1) push('original-id', `raw identifier still present (${raw.length} digits)`, index);
  }

  /*
   * 2. Original identifying strings must all be gone -- including their
   * HTML-encoded forms. Serialized output re-encodes `&`, so a plain
   * `indexOf` on the raw string alone would miss `Course &amp; Name`.
   */
  for (const raw of registry.strings.keys()) {
    for (const variant of entityVariants(raw)) {
      const index = html.indexOf(variant);
      if (index !== -1) push('original-text', 'registered string still present', index);
    }
  }

  // 3. The captured tenant hostname must be gone.
  for (const host of registry.hosts) {
    const index = html.indexOf(host);
    if (index !== -1) push('capture-host', host, index);
  }

  // 4. Anything the operator explicitly forbade.
  for (const forbidden of config.forbidden ?? []) {
    if (!forbidden.trim()) continue;
    const index = html.toLowerCase().indexOf(forbidden.toLowerCase());
    if (index !== -1) push('forbidden-string', 'operator-configured forbidden string', index);
  }

  // 5. Credential-shaped strings, wherever they came from.
  for (const { kind, re } of SECRET_SIGNATURES) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
      if (isAllowedOpaqueString(match[0])) continue;
      push(kind, `${match[0].length} characters`, match.index);
    }
  }

  return leaks;
}

/**
 * Long strings that are structural rather than secret.
 *
 * Sanitized fixtures legitimately contain long generated class names such as
 * `util-justify-content-space-between-3euFK`. Flagging those would make the
 * check noisy enough that a real leak would be scrolled past.
 *
 * The discriminator is readability: a class name is built from several short
 * dictionary-shaped words, while a credential is one high-entropy run. A
 * base64 or hex token has no such word structure, so it still fails.
 */
function isAllowedOpaqueString(value: string): boolean {
  if (value === 'REDACTED') return true;
  if (/^[0-9]+$/.test(value)) return true;
  return looksLikeCompoundName(value);
}

function looksLikeCompoundName(value: string): boolean {
  const segments = value.split(/[-_]/).filter(Boolean);
  if (segments.length < 3) return false;

  // Short, purely alphabetic segments read as words; long mixed runs do not.
  const wordish = segments.filter((segment) => /^[A-Za-z]{2,15}$/.test(segment));
  return wordish.length >= 3;
}

export function formatLeakReport(leaks: Leak[]): string {
  const byKind = new Map<string, Leak[]>();
  for (const leak of leaks) {
    const list = byKind.get(leak.kind) ?? [];
    list.push(leak);
    byKind.set(leak.kind, list);
  }

  const lines = [`${leaks.length} potential leak(s) found:`];
  for (const [kind, items] of byKind) {
    lines.push(`  ${kind} (${items.length})`);
    for (const item of items.slice(0, 3)) {
      lines.push(`    - ${item.detail}`);
      lines.push(`      near: ...${item.context}...`);
    }
    if (items.length > 3) lines.push(`    ... and ${items.length - 3} more`);
  }
  return lines.join('\n');
}
