import { SPLASHES } from './catalog';
import type { Splash, SplashContext, SplashHoliday, SplashOptions, SplashRequirement, SplashSelection } from './types';

export { SPLASHES, parseSplashMarkdown } from './catalog';
export type { AcademicPeriod, Splash, SplashCategory, SplashContext, SplashHoliday, SplashOptions, SplashRequirement, SplashSelection } from './types';

const MINUTE = 60_000;
export const SPLASH_HISTORY_LIMIT = 10;
export const SPLASH_GRADE_RECENCY_MS = 5 * MINUTE;

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return localDate(new Date(`${value}T12:00:00`)) === value;
}

function matchesHoliday(holiday: SplashHoliday, now: Date): boolean {
  const month = now.getMonth() + 1;
  const date = now.getDate();
  switch (holiday) {
    case 'new-year': return month === 1 && date === 1;
    case 'valentine': return month === 2 && date === 14;
    case 'pi-day': return month === 3 && date === 14;
    case 'april-fools': return month === 4 && date === 1;
    case 'halloween': return month === 10 && date === 31;
    // US Thanksgiving: fourth Thursday in November, independent of school breaks.
    case 'thanksgiving': return month === 11 && now.getDay() === 4 && date >= 22 && date <= 28;
    case 'winter-holidays': return (month === 12 && date >= 20) || (month === 1 && date <= 2);
  }
}

function activeTasks(context: SplashContext): NonNullable<SplashContext['tasks']> {
  return (context.tasks ?? []).filter((task) => !['completed', 'complete', 'submitted'].includes(task.status ?? ''));
}

function pendingDates(context: SplashContext): Date[] {
  return activeTasks(context)
    .map((task) => task.dueAt)
    .filter((dueAt): dueAt is Date => dueAt instanceof Date && Number.isFinite(dueAt.getTime()));
}

function isRecent(date: Date | undefined, now: Date): boolean {
  if (!date) return false;
  const elapsed = now.getTime() - date.getTime();
  return elapsed >= 0 && elapsed <= SPLASH_GRADE_RECENCY_MS;
}

function meetsRequirement(requirement: SplashRequirement, context: SplashContext): boolean {
  const now = context.now;
  const hour = now.getHours();
  switch (requirement.kind) {
    case 'unsupported': return false;
    case 'tasks': return activeTasks(context).length > 0;
    case 'time':
      switch (requirement.period) {
        case 'morning': return hour >= 5 && hour < 12;
        case 'early-morning': return hour >= 5 && hour < 8;
        case 'afternoon': return hour >= 12 && hour < 18;
        case 'evening': return hour >= 18;
        case 'late-night': return hour >= 22 || hour < 5;
      }
      break;
    case 'weekday': return requirement.day === -1 ? now.getDay() >= 1 && now.getDay() <= 5 : now.getDay() === requirement.day;
    case 'holiday': return matchesHoliday(requirement.holiday, now);
    case 'academic-period': {
      const period = context.academicCalendar?.[requirement.period];
      if (!period || !isValidLocalDate(period.start) || !isValidLocalDate(period.end) || period.start > period.end) return false;
      const today = localDate(now);
      return today >= period.start && today <= period.end;
    }
    case 'clock': return hour === requirement.hour && now.getMinutes() === requirement.minute;
    case 'deadline-minutes': {
      const future = pendingDates(context).map((date) => date.getTime() - now.getTime()).filter((delta) => delta > 0);
      // Round up a partial minute as a normal deadline countdown does. Never
      // claim six minutes remain when an earlier pending task is due in two.
      return future.length > 0 && Math.ceil(Math.min(...future) / MINUTE) === requirement.minutes;
    }
    case 'due': {
      const dates = pendingDates(context);
      const today = localDate(now);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return dates.some((date) => {
        const delta = date.getTime() - now.getTime();
        switch (requirement.timing) {
          case 'soon': return delta > 0 && delta <= 60 * MINUTE;
          case 'today': return delta > 0 && localDate(date) === today;
          case 'tonight': return delta > 0 && localDate(date) === today && date.getHours() >= 18;
          case 'tomorrow': return localDate(date) === localDate(tomorrow);
          case 'midnight': return delta > 0 && localDate(date) === today && date.getHours() === 23 && date.getMinutes() === 59;
          case 'overdue': return delta < 0;
          case 'overdue-yesterday': return delta < 0 && localDate(date) === localDate(yesterday);
        }
      }) || (requirement.timing === 'overdue' && activeTasks(context).some((task) => task.status === 'overdue'));
    }
    case 'grade-context': return context.surface === 'grades' || isRecent(context.gradeDataLoadedAt, now) || isRecent(context.gradeDataChangedAt, now);
    case 'grade-changed': return isRecent(context.gradeDataChangedAt, now);
    case 'feedback': return context.hasFeedback === true;
    case 'tab-count': {
      const count = context.tabCount;
      if (count === undefined || !Number.isInteger(count) || count < 1) return false;
      return requirement.comparison === 'exact' ? count === requirement.count : count >= requirement.count;
    }
  }
  return false;
}

