import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRegistry } from '@/scripts/sanitizer/types';
import { entityVariants, replaceAll, replaceIdsIn, sanitizePage } from '@/scripts/sanitizer/sanitize';
import { verifyNoLeaks } from '@/scripts/sanitizer/verify';

const FIXTURE_ROOT = resolve(import.meta.dirname, 'fixtures', 'schoology');

function registryWith(
  ids: Record<string, string> = {},
  strings: Record<string, string> = {},
  hosts: string[] = [],
) {
  const registry = createRegistry();
  for (const [raw, synthetic] of Object.entries(ids)) {
    registry.ids.set(raw, synthetic);
    registry.kinds.set(raw, 'other');
  }
  for (const [raw, replacement] of Object.entries(strings)) registry.strings.set(raw, replacement);
  for (const host of hosts) registry.hosts.add(host);
  return registry;
}

describe('identifier remapping', () => {
  it('replaces IDs consistently and never merges adjacent digits', () => {
    const registry = registryWith({ '1234567890': '100001', '1234567891': '200001' });

    expect(replaceIdsIn('/course/1234567890/materials', registry)).toBe('/course/100001/materials');
    expect(replaceIdsIn('n-1234567891', registry)).toBe('n-200001');
    // A longer number that merely contains a mapped one must be left alone.
    expect(replaceIdsIn('11234567890999', registry)).toBe('11234567890999');
  });
});

describe('string replacement', () => {
  it('replaces longest matches first', () => {
    const registry = registryWith({}, {
      'Example Government': 'Course A',
      'Example Government: 1(A)': 'Course A: 9(Z)',
    });

    expect(replaceAll('Example Government: 1(A)', registry)).toBe('Course A: 9(Z)');
  });

  /** Saved pages contain double-encoded attribute values. */
  it('matches HTML-entity encoded variants', () => {
    const registry = registryWith({}, { 'Math & Science': 'Example Course' });

    expect(replaceAll('Math &amp; Science', registry)).toBe('Example Course');
    expect(replaceAll('Math &amp;amp; Science', registry)).toBe('Example Course');
  });

  it('enumerates the encoding variants of a string', () => {
    expect(entityVariants('A & B')).toEqual(['A & B', 'A &amp; B', 'A &amp;amp; B']);
  });

  it('redacts credential-shaped values', () => {
    const registry = createRegistry();
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop';

    expect(replaceAll(jwt, registry)).toBe('REDACTED');
    expect(replaceAll('c4e731f7bf81265c9ff6dd0dd5c6b3a1', registry)).toBe('REDACTED');
  });
});

describe('page sanitization', () => {
  const page = `<!doctype html><html><head>
      <title>Real Course | Schoology</title>
      <style>.a{color:red}</style>
      <link rel="stylesheet" href="page_files/theme.css">
      <script>jQuery.extend(Drupal.settings, {"s_common":{"csrf_token":"secret-token-value-here"}});</script>
    </head><body>
      <svg><symbol id="icon"><path d="M15 17v1H5v-1h10z"/></symbol></svg>
      <div id="menu-s-main"><a href="https://district.schoology.com/course/1234567890">Real Course: 5(A)</a></div>
      <div class="update-body"><p>Announcement naming a real student.</p></div>
      <a class="doc" href="/link?a=123&amp;path=https%3A%2F%2Fthird-party.example%2Fdoc" title="Private doc title">link</a>
      <img src="page_files/logo_9sNy.png" alt="Real Course">
    </body></html>`;

  const registry = registryWith(
    { '1234567890': '100001' },
    { 'Real Course': 'Example Course', '5(A)': '1(A)' },
    ['district.schoology.com'],
  );

  const output = sanitizePage(page, { registry, title: 'Example Course', route: '/course/100001' });

  it('removes captured scripts, styles and inline SVG artwork', () => {
    // The only script left is the fixture server's own bootstrap shim.
    expect(output).not.toContain('Drupal.settings');
    expect(output).not.toContain('csrf_token');
    expect(output).not.toContain('secret-token-value-here');
    expect(output).not.toContain('<style');
    expect(output).not.toContain('<symbol');
    expect(output).toContain('/__bs_fixture/bootstrap.js');
  });

  it('rewrites the tenant host to a root-relative path', () => {
    expect(output).not.toContain('district.schoology.com');
    expect(output).toContain('href="/course/100001"');
  });

  it('remaps identifiers and identifying strings', () => {
    expect(output).not.toContain('1234567890');
    expect(output).not.toContain('Real Course');
    expect(output).toContain('Example Course');
  });

  it('replaces user-written prose and the attributes that mirror it', () => {
    expect(output).not.toContain('Announcement naming a real student');
    expect(output).not.toContain('Private doc title');
  });

  it('drops query parameters the router does not read', () => {
    // Schoology's /link redirect embeds a whole third-party document URL.
    expect(output).not.toContain('third-party.example');
  });

  it('preserves the structure the extension parses', () => {
    expect(output).toContain('id="menu-s-main"');
    expect(output).toContain('class="update-body"');
    expect(output).toContain('/__schoology_assets/');
  });

  it('passes its own verification', () => {
    expect(verifyNoLeaks(output, registry)).toEqual([]);
  });
});

