import type { CourseCustomization, StoredCourse } from './index';

export type ThemeMode = 'system' | 'light' | 'dark';

/** Which Better Home view opens first. Feed is always reachable. */
export type HomeView = 'dashboard' | 'feed';

/** Shared density scale for course cards and material rows. */
export type Density = 'comfortable' | 'compact';

/** What to do with a course's third-party app links in the left navigation. */
export type AppsVisibility = 'show' | 'collapse' | 'hide';

/** Student-chosen names for Schoology's own header navigation. */
export interface NavLabelCustomization {
  courses?: string;
  groups?: string;
  resources?: string;
  gradeReport?: string;
}

/**
 * Which panels the dashboard shows.
 *
 * Every panel toggle lives here rather than beside the feature flags: they are
 * one kind of decision ("what belongs on my dashboard"), and splitting them
 * across two levels is how the same setting ends up existing twice.
 */
export interface DashboardSettings {
  showTodo: boolean;
  showNotifications: boolean;
  showRecentFeedback: boolean;
  showAnnouncements: boolean;
  showGpa: boolean;
  hideHiddenCourseTasks: boolean;
}

/** The rotating dashboard heading. Entirely cosmetic, entirely optional. */
export interface SplashSettings {
  enabled: boolean;
  contextual: boolean;
  holidays: boolean;
  easterEggs: boolean;
}

/** Fast-toggle settings surfaced in the popup, plus the customizer's detail settings. */
export interface BetterSchoologySettings {
  enabled: boolean;
  theme: ThemeMode;

  // ---------------------------------------------------------------- home
  betterDashboard: boolean;
  betterTodo: boolean;
  defaultHomeView: HomeView;
  courseCardDensity: Density;
  compactCourseSwitcher: boolean;

  // ------------------------------------------------------------- courses
  betterCourses: boolean;
  betterAssignments: boolean;
  appsVisibility: AppsVisibility;
  materialDensity: Density;

  // -------------------------------------------------------------- grades
  betterGrades: boolean;
  gpaEnabled: boolean;

  // ------------------------------------------------------ personalization
  displayNameOverride?: string;
  applyDisplayNameToSchoologyHeader: boolean;
  navLabels: NavLabelCustomization;
  dashboard: DashboardSettings;
  splash: SplashSettings;
}

/**
 * Nested patches preserve sibling toggles.
 *
 * A caller that flips one dashboard panel must not have to resend the other
 * four, and an undefined text field clears its override rather than storing an
 * empty string.
 */
export type SettingsPatch = Partial<
  Omit<BetterSchoologySettings, 'navLabels' | 'dashboard' | 'splash'>
> & {
  navLabels?: NavLabelCustomization;
  dashboard?: Partial<DashboardSettings>;
  splash?: Partial<SplashSettings>;
};

/** A To Do row the student chose not to see. */
export interface HiddenTask {
  /** Stable assignment/event identity, never just its title. */
  id: string;
  title: string;
  href?: string;
}

/** One band of a student-configurable grading scale. */
export interface GradeBand {
  /** Letter shown for this band, e.g. `A-`. */
  letter: string;
  /** Inclusive lower bound, as a percentage. */
  minPercentage: number;
  /** Grade points this band is worth before any boost. */
  points: number;
}

/**
 * Per-course GPA inputs the student controls.
 *
 * Schoology supplies none of these. Credits in particular are a local default
 * of 1.0 per course, not a value read from anywhere, and the UI says so.
 */
export interface CourseGpaSettings {
  /** Excluded courses still show their grade; they just do not count. */
  included?: boolean;
  credits?: number;
  /** Extra grade points for an honors/AP course, e.g. 1.0. */
  boost?: number;
}

/**
 * GPA configuration.
 *
 * Deliberately a separate top-level record rather than part of `settings`: it
 * is structured student data with its own sanitizer, and it must survive every
 * future settings change untouched.
 */
export interface GpaConfig {
  scale: GradeBand[];
  /** Named boost presets the student can apply to a course. */
  boosts: { honors: number; ap: number };
  /** Per-course overrides, keyed by Schoology course ID. */
  courses: Record<string, CourseGpaSettings>;
}

/**
 * A course grade Better Schoology has seen.
 *
 * Deliberately the smallest thing that makes the GPA widget work away from the
 * grades page: a course ID, one percentage and when it was read. No assignment
 * titles, no individual scores, no comments -- none of which the widget needs,
 * and all of which would be a much more sensitive thing to keep.
 */
export interface CourseGradeSnapshot {
  courseId: string;
  percentage: number;
  /** Epoch ms of the read. */
  updatedAt: number;
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
  /** Local GPA configuration. Never derived from Schoology. */
  gpa: GpaConfig;
  /** Course-level percentages, so the GPA widget works off the grades page. */
  gradeSnapshots: Record<string, CourseGradeSnapshot>;
  /** To Do rows the student dismissed. */
  hiddenTasks: Record<string, HiddenTask>;
  /** Most recently displayed splash IDs, oldest first, limited to ten. */
  splashHistory: string[];
}
