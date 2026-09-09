/**
 * Visual QA scenes.
 *
 * One entry per thing worth looking at with human eyes: each milestone's main
 * surfaces, in both themes, plus the layouts that break first (narrow widths,
 * very long names, missing data).
 */
const BASE_SETTINGS = {
  enabled: true,
  theme: 'light',
  betterDashboard: true,
  betterTodo: true,
  defaultHomeView: 'dashboard',
  courseCardDensity: 'comfortable',
  showGpaWidget: true,
  showAnnouncements: true,
  compactCourseSwitcher: true,
};

const COURSES = {
  100001: {
    id: '100001',
    originalName: 'Example Government',
    sectionName: '1(A)',
    href: '/course/100001',
    lastSeenAt: 0,
  },
  100002: {
    id: '100002',
    originalName: 'Example Biology',
    sectionName: '2(B)',
    href: '/course/100002',
    lastSeenAt: 0,
  },
  100003: {
    id: '100003',
    originalName: 'Example Algebra',
    sectionName: '3(C)',
    href: '/course/100003',
    lastSeenAt: 0,
  },
};

export function state(overrides = {}) {
  return {
    schemaVersion: 2,
    settings: { ...BASE_SETTINGS, ...(overrides.settings ?? {}) },
    customizations: overrides.customizations ?? {},
    courses: overrides.courses ?? COURSES,
  };
}

const CUSTOMIZED = {
  100001: {
    courseId: '100001',
    customName: 'AP Gov',
    shortName: 'AP Gov',
    accentColor: '#b3261e',
    imageUrl: '/__schoology_assets/course-default.svg',
    pinned: true,
  },
  100002: { courseId: '100002', accentColor: '#15803d' },
};

const COURSE_SCENES = [
  { name: 'course-materials-light', url: '/course/100001/materials' },
  {
    name: 'course-materials-dark',
    url: '/course/100001/materials',
    state: state({ settings: { theme: 'dark' } }),
  },
  {
    name: 'course-materials-apps-open',
    url: '/course/100001/materials',
    click: ['.bs-apps-toggle__button'],
  },
  {
    name: 'course-materials-apps-shown',
    url: '/course/100001/materials',
    state: state({ settings: { appsVisibility: 'show' } }),
  },
  {
    name: 'course-materials-compact',
    url: '/course/100001/materials',
    state: state({ settings: { materialDensity: 'compact' } }),
  },
  { name: 'course-folder', url: '/course/100001/materials?f=500001' },
  {
    name: 'course-folder-customized',
    url: '/course/100001/materials?f=500001',
    state: state({ customizations: CUSTOMIZED }),
  },
  { name: 'assignment-graded', url: '/assignment/200002/info' },
  {
    name: 'assignment-graded-dark',
    url: '/assignment/200002/info',
    state: state({ settings: { theme: 'dark' } }),
  },
  {
    name: 'assignment-ungraded',
    url: '/assignment/200002/info?fixture=ungraded',
  },
  {
    name: 'assignment-narrow',
    url: '/assignment/200002/info',
    viewport: { width: 760, height: 1100 },
  },
];

export const SCENES = [
  { name: 'home-dashboard-light', url: '/home', state: state() },
  {
    name: 'home-dashboard-dark',
    url: '/home',
    state: state({ settings: { theme: 'dark' } }),
  },
  {
    name: 'home-dashboard-customized',
    url: '/home',
    state: state({ customizations: CUSTOMIZED }),
  },
  {
    name: 'home-feed',
    url: '/home',
    state: state(),
    click: ['.bs-tab[data-bs-tab="feed"]'],
  },
  {
    name: 'home-switcher',
    url: '/home',
    state: state(),
    click: ['.bs-switcher__trigger'],
  },
  {
    name: 'home-empty-todo',
    url: '/home?fixture=empty',
    state: state(),
  },
  {
    name: 'home-narrow',
    url: '/home',
    state: state(),
    viewport: { width: 720, height: 1100 },
  },
  {
    name: 'home-mobile',
    url: '/home',
    state: state(),
    viewport: { width: 420, height: 1100 },
  },
  {
    name: 'home-long-names',
    url: '/home',
    state: state({
      customizations: {
        100001: {
          courseId: '100001',
          customName:
            'Example Advanced Interdisciplinary Research Seminar and Capstone Workshop for Graduating Students',
        },
      },
    }),
  },
  ...COURSE_SCENES.map((scene) => ({ state: state(), ...scene })),
];
