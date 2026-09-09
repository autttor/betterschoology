import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { loadFixtureAtRoute } from './helpers/fixtures';
import {
  openNativeNotifications,
  parseNotifications,
  parseRecentFeedback,
} from '@/src/schoology/adapters/dashboard';
import { renderNotifications, renderRecentFeedback } from '@/src/features/dashboard/panels';
import { betterDashboardEnhancement, resetDashboardCache, setActiveView } from '@/src/features/dashboard';
import { renderTodoPanel, resetTaskStore } from '@/src/features/todo';
import { taskKey, visibleTasks } from '@/src/features/todo/visibility';
import { defaultState } from '@/src/storage/defaults';
import { resolveRoute } from '@/src/schoology/router';
import type { EnhancementContext } from '@/src/schoology/lifecycle';
import type { BetterSchoologyState } from '@/src/types/settings';
import type { SchoologyTask } from '@/src/types';

/**
 * The 0.4 additions: hiding work, the rail's information panels, and the
 * rotating heading.
 *
 * The through-line of every case here is that Better Schoology reports what
 * Schoology actually said. It hides a task only when Schoology gave it a stable
 * identity, counts notifications only from an accessible label, and calls work
 * "graded" only when a grade is really there.
 */
const contexts: EnhancementContext[] = [];

function context(document: Document, mutate?: (state: BetterSchoologyState) => void): EnhancementContext {
  const state = defaultState();
  state.settings.betterDashboard = true;
  mutate?.(state);
  const result = { document, state, route: resolveRoute('/home'), requestPass: vi.fn() };
  contexts.push(result);
  return result;
}

const task = (overrides: Partial<SchoologyTask> = {}): SchoologyTask => ({
  title: 'Lab',
  status: 'upcoming',
  source: 'assignment',
  ...overrides,
});

beforeEach(() => {
  setActiveView('dashboard');
  resetTaskStore();
  resetDashboardCache();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
});

afterEach(() => {
  for (const item of contexts.splice(0)) betterDashboardEnhancement.revert?.(item);
  vi.restoreAllMocks();
});

describe('hiding work', () => {
  it('hides by a stable identity, so a renamed assignment stays hidden', () => {
    const state = defaultState();
    const original = task({ id: '123', href: '/assignment/123', status: 'overdue' });
    const key = taskKey(original)!;
    state.hiddenTasks[key] = { id: key, title: original.title, href: original.href };

    expect(visibleTasks([{ ...original, title: 'Renamed lab' }], state)).toEqual([]);
  });

  it('hides one task, not every task that shares its title', () => {
    const state = defaultState();
    const mine = task({ id: '1', href: '/assignment/1' });
    const namesake = task({ id: '2', href: '/assignment/2' });
    const key = taskKey(mine)!;
    state.hiddenTasks[key] = { id: key, title: mine.title };

    expect(visibleTasks([mine, namesake], state).map((entry) => entry.id)).toEqual(['2']);
  });

  it('refuses an identity it cannot make stable', () => {
    // No ID, no link, no due date: nothing here identifies one row rather than
    // a class of them, so it must not be hideable at all.
    expect(taskKey(task({ title: 'Reading' }))).toBeUndefined();
    expect(taskKey(task({ id: '9' }))).toBeDefined();
    expect(taskKey(task({ href: '/assignment/9' }))).toBeDefined();
  });

  it('deduplicates the same task arriving from two reads', () => {
    const state = defaultState();
    const duplicate = task({ id: '5', href: '/assignment/5' });

    expect(visibleTasks([duplicate, { ...duplicate }], state)).toHaveLength(1);
  });

  it('drops work from hidden courses only when asked to', () => {
    const state = defaultState();
    state.courses['100001'] = {
      id: '100001',
      originalName: 'Biology',
      href: '/course/100001',
      lastSeenAt: 0,
    };
    state.customizations['100001'] = { courseId: '100001', hidden: true };
    const item = task({ id: '7', href: '/assignment/7', courseId: '100001' });

    expect(visibleTasks([item], state)).toHaveLength(1);

    state.settings.dashboard.hideHiddenCourseTasks = true;
    expect(visibleTasks([item], state)).toHaveLength(0);
  });

  it('offers a keyboard-operable hide control only where identity is stable', () => {
    const { document } = loadFixtureAtRoute('home');
    const onHide = vi.fn();
    const panel = renderTodoPanel(
      document,
      [task({ id: '3', href: '/assignment/3' }), task({ title: 'Unidentifiable reading' })],
      { onHide, now: new Date('2026-09-08T12:00:00') },
    );

    const hides = panel.querySelectorAll<HTMLButtonElement>('.bs-task__hide');
    expect(hides).toHaveLength(1);
    expect(hides[0]!.tagName).toBe('BUTTON');
    expect(hides[0]!.getAttribute('aria-label')).toContain('Hide');

    hides[0]!.click();
    expect(onHide).toHaveBeenCalledOnce();
  });
});

describe('notifications', () => {
  function header(markup: string): Document {
    return new JSDOM(`<div id="header">${markup}</div>`).window.document;
  }

  it('reads a count only from an accessible label', () => {
    const doc = header('<button aria-label="Notifications, 3 new">bell</button>');
    expect(parseNotifications(doc)).toMatchObject({ available: true, count: 3 });
  });

  it('never invents unread state from an unlabelled icon', () => {
    const doc = header('<button><span class="badge">7</span></button>');
    const summary = parseNotifications(doc);

    expect(summary.count).toBeUndefined();
    expect(summary.available).toBe(false);
  });

  it('delegates to Schoology’s own control rather than reimplementing it', () => {
    const doc = header('<button aria-label="Notifications">bell</button>');
    const control = doc.querySelector('button')!;
    const clicked = vi.fn();
    control.addEventListener('click', clicked);

    openNativeNotifications(doc);
    expect(clicked).toHaveBeenCalledOnce();
  });

  it('renders the count, and an opener when Schoology offers one', () => {
    const doc = header('<button aria-label="Notifications, 2 new">bell</button>');
    const panel = renderNotifications(doc, parseNotifications(doc));

    expect(panel.querySelector('.bs-notify__count')!.textContent).toBe('2');
    expect(panel.querySelector('button, a')).not.toBeNull();
  });
});

