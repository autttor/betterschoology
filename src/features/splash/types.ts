/** Content categories come directly from the supplied Markdown, in source order. */
export type SplashCategory =
  | 'Contextual and General'
  | 'Time of Day'
  | 'Due Dates and Urgency'
  | 'Tabs and Browser'
  | 'Grades and GPA'
  | 'Day of Week'
  | 'Holidays and School Year'
  | 'Easter Eggs and Funny';

export type SplashHoliday = 'new-year' | 'valentine' | 'pi-day' | 'april-fools' | 'halloween' | 'thanksgiving' | 'winter-holidays';
export type AcademicPeriod = 'first-day' | 'first-week' | 'semester-start' | 'midterms' | 'finals' | 'finals-ending' | 'last-week' | 'last-day' | 'before-break' | 'graduation' | 'summer-start' | 'summer-break';

/** Every requirement must be satisfied. Unsupported claims stay in the catalog, disabled. */
export type SplashRequirement =
  | { kind: 'time'; period: 'morning' | 'afternoon' | 'evening' | 'late-night' | 'early-morning' }
  | { kind: 'weekday'; day: number }
  | { kind: 'holiday'; holiday: SplashHoliday }
  | { kind: 'academic-period'; period: AcademicPeriod }
  | { kind: 'deadline-minutes'; minutes: number }
  | { kind: 'clock'; hour: number; minute: number }
  | { kind: 'due'; timing: 'soon' | 'today' | 'tonight' | 'tomorrow' | 'midnight' | 'overdue' | 'overdue-yesterday' }
  | { kind: 'tasks' }
  | { kind: 'grade-context' }
  | { kind: 'grade-changed' }
  | { kind: 'feedback' }
  | { kind: 'tab-count'; count: number; comparison: 'exact' | 'at-least' }
  | { kind: 'unsupported'; reason: string };

export interface Splash {
  /** Stable source-number ID, independent of title or rendered name. */
  id: string;
  number: number;
  text: string;
  category: SplashCategory;
  requirements: readonly SplashRequirement[];
  bucket: 'general' | 'contextual' | 'easter-egg';
}

export interface SplashOptions {
  enabled: boolean;
  contextual: boolean;
  holidays: boolean;
  easterEggs: boolean;
}

export interface SplashContext {
  /** All time/date comparisons use the student's local timezone. */
  now: Date;
  displayNameOverride?: string;
  displayName?: string;
  tasks?: ReadonlyArray<{ dueAt?: Date; status?: string }>;
  surface?: 'dashboard' | 'grades' | 'other';
  /** Recent means within five minutes, never a future timestamp. */
  gradeDataLoadedAt?: Date;
  gradeDataChangedAt?: Date;
  hasFeedback?: boolean;
  /** Only pass a count already available through a safely authorized browser API. */
  tabCount?: number;
  /** Explicit local dates only. Never infer a school calendar from the month. */
  academicCalendar?: Partial<Record<AcademicPeriod, { start: string; end: string }>>;
}

export interface SplashSelection {
  id: string;
  text: string;
  history: string[];
}
