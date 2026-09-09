import type {
  AppsVisibility,
  BetterSchoologyState,
  CourseGpaSettings,
  Density,
  GpaConfig,
  GradeBand,
  HomeView,
} from '@/src/types/settings';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  defaultGpaConfig,
  defaultState,
} from './defaults';

/**
 * Reads whatever is in storage and returns a valid, fully-populated state.
 *
 * Written defensively rather than trustingly: storage may hold a shape written
 * by an older (or newer) build, a partially-written object, or nothing at all.
 * The rule is that a student's existing customizations survive every one of
 * those cases -- adding a setting must never reset a course's colors, and a
 * new release must never reset a preference the student set.
 *
 * There is no per-version branch here on purpose: every field is read
 * independently and falls back to its default, which is equivalent to running
 * every migration step and is impossible to get out of order.
 */
export function migrateState(raw: unknown): BetterSchoologyState {
  const base = defaultState();
  if (!isRecord(raw)) return base;

  const settings = isRecord(raw.settings) ? raw.settings : {};
  const dashboard = isRecord(settings.dashboard) ? settings.dashboard : {};
  const splash = isRecord(settings.splash) ? settings.splash : {};
  const navLabels = isRecord(settings.navLabels) ? settings.navLabels : {};

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: {
      // Unknown keys are dropped and missing keys fall back to the default, so
      // a new setting appears with its default instead of `undefined`.
      enabled: boolOr(settings.enabled, DEFAULT_SETTINGS.enabled),
      theme: themeOr(settings.theme),

      betterDashboard: boolOr(settings.betterDashboard, DEFAULT_SETTINGS.betterDashboard),
      betterTodo: boolOr(settings.betterTodo, DEFAULT_SETTINGS.betterTodo),
      defaultHomeView: oneOf<HomeView>(
        settings.defaultHomeView,
        ['dashboard', 'feed'],
        DEFAULT_SETTINGS.defaultHomeView,
      ),
      courseCardDensity: density(settings.courseCardDensity, DEFAULT_SETTINGS.courseCardDensity),
      compactCourseSwitcher: boolOr(
        settings.compactCourseSwitcher,
        DEFAULT_SETTINGS.compactCourseSwitcher,
      ),

      betterCourses: boolOr(settings.betterCourses, DEFAULT_SETTINGS.betterCourses),
      betterAssignments: boolOr(settings.betterAssignments, DEFAULT_SETTINGS.betterAssignments),
      appsVisibility: oneOf<AppsVisibility>(
        settings.appsVisibility,
        ['show', 'collapse', 'hide'],
        DEFAULT_SETTINGS.appsVisibility,
      ),
      materialDensity: density(settings.materialDensity, DEFAULT_SETTINGS.materialDensity),

      betterGrades: boolOr(settings.betterGrades, DEFAULT_SETTINGS.betterGrades),
      gpaEnabled: boolOr(settings.gpaEnabled, DEFAULT_SETTINGS.gpaEnabled),

      ...cleanText(settings, 'displayNameOverride', 80),
      applyDisplayNameToSchoologyHeader: boolOr(
        settings.applyDisplayNameToSchoologyHeader,
        DEFAULT_SETTINGS.applyDisplayNameToSchoologyHeader,
      ),
      navLabels: {
        ...cleanText(navLabels, 'courses', 40),
        ...cleanText(navLabels, 'groups', 40),
        ...cleanText(navLabels, 'resources', 40),
        ...cleanText(navLabels, 'gradeReport', 40),
      },
      dashboard: {
        showTodo: boolOr(dashboard.showTodo, DEFAULT_SETTINGS.dashboard.showTodo),
        showNotifications: boolOr(
          dashboard.showNotifications,
          DEFAULT_SETTINGS.dashboard.showNotifications,
        ),
        showRecentFeedback: boolOr(
          dashboard.showRecentFeedback,
          DEFAULT_SETTINGS.dashboard.showRecentFeedback,
        ),
        /*
         * Two releases arrived at the same toggle from different directions:
         * 0.1's flat `showAnnouncements`/`showGpaWidget` and 0.4's grouped
         * dashboard panels. The group is authoritative now, and a student who
         * set either flat key keeps the choice they made.
         */
        showAnnouncements: boolOr(
          dashboard.showAnnouncements,
          boolOr(settings.showAnnouncements, DEFAULT_SETTINGS.dashboard.showAnnouncements),
        ),
        showGpa: boolOr(
          dashboard.showGpa,
          boolOr(settings.showGpaWidget, DEFAULT_SETTINGS.dashboard.showGpa),
        ),
        hideHiddenCourseTasks: boolOr(
          dashboard.hideHiddenCourseTasks,
          DEFAULT_SETTINGS.dashboard.hideHiddenCourseTasks,
        ),
      },
      splash: {
        enabled: boolOr(splash.enabled, DEFAULT_SETTINGS.splash.enabled),
        contextual: boolOr(splash.contextual, DEFAULT_SETTINGS.splash.contextual),
        holidays: boolOr(splash.holidays, DEFAULT_SETTINGS.splash.holidays),
        easterEggs: boolOr(splash.easterEggs, DEFAULT_SETTINGS.splash.easterEggs),
      },
    },
    customizations: sanitizeCustomizations(raw.customizations),
    courses: sanitizeCourses(raw.courses),
    gpa: sanitizeGpa(raw.gpa),
    gradeSnapshots: sanitizeSnapshots(raw.gradeSnapshots),
    hiddenTasks: sanitizeHiddenTasks(raw.hiddenTasks),
    splashHistory: Array.isArray(raw.splashHistory)
      ? [...new Set(raw.splashHistory.filter((id): id is string => validId(id)))].slice(-10)
      : [],
  };
}

