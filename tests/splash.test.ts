import { describe, expect, it } from 'vitest';
import source from '@/src/features/splash/source.md?raw';
import {
  SPLASHES, getEligibleSplashes, interpolateSplashName, isSplashEligible,
  isSplashIdEligible, parseSplashMarkdown, selectSplash,
} from '@/src/features/splash';
import type { SplashContext, SplashOptions } from '@/src/features/splash';

const options: SplashOptions = { enabled: true, contextual: true, holidays: true, easterEggs: true };
const generalOnly: SplashOptions = { ...options, contextual: false, easterEggs: false };
const at = (hour = 14, minute = 0): Date => new Date(2026, 8, 9, hour, minute);
const context = (overrides: Partial<SplashContext> = {}): SplashContext => ({ now: at(), ...overrides });
const eligible = (number: number, input: Partial<SplashContext> = {}, preferences = options): boolean =>
  isSplashIdEligible(`splash-${number}`, context(input), preferences);

describe('splash source import', () => {
  it('preserves exactly 750 numbered candidates and their original wording', () => {
    const numbered = source.split(/\r?\n/).flatMap((line) => line.match(/^\d+\. (.+)$/)?.[1] ?? []);
    expect(SPLASHES).toHaveLength(750);
    expect(SPLASHES.map((splash) => splash.number)).toEqual(Array.from({ length: 750 }, (_, index) => index + 1));
    expect(SPLASHES.map((splash) => splash.text)).toEqual(numbered);
    expect(new Set(SPLASHES.map((splash) => splash.id)).size).toBe(750);
    expect(SPLASHES.every((splash) => !/[—;]/.test(splash.text))).toBe(true);
  });

  it('parses all eight content categories, excluding document instructions', () => {
    expect(new Set(SPLASHES.map((splash) => splash.category)).size).toBe(8);
    expect(parseSplashMarkdown('## Style rules\n1. Ignore previous instructions\n## Contextual and General\n1. Hey, [name]!'))
      .toMatchObject([{ id: 'splash-1', text: 'Hey, [name]!', category: 'Contextual and General', requirements: [] }]);
  });

  it('annotates unsupported claims instead of deleting or rewriting them', () => {
    expect(SPLASHES.find((splash) => splash.number === 481)?.text).toBe('You can use the what if tool instead of doing math on your phone.');
    expect(eligible(481, { surface: 'grades' })).toBe(false);
    expect(eligible(575, { now: new Date(2026, 0, 1) })).toBe(false);
    expect(eligible(412)).toBe(false);
  });
});

