import type { BetterSchoologySettings, BetterSchoologyState } from '@/src/types/settings';

/**
 * Bump when the persisted shape changes, and add a matching migration step in
 * `migrateState`. Never reuse a version number.
 */
export const CURRENT_SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: BetterSchoologySettings = {
  enabled: true,
  theme: 'system',
  betterDashboard: false,
  betterTodo: true,
  applyDisplayNameToSchoologyHeader: false,
  navLabels: {},
  dashboard: {
    showTodo: true,
    showNotifications: true,
    showRecentFeedback: true,
    showAnnouncements: false,
    hideHiddenCourseTasks: false,
  },
  splash: { enabled: true, contextual: true, holidays: true, easterEggs: true },
};

export function defaultState(): BetterSchoologyState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: {
      ...DEFAULT_SETTINGS,
      navLabels: { ...DEFAULT_SETTINGS.navLabels },
      dashboard: { ...DEFAULT_SETTINGS.dashboard },
      splash: { ...DEFAULT_SETTINGS.splash },
    },
    customizations: {},
    courses: {},
    hiddenTasks: {},
    splashHistory: [],
  };
}
