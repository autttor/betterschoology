import type { BetterSchoologyState } from '@/src/types/settings';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SETTINGS, defaultState } from './defaults';

/**
 * Reads whatever is in storage and returns a valid, fully-populated state.
 *
 * Written defensively rather than trustingly: storage may hold a shape written
 * by an older (or newer) build, a partially-written object, or nothing at all.
 * The rule is that a student's existing customizations survive every one of
 * those cases -- adding a setting must never reset a course's colors.
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
      ...cleanText(settings, 'displayNameOverride', 80),
      applyDisplayNameToSchoologyHeader: boolOr(settings.applyDisplayNameToSchoologyHeader, false),
      navLabels: {
        ...cleanText(navLabels, 'courses', 40),
        ...cleanText(navLabels, 'groups', 40),
        ...cleanText(navLabels, 'resources', 40),
        ...cleanText(navLabels, 'gradeReport', 40),
      },
      dashboard: {
        showTodo: boolOr(dashboard.showTodo, DEFAULT_SETTINGS.dashboard.showTodo),
        showNotifications: boolOr(dashboard.showNotifications, DEFAULT_SETTINGS.dashboard.showNotifications),
        showRecentFeedback: boolOr(dashboard.showRecentFeedback, DEFAULT_SETTINGS.dashboard.showRecentFeedback),
        showAnnouncements: boolOr(dashboard.showAnnouncements, DEFAULT_SETTINGS.dashboard.showAnnouncements),
        hideHiddenCourseTasks: boolOr(dashboard.hideHiddenCourseTasks, false),
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
    hiddenTasks: sanitizeHiddenTasks(raw.hiddenTasks),
    splashHistory: Array.isArray(raw.splashHistory)
      ? [...new Set(raw.splashHistory.filter((id): id is string => validId(id)))].slice(-10)
      : [],
  };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value === value.trim() && !['__proto__', 'constructor', 'prototype'].includes(value);
}

function sanitizeHiddenTasks(raw: unknown): BetterSchoologyState['hiddenTasks'] {
  if (!isRecord(raw)) return {};
  const out: BetterSchoologyState['hiddenTasks'] = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!validId(id) || !isRecord(value) || value.id !== id) continue;
    const title = typeof value.title === 'string' ? value.title.trim().slice(0, 300) : '';
    if (!title) continue;
    const href = typeof value.href === 'string' ? value.href : undefined;
    // Keep the original URL bytes when safe. Never turn stored text into an executable link.
    const safeHref = href && (/^https?:\/\//i.test(href) || /^\/(?![/\\])/.test(href));
    out[id] = { id, title, ...(safeHref ? { href } : {}) };
  }
  return out;
}

function cleanText<K extends string>(source: Record<string, unknown>, key: K, limit: number) {
  const value = source[key];
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
  return text ? ({ [key]: text } as Record<K, string>) : {};
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function themeOr(value: unknown): BetterSchoologyState['settings']['theme'] {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_SETTINGS.theme;
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
