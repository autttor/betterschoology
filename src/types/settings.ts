import type { CourseCustomization, StoredCourse } from './index';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface NavLabelCustomization {
  courses?: string;
  groups?: string;
  resources?: string;
  gradeReport?: string;
}

export interface DashboardSettings {
  showTodo: boolean;
  showNotifications: boolean;
  showRecentFeedback: boolean;
  showAnnouncements: boolean;
  hideHiddenCourseTasks: boolean;
}

export interface SplashSettings {
  enabled: boolean;
  contextual: boolean;
  holidays: boolean;
  easterEggs: boolean;
}

/** Local presentation settings, shared by the popup and customizer. */
export interface BetterSchoologySettings {
  enabled: boolean;
  theme: ThemeMode;
  betterDashboard: boolean;
  betterTodo: boolean;
  displayNameOverride?: string;
  applyDisplayNameToSchoologyHeader: boolean;
  navLabels: NavLabelCustomization;
  dashboard: DashboardSettings;
  splash: SplashSettings;
}

/** Nested patches preserve sibling toggles. Undefined text clears an override. */
export type SettingsPatch = Partial<Omit<BetterSchoologySettings, 'navLabels' | 'dashboard' | 'splash'>> & {
  navLabels?: NavLabelCustomization;
  dashboard?: Partial<DashboardSettings>;
  splash?: Partial<SplashSettings>;
};

export interface HiddenTask {
  /** Stable assignment/event identity, never just its title. */
  id: string;
  title: string;
  href?: string;
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
  hiddenTasks: Record<string, HiddenTask>;
  /** Most recently displayed IDs, oldest first, limited to ten. */
  splashHistory: string[];
}
