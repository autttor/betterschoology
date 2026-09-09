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
  compactCourseSwitcher: true,
  betterCourses: true,
  betterAssignments: true,
  appsVisibility: 'collapse',
  materialDensity: 'comfortable',
  betterGrades: true,
  gpaEnabled: true,
};

/** Every rail panel on, which is what a fresh install looks like. */
const DASHBOARD = {
  showTodo: true,
  showNotifications: true,
  showRecentFeedback: true,
  showAnnouncements: true,
  showGpa: true,
  hideHiddenCourseTasks: false,
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
    schemaVersion: 5,
    settings: {
      ...BASE_SETTINGS,
      ...(overrides.settings ?? {}),
      dashboard: { ...DASHBOARD, ...(overrides.settings?.dashboard ?? {}) },
    },
    customizations: overrides.customizations ?? {},
    courses: overrides.courses ?? COURSES,
    // The GPA config is filled in by the migration; only snapshots need seeding,
    // because they are what a real student accumulates by visiting Grades.
    ...(overrides.gradeSnapshots ? { gradeSnapshots: overrides.gradeSnapshots } : {}),
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

const GRADE_SCENES = [
  { name: 'grades-course-light', url: '/course/100001/student_grades' },
  {
    name: 'grades-course-dark',
    url: '/course/100001/student_grades',
    state: state({ settings: { theme: 'dark' } }),
  },
  {
    name: 'grades-course-expanded',
    url: '/course/100001/student_grades',
    click: ['.bs-grade-category__head'],
  },
  {
    name: 'grades-weighted',
    url: '/course/100001/student_grades?fixture=weighted',
    click: ['.bs-grade-category__head'],
  },
  {
    name: 'grades-whatif',
    url: '/course/100001/student_grades',
    click: ['.bs-grades__actions .bs-btn', '.bs-grade-category__head'],
  },
  {
    name: 'grades-calculator',
    url: '/course/100001/student_grades',
    click: ['.bs-grades__actions .bs-btn:nth-child(2)'],
  },
  { name: 'grades-global', url: '/grades/grades' },
  {
    name: 'grades-global-dark',
    url: '/grades/grades',
    state: state({ settings: { theme: 'dark' } }),
  },
  {
    name: 'grades-ungraded',
    url: '/course/100001/student_grades?fixture=ungraded',
  },
];

/**
 * A tenant header stylesheet, reduced to the shape that broke us: ID-based
 * rules that outrank any single class, including Better Schoology's own.
 */
const TENANT_HEADER_CSS = `
  #header button, #header a { background-color: #ffffff; color: #1a1a1a; }
  #header button { border: 1px solid #d0d0d0; border-radius: 3px;
                   font-family: Georgia, serif; text-transform: uppercase; }
  .link-btn { background: #fff; border: 1px solid #c8c8c8; color: #0677ba; }
  .ui-selectmenu { background: #fff; border: 1px solid #c8c8c8; }
`;

/**
 * A portalled Courses menu, in the shape that broke: no ARIA ownership, no
 * semantic roles, tenant-white inline backgrounds, plain divs throughout.
 */
const MEGA_MENU = `
  <div style="position:fixed;top:56px;left:120px;width:640px;padding:16px;
              background:#ffffff;color:#1a1a1a;border:1px solid #d0d0d0;
              box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:9999">
    <div style="background:#ffffff;padding-bottom:8px">
      <input type="search" placeholder="Search courses" style="width:100%;padding:6px;
             background:#ffffff;border:1px solid #c8c8c8;color:#1a1a1a">
    </div>
    <div style="background:#f4f4f4;font-weight:600;padding:6px 0">Fall 2026</div>
    <ul style="list-style:none;margin:0;padding:0;background:#ffffff">
      <li style="background:#ffffff;padding:6px 0">
        <a href="/course/100001" style="color:#0677ba;text-decoration:none">Example Government</a>
      </li>
      <li style="background:#ffffff;padding:6px 0">
        <a href="/course/100002" style="color:#0677ba;text-decoration:none">Example Biology</a>
      </li>
      <li style="background:#ffffff;padding:6px 0">
        <a href="/course/100003" style="color:#0677ba;text-decoration:none">Example Algebra</a>
      </li>
    </ul>
    <hr style="border:0;border-top:1px solid #e0e0e0">
    <a href="/courses" style="color:#0677ba">See all courses</a>
  </div>
`;

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
  ...GRADE_SCENES.map((scene) => ({ state: state(), ...scene })),
  {
    name: 'theme-course-updates-dark',
    url: '/course/100001/updates',
    state: state({ settings: { theme: 'dark' } }),
  },
  {
    name: 'theme-course-updates-light',
    url: '/course/100001/updates',
  },
  {
    name: 'theme-header-switcher-dark',
    url: '/home',
    state: state({ settings: { theme: 'dark' } }),
    click: ['.bs-switcher__trigger'],
  },
  {
    // The regression from the field: a tenant header stylesheet outranking us.
    name: 'theme-header-vs-tenant-css',
    url: '/home',
    state: state({ settings: { theme: 'dark' } }),
    pageCss: TENANT_HEADER_CSS,
    click: ['.bs-switcher__trigger'],
  },
  {
    name: 'theme-course-updates-vs-tenant-css',
    url: '/course/100001/updates',
    state: state({ settings: { theme: 'dark' } }),
    pageCss: TENANT_HEADER_CSS,
  },
  {
    /*
     * The regression the user reported: opening Courses in dark mode showed a
     * white mega-menu. It is React-portalled, carries no `aria-controls`, and
     * is built from plain divs with tenant-white inline styles -- so it is
     * reproduced here exactly that way.
     */
    name: 'theme-courses-mega-menu-dark',
    url: '/home',
    state: state({ settings: { theme: 'dark' } }),
    pageCss: TENANT_HEADER_CSS,
    inject: { expand: '#header [data-sgy-sitenav="nav-trigger"]', html: MEGA_MENU },
  },
  {
    // Every rail panel off: the grid must collapse to one column cleanly
    // rather than leaving a hole where the rail was.
    name: 'home-no-rail',
    url: '/home',
    state: state({
      settings: {
        dashboard: {
          showTodo: true,
          showNotifications: false,
          showRecentFeedback: false,
          showAnnouncements: false,
          showGpa: false,
          hideHiddenCourseTasks: false,
        },
      },
    }),
  },
  {
    name: 'home-gpa-tile',
    url: '/home',
    state: state({
      gradeSnapshots: {
        100001: { courseId: '100001', percentage: 94.2, updatedAt: 1 },
        100002: { courseId: '100002', percentage: 88.4, updatedAt: 1 },
        100003: { courseId: '100003', percentage: 97.1, updatedAt: 1 },
      },
    }),
  },
];
