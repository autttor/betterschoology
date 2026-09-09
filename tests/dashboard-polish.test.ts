import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { loadFixtureAtRoute } from './helpers/fixtures';
import { parseNotifications, openNativeNotifications, parseRecentFeedback, parseAnnouncements } from '@/src/schoology/adapters/dashboard';
import { renderNotifications, renderRecentFeedback } from '@/src/features/dashboard/panels';
import { betterDashboardEnhancement, dashboardCounts, renderDashboard, setActiveView } from '@/src/features/dashboard';
import { betterTodoEnhancement, getDashboardTasks, renderTodoPanel, resetTodoCache } from '@/src/features/todo';
import { taskKey, visibleTasks } from '@/src/features/todo/visibility';
import { defaultState } from '@/src/storage/defaults';
import { resolveAllCourses } from '@/src/storage/courses';
import { parseTodoPanel } from '@/src/schoology/adapters/todo';
import { resolveRoute } from '@/src/schoology/router';
import type { EnhancementContext } from '@/src/schoology/lifecycle';
import type { SchoologyTask } from '@/src/types';

const contexts: EnhancementContext[] = [];
function context(document: Document): EnhancementContext {
  const state = defaultState();
  state.settings.betterDashboard = true;
  const result = { document, state, route: resolveRoute('/home'), requestPass: vi.fn() };
  contexts.push(result);
  return result;
}
beforeEach(() => {
  setActiveView('dashboard');
  resetTodoCache();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
});
afterEach(() => {
  for (const item of contexts.splice(0)) betterDashboardEnhancement.revert?.(item);
  vi.restoreAllMocks();
});

