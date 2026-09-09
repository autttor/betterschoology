import { browser } from 'wxt/browser';
import type { CourseCustomization, SchoologyCourse, StoredCourse } from '@/src/types';
import type {
  BetterSchoologySettings,
  BetterSchoologyState,
  CourseGpaSettings,
  GpaConfig,
  HiddenTask,
  SettingsPatch,
} from '@/src/types/settings';
import { log } from '@/src/utils/log';
import { defaultState } from './defaults';
import { migrateState } from './migrations';

export * from './defaults';
export { migrateState } from './migrations';

const STORAGE_KEY = 'betterSchoologyState';
const pendingWrites = new WeakMap<StorageArea, Promise<BetterSchoologyState>>();

/**
 * Minimal surface of `browser.storage.local` we depend on, so tests can supply
 * an in-memory implementation without a browser.
 */
export interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/**
 * `storage.local`, deliberately not `storage.sync`.
 *
 * Customizations are personal and stay on the device: there is no Better
 * Schoology account and no backend to sync to. `local` also avoids `sync`'s
 * small per-item quota, which course image URLs would eventually run into.
 */
function defaultArea(): StorageArea | null {
  const area = browser?.storage?.local;
  return area ? (area as unknown as StorageArea) : null;
}

export async function loadState(area: StorageArea | null = defaultArea()): Promise<BetterSchoologyState> {
  if (!area) return defaultState();

  try {
    const stored = await area.get(STORAGE_KEY);
    return migrateState(stored[STORAGE_KEY]);
  } catch (error) {
    // A read failure must not stop the extension from running with defaults.
    log.error('failed to read settings, using defaults:', error);
    return defaultState();
  }
}

export async function saveState(
  state: BetterSchoologyState,
  area: StorageArea | null = defaultArea(),
): Promise<void> {
  if (!area) return;
  await area.set({ [STORAGE_KEY]: state });
}

/** Serializes local read-modify-writes so simultaneous toggles/history updates coexist. */
export async function updateState(
  mutate: (state: BetterSchoologyState) => BetterSchoologyState,
  area: StorageArea | null = defaultArea(),
): Promise<BetterSchoologyState> {
  const write = async () => {
    const current = await loadState(area);
    const next = mutate(current);
    if (next !== current) await saveState(next, area);
    return next;
  };
  if (!area) return write();
  const pending = pendingWrites.get(area);
  const next = (pending ? pending.catch(() => undefined) : Promise.resolve()).then(write);
  pendingWrites.set(area, next);
  return next;
}

export async function updateSettings(
  patch: SettingsPatch,
  area: StorageArea | null = defaultArea(),
): Promise<BetterSchoologyState> {
  return updateState(
    (state) => migrateState({ ...state, settings: mergeSettings(state.settings, patch) }),
    area,
  );
}

export function mergeSettings(settings: BetterSchoologySettings, patch: SettingsPatch): BetterSchoologySettings {
  return {
    ...settings,
    ...patch,
    navLabels: { ...settings.navLabels, ...patch.navLabels },
    dashboard: { ...settings.dashboard, ...patch.dashboard },
    splash: { ...settings.splash, ...patch.splash },
  };
}

/** Dashboard visibility only. Schoology's task and original link remain intact. */
export async function hideTask(task: HiddenTask, area: StorageArea | null = defaultArea()): Promise<BetterSchoologyState> {
  return updateState((state) => migrateState({
    ...state,
    hiddenTasks: { ...state.hiddenTasks, [task.id]: task },
  }), area);
}

export async function restoreTask(id: string, area: StorageArea | null = defaultArea()): Promise<BetterSchoologyState> {
  return updateState((state) => {
    const hiddenTasks = { ...state.hiddenTasks };
    delete hiddenTasks[id];
    return { ...state, hiddenTasks };
  }, area);
}

export async function rememberSplash(id: string, area: StorageArea | null = defaultArea()): Promise<BetterSchoologyState> {
  return updateState((state) => migrateState({
    ...state,
    splashHistory: [...state.splashHistory.filter((previous) => previous !== id), id].slice(-10),
  }), area);
}

export async function resetSplashHistory(area: StorageArea | null = defaultArea()): Promise<BetterSchoologyState> {
  return updateState((state) => ({ ...state, splashHistory: [] }), area);
}

/**
 * Merges a customization patch for one course.
 *
 * Keys set to `undefined` are removed, which is how "reset this one field to
 * the Schoology default" is expressed -- the native value is always the
 * fallback, so deleting the override restores it.
 */
export async function updateCustomization(
  courseId: string,
  patch: Partial<Omit<CourseCustomization, 'courseId'>>,
  area: StorageArea | null = defaultArea(),
): Promise<BetterSchoologyState> {
  return updateState((state) => {
    const existing = state.customizations[courseId] ?? { courseId };
    const merged: CourseCustomization = { ...existing, ...patch, courseId };

    const mutable = merged as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') delete mutable[key];
    }

    return { ...state, customizations: { ...state.customizations, [courseId]: merged } };
  }, area);
}