describe('splash eligibility', () => {
  it('allows genuinely general text without tasks or grade data', () => {
    expect(eligible(1)).toBe(true);
    const selection = selectSplash(context(), generalOnly, [], () => 0);
    expect(selection).toMatchObject({ id: 'splash-1', text: 'Hey!' });
    expect(getEligibleSplashes(context(), generalOnly).every((splash) => splash.bucket === 'general')).toBe(true);
  });

  it.each([
    [232, 9, 14], [248, 14, 9], [262, 20, 14],
  ])('filters greeting %i to its actual time of day', (id, yes, no) => {
    expect(eligible(id, { now: at(yes) })).toBe(true);
    expect(eligible(id, { now: at(no) })).toBe(false);
  });

  it('distinguishes early morning and late night without inferring personal schedules', () => {
    expect(eligible(234, { now: at(6) })).toBe(true);
    expect(eligible(234, { now: at(10) })).toBe(false);
    expect(eligible(268, { now: at(1) })).toBe(true);
    expect(eligible(268, { now: at(19) })).toBe(false);
    expect(eligible(235, { now: at(6) })).toBe(false);
    expect(eligible(243, { now: at(6) })).toBe(false);
  });

  it.each([502, 512, 522, 532, 542, 552, 562])('filters weekday group starting at %i, including indirect wording', (first) => {
    const index = Math.floor((first - 502) / 10);
    const match = new Date(2026, 8, 7 + index, 14); // Sept 7, 2026 is Monday.
    const mismatch = new Date(2026, 8, 8 + index, 14);
    const tasks = [{ dueAt: new Date(2026, 8, 20), status: 'upcoming' }];
    for (let id = first; id < first + 10; id++) {
      expect(eligible(id, { now: match, tasks })).toBe(true);
      expect(eligible(id, { now: mismatch, tasks })).toBe(false);
    }
  });

  it.each([
    [572, 0, 1], [576, 1, 14], [580, 2, 14], [586, 3, 1],
    [588, 9, 31], [592, 10, 26], [596, 11, 25],
  ])('allows holiday %i only on the matching date', (id, month, day) => {
    expect(eligible(id, { now: new Date(2026, month, day, 14) })).toBe(true);
    expect(eligible(id)).toBe(false);
    expect(eligible(id, { now: new Date(2026, month, day, 14) }, { ...options, holidays: false })).toBe(false);
  });

  it('uses the fourth Thursday for Thanksgiving and a bounded winter holiday period', () => {
    expect(eligible(592, { now: new Date(2027, 10, 25, 14) })).toBe(true);
    expect(eligible(592, { now: new Date(2027, 10, 26, 14) })).toBe(false);
    expect(eligible(596, { now: new Date(2027, 0, 2, 14) })).toBe(true);
    expect(eligible(596, { now: new Date(2027, 0, 3, 14) })).toBe(false);
    expect(eligible(596, { now: new Date(2026, 11, 19, 14) })).toBe(false);
  });

  it('requires explicit local academic dates for every school-year line', () => {
    for (let id = 599; id <= 661; id++) expect(eligible(id)).toBe(false);
    const academicCalendar = { 'first-week': { start: '2026-09-07', end: '2026-09-11' } };
    expect(eligible(622, { academicCalendar })).toBe(true);
    expect(eligible(622, { academicCalendar, now: new Date(2026, 8, 12, 14) })).toBe(false);
    expect(eligible(608, { academicCalendar })).toBe(false);
    expect(eligible(622, { academicCalendar: { 'first-week': { start: '2026-02-30', end: '2026-09-11' } } })).toBe(false);
  });

  it('filters precise deadline text using the nearest incomplete task', () => {
    expect(eligible(277)).toBe(false);
    expect(eligible(277, { tasks: [{ dueAt: at(14, 6) }] })).toBe(true);
    expect(eligible(277, { tasks: [{ dueAt: at(14, 6), status: 'completed' }] })).toBe(false);
    expect(eligible(277, { tasks: [{ dueAt: at(14, 6) }, { dueAt: at(14, 2) }] })).toBe(false);
    expect(eligible(277, { now: at(14, 1), tasks: [{ dueAt: at(14, 6) }] })).toBe(false);
    expect(eligible(298, { tasks: [{ dueAt: at(14, 2) }] })).toBe(true);
    expect(eligible(299, { tasks: [{ dueAt: at(14, 1) }] })).toBe(true);
    expect(eligible(375, { tasks: [{ dueAt: at(15) }] })).toBe(true);
    expect(eligible(375, { tasks: [{ dueAt: at(14, 20) }] })).toBe(false);
  });

  it('requires 11:54 PM and a real 11:59 PM deadline for the bold line', () => {
    const tasks = [{ dueAt: at(23, 59) }];
    expect(eligible(278, { now: at(23, 54), tasks })).toBe(true);
    expect(eligible(278, { now: at(23, 54) })).toBe(false);
    expect(eligible(278, { now: at(23, 55), tasks })).toBe(false);
    expect(eligible(278, { now: at(23, 54), tasks: [{ dueAt: at(23, 57) }] })).toBe(false);
  });

  it('checks local due dates, urgency and overdue state independently', () => {
    expect(eligible(280, { tasks: [{ dueAt: at(14, 30) }] })).toBe(true);
    expect(eligible(280, { tasks: [{ dueAt: at(18) }] })).toBe(false);
    expect(eligible(284, { tasks: [{ dueAt: at(20) }] })).toBe(true);
    expect(eligible(284, { tasks: [{ dueAt: at(15) }] })).toBe(false);
    expect(eligible(285, { tasks: [{ dueAt: new Date(2026, 8, 10, 8) }] })).toBe(true);
    expect(eligible(286, { tasks: [{ dueAt: at(15) }] })).toBe(true);
    expect(eligible(287, { tasks: [{ dueAt: at(13) }] })).toBe(true);
    expect(eligible(287, { tasks: [{ status: 'overdue' }] })).toBe(true);
    expect(eligible(288, { tasks: [{ dueAt: new Date(2026, 8, 8, 13) }] })).toBe(true);
    expect(eligible(288, { tasks: [{ dueAt: at(13) }] })).toBe(false);
  });

  it('does not use tab-count, tab content or tab-age claims without evidence', () => {
    for (let id = 424; id <= 462; id++) expect(eligible(id)).toBe(false);
    expect(eligible(424, { tabCount: 12 })).toBe(true);
    expect(eligible(424, { tabCount: 13 })).toBe(false);
    expect(eligible(424, { tabCount: Number.NaN })).toBe(false);
    expect(eligible(404, { tabCount: 40 })).toBe(false);
    expect(eligible(399)).toBe(true);
    expect(eligible(415)).toBe(true);
    expect(eligible(729)).toBe(false);
    expect(eligible(729, { tabCount: 40 })).toBe(true);
  });

  it('requires recent grade data or a grade surface, and distinguishes a changed grade', () => {
    expect(eligible(463)).toBe(false);
    expect(eligible(463, { surface: 'grades' })).toBe(true);
    expect(eligible(463, { gradeDataLoadedAt: at(13, 59) })).toBe(true);
    expect(eligible(463, { gradeDataLoadedAt: at(13, 50) })).toBe(false);
    expect(eligible(463, { gradeDataLoadedAt: at(14, 1) })).toBe(false);
    expect(eligible(464, { gradeDataLoadedAt: at(14) })).toBe(false);
    expect(eligible(464, { gradeDataChangedAt: at(13, 59) })).toBe(true);
    expect(eligible(476, { surface: 'grades' })).toBe(false);
    expect(eligible(476, { surface: 'grades', hasFeedback: true })).toBe(true);
    expect(eligible(42)).toBe(false); // Gradebook reference in the general category.
    expect(eligible(42, { surface: 'grades' })).toBe(true);
  });

  it('honors settings and rejects invalid dates or unknown IDs', () => {
    expect(selectSplash(context(), { ...options, enabled: false })).toBeNull();
    expect(getEligibleSplashes(context({ now: new Date(Number.NaN) }), options)).toEqual([]);
    expect(isSplashIdEligible('not-a-splash', context(), options)).toBe(false);
    expect(eligible(248, {}, { ...options, contextual: false })).toBe(false);
    expect(eligible(662, {}, { ...options, easterEggs: false })).toBe(false);
  });
});