describe('dashboard visibility and native behavior', () => {
  it('excludes hidden courses from cards, switcher and count, then restores them', () => {
    const { document } = loadFixtureAtRoute('home');
    const state = defaultState();
    state.courses['123'] = { id: '123', originalName: 'Biology', href: '/course/123', lastSeenAt: 0 };
    state.customizations['123'] = { courseId: '123', hidden: true };
    const hidden = renderDashboard(document, resolveAllCourses(state), vi.fn(), { state });
    expect(hidden.querySelectorAll('.better-schoology-course-card')).toHaveLength(0);
    expect(hidden.querySelectorAll('.better-schoology-course-switcher a')).toHaveLength(0);
    expect(dashboardCounts([], resolveAllCourses(state), new Date()).courses).toBe(0);
    delete state.customizations['123']!.hidden;
    const restored = renderDashboard(document, resolveAllCourses(state), vi.fn(), { state });
    expect(restored.querySelector('.better-schoology-course-card a')?.getAttribute('href')).toBe('/course/123');
    expect(restored.querySelectorAll('.better-schoology-course-switcher a')).toHaveLength(1);
    expect(dashboardCounts([], resolveAllCourses(state), new Date()).courses).toBe(1);
  });

  it('filters a stable task ID across title changes, preserves native href, and restores counts', () => {
    const { document } = loadFixtureAtRoute('home');
    const native = document.querySelector('.event-title > a')!;
    const href = native.getAttribute('href');
    const state = defaultState();
    const task: SchoologyTask = { id: '123', title: 'Lab', href: '/assignment/123', source: 'assignment', status: 'overdue' };
    const key = taskKey(task)!;
    state.hiddenTasks[key] = { id: key, title: task.title, href: task.href };
    expect(visibleTasks([{ ...task, title: 'Renamed lab' }], state)).toEqual([]);
    expect(dashboardCounts(visibleTasks([task], state), [], new Date()).overdue).toBe(0);
    delete state.hiddenTasks[key];
    const visible = visibleTasks([task], state);
    expect(dashboardCounts(visible, [], new Date()).overdue).toBe(1);
    expect(renderTodoPanel(document, visible).querySelector('a')?.getAttribute('href')).toBe('/assignment/123');
    expect(native.getAttribute('href')).toBe(href);
  });

  it('offers keyboard accessible overflow hiding only with a stable identity', () => {
    const { document } = loadFixtureAtRoute('home');
    const onHide = vi.fn();
    const task: SchoologyTask = { title: 'Lab', href: '/assignment/123', source: 'assignment', status: 'upcoming' };
    const panel = renderTodoPanel(document, [task, { ...task, href: undefined }], { onHide });
    expect(panel.querySelectorAll('details > summary')).toHaveLength(1);
    const action = panel.querySelector<HTMLButtonElement>('details button')!;
    expect(action.textContent).toBe('Hide from dashboard');
    action.click();
    expect(onHide).toHaveBeenCalledWith(task);
  });

  it('deduplicates and hides read-only rows by course, due time and title together', () => {
    const { document } = loadFixtureAtRoute('home');
    const readonly = parseTodoPanel(document).find((task) => !task.href)!;
    expect(readonly.title).toBe('Science & Engineering Edpuzzles (9/9)');
    const id = taskKey(readonly)!;
    expect(id).toMatch(/^readonly:/);
    const state = defaultState();
    expect(visibleTasks([readonly, readonly], state)).toHaveLength(1);
    state.hiddenTasks[id] = { id, title: readonly.title };
    expect(visibleTasks([readonly], state)).toHaveLength(0);
    expect(visibleTasks([{ ...readonly, courseName: 'Different course' }], state)).toHaveLength(1);
  });

  it('optionally excludes tasks from hidden courses without guessing ambiguous course names', () => {
    const state = defaultState();
    state.courses['123'] = { id: '123', originalName: 'Biology', href: '/course/123', lastSeenAt: 0 };
    state.customizations['123'] = { courseId: '123', hidden: true };
    const task: SchoologyTask = { title: 'Lab', courseName: 'Biology', source: 'assignment', status: 'upcoming' };
    expect(visibleTasks([task], state)).toHaveLength(1);
    state.settings.dashboard.hideHiddenCourseTasks = true;
    expect(visibleTasks([task], state)).toHaveLength(0);
    state.courses['456'] = { ...state.courses['123']!, id: '456', href: '/course/456' };
    expect(visibleTasks([task], state)).toHaveLength(1);
  });

  it('keeps Better To Do visible in Feed and restores native feed event handlers', () => {
    const { document } = loadFixtureAtRoute('home');
    const ctx = context(document);
    const feed = document.querySelector<HTMLElement>('#home-feed-container')!;
    const listener = vi.fn();
    feed.addEventListener('click', listener);
    betterDashboardEnhancement.apply(ctx);
    betterTodoEnhancement.apply(ctx);
    expect(document.querySelector('[data-better-schoology="dashboard-todo-slot"] .better-schoology-todo')).not.toBeNull();
    setActiveView('feed');
    betterDashboardEnhancement.apply(ctx);
    betterTodoEnhancement.apply(ctx);
    expect(document.querySelector('#right-column .better-schoology-todo')).not.toBeNull();
    expect(feed.classList.contains('better-schoology-hidden-by-dashboard')).toBe(false);
    feed.click();
    expect(listener).toHaveBeenCalledOnce();
    expect(document.querySelector('#home-feed-container')).toBe(feed);
  });

  it('uses the same task filter for fetched/DOM tasks and counts', () => {
    const { document } = loadFixtureAtRoute('home');
    const ctx = context(document);
    const tasks = parseTodoPanel(document);
    const first = tasks[0]!;
    const id = taskKey(first)!;
    ctx.state.hiddenTasks[id] = { id, title: first.title };
    expect(getDashboardTasks(ctx).tasks.some((task) => taskKey(task) === id)).toBe(false);
  });

  it('keeps the dashboard To Do toggle separate from Feed visibility', () => {
    const { document } = loadFixtureAtRoute('home');
    const ctx = context(document);
    ctx.state.settings.dashboard.showTodo = false;
    betterDashboardEnhancement.apply(ctx);
    expect(betterTodoEnhancement.appliesTo(ctx)).toBe(false);
    setActiveView('feed');
    betterDashboardEnhancement.apply(ctx);
    expect(betterTodoEnhancement.appliesTo(ctx)).toBe(true);
  });

  it('honors dashboard toggles and never fabricates GPA', () => {
    const { document } = loadFixtureAtRoute('home');
    const state = defaultState();
    state.settings.dashboard = { showTodo: false, showNotifications: false, showRecentFeedback: false, showAnnouncements: false, hideHiddenCourseTasks: false };
    const panel = renderDashboard(document, [], vi.fn(), { state });
    expect(panel.querySelectorAll('[data-dashboard-section]')).toHaveLength(0);
    expect(panel.querySelector('[data-better-schoology="dashboard-todo-slot"]')).toBeNull();
    expect(panel.querySelector('dd[title]')?.textContent).toBe('—');
    expect(panel.querySelector('dd[title]')?.getAttribute('title')).toContain('not provided');
  });

  it('does not reroll the splash on unrelated native mutations and applies the chosen name', () => {
    const { document } = loadFixtureAtRoute('home');
    const ctx = context(document);
    ctx.state.settings.displayNameOverride = 'Alex';
    ctx.state.settings.splash.contextual = false;
    ctx.state.settings.splash.easterEggs = false;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    betterDashboardEnhancement.apply(ctx);
    const text = document.querySelector('h1.better-schoology-splash')!.textContent;
    document.body.appendChild(document.createElement('span'));
    betterDashboardEnhancement.apply(ctx);
    expect(document.querySelector('h1.better-schoology-splash')!.textContent).toBe(text);
    expect(text).toContain('Alex');
    expect(text).not.toContain('[name]');
  });
});

