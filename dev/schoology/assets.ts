import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * Asset resolver for the fixture server.
 *
 * Fixtures reference `/__schoology_assets/<name>`. Two tiers answer that:
 *
 *  1. **Captured assets**, if the developer has a capture in the gitignored
 *     `.local-schoology/` directory. These are PowerSchool's own icons and
 *     stylesheets, so they are never committed -- but when present locally
 *     they make the reconstruction look almost exactly like real Schoology.
 *  2. **Graceful degradation.** Anything not captured resolves to a 1x1
 *     transparent PNG (for images) or empty CSS, so a missing asset never
 *     breaks a page or fills the console with errors.
 *
 * This is why the reconstruction is useful without a capture and faithful with
 * one, and why the repository can stay clean of third-party assets either way.
 */

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/** 1x1 transparent PNG, used for any image the capture did not include. */
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export interface AssetResolution {
  body: Buffer;
  contentType: string;
  /** True when the bytes came from a real capture rather than a placeholder. */
  captured: boolean;
}

export class AssetResolver {
  private index: Map<string, string> | null = null;

  constructor(private readonly localRoot: string) {}

  /** True when a local capture directory is available. */
  hasCapturedAssets(): boolean {
    return this.buildIndex().size > 0;
  }

  capturedCount(): number {
    return this.buildIndex().size;
  }

  resolve(name: string): AssetResolution {
    const normalized = name.toLowerCase();
    const extension = extname(normalized) || '.png';
    const contentType = MIME[extension] ?? 'application/octet-stream';

    const path = this.buildIndex().get(normalized);
    if (path && existsSync(path)) {
      return { body: readFileSync(path), contentType, captured: true };
    }

    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension)) {
      return { body: TRANSPARENT_PNG, contentType: 'image/png', captured: false };
    }
    if (extension === '.svg') {
      return {
        body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>'),
        contentType: MIME['.svg']!,
        captured: false,
      };
    }
    return { body: Buffer.alloc(0), contentType, captured: false };
  }

  /**
   * Indexes every file in the capture directory by its normalized basename.
   *
   * Saved pages copy the same asset into each `<page>_files` directory with a
   * different four-character suffix, so the suffix is stripped and the first
   * copy of each name wins.
   */
  private buildIndex(): Map<string, string> {
    if (this.index) return this.index;

    const index = new Map<string, string>();
    if (existsSync(this.localRoot)) walk(this.localRoot, index, 0);
    this.index = index;
    return index;
  }
}

function walk(dir: string, index: Map<string, string>, depth: number): void {
  if (depth > 6) return;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(dir, entry);
    let stats;
    try {
      stats = statSync(path);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      walk(path, index, depth + 1);
      continue;
    }

    const normalized = normalizeAssetName(entry);
    if (!index.has(normalized)) index.set(normalized, path);
  }
}

/** Mirrors the sanitizer's asset naming so fixture references line up. */
export function normalizeAssetName(name: string): string {
  const withoutQuery = name.split(/[?#]/)[0] ?? name;
  const cleaned = withoutQuery.replace(/_[A-Za-z0-9]{4}(\.[A-Za-z0-9]+)$/, '$1');
  if (/logo/i.test(cleaned) && !/^logo/i.test(cleaned)) return 'school-logo.png';
  return cleaned.toLowerCase();
}