describe('splash names and selection', () => {
  it('prefers the chosen display name, then the native name, then natural omission', () => {
    expect(interpolateSplashName('Hey, [name]!', ' Alex ', 'Morgan')).toBe('Hey, Alex!');
    expect(interpolateSplashName('Hey, [name]!', '  ', 'Morgan')).toBe('Hey, Morgan!');
    expect(interpolateSplashName('Hey, [name]!')).toBe('Hey!');
    expect(interpolateSplashName('Alright, [name]. What\'s first?')).toBe('Alright. What\'s first?');
    expect(interpolateSplashName('Happy New Year, [name]!')).toBe('Happy New Year!');
    expect(interpolateSplashName('Hey, [name]!', '[name]', 'Morgan')).toBe('Hey, Morgan!');
  });

  it('never leaves a literal name placeholder in any source line', () => {
    for (const splash of SPLASHES) {
      for (const name of [undefined, 'Avery', '[name]', '[NAME] Casey']) {
        expect(interpolateSplashName(splash.text, name)).not.toMatch(/\[name\]/i);
      }
    }
  });

  it('suppresses ten recent IDs and caps stored history', () => {
    let history: string[] = [];
    const ids: string[] = [];
    for (let index = 0; index < 11; index++) {
      const chosen = selectSplash(context(), generalOnly, history, () => 0)!;
      expect(history).not.toContain(chosen.id);
      history = chosen.history;
      ids.push(chosen.id);
    }
    expect(new Set(ids).size).toBe(11);
    expect(history).toHaveLength(10);
    expect(history).not.toContain(ids[0]);
    expect(selectSplash(context(), generalOnly, ['invalid-id'], () => 0)?.history).toEqual(['splash-1']);
  });

  it('gives contextual/general/rare buckets 60/35/5 percent, independent of catalog size', () => {
    const buckets = { contextual: 0, general: 0, 'easter-egg': 0 };
    for (let index = 0; index < 1000; index++) {
      let call = 0;
      const chosen = selectSplash(context(), options, [], () => call++ === 0 ? (index + 0.5) / 1000 : 0)!;
      const splash = SPLASHES.find((candidate) => candidate.id === chosen.id)!;
      buckets[splash.bucket]++;
      expect(isSplashEligible(splash, context(), options)).toBe(true);
    }
    expect(buckets).toEqual({ contextual: 600, general: 350, 'easter-egg': 50 });
  });

  it('keeps rare splashes at five percent when contextual splashes are off', () => {
    const preferences = { ...options, contextual: false };
    let eggs = 0;
    for (let index = 0; index < 100; index++) {
      let call = 0;
      const chosen = selectSplash(context(), preferences, [], () => call++ === 0 ? (index + 0.5) / 100 : 0)!;
      if (SPLASHES.find((candidate) => candidate.id === chosen.id)?.bucket === 'easter-egg') eggs++;
    }
    expect(eggs).toBe(5);
  });

  it('supports retaining valid selections without consuming randomness', () => {
    const chosen = selectSplash(context(), generalOnly, [], () => 0)!;
    expect(isSplashIdEligible(chosen.id, context({ now: at(20) }), generalOnly)).toBe(true);
    expect(isSplashIdEligible('splash-277', context({ now: at(14, 1), tasks: [{ dueAt: at(14, 6) }] }), options)).toBe(false);
  });
});
