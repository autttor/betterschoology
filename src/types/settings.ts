import type { CourseCustomization, StoredCourse } from './index';

export type ThemeMode = 'system' | 'light' | 'dark';

/** Which Better Home view opens first. Feed is always reachable. */
export type HomeView = 'dashboard' | 'feed';

/** Shared density scale for course cards and material rows. */
export type Density = 'comfortable' | 'compact';

/** What to do with a course's third-party app links in the left navigation. */
export type AppsVisibility = 'show' | 'collapse' | 'hide';

/** Fast-toggle settings surfaced in the popup, plus the customizer's detail settings. */
export interface BetterSchoologySettings {
  enabled: boolean;
  theme: ThemeMode;

  // ---------------------------------------------------------------- home
  betterDashboard: boolean;
  betterTodo: boolean;
  defaultHomeView: HomeView;
  courseCardDensity: Density;
  showGpaWidget: boolean;
  showAnnouncements: boolean;
  compactCourseSwitcher: boolean;

  // ------------------------------------------------------------- courses
  betterCourses: boolean;
  betterAssignments: boolean;
  appsVisibility: AppsVisibility;
  materialDensity: Density;
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
