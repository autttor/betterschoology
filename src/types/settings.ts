import type { CourseCustomization, StoredCourse } from './index';

export type ThemeMode = 'system' | 'light' | 'dark';

/** Fast-toggle settings surfaced in the popup. */
export interface BetterSchoologySettings {
  enabled: boolean;
  theme: ThemeMode;
  betterDashboard: boolean;
  betterTodo: boolean;
}

/**
 * The complete persisted shape.
 *
 * `schemaVersion` exists so future releases can migrate rather than reset. Any
 * change to the stored shape must bump it and add a migration step.
 */
export interface BetterSchoologyState {
  schemaVersion: number;
  settings: BetterSchoologySettings;
  /** Course customizations keyed by Schoology course ID. */
  customizations: Record<string, CourseCustomization>;
  /** Courses Better Schoology has seen, so the customizer can list them offline. */
  courses: Record<string, StoredCourse>;
}