/** Eligibility is also used to expire a held splash, without rerolling on DOM mutations. */
export function isSplashEligible(splash: Splash, context: SplashContext, options: SplashOptions): boolean {
  if (!options.enabled || !Number.isFinite(context.now.getTime())) return false;
  if (splash.bucket === 'easter-egg' && !options.easterEggs) return false;
  if (splash.requirements.length > 0 && !options.contextual) return false;
  if (!options.holidays && splash.requirements.some((requirement) => requirement.kind === 'holiday')) return false;
  return splash.requirements.every((requirement) => meetsRequirement(requirement, context));
}

export function isSplashIdEligible(id: string, context: SplashContext, options: SplashOptions): boolean {
  const splash = SPLASHES.find((candidate) => candidate.id === id);
  return !!splash && isSplashEligible(splash, context, options);
}

export function getEligibleSplashes(context: SplashContext, options: SplashOptions): Splash[] {
  return SPLASHES.filter((splash) => isSplashEligible(splash, context, options));
}

/** Names are text, never markup. Even a placeholder entered as a name cannot leak. */
export function interpolateSplashName(text: string, displayNameOverride?: string, displayName?: string): string {
  const clean = (value?: string): string => (value ?? '').replace(/\[name\]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const name = clean(displayNameOverride) || clean(displayName);
  return text.replace(/\[name\]/gi, () => name)
    .replace(/,\s*(?=[.!?]|$)/g, '')
    .replace(/\s+([.!?,])/g, '$1')
    .replace(/\s+/g, ' ').trim();
}

function randomUnit(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
}

/**
 * Call once per page/session and retain the result until it becomes ineligible.
 * A minute-level validity check can expire exact deadlines and midnight/date
 * changes without replacing a valid greeting on every mutation. Caller owns
 * browser.storage.local persistence; this pure module makes no browser requests.
 *
 * Contextual/general/easter eggs receive 60/35/5 percent of rolls. An absent
 * contextual bucket falls back to general, keeping Easter eggs at most 5%.
 */
export function selectSplash(
  context: SplashContext,
  options: SplashOptions,
  recentHistory: readonly string[] = [],
  random: () => number = Math.random,
): SplashSelection | null {
  const eligible = getEligibleSplashes(context, options);
  if (!eligible.length) return null;
  const known = new Set(SPLASHES.map((splash) => splash.id));
  const history = recentHistory.filter((id) => known.has(id)).slice(-SPLASH_HISTORY_LIMIT);
  const recent = new Set(history);
  const recentText = new Set(SPLASHES.filter((splash) => recent.has(splash.id)).map((splash) => splash.text));
  const fresh = eligible.filter((splash) => !recent.has(splash.id) && !recentText.has(splash.text));
  const candidates = fresh.length ? fresh : eligible;
  const general = candidates.filter((splash) => splash.bucket === 'general');
  const contextual = candidates.filter((splash) => splash.bucket === 'contextual');
  const eggs = candidates.filter((splash) => splash.bucket === 'easter-egg');
  const roll = randomUnit(random);
  let pool = roll < 0.6 ? contextual : roll < 0.95 ? general : eggs;
  if (!pool.length) pool = general.length ? general : contextual.length ? contextual : eggs;
  const chosen = pool[Math.floor(randomUnit(random) * pool.length)];
  if (!chosen) return null;
  return {
    id: chosen.id,
    text: interpolateSplashName(chosen.text, context.displayNameOverride, context.displayName),
    history: [...history.filter((id) => id !== chosen.id), chosen.id].slice(-SPLASH_HISTORY_LIMIT),
  };
}