function sanitizeCustomizations(raw: unknown): BetterSchoologyState['customizations'] {
  if (!isRecord(raw)) return {};
  const out: BetterSchoologyState['customizations'] = {};

  for (const [courseId, value] of Object.entries(raw)) {
    if (!isRecord(value) || !/^\d+$/.test(courseId)) continue;

    out[courseId] = {
      courseId,
      ...pickString(value, 'customName'),
      ...pickString(value, 'shortName'),
      ...pickString(value, 'imageUrl'),
      ...pickString(value, 'accentColor'),
      ...pickString(value, 'backgroundColor'),
      ...pickString(value, 'textColor'),
      ...pickString(value, 'mutedTextColor'),
      ...pickBoolean(value, 'pinned'),
      ...pickBoolean(value, 'hidden'),
      ...pickNumber(value, 'position'),
    };
  }

  return out;
}

function sanitizeCourses(raw: unknown): BetterSchoologyState['courses'] {
  if (!isRecord(raw)) return {};
  const out: BetterSchoologyState['courses'] = {};

  for (const [courseId, value] of Object.entries(raw)) {
    if (!isRecord(value) || !/^\d+$/.test(courseId)) continue;
    const originalName = typeof value.originalName === 'string' ? value.originalName : '';
    if (!originalName) continue;

    out[courseId] = {
      id: courseId,
      originalName,
      ...pickString(value, 'sectionName'),
      ...pickString(value, 'schoolName'),
      ...pickString(value, 'originalImageUrl'),
      href: typeof value.href === 'string' ? value.href : `/course/${courseId}`,
      lastSeenAt: typeof value.lastSeenAt === 'number' ? value.lastSeenAt : 0,
    };
  }

  return out;
}

/**
 * A stored key that is safe to use as a record key.
 *
 * Storage is JSON a previous build wrote, and `__proto__` as a key is how a
 * plain object assignment turns into prototype pollution.
 */
function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
  );
}

