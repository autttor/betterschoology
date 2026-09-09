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
  shell: {
    header: ['#header'],
    breadcrumbs: ['#site-navigation-breadcrumbs'],
    wrapper: ['#wrapper'],
    container: ['#container'],
    sidebarLeft: ['#sidebar-left'],
    mainContentWrapper: ['#main-content-wrapper'],
    centerTop: ['#center-top'],
    /** The page's own heading. Present on most server-rendered surfaces. */
    pageTitle: ['#center-top h1.page-title'],
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
    eventLink: ['.event-title > a'],
    eventSubtitle: ['.event-subtitle'],
    submissionInfotip: ['.submission-infotip'],
    upcomingEvents: ['#upcoming-events'],
    recentlyCompleted: ['.recently-completed-wrapper'],
    /** The empty-state node Schoology renders inside an upcoming list. */
    listEmpty: ['.empty'],
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
    profileLink: ['.course-profile-left-menu'],
    menuItem: ['#menu-s-main .link-wrapper'],
    appsRoot: ['#menu-s-apps'],
    appsList: ['#menu-s-apps-list'],
    appLink: ['.app-link-wrapper'],
    appTitle: ['.app-title'],
    /** The school name Schoology renders above a course page's chrome. */
    schoolName: ['#center-top .school-name'],
    contentTop: ['#center-top .content-top'],
    /** Schoology's own course switcher control on course pages. */
    nativeSwitcher: ['#taught-courses-switcher'],
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
    itemBody: ['.item-body'],
    itemIcon: ['.item-icon'],
    folderTitle: ['.folder-title'],
    folderExpander: ['.folder-expander'],
    folderIcon: ['.folder-icon'],
    /** "Up" link rendered on a folder-contents page. */
    folderUp: ['#toolbar-folder-up'],
    /** Lesson-plan affordance appended to a row's subtitle. */
    lessonPlan: ['.lesson-plan-wrapper'],
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
    /** The whole native submission block in the right rail. */
    dropItems: ['.drop-items'],
    /** Body text Schoology renders for the assignment description. */
    infoText: ['#main-inner .info-container .info-text'],
    postedTime: ['.posted-time'],
    /** Folder breadcrumb rendered in the assignment's own chrome. */
    folderTitle: ['#center-top .folder-title'],
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
    updateSentence: ['.update-sentence-inner'],
    author: ['.long-username'],
    updateBody: ['.update-body'],
    postBody: ['.post-body'],
    footer: ['.edge-footer'],
    created: ['.edge-footer .created'],
  },

  /**
   * The modern PowerSchool header.
   *
   * Everything inside it is a React tree with generated class names, so the
   * only hooks used are the `data-sgy-sitenav` attributes Schoology's own
   * navigation code sets. Better Schoology reads them to find an anchor point;
   * it never rewrites, hides or rebinds a native header control.
   */
  header: {
    root: ['#header'],
    navList: ['#header nav ul'],
    navTrigger: ['#header [data-sgy-sitenav="nav-trigger"]'],
    groupsMenu: ['#header [data-sgy-sitenav="header-groups-menu"]'],
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

/** Clears a feature's markers everywhere, so a revert leaves no trace at all. */
export function clearEnhancedAll(root: ParentNode, feature: string): void {
  for (const element of Array.from(root.querySelectorAll(`[${BS_ENHANCED_ATTR}]`))) {
    clearEnhanced(element, feature);
  }
}

/**
 * Removes classes and drops an emptied `class` attribute.
 *
 * `classList.remove` leaves `class=""` behind. That is inert, but Better
 * Schoology's promise is that turning it off returns the page to exactly what
 * Schoology rendered -- including its markup.
 */
export function dropClasses(element: Element, ...names: string[]): void {
  element.classList.remove(...names);
  if (element.classList.length === 0) element.removeAttribute('class');
}
