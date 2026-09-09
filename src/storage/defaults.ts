import type {
  BetterSchoologySettings,
  BetterSchoologyState,
  GpaConfig,
  GradeBand,
} from '@/src/types/settings';

/**
 * Bump when the persisted shape changes, and add a matching migration step in
 * `migrateState`. Never reuse a version number.
 *
 *   1  0.0.1  settings + customizations + course registry
 *   2  0.1.0  Better Home settings (default view, density, widgets, switcher)
 *   3  0.2.0  course and assignment settings (apps visibility, material density)
 *   4  0.3.0  grade settings and the local GPA configuration
 */
export const CURRENT_SCHEMA_VERSION = 4;

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

  betterGrades: true,
  gpaEnabled: true,
};

/**
 * A common unweighted 4.0 mapping, used only as a starting point.
 *
 * Schools differ: different letter boundaries, 5.0 ceilings, weighted scales,
 * schools that do not use letters at all. Schoology exposes none of this, so
 * the scale is fully editable and every surface that uses it says where the
 * number came from.
 */
export const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { letter: 'A', minPercentage: 93, points: 4 },
  { letter: 'A-', minPercentage: 90, points: 3.7 },
  { letter: 'B+', minPercentage: 87, points: 3.3 },
  { letter: 'B', minPercentage: 83, points: 3 },
  { letter: 'B-', minPercentage: 80, points: 2.7 },
  { letter: 'C+', minPercentage: 77, points: 2.3 },
  { letter: 'C', minPercentage: 73, points: 2 },
  { letter: 'C-', minPercentage: 70, points: 1.7 },
  { letter: 'D+', minPercentage: 67, points: 1.3 },
  { letter: 'D', minPercentage: 63, points: 1 },
  { letter: 'D-', minPercentage: 60, points: 0.7 },
  { letter: 'F', minPercentage: 0, points: 0 },
];

export function defaultGpaConfig(): GpaConfig {
  return {
    scale: DEFAULT_GRADE_SCALE.map((band) => ({ ...band })),
    boosts: { honors: 0.5, ap: 1 },
    courses: {},
  };
}

export function defaultState(): BetterSchoologyState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    customizations: {},
    courses: {},
    gpa: defaultGpaConfig(),
    gradeSnapshots: {},
  };
}
