import type { BetterSchoologySettings, BetterSchoologyState } from '@/src/types/settings';

/**
 * Bump when the persisted shape changes, and add a matching migration step in
 * `migrateState`. Never reuse a version number.
 *
 *   1  0.0.1  settings + customizations + course registry
 *   2  0.1.0  Better Home settings (default view, density, widgets, switcher)
 *   3  0.2.0  course and assignment settings (apps visibility, material density)
 */
export const CURRENT_SCHEMA_VERSION = 3;

export const DEFAULT_SETTINGS: BetterSchoologySettings = {
  enabled: true,
  theme: 'system',

  betterDashboard: true,
  betterTodo: true,
  defaultHomeView: 'dashboard',
  courseCardDensity: 'comfortable',
  showGpaWidget: true,
  showAnnouncements: true,
  compactCourseSwitcher: true,

  betterCourses: true,
  betterAssignments: true,
  appsVisibility: 'collapse',
  materialDensity: 'comfortable',
};

export function defaultState(): BetterSchoologyState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    customizations: {},
    courses: {},
  };
}
