/**
 * Central Schoology selector registry.
 *
 * Seeded from `machine/selectors.json` in the Schoology client reference pack.
 * Every selector here is either a stable ID or a semantic legacy class that
 * native Schoology module code itself depends on.
 *
 * Rules:
 *  - never add a generated/hashed class (`_24avl`, `_1Z0RM`, ...); those are
 *    build artifacts of Schoology's React bundles and change between releases
 *  - never reuse Schoology's own `*-processed` markers for our state
 *  - each entry is an ordered fallback list; the first match wins
 */
export const SGY = {
  notifications: {
    // Only accessible identity is trusted. The captures omit icon labels, so
    // unlabeled controls deliberately produce an unavailable state.
    controls: ['#header button, #header a[href], #header [role="button"]'],
  },
  feedback: {
    comment: ['.comment-column .td-content-wrapper', '.comment-column'],
  },
  announcements: {
    body: ['.update-body'],
    courseLink: ['.update-sentence-inner > a[href^="/course/"]'],
    created: ['.edge-footer .created'],
  },
  navigation: {
    triggers: ['#header [data-sgy-sitenav="nav-trigger"]'],
    groups: ['#header [data-sgy-sitenav="header-groups-menu"] [data-sgy-sitenav="nav-trigger"]'],
    account: ['#header [data-sgy-sitenav="header-my-account-menu"] [data-sgy-sitenav="nav-trigger"]'],
    controlledTriggers: ['#header [aria-controls][aria-haspopup]'],
    /** Ignore hidden instructions, icons and editable content when finding a label. */
    excludedLabelContent: ['[hidden], [aria-hidden="true"], .visually-hidden, svg, img, input, textarea, select, form'],
  },

  shell: {
    header: ['#header'],
    breadcrumbs: ['#site-navigation-breadcrumbs'],
    wrapper: ['#wrapper'],
    container: ['#container'],
    sidebarLeft: ['#sidebar-left'],
    mainContentWrapper: ['#main-content-wrapper'],
    centerTop: ['#center-top'],
    center: ['#center'],
    main: ['#main'],
    mainInner: ['#main-inner'],
    rightColumn: ['#right-column'],
    rightColumnInner: ['#right-column-inner'],
  },

  home: {
    tabs: ['.sgy-tabbed-navigation'],
    feedContainer: ['#home-feed-container'],
    feedList: ['ul.s-edge-feed'],
    feedItem: ['li[id^="edge-assoc-"]'],
    smartBox: ['#smart-box'],
    todo: ['#todo'],
    overdueWrapper: ['.overdue-submissions-wrapper'],
    upcomingWrapper: ['.upcoming-submissions-wrapper'],
    upcomingList: ['.upcoming-list'],
    dateHeader: ['.date-header'],
    upcomingEvent: ['.upcoming-event'],
    eventTitle: ['.event-title'],
    readonlyEventTitle: ['.readonly-title.event-title'],
    eventLink: ['.event-title > a'],
    eventSubtitle: ['.event-subtitle'],
    submissionInfotip: ['.submission-infotip'],
    upcomingEvents: ['#upcoming-events'],
    recentlyCompleted: ['.recently-completed-wrapper'],
    /** Course identity rendered inside a To Do row's tooltip. */
    realmTitleCourse: ['.realm-title-course'],
    realmMainTitles: ['.realm-main-titles'],
    realmBuilding: ['.realm-title-building'],
  },

  course: {
    menu: ['#menu-s-main'],
    materialsLink: ['.course-materials-left-menu'],
    updatesLink: ['.course-updates-left-menu'],
    gradesLink: ['.course-student-grade-left-menu'],
    membersLink: ['.course-member-left-menu'],
    materialsDropdown: ['#course-materials-dropdown'],
    appLink: ['.app-link-wrapper'],
    /**
     * The course's name in `#center-top`, which Schoology renders two ways:
     *
     *  - material/folder *player* pages (folder contents, course grades,
     *    assignment) use a `.course-title` breadcrumb, whose `title` attribute
     *    conveniently holds the unsectioned name;
     *  - course section-root pages (materials, updates) put the name in the
     *    page heading instead.
     *
     * Both are checked, in that order.
     */
    breadcrumbCourseTitle: [
      '#center-top .course-title',
      '#center-top h1.page-title',
    ],
  },

  materials: {
    root: ['#course-profile-materials'],
    toolbar: ['#toolbar-options-wrapper'],
    filterWrapper: ['.s-js-materials-filter-wrapper'],
    foldersBody: ['#course-profile-materials-folders'],
    contentsForm: ['#s-course-materials-folder-contents-form'],
    table: ['#folder-contents-table'],
    folderRow: ['tr.material-row-folder', 'tr[id^="f-"]'],
    materialRow: ['tr[id^="n-"]'],
    assignmentRow: ['.type-assignment'],
    itemInfo: ['.item-info'],
    itemTitle: ['.item-title'],
    itemSubtitle: ['.item-subtitle'],
    folderTitle: ['.folder-title'],
  },

  assignment: {
    pageTitle: ['h1.page-title'],
    gradeHeader: ['.grade-item-header-buttons'],
    gradingGrade: ['.grading-grade'],
    receivedGrade: ['.received-grade'],
    maxPoints: ['.max-points'],
    gradingInfo: ['.grading-info'],
    gradingCategory: ['.grading-category'],
    gradingPeriod: ['.grading-period'],
    details: ['.assignment-details'],
    dueDate: ['.assignment-details .due-date'],
    attachments: ['.attachments'],
    attachmentFile: ['.attachments-file'],
    comments: ['.comment-container'],
    submitWrapper: ['.submit-assignment'],
    submitLink: ['.dropbox-submit'],
    materialNavigator: ['.course-material-navigator'],
  },

  grades: {
    gradebookCourse: ['.gradebook-course'],
    gradebookCourseTitle: ['.gradebook-course-title'],
    gradebookCourseGrades: ['.gradebook-course-grades'],
    report: ['.hierarchical-grading-report'],
    row: ['.report-row'],
    courseRow: ['.course-row'],
    periodRow: ['.period-row'],
    categoryRow: ['.category-row'],
    itemRow: ['.item-row'],
    titleColumn: ['.title-column'],
    title: ['.title'],
    contribution: ['.percentage-contrib'],
    gradeColumn: ['.grade-column'],
    awardedGrade: ['.awarded-grade'],
    roundedGrade: ['.rounded-grade'],
    numericGrade: ['.numeric-grade.primary-grade'],
    maxGrade: ['.max-grade'],
    noGrade: ['.no-grade'],
    dueDate: ['.due-date'],
  },

  calendar: {
    root: ['#fcalendar'],
    header: ['.fc-header'],
    content: ['.fc-content'],
    view: ['.fc-view'],
    event: ['.fc-event'],
    eventTitle: ['.fc-event-title'],
    eventTime: ['.fc-event-time'],
  },

  feed: {
    wrapper: ['.edge-wrapper'],
    courseUpdatesRoot: ['#course-profile-updates'],
    item: ['.edge-item'],
    updateBody: ['.update-body'],
    postBody: ['.post-body'],
    footer: ['.edge-footer'],
  },
} as const;