function sanitizeHiddenTasks(raw: unknown): BetterSchoologyState['hiddenTasks'] {
  if (!isRecord(raw)) return {};
  const out: BetterSchoologyState['hiddenTasks'] = {};

  for (const [id, value] of Object.entries(raw)) {
    if (!validId(id) || !isRecord(value) || value.id !== id) continue;
    const title = typeof value.title === 'string' ? value.title.trim().slice(0, 300) : '';
    if (!title) continue;

    const href = typeof value.href === 'string' ? value.href : undefined;
    // Keep the original URL when it is safe. Stored text must never become an
    // executable link.
    const safeHref = href && (/^https?:\/\//i.test(href) || /^\/(?![/\\])/.test(href));
    out[id] = { id, title, ...(safeHref ? { href } : {}) };
  }

  return out;
}

/** Trimmed, length-capped free text, or nothing at all. */
function cleanText<K extends string>(source: Record<string, unknown>, key: K, limit: number) {
  const value = source[key];
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
  return text ? ({ [key]: text } as Record<K, string>) : {};
}

/**
 * Reads stored course-grade snapshots.
 *
 * Only three fields exist by design, and anything else in the record is
 * dropped: this is the one place Better Schoology keeps anything resembling a
 * grade, and it stays as small as the GPA widget allows.
 */
function sanitizeSnapshots(raw: unknown): BetterSchoologyState['gradeSnapshots'] {
  if (!isRecord(raw)) return {};
  const out: BetterSchoologyState['gradeSnapshots'] = {};

  for (const [courseId, value] of Object.entries(raw)) {
    if (!isRecord(value) || !/^\d+$/.test(courseId)) continue;
    const percentage = finiteNumber(value.percentage);
    if (percentage === undefined) continue;

    out[courseId] = {
      courseId,
      percentage,
      updatedAt: finiteNumber(value.updatedAt) ?? 0,
    };
  }

  return out;
}

/**
 * Reads the stored GPA configuration.
 *
 * A stored scale is kept exactly as the student left it, including bands that
 * look unusual -- schools really do use 7-point bands and 5.0 scales. Only
 * structurally invalid entries are dropped, and an empty result falls back to
 * the default scale so the calculator always has something to work with.
 */
function sanitizeGpa(raw: unknown): GpaConfig {
  const fallback = defaultGpaConfig();
  if (!isRecord(raw)) return fallback;

  const bands: GradeBand[] = [];
  if (Array.isArray(raw.scale)) {
    for (const entry of raw.scale) {
      if (!isRecord(entry)) continue;
      const letter = typeof entry.letter === 'string' ? entry.letter.trim() : '';
      const minPercentage = finiteNumber(entry.minPercentage);
      const points = finiteNumber(entry.points);
      if (!letter || minPercentage === undefined || points === undefined) continue;
      bands.push({ letter, minPercentage, points });
    }
  }

  const boosts = isRecord(raw.boosts) ? raw.boosts : {};
  const courses: Record<string, CourseGpaSettings> = {};

  if (isRecord(raw.courses)) {
    for (const [courseId, value] of Object.entries(raw.courses)) {
      if (!isRecord(value) || !/^\d+$/.test(courseId)) continue;
      const credits = finiteNumber(value.credits);
      const boost = finiteNumber(value.boost);
      courses[courseId] = {
        ...(typeof value.included === 'boolean' ? { included: value.included } : {}),
        ...(credits !== undefined && credits >= 0 ? { credits } : {}),
        ...(boost !== undefined ? { boost } : {}),
      };
    }
  }

  return {
    scale: bands.length > 0 ? bands : fallback.scale,
    boosts: {
      honors: finiteNumber(boosts.honors) ?? fallback.boosts.honors,
      ap: finiteNumber(boosts.ap) ?? fallback.boosts.ap,
    },
    courses,
  };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function themeOr(value: unknown): BetterSchoologyState['settings']['theme'] {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_SETTINGS.theme;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function density(value: unknown, fallback: Density): Density {
  return oneOf<Density>(value, ['comfortable', 'compact'], fallback);
}

function pickString<K extends string>(source: Record<string, unknown>, key: K) {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? ({ [key]: value } as Record<K, string>) : {};
}

function pickBoolean<K extends string>(source: Record<string, unknown>, key: K) {
  const value = source[key];
  return typeof value === 'boolean' ? ({ [key]: value } as Record<K, boolean>) : {};
}

function pickNumber<K extends string>(source: Record<string, unknown>, key: K) {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? ({ [key]: value } as Record<K, number>)
    : {};
}
