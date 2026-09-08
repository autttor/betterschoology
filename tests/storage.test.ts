import { beforeEach, describe, expect, it } from 'vitest';
import type { StorageArea } from '@/src/storage';
import {
  loadState,
  recordCourses,
  resetCustomization,
  updateCustomization,
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
