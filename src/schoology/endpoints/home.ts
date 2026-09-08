import type { SchoologyTask } from '@/src/types';
import { log } from '@/src/utils/log';
import { parseTaskRows } from '../adapters/todo';

/**
 * Same-origin Home fragment endpoints.
 *
 * These are Schoology's own internal endpoints, called by `s_home` on every
 * Home page load. Better Schoology calls them the same way the page already
 * does -- a plain same-origin `fetch` that rides the browser's existing session
 * cookie. Nothing here reads, copies, stores or transmits credentials: there is
 * no cookie access, no auth header, no token persistence and no login flow.
 *
 * Endpoints and their `{ html }` response envelope are documented in the
 * client reference (`machine/endpoints.json`, confidence: observed source).
 * They are internal and undocumented by PowerSchool, so every caller must have
 * a DOM fallback and must fail open.
 */

export const HOME_ENDPOINTS = {
  overdueSubmissions: '/home/overdue_submissions_ajax',
  upcomingSubmissions: '/home/upcoming_submissions_ajax',
  upcomingEvents: '/home/upcoming_ajax',
  recentlyCompleted: '/home/recently_completed_ajax',
} as const;

export type HomeEndpointKey = keyof typeof HOME_ENDPOINTS;

export interface FragmentResult {
  ok: boolean;
  status: number;
  /** Sanitized failure reason. Never contains a response body. */
  reason?: string;
  html?: string;
}

interface FragmentEnvelope {
  html?: unknown;
}

const REQUEST_TIMEOUT_MS = 8000;

/**
 * Fetches one fragment endpoint.
 *
 * Every failure mode the reference calls out (non-2xx, non-JSON, missing
 * `html`, timeout, network error) resolves to a result object rather than
 * throwing, because the caller's correct response to all of them is identical:
 * leave native Schoology alone.
 */
export async function fetchHomeFragment(
  key: HomeEndpointKey,
  init: { origin?: string; fetchImpl?: typeof fetch } = {},
): Promise<FragmentResult> {
  const fetchImpl = init.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, status: 0, reason: 'fetch-unavailable' };
  }

  const url = `${init.origin ?? ''}${HOME_ENDPOINTS[key]}`;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

  try {
    const response = await fetchImpl(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json, text/javascript, */*' },
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (!response.ok) {
      log.warn(`fragment ${key} responded ${response.status}`);
      return { ok: false, status: response.status, reason: 'http-error' };
    }

    let payload: FragmentEnvelope;
    try {
      payload = (await response.json()) as FragmentEnvelope;
    } catch {
      return { ok: false, status: response.status, reason: 'invalid-json' };
    }

    if (typeof payload.html !== 'string') {
      // A 200 with no `html` is a legitimate empty state, not an error.
      return { ok: true, status: response.status, html: '' };
    }

    return { ok: true, status: response.status, html: payload.html };
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network';
    log.warn(`fragment ${key} failed:`, reason);
    return { ok: false, status: 0, reason };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Parses a fragment's HTML in an isolated document.
 *
 * `DOMParser` is used rather than injecting into the live page so a malformed
 * or unexpected fragment can never disturb native Schoology, and so no scripts
 * inside the fragment are ever executed.
 */
export function parseFragmentTasks(
  html: string,
  status: 'overdue' | 'upcoming',
  parser: DOMParser = new DOMParser(),
): SchoologyTask[] {
  if (!html.trim()) return [];
  const doc = parser.parseFromString(html, 'text/html');
  return parseTaskRows(doc, status);
}

/**
 * Endpoint-first To Do read with an explicit caller-supplied DOM fallback.
 *
 * Returns `null` when neither path produced anything, which callers treat as
 * "leave the native panel alone" rather than "render an empty list".
 */
export async function fetchTasks(
  options: { origin?: string; fetchImpl?: typeof fetch; parser?: DOMParser } = {},
): Promise<{ tasks: SchoologyTask[]; degraded: boolean } | null> {
  const [overdue, upcoming] = await Promise.all([
    fetchHomeFragment('overdueSubmissions', options),
    fetchHomeFragment('upcomingSubmissions', options),
  ]);

  if (!overdue.ok && !upcoming.ok) return null;

  const parser = options.parser ?? (typeof DOMParser !== 'undefined' ? new DOMParser() : undefined);
  if (!parser) return null;

  const tasks: SchoologyTask[] = [
    ...(overdue.ok && overdue.html ? parseFragmentTasks(overdue.html, 'overdue', parser) : []),
    ...(upcoming.ok && upcoming.html ? parseFragmentTasks(upcoming.html, 'upcoming', parser) : []),
  ];

  return { tasks, degraded: !overdue.ok || !upcoming.ok };
}