/** Drops every override for a course, restoring Schoology's own presentation. */
export async function resetCustomization(
  courseId: string,
  area: StorageArea | null = defaultArea(),
): Promise<BetterSchoologyState> {
  return updateState((state) => {
    const next = { ...state.customizations };
    delete next[courseId];
    return { ...state, customizations: next };
  }, area);
}

/**
 * Records courses discovered on a page.
 *
 * Only the non-sensitive metadata the customizer needs to list a course is
 * stored: identity and presentation. No assignment content, no grades, no
 * classmate or teacher data.
 */
export async function recordCourses(
  courses: SchoologyCourse[],
  area: StorageArea | null = defaultArea(),
  now: number = Date.now(),
): Promise<BetterSchoologyState | null> {
  if (courses.length === 0) return null;

  return updateState((state) => {
    const next: Record<string, StoredCourse> = { ...state.courses };
    let changed = false;

    for (const course of courses) {
      const existing = next[course.id];
      // A discovery that produced no name (a page that names only the section)
      // must not create a nameless registry entry.
      if (!course.originalName && !existing?.originalName) continue;
      // A weaker source (a bare `/course/<id>` link) must not overwrite a good
      // name discovered from the gradebook.
      const merged: StoredCourse = {
        ...existing,
        ...course,
        originalName: course.originalName || existing?.originalName || '',
        ...(existing?.sectionName && !course.sectionName
          ? { sectionName: existing.sectionName }
          : {}),
        ...(existing?.originalImageUrl && !course.originalImageUrl
          ? { originalImageUrl: existing.originalImageUrl }
          : {}),
        lastSeenAt: now,
      };

      if (!existing || !sameCourse(existing, merged)) changed = true;
      next[course.id] = merged;
    }

    return changed ? { ...state, courses: next } : state;
  }, area);
}

function sameCourse(a: StoredCourse, b: StoredCourse): boolean {
  return (
    a.originalName === b.originalName &&
    a.sectionName === b.sectionName &&
    a.schoolName === b.schoolName &&
    a.originalImageUrl === b.originalImageUrl &&
    a.href === b.href
  );
}

/**
 * Merges a patch into the GPA configuration.
 *
 * Kept separate from `updateSettings` because the GPA config is structured
 * student data with its own shape: a scale the student edited must survive
 * every future settings change untouched.
 */
export async function updateGpaConfig(
  patch: Partial<GpaConfig>,
  area: StorageArea | null = defaultArea(),
): Promise<BetterSchoologyState> {
  return updateState((state) => ({ ...state, gpa: { ...state.gpa, ...patch } }), area);
}

/** Merges per-course GPA settings (credits, boost, inclusion) for one course. */
export async function updateCourseGpa(
  courseId: string,
  patch: Partial<CourseGpaSettings>,
  area: StorageArea | null = defaultArea(),
): Promise<BetterSchoologyState> {
  return updateState((state) => {
    const existing = state.gpa.courses[courseId] ?? {};
    return {
      ...state,
      gpa: {
        ...state.gpa,
        courses: { ...state.gpa.courses, [courseId]: { ...existing, ...patch } },
      },
    };
  }, area);
}

/**
 * Records course-level grade percentages seen on a grades page.
 *
 * Written only when something actually changed, so a page full of unchanged
 * grades does not cause a storage write (and a storage-change round trip) on
 * every enhancement pass.
 */
export async function recordGradeSnapshots(
  snapshots: Array<{ courseId: string; percentage: number }>,
  area: StorageArea | null = defaultArea(),
  now: number = Date.now(),
): Promise<BetterSchoologyState | null> {
  if (snapshots.length === 0) return null;

  return updateState((state) => {
    const next = { ...state.gradeSnapshots };
    let changed = false;

    for (const snapshot of snapshots) {
      if (!Number.isFinite(snapshot.percentage)) continue;
      const existing = next[snapshot.courseId];
      if (existing && existing.percentage === snapshot.percentage) continue;

      next[snapshot.courseId] = { ...snapshot, updatedAt: now };
      changed = true;
    }

    return changed ? { ...state, gradeSnapshots: next } : state;
  }, area);
}

/** Forgets every stored grade percentage. Offered in the customizer. */
export async function clearGradeSnapshots(
  area: StorageArea | null = defaultArea(),
): Promise<BetterSchoologyState> {
  return updateState((state) => ({ ...state, gradeSnapshots: {} }), area);
}

/**
 * Subscribes to storage changes so an open Schoology tab reacts to a popup
 * toggle without a reload. Returns an unsubscribe function.
 */
export function watchState(callback: (state: BetterSchoologyState) => void): () => void {
  const storage = browser?.storage;
  if (!storage?.onChanged) return () => {};

  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ): void => {
    if (areaName !== 'local' || !(STORAGE_KEY in changes)) return;
    callback(migrateState(changes[STORAGE_KEY]?.newValue));
  };

  storage.onChanged.addListener(listener);
  return () => storage.onChanged.removeListener(listener);
}