describe('notifications', () => {
  it('reads accessible count-only data and delegates to the original handler', () => {
    const doc = new JSDOM('<div id="header"><button aria-label="Notifications, 2 unread"></button></div>').window.document;
    const native = doc.querySelector('button')!;
    const listener = vi.fn();
    native.addEventListener('click', listener);
    const summary = parseNotifications(doc);
    expect(summary).toEqual({ available: true, count: 2 });
    renderNotifications(doc, summary).querySelector('button')!.click();
    expect(listener).toHaveBeenCalledOnce();
    expect(doc.querySelector('button')).toBe(native);
  });
  it('preserves a native notifications link even when other header buttons exist', () => {
    const doc = new JSDOM('<div id="header"><button>Courses</button><a href="/notifications" aria-label="3 unread notifications">Notifications</a></div>').window.document;
    const summary = parseNotifications(doc);
    expect(summary.count).toBe(3);
    expect(renderNotifications(doc, summary).querySelector('a')?.getAttribute('href')).toBe('/notifications');
  });
  it('does not invent unread state or identify unlabeled icons by their position', () => {
    const doc = new JSDOM('<div id="header"><button>2</button></div>').window.document;
    expect(parseNotifications(doc)).toEqual({ available: false });
    expect(() => openNativeNotifications(doc)).not.toThrow();
    expect(renderNotifications(doc, parseNotifications(doc)).textContent).not.toContain('0 new');
  });
});

describe('feedback and announcements', () => {
  it('reads actual scored report rows, skips ungraded rows, and preserves assignment hrefs', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const items = parseRecentFeedback(document);
    expect(items.length).toBeGreaterThan(0);
    const item = items[0]!;
    expect(item.earned).toBeTypeOf('number');
    expect(item.possible).toBeTypeOf('number');
    expect(item.href).toMatch(/^\/assignment\/\d+/);
    expect(item.feedbackPreview).toBeUndefined();
    expect(renderRecentFeedback(document, items, 'loaded').textContent).toContain('does not provide grading dates');
  });
  it('uses visible comments only and renders a short text preview without executing markup', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const graded = document.querySelector('.item-row:has(.rounded-grade)')!;
    const comment = graded.querySelector('.comment-column .td-content-wrapper')!;
    comment.textContent = 'Good work on the analysis. <script>private()</script>';
    const items = parseRecentFeedback(document);
    expect(items[0]!.feedbackPreview).toContain('Good work');
    const panel = renderRecentFeedback(document, items, 'loaded');
    expect(panel.querySelector('script')).toBeNull();
    expect(panel.querySelector('.better-schoology-feedback-preview')?.textContent).toContain('<script>');
  });
  it('supports grade-only, percentage-only, missing feedback, and empty states', () => {
    const doc = new JSDOM('').window.document;
    const item = { courseId: '1', courseName: 'Biology', assignmentName: 'Lab', percentage: 95, href: '/assignment/123' };
    const panel = renderRecentFeedback(doc, [item], 'loaded');
    expect(panel.textContent).toContain('95%');
    expect(panel.querySelector('.better-schoology-feedback-preview')).toBeNull();
    expect(panel.querySelector('a')?.getAttribute('href')).toBe('/assignment/123');
    expect(renderRecentFeedback(doc, [], 'loaded').textContent).toContain('No graded assignments');
    expect(renderRecentFeedback(doc, [], 'unavailable').textContent).toContain('could not be loaded');
  });
  it('takes announcement text and course links from the captured feed', () => {
    const { document } = loadFixtureAtRoute('home');
    const items = parseAnnouncements(document);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.courseHref).toMatch(/^\/course\/\d+/);
    expect(items[0]!.preview.length).toBeLessThanOrEqual(220);
  });
});