/** Prefix for every DOM node, class and attribute Better Schoology owns. */
export const BS_PREFIX = 'better-schoology';

/**
 * Our own idempotency marker namespace. Deliberately distinct from Schoology's
 * `sHome-processed` / `sCourse-processed` convention -- stripping or reusing
 * those would break native duplicate-handler protection.
 */
export const BS_ENHANCED_ATTR = 'data-bs-enhanced';
export const BS_OWNED_ATTR = 'data-better-schoology';

/** Resolves the first selector in a fallback list that matches. */
export function queryFirst<T extends Element = HTMLElement>(
  root: ParentNode,
  selectors: readonly string[],
): T | null {
  for (const selector of selectors) {
    const found = root.querySelector<T>(selector);
    if (found) return found;
  }
  return null;
}

/** Resolves all matches for the first selector in the list that matches anything. */
export function queryAll<T extends Element = HTMLElement>(
  root: ParentNode,
  selectors: readonly string[],
): T[] {
  for (const selector of selectors) {
    const found = Array.from(root.querySelectorAll<T>(selector));
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Marks an element as enhanced by a named feature, returning false when it was
 * already marked. Every enhancement must gate on this so repeated passes over
 * the same node -- which Schoology's own AJAX churn guarantees -- are no-ops.
 */
export function markEnhanced(element: Element, feature: string): boolean {
  const existing = element.getAttribute(BS_ENHANCED_ATTR);
  const markers = existing ? existing.split(' ').filter(Boolean) : [];
  if (markers.includes(feature)) return false;

  markers.push(feature);
  element.setAttribute(BS_ENHANCED_ATTR, markers.join(' '));
  return true;
}

export function isEnhanced(element: Element, feature: string): boolean {
  const existing = element.getAttribute(BS_ENHANCED_ATTR);
  return existing ? existing.split(' ').includes(feature) : false;
}

/** Clears a marker so a feature can re-run after being toggled off and on. */
export function clearEnhanced(element: Element, feature: string): void {
  const existing = element.getAttribute(BS_ENHANCED_ATTR);
  if (!existing) return;

  const markers = existing.split(' ').filter((marker) => marker && marker !== feature);
  if (markers.length > 0) element.setAttribute(BS_ENHANCED_ATTR, markers.join(' '));
  else element.removeAttribute(BS_ENHANCED_ATTR);
}
