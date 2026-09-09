import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageArea } from '@/src/storage';
import {
  clearGradeSnapshots,
  loadState,
  hideTask,
  restoreTask,
  rememberSplash,
  resetSplashHistory,
  recordCourses,
  recordGradeSnapshots,
  resetCustomization,
  updateCourseGpa,
  updateCustomization,
  updateGpaConfig,
  updateSettings,
} from '@/src/storage';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS, defaultState } from '@/src/storage/defaults';
import { migrateState } from '@/src/storage/migrations';
import { findCourseIdByName, resolveAllCourses, resolveCourse } from '@/src/storage/courses';
import { isSafeCssColor, isSafeImageUrl, safeImageUrl } from '@/src/utils/url';

/** In-memory stand-in for `browser.storage.local`. */
function memoryArea(initial: Record<string, unknown> = {}): StorageArea {
  const data = { ...initial };
  return {
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items) {
      Object.assign(data, items);
    },
  };
}

describe('migrations', () => {
  it('returns defaults for empty storage', () => {
    expect(migrateState(undefined)).toEqual(defaultState());
    expect(migrateState(null)).toEqual(defaultState());
    expect(migrateState('nonsense')).toEqual(defaultState());
  });

  /**
   * The rule that matters: adding a setting must never cost a student their
   * course customizations.
   */
  it('fills in a newly added setting without touching customizations', () => {
    const legacy = {
      schemaVersion: 1,
      settings: { enabled: true, theme: 'dark' },
      customizations: { '100001': { courseId: '100001', customName: 'AP Gov' } },
      courses: {},
    };

    const migrated = migrateState(legacy);

    expect(migrated.settings.theme).toBe('dark');
    expect(migrated.settings.betterTodo).toBe(DEFAULT_SETTINGS.betterTodo);
    expect(migrated.customizations['100001']!.customName).toBe('AP Gov');
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  /**
   * The 0.0.1 -> 0.1.0 step. A student upgrading keeps every override and every
   * toggle they had set; the new Home settings simply appear with defaults.
   */
  it('migrates a 0.0.1 record to the Better Home schema', () => {
    const v1 = {
      schemaVersion: 1,
      settings: { enabled: true, theme: 'dark', betterDashboard: false, betterTodo: true },
      customizations: {
        '100001': { courseId: '100001', customName: 'AP Gov', accentColor: '#123456', pinned: true },
      },
      courses: {
        '100001': { id: '100001', originalName: 'Example Government', href: '/course/100001' },
      },
    };

    const migrated = migrateState(v1);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // Explicit choices survive, including one that differs from the new default.
    expect(migrated.settings.betterDashboard).toBe(false);
    expect(migrated.settings.theme).toBe('dark');
    // New settings arrive at their defaults rather than as undefined.
    expect(migrated.settings.defaultHomeView).toBe(DEFAULT_SETTINGS.defaultHomeView);
    expect(migrated.settings.courseCardDensity).toBe(DEFAULT_SETTINGS.courseCardDensity);
    expect(migrated.settings.dashboard.showAnnouncements).toBe(
      DEFAULT_SETTINGS.dashboard.showAnnouncements,
    );
    expect(migrated.settings.compactCourseSwitcher).toBe(DEFAULT_SETTINGS.compactCourseSwitcher);
    // And nothing the student customized is touched.
    expect(migrated.customizations['100001']).toEqual(v1.customizations['100001']);
    expect(migrated.courses['100001']!.originalName).toBe('Example Government');
  });

  /** The 0.2.0 -> 0.3.0 step: GPA configuration appears, nothing is lost. */
  it('migrates a 0.2.0 record to the grades schema', () => {
    const v3 = {
      schemaVersion: 3,
      settings: { enabled: true, theme: 'dark', appsVisibility: 'hide' },
      customizations: { '100001': { courseId: '100001', customName: 'AP Gov' } },
      courses: {
        '100001': { id: '100001', originalName: 'Example Government', href: '/course/100001' },
      },
    };

    const migrated = migrateState(v3);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.settings.appsVisibility).toBe('hide');
    expect(migrated.customizations['100001']!.customName).toBe('AP Gov');
    // The GPA config arrives fully populated, with a usable default scale.
    expect(migrated.gpa.scale.length).toBeGreaterThan(0);
    expect(migrated.gpa.scale.some((band) => band.minPercentage === 0)).toBe(true);
    expect(migrated.gpa.courses).toEqual({});
    expect(migrated.gradeSnapshots).toEqual({});
  });

  it('keeps a grading scale exactly as the student edited it', () => {
    const custom = [
      { letter: 'A', minPercentage: 85, points: 5 },
      { letter: 'F', minPercentage: 0, points: 0 },
    ];

    const migrated = migrateState({
      gpa: { scale: custom, boosts: { honors: 1, ap: 2 }, courses: { '100001': { credits: 0.5 } } },
    });

    expect(migrated.gpa.scale).toEqual(custom);
    expect(migrated.gpa.boosts).toEqual({ honors: 1, ap: 2 });
    expect(migrated.gpa.courses['100001']).toEqual({ credits: 0.5 });
  });

  it('falls back to the default scale rather than an unusable one', () => {
    const migrated = migrateState({ gpa: { scale: [{ letter: '', points: 'x' }] } });
    expect(migrated.gpa.scale.length).toBeGreaterThan(1);
  });

  it('stores only a percentage per course, and drops anything else', () => {
    const migrated = migrateState({
      gradeSnapshots: {
        '100001': { courseId: '100001', percentage: 91.5, updatedAt: 5, assignments: ['secret'] },
        notACourse: { percentage: 50 },
        '100002': { courseId: '100002' },
      },
    });

    expect(migrated.gradeSnapshots['100001']).toEqual({
      courseId: '100001',
      percentage: 91.5,
      updatedAt: 5,
    });
    expect(migrated.gradeSnapshots['notACourse']).toBeUndefined();
    expect(migrated.gradeSnapshots['100002']).toBeUndefined();
  });

  it('rejects an unknown enum value rather than storing it', () => {
    const migrated = migrateState({
      settings: { defaultHomeView: 'kanban', courseCardDensity: 'enormous' },
    });

    expect(migrated.settings.defaultHomeView).toBe(DEFAULT_SETTINGS.defaultHomeView);
    expect(migrated.settings.courseCardDensity).toBe(DEFAULT_SETTINGS.courseCardDensity);
  });

  it('discards malformed entries instead of crashing', () => {
    const migrated = migrateState({
      settings: { theme: 'neon', enabled: 'yes' },
      customizations: { notACourse: { customName: 'x' }, '100001': 'nope' },
      courses: { '100002': { originalName: '' } },
    });

    expect(migrated.settings.theme).toBe('system');
    expect(migrated.settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(migrated.customizations).toEqual({});
    expect(migrated.courses).toEqual({});
  });

  it('migrates v1 preferences while enabling the new dashboard defaults', () => {
    const migrated = migrateState({
      schemaVersion: 1,
      settings: { theme: 'dark', betterDashboard: true, betterTodo: false },
      customizations: { '1': { hidden: true, shortName: 'Bio' } },
    });
    expect(migrated.settings.betterTodo).toBe(false);
    expect(migrated.settings.dashboard).toEqual(DEFAULT_SETTINGS.dashboard);
    expect(migrated.settings.splash).toEqual(DEFAULT_SETTINGS.splash);
    expect(migrated.settings.applyDisplayNameToSchoologyHeader).toBe(false);
    expect(migrated.customizations['1']).toMatchObject({ hidden: true, shortName: 'Bio' });
    expect(migrated.hiddenTasks).toEqual({});
    expect(migrated.splashHistory).toEqual([]);
  });

  it('sanitizes nested preferences and rejects malformed task identities', () => {
    const migrated = migrateState({
      settings: {
        displayNameOverride: '  Alex\n Example  ',
        applyDisplayNameToSchoologyHeader: 'true',
        navLabels: { courses: ' Classes ', groups: 1, resources: ' ' },
        dashboard: { showTodo: false, showNotifications: 'yes' },
        splash: { holidays: false, easterEggs: null },
      },
      hiddenTasks: {
        'assignment:1': { id: 'assignment:1', title: 'Homework', href: '/assignment/1?x=2' },
        'assignment:2': { id: 'mismatch', title: 'Homework' },
        'assignment:3': { id: 'assignment:3', title: 'Other', href: 'javascript:alert(1)' },
        blank: { id: 'blank', title: ' ' },
      },
      splashHistory: ['splash-1', null, '', 'splash-1', 'splash-2'],
    });
    expect(migrated.settings.displayNameOverride).toBe('Alex Example');
    expect(migrated.settings.applyDisplayNameToSchoologyHeader).toBe(false);
    expect(migrated.settings.navLabels).toEqual({ courses: 'Classes' });
    expect(migrated.settings.dashboard.showTodo).toBe(false);
    expect(migrated.settings.dashboard.showNotifications).toBe(true);
    expect(migrated.settings.splash.holidays).toBe(false);
    expect(migrated.hiddenTasks).toEqual({
      'assignment:1': { id: 'assignment:1', title: 'Homework', href: '/assignment/1?x=2' },
      'assignment:3': { id: 'assignment:3', title: 'Other' },
    });
    expect(migrated.splashHistory).toEqual(['splash-1', 'splash-2']);
  });

  it('does not share nested defaults between fresh states', () => {
    const state = defaultState();
    state.settings.dashboard.showTodo = false;
    state.settings.navLabels.courses = 'Classes';
    state.settings.splash.enabled = false;
    expect(defaultState().settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('settings persistence', () => {
  let area: StorageArea;

  beforeEach(() => {
    area = memoryArea();
  });

  it('round-trips a settings change', async () => {
    await updateSettings({ enabled: false, theme: 'dark' }, area);
    const state = await loadState(area);

    expect(state.settings.enabled).toBe(false);
    expect(state.settings.theme).toBe('dark');
  });

  it('stores the chosen name locally and clears it independently', async () => {
    await updateSettings({ displayNameOverride: ' Alex ', applyDisplayNameToSchoologyHeader: true }, area);
    expect((await loadState(area)).settings).toMatchObject({
      displayNameOverride: 'Alex', applyDisplayNameToSchoologyHeader: true,
    });
    await updateSettings({ displayNameOverride: undefined }, area);
    expect((await loadState(area)).settings.displayNameOverride).toBeUndefined();
    expect((await loadState(area)).settings.applyDisplayNameToSchoologyHeader).toBe(true);
  });

  it('preserves sibling nested settings and supports resetting labels', async () => {
    await updateSettings({ navLabels: { courses: 'Classes', groups: 'Clubs' }, dashboard: { showTodo: false } }, area);
    await updateSettings({ navLabels: { courses: undefined }, dashboard: { showRecentFeedback: false }, splash: { holidays: false } }, area);
    const { settings } = await loadState(area);
    expect(settings.navLabels).toEqual({ groups: 'Clubs' });
    expect(settings.dashboard).toMatchObject({ showTodo: false, showRecentFeedback: false, showNotifications: true });
    expect(settings.splash).toMatchObject({ holidays: false, enabled: true, contextual: true });
  });

  it('hides and restores tasks by stable identity while preserving native hrefs', async () => {
    const first = { id: 'assignment:1', title: 'Worksheet', href: '/assignment/1?mode=details' };
    const second = { id: 'assignment:2', title: 'Worksheet', href: '/assignment/2' };
    await hideTask(first, area);
    await hideTask(second, area);
    expect((await loadState(area)).hiddenTasks).toEqual({ [first.id]: first, [second.id]: second });
    await restoreTask(first.id, area);
    expect((await loadState(area)).hiddenTasks).toEqual({ [second.id]: second });
    expect(first.href).toBe('/assignment/1?mode=details');
  });

  it('keeps ten distinct recent splash IDs and resets only history', async () => {
    await updateSettings({ displayNameOverride: 'Alex' }, area);
    for (let index = 0; index < 12; index++) await rememberSplash(`splash-${index}`, area);
    await rememberSplash('splash-5', area);
    const history = (await loadState(area)).splashHistory;
    expect(history).toHaveLength(10);
    expect(history[0]).toBe('splash-2');
    expect(history.at(-1)).toBe('splash-5');
    expect(new Set(history).size).toBe(10);
    await resetSplashHistory(area);
    expect((await loadState(area)).splashHistory).toEqual([]);
    expect((await loadState(area)).settings.displayNameOverride).toBe('Alex');
  });

  it('preserves concurrent task, settings and splash updates in one context', async () => {
    await Promise.all([
      updateSettings({ displayNameOverride: 'Alex' }, area),
      hideTask({ id: 'assignment:1', title: 'Worksheet' }, area),
      rememberSplash('splash-1', area),
    ]);
    const state = await loadState(area);
    expect(state.settings.displayNameOverride).toBe('Alex');
    expect(state.hiddenTasks['assignment:1']?.title).toBe('Worksheet');
    expect(state.splashHistory).toEqual(['splash-1']);
  });

  it('restores a hidden course without losing its name or enrollment identity', async () => {
    await recordCourses([{ id: '1', originalName: 'Biology', href: '/course/1' }], area);
    await updateCustomization('1', { hidden: true, customName: 'Bio' }, area);
    expect(resolveAllCourses(await loadState(area)).filter((course) => !course.hidden)).toHaveLength(0);
    await updateCustomization('1', { hidden: undefined }, area);
    const restored = resolveAllCourses(await loadState(area)).filter((course) => !course.hidden);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ id: '1', displayName: 'Bio', href: '/course/1' });
  });

  it('merges a customization patch', async () => {
    await updateCustomization('100001', { customName: 'AP Gov' }, area);
    await updateCustomization('100001', { accentColor: '#ff0000' }, area);

    const state = await loadState(area);
    expect(state.customizations['100001']).toMatchObject({
      courseId: '100001',
      customName: 'AP Gov',
      accentColor: '#ff0000',
    });
  });

  /** Clearing one field must restore Schoology's value for that field only. */
  it('removes a single override when it is cleared', async () => {
    await updateCustomization('100001', { customName: 'AP Gov', shortName: 'Gov' }, area);
    await updateCustomization('100001', { customName: '' }, area);

    const state = await loadState(area);
    expect(state.customizations['100001']!.customName).toBeUndefined();
    expect(state.customizations['100001']!.shortName).toBe('Gov');
  });

  it('resets a course completely', async () => {
    await updateCustomization('100001', { customName: 'AP Gov' }, area);
    await resetCustomization('100001', area);

    expect((await loadState(area)).customizations['100001']).toBeUndefined();
  });

  it('records discovered courses without losing a better name', async () => {
    await recordCourses(
      [{ id: '100001', originalName: 'Example Government', sectionName: '1(A)', href: '/course/100001' }],
      area,
    );
    // A weaker source (a bare course link) must not overwrite the good name.
    await recordCourses([{ id: '100001', originalName: '', href: '/course/100001' }], area);

    const state = await loadState(area);
    expect(state.courses['100001']!.originalName).toBe('Example Government');
    expect(state.courses['100001']!.sectionName).toBe('1(A)');
  });

  it('never stores a course a page could not name', async () => {
    const state = await recordCourses(
      [{ id: '100001', originalName: '', sectionName: '8(B-D)', href: '/course/100001' }],
      area,
    );

    expect(state?.courses['100001']).toBeUndefined();
  });

  it('keeps a known course name when a weaker page reports none', async () => {
    await recordCourses(
      [{ id: '100001', originalName: 'Math Concepts & Applications L2', href: '/course/100001' }],
      area,
    );
    const state = await recordCourses(
      [{ id: '100001', originalName: '', sectionName: '8(B-D)', href: '/course/100001' }],
      area,
    );

    expect(state?.courses['100001']!.originalName).toBe('Math Concepts & Applications L2');
    expect(state?.courses['100001']!.sectionName).toBe('8(B-D)');
  });

  it('records a grade snapshot only when it changed', async () => {
    const first = await recordGradeSnapshots([{ courseId: '100001', percentage: 91.5 }], area, 10);
    expect(first!.gradeSnapshots['100001']).toEqual({
      courseId: '100001',
      percentage: 91.5,
      updatedAt: 10,
    });

    // The same percentage again is not a write.
    const unchanged = await recordGradeSnapshots(
      [{ courseId: '100001', percentage: 91.5 }],
      area,
      20,
    );
    expect(unchanged!.gradeSnapshots['100001']!.updatedAt).toBe(10);

    const changed = await recordGradeSnapshots([{ courseId: '100001', percentage: 93 }], area, 30);
    expect(changed!.gradeSnapshots['100001']!.updatedAt).toBe(30);
  });

  it('forgets every stored grade on request', async () => {
    await recordGradeSnapshots([{ courseId: '100001', percentage: 91.5 }], area);
    const cleared = await clearGradeSnapshots(area);
    expect(cleared.gradeSnapshots).toEqual({});
  });

  it('merges per-course GPA settings without touching the scale', async () => {
    await updateGpaConfig({ boosts: { honors: 1, ap: 2 } }, area);
    const state = await updateCourseGpa('100001', { credits: 0.5 }, area);

    expect(state.gpa.courses['100001']).toEqual({ credits: 0.5 });
    expect(state.gpa.boosts).toEqual({ honors: 1, ap: 2 });
    expect(state.gpa.scale.length).toBeGreaterThan(1);
  });

  it('falls back to defaults when storage throws', async () => {
    const broken: StorageArea = {
      async get() {
        throw new Error('storage unavailable');
      },
      async set() {},
    };

    expect(await loadState(broken)).toEqual(defaultState());
  });
});

describe('course customization resolution', () => {
  const native = {
    id: '100001',
    originalName: 'Example Government',
    sectionName: '1(A)',
    href: '/course/100001',
  };

  it('falls back to the Schoology value when there is no override', () => {
    const resolved = resolveCourse(native, undefined);

    expect(resolved.displayName).toBe('Example Government');
    expect(resolved.hasCustomizations).toBe(false);
    expect(resolved.href).toBe('/course/100001');
  });

  it('overrides only the displayed name, never the identity', () => {
    const resolved = resolveCourse(native, { courseId: '100001', customName: 'AP Gov' });

    expect(resolved.displayName).toBe('AP Gov');
    // Native identity is carried through untouched.
    expect(resolved.originalName).toBe('Example Government');
    expect(resolved.id).toBe('100001');
    expect(resolved.href).toBe('/course/100001');
  });

  it('rejects unsafe image URLs and colors rather than rendering them', () => {
    const resolved = resolveCourse(native, {
      courseId: '100001',
      imageUrl: 'javascript:alert(1)',
      accentColor: 'red; background: url(evil)',
    });

    expect(resolved.displayImageUrl).toBeUndefined();
    expect(resolved.accentColor).toBeUndefined();
  });

  it('orders pinned courses first, then position, then name', () => {
    const state = {
      ...defaultState(),
      courses: {
        '1': { id: '1', originalName: 'Zoology', href: '/course/1', lastSeenAt: 0 },
        '2': { id: '2', originalName: 'Art', href: '/course/2', lastSeenAt: 0 },
        '3': { id: '3', originalName: 'Biology', href: '/course/3', lastSeenAt: 0 },
      },
      customizations: {
        '1': { courseId: '1', pinned: true },
        '3': { courseId: '3', position: 0 },
      },
    };

    expect(resolveAllCourses(state).map((course) => course.displayName)).toEqual([
      'Zoology',
      'Biology',
      'Art',
    ]);
  });

  /**
   * Name matching is a display-only convenience for To Do rows, which link to
   * an assignment rather than a course. It must refuse to guess.
   */
  it('refuses to resolve an ambiguous course name', () => {
    const state = {
      ...defaultState(),
      courses: {
        '1': { id: '1', originalName: 'Lunch', href: '/course/1', lastSeenAt: 0 },
        '2': { id: '2', originalName: 'Lunch', href: '/course/2', lastSeenAt: 0 },
        '3': { id: '3', originalName: 'Art', href: '/course/3', lastSeenAt: 0 },
      },
    };

    expect(findCourseIdByName(state, 'Lunch')).toBeNull();
    expect(findCourseIdByName(state, 'Art')).toBe('3');
    expect(findCourseIdByName(state, undefined)).toBeNull();
  });
});

describe('untrusted value validation', () => {
  it('accepts http(s) and root-relative image URLs only', () => {
    expect(isSafeImageUrl('https://example.com/a.png')).toBe(true);
    expect(isSafeImageUrl('http://example.com/a.png')).toBe(true);
    expect(isSafeImageUrl('/sites/default/course.svg')).toBe(true);

    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
    expect(isSafeImageUrl('//evil.test/x.png')).toBe(false);
    expect(isSafeImageUrl('')).toBe(false);
    expect(isSafeImageUrl(undefined)).toBe(false);
  });

  it('accepts only hex colors', () => {
    expect(isSafeCssColor('#fff')).toBe(true);
    expect(isSafeCssColor('#0a6ed1')).toBe(true);
    expect(isSafeCssColor('#0a6ed1ff')).toBe(true);

    expect(isSafeCssColor('red')).toBe(false);
    expect(isSafeCssColor('rgb(0,0,0)')).toBe(false);
    expect(isSafeCssColor('#fff; background: url(x)')).toBe(false);
  });

  it('trims a safe URL and drops an unsafe one', () => {
    expect(safeImageUrl('  https://example.com/a.png ')).toBe('https://example.com/a.png');
    expect(safeImageUrl('javascript:x')).toBeUndefined();
  });
});
