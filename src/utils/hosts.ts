/**
 * Host authorization lives here and nowhere else.
 *
 * Page *routing* is a separate concern (see `src/schoology/router.ts`) and is
 * derived from `location.pathname` alone, so the adapter behaves identically on
 * `https://district.schoology.com/course/100001/materials` and on
 * `http://localhost:4173/course/100001/materials`.
 */

/** Hosts the production extension is allowed to enhance. */
export const SCHOOLOGY_HOST_MATCHES = ['*://*.schoology.com/*'] as const;

/** Port the local Schoology fixture server listens on (`npm run schoology:dev`). */
export const FIXTURE_SERVER_PORT = 4173;

/** Development-only hosts, added to the manifest for dev builds only. */
export const FIXTURE_HOST_MATCHES = [
  `http://localhost:${FIXTURE_SERVER_PORT}/*`,
  `http://127.0.0.1:${FIXTURE_SERVER_PORT}/*`,
] as const;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** True for a real Schoology-hosted tenant such as `district.schoology.com`. */
export function isSchoologyHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'schoology.com' || host.endsWith('.schoology.com');
}

/** True for the local fixture server. Only meaningful in development builds. */
export function isLocalFixtureHost(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * Single place that answers "may Better Schoology enhance this page?".
 *
 * `allowDevelopmentHosts` defaults to the build mode so production builds can
 * never be talked into enhancing localhost, while `npm run dev` can.
 */
export function isDevelopmentSchoologyHost(
  hostname: string,
  allowDevelopmentHosts: boolean,
): boolean {
  return allowDevelopmentHosts && isLocalFixtureHost(hostname);
}

export function isSupportedSchoologyHost(
  hostname: string,
  allowDevelopmentHosts: boolean,
): boolean {
  return isSchoologyHost(hostname) || isDevelopmentSchoologyHost(hostname, allowDevelopmentHosts);
}
