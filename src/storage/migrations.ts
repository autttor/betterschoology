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

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: {
      // Unknown keys are dropped and missing keys fall back to the default, so
      // a new setting appears with its default instead of `undefined`.
      enabled: boolOr(settings.enabled, DEFAULT_SETTINGS.enabled),
      theme: themeOr(settings.theme),
      betterDashboard: boolOr(settings.betterDashboard, DEFAULT_SETTINGS.betterDashboard),
      betterTodo: boolOr(settings.betterTodo, DEFAULT_SETTINGS.betterTodo),
    },
    customizations: sanitizeCustomizations(raw.customizations),
    courses: sanitizeCourses(raw.courses),
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
