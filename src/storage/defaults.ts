import type { BetterSchoologySettings, BetterSchoologyState } from '@/src/types/settings';

/**
 * Bump when the persisted shape changes, and add a matching migration step in
 * `migrateState`. Never reuse a version number.
 */
export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: BetterSchoologySettings = {
  enabled: true,
  theme: 'system',
  betterDashboard: false,
  betterTodo: true,
};

export function defaultState(): BetterSchoologyState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    customizations: {},
    courses: {},
  };
}
