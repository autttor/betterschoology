/**
 * Console logging, prefixed and quiet in production.
 *
 * Diagnostics must never include Schoology runtime auth material. Log route
 * kinds, counts and selector hits -- not response bodies, tokens or names.
 */
const PREFIX = '[Better Schoology]';

let enabled = false;

export function setLoggingEnabled(value: boolean): void {
  enabled = value;
}

export function isLoggingEnabled(): boolean {
  return enabled;
}

export const log = {
  info(...args: unknown[]): void {
    if (enabled) console.info(PREFIX, ...args);
  },
  warn(...args: unknown[]): void {
    if (enabled) console.warn(PREFIX, ...args);
  },
  /** Errors are always reported: a silent failure is worse than a noisy one. */
  error(...args: unknown[]): void {
    console.error(PREFIX, ...args);
  },
};