describe('leak verification', () => {
  it('flags a surviving identifier', () => {
    const registry = registryWith({ '1234567890': '100001' });
    const leaks = verifyNoLeaks('<a href="/course/1234567890">x</a>', registry);

    expect(leaks.some((leak) => leak.kind === 'original-id')).toBe(true);
  });

  it('flags a surviving name and a surviving host', () => {
    const registry = registryWith({}, { 'Jane Doe': 'Test Student' }, ['district.schoology.com']);
    const leaks = verifyNoLeaks('<p>Jane Doe at district.schoology.com</p>', registry);

    expect(leaks.some((leak) => leak.kind === 'original-text')).toBe(true);
    expect(leaks.some((leak) => leak.kind === 'capture-host')).toBe(true);
  });

  it('flags credential-shaped strings', () => {
    const leaks = verifyNoLeaks(
      'token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signaturevalue',
      createRegistry(),
    );

    expect(leaks.some((leak) => leak.kind === 'jwt')).toBe(true);
  });

  /** Generated CSS class names must not drown out real findings. */
  it('does not flag long generated class names', () => {
    const html = '<div class="util-justify-content-space-between-3euFK CustomBrandingLogo-vertical-strip-background-color-3_NIE"></div>';
    expect(verifyNoLeaks(html, createRegistry())).toEqual([]);
  });

  it('honours operator-configured forbidden strings', () => {
    const leaks = verifyNoLeaks('<p>Springfield High</p>', createRegistry(), {
      forbidden: ['springfield high'],
    });

    expect(leaks.some((leak) => leak.kind === 'forbidden-string')).toBe(true);
  });
});

/**
 * A standing guard on the committed fixtures themselves.
 *
 * The sanitizer runs on a developer's machine against a private capture; this
 * runs in CI against what actually landed in the repository. It is the check
 * that would catch a fixture committed by hand, or a sanitizer regression that
 * slipped through locally.
 */
describe('committed fixtures contain no private data', () => {
  const files = [
    ...readdirSync(join(FIXTURE_ROOT, 'pages')).map((name) => join(FIXTURE_ROOT, 'pages', name)),
    ...readdirSync(join(FIXTURE_ROOT, 'api')).map((name) => join(FIXTURE_ROOT, 'api', name)),
  ];

  it.each(files.map((file) => [file.split('/').slice(-2).join('/'), file]))(
    '%s has no credential-shaped values',
    (_label, file) => {
      const contents = readFileSync(file, 'utf8');
      const leaks = verifyNoLeaks(contents, createRegistry());

      expect(leaks, leaks.map((leak) => `${leak.kind}: ${leak.detail}`).join('\n')).toEqual([]);
    },
  );

  it('uses only synthetic identifiers in Schoology object URLs', () => {
    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      const objectIds = Array.from(
        contents.matchAll(/\/(?:course|assignment|user|school|attachment)\/(\d+)/g),
      ).map((match) => Number(match[1]));

      for (const id of objectIds) {
        // Synthetic IDs live in the 100001-999999 range the sanitizer allocates.
        expect(id, `unexpected identifier ${id} in ${file}`).toBeLessThan(1_000_000);
        expect(id).toBeGreaterThanOrEqual(100_000);
      }
    }
  });

  it('references no tenant Schoology host', () => {
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/https?:\/\/[a-z0-9-]+\.schoology\.com/i);
    }
  });
});