describe('recent feedback', () => {
  it('reports only rows that actually carry a grade', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const items = parseRecentFeedback(document);

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.earned !== undefined || item.percentage !== undefined).toBe(true);
      if (item.href) expect(item.href).toMatch(/^\/assignment\/\d+/);
    }

    const ungraded = document.querySelectorAll('.item-row .no-grade').length;
    expect(ungraded).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(document.querySelectorAll('.item-row').length);
  });

  it('renders a comment as text, never as markup', () => {
    const { document } = loadFixtureAtRoute('home');
    const panel = renderRecentFeedback(
      document,
      [
        {
          courseId: '100001',
          courseName: 'Biology',
          assignmentName: 'Lab',
          feedbackPreview: '<img src=x onerror=alert(1)>',
          percentage: 92,
        },
      ],
      'loaded',
    );

    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('.bs-feedback__comment')!.textContent).toContain('<img');
  });

  it('has an honest state for loading, empty and unavailable', () => {
    const { document } = loadFixtureAtRoute('home');

    expect(renderRecentFeedback(document, [], 'loading').textContent).toContain('Reading');
    expect(renderRecentFeedback(document, [], 'loaded').textContent).toContain('Nothing graded');
    expect(renderRecentFeedback(document, [], 'unavailable').textContent).toContain('could not be read');
  });

  it('never claims a recency Schoology does not publish', () => {
    const { document } = loadFixtureAtRoute('home');
    const panel = renderRecentFeedback(
      document,
      [{ courseId: '100001', courseName: 'Biology', assignmentName: 'Lab', earned: 9, possible: 10 }],
      'loaded',
    );

    expect(panel.textContent).toContain('does not publish grading dates');
  });
});

describe('dashboard panels', () => {
  it('honours each panel toggle', async () => {
    const { document } = loadFixtureAtRoute('home');
    const ctx = context(document, (state) => {
      state.settings.dashboard = {
        showTodo: false,
        showNotifications: false,
        showRecentFeedback: false,
        showAnnouncements: false,
        showGpa: false,
        hideHiddenCourseTasks: false,
      };
    });

    await betterDashboardEnhancement.apply(ctx);

    const root = document.querySelector('[data-better-schoology="better-dashboard"]')!;
    expect(root.querySelector('.bs-todo')).toBeNull();
    expect(root.querySelector('.bs-notify-panel')).toBeNull();
    expect(root.querySelector('.bs-feedback-panel')).toBeNull();
    expect(root.querySelector('.bs-announcements-panel')).toBeNull();
    // Courses are the point of the page and are never a toggle.
    expect(root.querySelector('.bs-section--courses')).not.toBeNull();
  });

  it('gives up the rail column when nothing is left to put in it', async () => {
    const { document } = loadFixtureAtRoute('home');
    const ctx = context(document, (state) => {
      state.settings.dashboard = {
        showTodo: true,
        showNotifications: false,
        showRecentFeedback: false,
        showAnnouncements: false,
        showGpa: false,
        hideHiddenCourseTasks: false,
      };
    });

    await betterDashboardEnhancement.apply(ctx);

    const grid = document.querySelector('.bs-home__grid')!;
    expect(grid.querySelector('.bs-home__rail')).toBeNull();
    expect(grid.classList.contains('bs-home__grid--solo')).toBe(true);
  });

  it('puts action in the main column and information in the rail', async () => {
    const { document } = loadFixtureAtRoute('home');
    const ctx = context(document);

    await betterDashboardEnhancement.apply(ctx);

    const main = document.querySelector('.bs-home__main')!;
    const rail = document.querySelector('.bs-home__rail')!;

    expect(main.querySelector('.bs-section--courses')).not.toBeNull();
    expect(main.querySelector('.bs-todo')).not.toBeNull();
    expect(rail.querySelector('.bs-todo')).toBeNull();
    expect(rail.querySelector('.bs-notify-panel')).not.toBeNull();
    expect(rail.getAttribute('aria-label')).toBe('Updates');
    expect(document.querySelector('.bs-home__grid--solo')).toBeNull();
  });

  it('says a course has nothing due only when To Do was actually readable', async () => {
    const { document } = loadFixtureAtRoute('home');
    const ctx = context(document, (state) => {
      // One course with work in the fixture's To Do, one without.
      state.courses['100001'] = {
        id: '100001', originalName: 'Government', href: '/course/100001', lastSeenAt: 0,
      };
      state.courses['999999'] = {
        id: '999999', originalName: 'Study Hall', href: '/course/999999', lastSeenAt: 0,
      };
    });

    await betterDashboardEnhancement.apply(ctx);

    const cards = [...document.querySelectorAll('.bs-course-card')];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      // A card shows a task list or says nothing is due -- never both, and
      // never an unexplained gap.
      const tasks = card.querySelector('.bs-course-card__tasks');
      const none = card.querySelector('.bs-course-card__none');
      expect(Boolean(tasks) !== Boolean(none)).toBe(true);
    }
  });

  it('never fabricates a GPA before it has seen a grade', async () => {
    const { document } = loadFixtureAtRoute('home');
    const ctx = context(document);

    await betterDashboardEnhancement.apply(ctx);

    expect(document.querySelector('.bs-stat--gpa')).toBeNull();
  });
});
