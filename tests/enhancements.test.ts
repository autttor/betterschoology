import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { fixtureIds, fixtureRoute, loadFixture, loadFixtureAtRoute } from './helpers/fixtures';
import { EnhancementLifecycle, type EnhancementContext } from '@/src/schoology/lifecycle';
import { resolveRoute } from '@/src/schoology/router';
import { defaultState } from '@/src/storage/defaults';
import type { BetterSchoologyState } from '@/src/types/settings';
import { DARK_ATTR, THEME_ATTR, applyTheme, clearTheme, resolveIsDark } from '@/src/features/theme';
import { courseOverridesEnhancement } from '@/src/features/courses';
import { HIDDEN_CLASS, betterDashboardEnhancement, setActiveView } from '@/src/features/dashboard';
import { betterTodoEnhancement, renderTodoPanel, resetTaskStore } from '@/src/features/todo';
import { courseSwitcherEnhancement, renderCourseSwitcher } from '@/src/features/courseSwitcher';
import { groupTasks, parseTodoPanel } from '@/src/schoology/adapters/todo';
import { parseAnnouncements } from '@/src/schoology/adapters/home';
import {
  APPS_COLLAPSED_CLASS,
  betterCoursesEnhancement,
  enhanceMaterials,
  setAppsExpanded,
} from '@/src/features/course';
import { betterAssignmentEnhancement } from '@/src/features/assignment';
import { betterGradesEnhancement, resetGradesUi } from '@/src/features/grades';
import { parseMaterialFolders, parseMaterialItems } from '@/src/schoology/adapters/materials';
import {
  parseAssignmentPage,
  parseDueDate,
  statusOf,
} from '@/src/schoology/adapters/assignment';
import { resolveCourse } from '@/src/storage/courses';
import type { SchoologyTask } from '@/src/types';
import { markEnhanced, isEnhanced, clearEnhanced, BS_ENHANCED_ATTR } from '@/src/schoology/selectors';

/**
 * Integration tests: real enhancements, run against the real (sanitized)
 * captured DOM, through the real lifecycle.
 *
 * Loading the extension itself into automated Firefox is not currently
 * practical (see docs/testing.md), so this layer carries the behavioural
 * coverage and `npm run dev:firefox` covers the browser integration manually.
 */
function stateWith(overrides: Partial<BetterSchoologyState>): BetterSchoologyState {
  const base = defaultState();
  return {
    ...base,
    ...overrides,
    settings: { ...base.settings, ...(overrides.settings ?? {}) },
  };
}

/**
 * Markup comparison that ignores whitespace *inside* class attributes.
 *
 * Adding and removing a class normalizes `class="page-title "` to
 * `class="page-title"`. The element, its classes and its behaviour are
 * identical; only the serialization differs, and asserting on that would make
 * the test about `classList` rather than about Better Schoology.
 */
function normalizedHtml(document: Document): string {
  return document.body.innerHTML.replace(/class="([^"]*)"/g, (_match, value: string) =>
    `class="${value.trim().replace(/\s+/g, ' ')}"`,
  );
}

function contextFor(
  document: Document,
  url: string,
  state: BetterSchoologyState,
): EnhancementContext {
  return {
    document,
    route: resolveRoute(`http://localhost:4173${url}`),
    state,
    requestPass: () => {},
  };
}

describe('idempotency markers', () => {
  it('marks an element once and reports it thereafter', () => {
    const dom = new JSDOM('<div id="x"></div>');
    const el = dom.window.document.getElementById('x')!;

    expect(markEnhanced(el, 'theme')).toBe(true);
    expect(markEnhanced(el, 'theme')).toBe(false);
    expect(isEnhanced(el, 'theme')).toBe(true);
  });

  it('tracks multiple features on one element independently', () => {
    const dom = new JSDOM('<div id="x"></div>');
    const el = dom.window.document.getElementById('x')!;

    markEnhanced(el, 'theme');
    markEnhanced(el, 'better-todo');
    expect(el.getAttribute(BS_ENHANCED_ATTR)).toBe('theme better-todo');

    clearEnhanced(el, 'theme');
    expect(isEnhanced(el, 'theme')).toBe(false);
    expect(isEnhanced(el, 'better-todo')).toBe(true);
  });

  /** Schoology's own markers are load-bearing and must never be touched. */
  it('uses its own namespace, not Schoology\'s -processed convention', async () => {
    const { document } = loadFixtureAtRoute('home');
    const before = document.querySelectorAll('.sEventUpcoming-processed').length;
    expect(before).toBeGreaterThan(0);

    const state = stateWith({ settings: { ...defaultState().settings, betterDashboard: true } });
    await betterDashboardEnhancement.apply(contextFor(document, '/home', state));

    expect(document.querySelectorAll('.sEventUpcoming-processed').length).toBe(before);
    expect(document.querySelector(`[${BS_ENHANCED_ATTR}]`)).not.toBeNull();
  });
});

describe('dark mode', () => {
  it('resolves system to the OS preference', () => {
    expect(resolveIsDark('system', true)).toBe(true);
    expect(resolveIsDark('system', false)).toBe(false);
    expect(resolveIsDark('dark', false)).toBe(true);
    expect(resolveIsDark('light', true)).toBe(false);
  });

  it('marks the document so scoped CSS applies', () => {
    const { document } = loadFixtureAtRoute('home');

    applyTheme(document, 'dark', false);
    expect(document.documentElement.getAttribute(THEME_ATTR)).toBe('dark');
    expect(document.documentElement.hasAttribute(DARK_ATTR)).toBe(true);
  });

  it('leaves light mode completely unmarked', () => {
    const { document } = loadFixtureAtRoute('home');

    applyTheme(document, 'light', true);
    expect(document.documentElement.hasAttribute(DARK_ATTR)).toBe(false);
  });

  it('removes every trace when reverted', () => {
    const { document } = loadFixtureAtRoute('home');

    applyTheme(document, 'dark', false);
    clearTheme(document);

    expect(document.documentElement.hasAttribute(THEME_ATTR)).toBe(false);
    expect(document.documentElement.hasAttribute(DARK_ATTR)).toBe(false);
  });

  /** The dark layer must target documented Schoology shell elements. */
  it('finds the shell elements the dark stylesheet targets', () => {
    const { document } = loadFixtureAtRoute('home');

    for (const selector of ['#main', '#right-column', '#todo', '.sgy-tabbed-navigation']) {
      expect(document.querySelector(selector), `missing ${selector}`).not.toBeNull();
    }
  });
});

describe('course overrides', () => {
  const courseState = (courseId: string, overrides: Record<string, unknown> = {}) =>
    stateWith({
      courses: {
        [courseId]: {
          id: courseId,
          originalName: 'Example Government',
          sectionName: '1(A)',
          href: `/course/${courseId}`,
          lastSeenAt: 0,
        },
      },
      customizations: { [courseId]: { courseId, ...overrides } },
    });

  it('replaces the displayed name on the global grades page', async () => {
    const { document } = loadFixtureAtRoute('global-grades');
    const panel = document.querySelector<HTMLElement>('.gradebook-course')!;
    const courseId = panel.id.replace('s-js-gradebook-course-', '');
    const anchor = panel.querySelector<HTMLAnchorElement>('.gradebook-course-title a')!;
    const originalHref = anchor.getAttribute('href');

    await courseOverridesEnhancement.apply(
      contextFor(document, '/grades/grades', courseState(courseId, { customName: 'AP Gov' })),
    );

    expect(anchor.textContent).toContain('AP Gov');
    // Identity is untouched: same panel ID, same href.
    expect(panel.id).toBe(`s-js-gradebook-course-${courseId}`);
    expect(anchor.getAttribute('href')).toBe(originalHref);
  });

  it('replaces the displayed name on a course page without touching the link', async () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const courseId = fixtureIds('course-materials').courseId!;
    const anchor = document.querySelector<HTMLAnchorElement>(
      '#center-top a[href^="/course/"]',
    )!;
    const originalHref = anchor.getAttribute('href');

    await courseOverridesEnhancement.apply(
      contextFor(
        document,
        fixtureRoute('course-materials'),
        courseState(courseId, { customName: 'AP Gov' }),
      ),
    );

    expect(anchor.textContent).toContain('AP Gov');
    expect(anchor.getAttribute('href')).toBe(originalHref);
    expect(originalHref).toBe(`/course/${courseId}`);
  });

  it('keeps the Schoology name reachable on hover after a rename', async () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const courseId = fixtureIds('course-materials').courseId!;
    const anchor = document.querySelector<HTMLAnchorElement>('#center-top a[href^="/course/"]')!;
    const originalText = anchor.textContent?.trim();

    await courseOverridesEnhancement.apply(
      contextFor(document, fixtureRoute('course-materials'), courseState(courseId, { customName: 'AP Gov' })),
    );

    expect(anchor.getAttribute('title')).toBe(originalText);
  });

  it('applies colors as scoped custom properties', async () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const courseId = fixtureIds('course-materials').courseId!;

    await courseOverridesEnhancement.apply(
      contextFor(
        document,
        fixtureRoute('course-materials'),
        courseState(courseId, { accentColor: '#ff0000', backgroundColor: '#001122' }),
      ),
    );

    const breadcrumb = document.querySelector<HTMLElement>('[data-bs-course-id]')!;
    expect(breadcrumb.style.getPropertyValue('--bs-course-accent')).toBe('#ff0000');
    expect(breadcrumb.style.getPropertyValue('--bs-course-bg')).toBe('#001122');
  });

  it('ignores an unsafe image URL and unsafe colors', async () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const courseId = fixtureIds('course-materials').courseId!;

    await courseOverridesEnhancement.apply(
      contextFor(
        document,
        fixtureRoute('course-materials'),
        courseState(courseId, { imageUrl: 'javascript:alert(1)', accentColor: 'red' }),
      ),
    );

    expect(document.documentElement.innerHTML).not.toContain('javascript:alert');
    const breadcrumb = document.querySelector<HTMLElement>('[data-bs-course-id]')!;
    expect(breadcrumb.style.getPropertyValue('--bs-course-accent')).toBe('');
  });

  it('restores the original name when the override is reverted', async () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const courseId = fixtureIds('course-materials').courseId!;
    const anchor = document.querySelector<HTMLAnchorElement>('#center-top a[href^="/course/"]')!;
    const originalText = anchor.textContent;

    const context = contextFor(
      document,
      fixtureRoute('course-materials'),
      courseState(courseId, { customName: 'AP Gov' }),
    );
    await courseOverridesEnhancement.apply(context);
    courseOverridesEnhancement.revert!(context);

    expect(anchor.textContent).toBe(originalText);
    expect(document.querySelector('[data-bs-course-id]')).toBeNull();
  });

  it('is idempotent across repeated passes', async () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const courseId = fixtureIds('course-materials').courseId!;
    const context = contextFor(
      document,
      fixtureRoute('course-materials'),
      courseState(courseId, { customName: 'AP Gov' }),
    );

    await courseOverridesEnhancement.apply(context);
    const afterFirst = document.querySelector('#center-top')!.innerHTML;
    await courseOverridesEnhancement.apply(context);
    await courseOverridesEnhancement.apply(context);

    expect(document.querySelector('#center-top')!.innerHTML).toBe(afterFirst);
    expect(document.body.textContent).not.toContain('AP GovAP Gov');
  });
});

describe('better dashboard', () => {
  beforeEach(() => {
    setActiveView('dashboard');
    resetTaskStore();
    // No network in unit tests: the fragment endpoints are exercised in
    // `adapters.test.ts` against recorded payloads. Here the DOM path is what
    // matters, so the endpoint read is made to fail deterministically.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  });

  afterEach(() => vi.unstubAllGlobals());

  const dashboardState = () =>
    stateWith({
      settings: { ...defaultState().settings, betterDashboard: true },
      courses: {
        '100001': {
          id: '100001',
          originalName: 'Example Government',
          sectionName: '1(A)',
          href: '/course/100001',
          lastSeenAt: 0,
        },
        '100002': {
          id: '100002',
          originalName: 'Example Biology',
          href: '/course/100002',
          lastSeenAt: 0,
        },
      },
    });

  const dashboardRoot = (document: Document) =>
    document.querySelector<HTMLElement>('[data-better-schoology="better-dashboard"]');

  it('adds a dashboard and hides — never removes — the native feed', async () => {
    const { document } = loadFixtureAtRoute('home');
    const feed = document.querySelector('#home-feed-container')!;

    await betterDashboardEnhancement.apply(contextFor(document, '/home', dashboardState()));

    expect(dashboardRoot(document)).not.toBeNull();
    // The native node is still in the document, with its handlers intact.
    expect(document.querySelector('#home-feed-container')).toBe(feed);
    expect(feed.classList.contains(HIDDEN_CLASS)).toBe(true);
  });

  it('takes over the right rail only once it has a task source', async () => {
    const { document } = loadFixtureAtRoute('home');
    const rail = document.querySelector('#right-column')!;

    await betterDashboardEnhancement.apply(contextFor(document, '/home', dashboardState()));

    expect(rail.classList.contains(HIDDEN_CLASS)).toBe(true);
    expect(document.querySelector('#todo')).not.toBeNull();
  });

  it('leaves the native rail alone when no task source could be read', async () => {
    const { document } = loadFixtureAtRoute('home');
    // Remove every To Do row, which is what a parse failure looks like.
    document.querySelector('#todo')!.remove();
    const rail = document.querySelector('#right-column')!;

    await betterDashboardEnhancement.apply(contextFor(document, '/home', dashboardState()));

    expect(rail.classList.contains(HIDDEN_CLASS)).toBe(false);
  });

  it('restores native surfaces when switched to Feed view', async () => {
    const { document } = loadFixtureAtRoute('home');
    const context = contextFor(document, '/home', dashboardState());

    await betterDashboardEnhancement.apply(context);
    setActiveView('feed');
    await betterDashboardEnhancement.apply(context);

    expect(document.querySelector('#home-feed-container')!.classList.contains(HIDDEN_CLASS)).toBe(
      false,
    );
    expect(document.querySelector('#right-column')!.classList.contains(HIDDEN_CLASS)).toBe(false);
    // The Better Schoology tab bar stays, so Dashboard is one click away.
    expect(dashboardRoot(document)!.querySelector('[role="tablist"]')).not.toBeNull();
  });

  it('opens on the view named by defaultHomeView', async () => {
    const { document } = loadFixtureAtRoute('home');
    setActiveView(null);
    const state = dashboardState();
    state.settings.defaultHomeView = 'feed';

    await betterDashboardEnhancement.apply(contextFor(document, '/home', state));

    expect(document.querySelector('#home-feed-container')!.classList.contains(HIDDEN_CLASS)).toBe(
      false,
    );
  });

  it('restores every native surface when the feature is turned off', async () => {
    const { document } = loadFixtureAtRoute('home');
    const context = contextFor(document, '/home', dashboardState());

    await betterDashboardEnhancement.apply(context);
    betterDashboardEnhancement.revert!(context);

    expect(dashboardRoot(document)).toBeNull();
    expect(document.querySelectorAll(`.${HIDDEN_CLASS}`).length).toBe(0);
    expect(document.documentElement.hasAttribute('data-bs-home-dashboard')).toBe(false);
  });

  it('renders course cards that link to the original course', async () => {
    const { document } = loadFixtureAtRoute('home');
    await betterDashboardEnhancement.apply(contextFor(document, '/home', dashboardState()));

    const link = document.querySelector<HTMLAnchorElement>(
      '.bs-course-card[data-bs-course-id="100001"] .bs-course-card__name a',
    )!;
    expect(link.getAttribute('href')).toBe('/course/100001');
    expect(document.querySelectorAll('.bs-course-card').length).toBe(2);
    // With nothing pinned, cards are ordered by the name the student sees.
    expect(
      Array.from(document.querySelectorAll('.bs-course-card')).map((card) =>
        card.getAttribute('data-bs-course-id'),
      ),
    ).toEqual(['100002', '100001']);
  });

  it('gives each card Materials, Updates and Grades links', async () => {
    const { document } = loadFixtureAtRoute('home');
    await betterDashboardEnhancement.apply(contextFor(document, '/home', dashboardState()));

    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        '.bs-course-card[data-bs-course-id="100001"] .bs-course-card__link',
      ),
    ).map((link) => link.getAttribute('href'));

    expect(links).toEqual([
      '/course/100001/materials',
      '/course/100001/updates',
      '/course/100001/student_grades',
    ]);
  });

  it('renders a custom name and image on its own card without changing the href', async () => {
    const { document } = loadFixtureAtRoute('home');
    const state = dashboardState();
    state.customizations['100001'] = {
      courseId: '100001',
      customName: 'AP Gov',
      imageUrl: 'https://example.com/cover.png',
    };

    await betterDashboardEnhancement.apply(contextFor(document, '/home', state));

    const card = document.querySelector<HTMLElement>('[data-bs-course-id="100001"]')!;
    const link = card.querySelector<HTMLAnchorElement>('.bs-course-card__name a')!;
    expect(link.textContent).toBe('AP Gov');
    expect(link.getAttribute('href')).toBe('/course/100001');
    // The Schoology name stays visible so the card is still identifiable.
    expect(card.querySelector('.bs-course-card__subtitle')!.textContent).toContain(
      'Example Government',
    );

    const image = card.querySelector<HTMLElement>('.bs-course-card__image')!;
    expect(image.style.backgroundImage).toContain('https://example.com/cover.png');
  });

  it('applies custom colors as scoped custom properties on the card', async () => {
    const { document } = loadFixtureAtRoute('home');
    const state = dashboardState();
    state.customizations['100001'] = {
      courseId: '100001',
      accentColor: '#ff0000',
      backgroundColor: '#001122',
      textColor: '#ffffff',
      mutedTextColor: '#cccccc',
    };

    await betterDashboardEnhancement.apply(contextFor(document, '/home', state));

    const card = document.querySelector<HTMLElement>('[data-bs-course-id="100001"]')!;
    expect(card.style.getPropertyValue('--bs-course-accent')).toBe('#ff0000');
    expect(card.style.getPropertyValue('--bs-course-bg')).toBe('#001122');
    expect(card.style.getPropertyValue('--bs-course-text')).toBe('#ffffff');
    expect(card.style.getPropertyValue('--bs-course-muted')).toBe('#cccccc');
  });

  it('puts pinned courses first and omits hidden ones', async () => {
    const { document } = loadFixtureAtRoute('home');
    const state = dashboardState();
    state.customizations['100002'] = { courseId: '100002', pinned: true };
    state.courses['100003'] = {
      id: '100003',
      originalName: 'Example Ceramics',
      href: '/course/100003',
      lastSeenAt: 0,
    };
    state.customizations['100003'] = { courseId: '100003', hidden: true };

    await betterDashboardEnhancement.apply(contextFor(document, '/home', state));

    const ids = Array.from(document.querySelectorAll('.bs-course-card')).map((card) =>
      card.getAttribute('data-bs-course-id'),
    );
    expect(ids).toEqual(['100002', '100001']);
  });

  it('summarizes announcements without mixing them into To Do', async () => {
    const { document } = loadFixtureAtRoute('home');
    await betterDashboardEnhancement.apply(contextFor(document, '/home', dashboardState()));

    const announcements = document.querySelectorAll('.bs-announcement');
    expect(announcements.length).toBeGreaterThan(0);
    // Announcements live in their own panel, never in the task list.
    expect(document.querySelectorAll('.bs-task-list .bs-announcement').length).toBe(0);
  });

  it('omits the announcements panel when the student turns it off', async () => {
    const { document } = loadFixtureAtRoute('home');
    const state = dashboardState();
    state.settings.showAnnouncements = false;

    await betterDashboardEnhancement.apply(contextFor(document, '/home', state));

    expect(document.querySelector('.bs-announcements-panel')).toBeNull();
  });

  it('does nothing on a page that is not a recognizable home', async () => {
    const { document } = loadFixtureAtRoute('assignment');
    const before = document.body.innerHTML;

    await betterDashboardEnhancement.apply(
      contextFor(document, fixtureRoute('assignment'), dashboardState()),
    );

    expect(document.body.innerHTML).toBe(before);
  });

  it('is idempotent across repeated passes', async () => {
    const { document } = loadFixtureAtRoute('home');
    const context = contextFor(document, '/home', dashboardState());

    await betterDashboardEnhancement.apply(context);
    await betterDashboardEnhancement.apply(context);
    await betterDashboardEnhancement.apply(context);

    expect(document.querySelectorAll('[data-better-schoology="better-dashboard"]').length).toBe(1);
    expect(document.querySelectorAll('.bs-course-card').length).toBe(2);
  });
});

describe('better to do', () => {
  const now = new Date('2026-09-08T12:00:00');

  beforeEach(() => {
    resetTaskStore();
    setActiveView('dashboard');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  });

  afterEach(() => vi.unstubAllGlobals());

  const task = (overrides: Partial<SchoologyTask>): SchoologyTask => ({
    title: 'Task',
    status: 'upcoming',
    source: 'assignment',
    ...overrides,
  });

  it('renders every parsed task, not just the ones Schoology shows', () => {
    const { document } = loadFixtureAtRoute('home');
    const tasks = parseTodoPanel(document);

    const panel = renderTodoPanel(document, tasks, { now });

    expect(panel.querySelectorAll('.bs-task').length).toBe(tasks.length);
    expect(tasks.length).toBeGreaterThan(7);
  });

  it('groups tasks into overdue, today, tomorrow, this week and later', () => {
    const groups = groupTasks(
      [
        task({ title: 'Late essay', status: 'overdue', dueAt: new Date('2026-09-01T23:59:00') }),
        task({ title: 'Today quiz', dueAt: new Date('2026-09-08T23:59:00') }),
        task({ title: 'Tomorrow lab', dueAt: new Date('2026-09-09T23:59:00') }),
        task({ title: 'Friday reading', dueAt: new Date('2026-09-11T23:59:00') }),
        task({ title: 'Next month project', dueAt: new Date('2026-10-20T23:59:00') }),
        task({ title: 'Someday' }),
      ],
      now,
    );

    expect(groups.map((group) => group.bucket)).toEqual([
      'overdue',
      'today',
      'tomorrow',
      'week',
      'later',
      'undated',
    ]);
    expect(groups[0]!.tasks[0]!.title).toBe('Late essay');
  });

  it('omits buckets that have nothing in them', () => {
    const groups = groupTasks([task({ title: 'Today quiz', dueAt: new Date('2026-09-08T09:00:00') })], now);
    expect(groups.map((group) => group.bucket)).toEqual(['today']);
  });

  it('trusts Schoology about what is overdue rather than the clock', () => {
    // A future due date that Schoology itself put in the overdue wrapper.
    const groups = groupTasks(
      [task({ status: 'overdue', dueAt: new Date('2026-09-20T23:59:00') })],
      now,
    );
    expect(groups[0]!.bucket).toBe('overdue');
  });

  it('marks overdue rows so they read as late without relying on colour', () => {
    const { document } = loadFixtureAtRoute('home');
    const panel = renderTodoPanel(document, parseTodoPanel(document), { now });

    const overdue = panel.querySelector('.bs-task--overdue')!;
    expect(overdue.textContent).toMatch(/days ago|Yesterday/);
  });

  it('keeps an unknown task type readable instead of dropping it', () => {
    const { document } = loadFixtureAtRoute('home');
    const panel = renderTodoPanel(
      document,
      [task({ title: 'Something new', source: 'unknown', dueAt: new Date('2026-09-08T15:00:00') })],
      { now },
    );

    expect(panel.textContent).toContain('Something new');
    expect(panel.querySelectorAll('.bs-task').length).toBe(1);
  });

  it('shows an empty state rather than an error when there is nothing due', () => {
    const { document } = loadFixtureAtRoute('home');
    const panel = renderTodoPanel(document, [], { now });

    expect(panel.querySelector('.bs-empty')).not.toBeNull();
    expect(panel.textContent).toContain('Nothing due');
  });

  it('carries Schoology hrefs through untouched', () => {
    const { document } = loadFixtureAtRoute('home');
    const panel = renderTodoPanel(document, parseTodoPanel(document), { now });

    const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>('a[href]'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/assignment\/\d+/);
  });

  it('mounts in the right rail when the dashboard is not showing it', async () => {
    const { document } = loadFixtureAtRoute('home');
    const state = stateWith({
      settings: { ...defaultState().settings, betterDashboard: false, betterTodo: true },
    });

    await betterTodoEnhancement.apply(contextFor(document, '/home', state));

    const panel = document.querySelector('[data-better-schoology="better-todo"]')!;
    expect(panel.closest('#right-column-inner')).not.toBeNull();
    // Schoology's own To Do panel is still there, untouched, below ours.
    expect(document.querySelector('#todo')).not.toBeNull();
  });

  it('stands down in the rail when the dashboard owns the list', async () => {
    const { document } = loadFixtureAtRoute('home');
    const state = stateWith({
      settings: { ...defaultState().settings, betterDashboard: true, betterTodo: true },
    });
    const context = contextFor(document, '/home', state);

    await betterDashboardEnhancement.apply(context);
    await betterTodoEnhancement.apply(context);

    expect(document.querySelector('[data-better-schoology="better-todo"]')).toBeNull();
    expect(document.querySelector('[data-better-schoology="better-dashboard"] .bs-task')).not.toBeNull();
  });

  it('leaves the native panel alone when no task source is available', async () => {
    const { document } = loadFixtureAtRoute('home');
    document.querySelector('#todo')!.remove();
    const state = stateWith({
      settings: { ...defaultState().settings, betterDashboard: false, betterTodo: true },
    });

    await betterTodoEnhancement.apply(contextFor(document, '/home', state));

    expect(document.querySelector('[data-better-schoology="better-todo"]')).toBeNull();
  });
});

describe('announcement parsing', () => {
  it('summarizes Recent Activity posts with a proven course ID', () => {
    const { document } = loadFixtureAtRoute('home');
    const announcements = parseAnnouncements(document);

    expect(announcements.length).toBeGreaterThan(0);
    const withCourse = announcements.find((announcement) => announcement.courseId);
    expect(withCourse?.courseId).toMatch(/^\d+$/);
    expect(withCourse?.author).toBeTruthy();
  });

  it('never returns raw markup in an excerpt', () => {
    const { document } = loadFixtureAtRoute('home');
    for (const announcement of parseAnnouncements(document)) {
      expect(announcement.excerpt ?? '').not.toContain('<');
    }
  });
});

describe('compact course switcher', () => {
  const courses = () =>
    [
      resolveCourse(
        { id: '100001', originalName: 'Example Government', sectionName: '1(A)', href: '/course/100001' },
        { courseId: '100001', customName: 'AP Gov', pinned: true },
      ),
      resolveCourse(
        { id: '100002', originalName: 'Example Biology', href: '/course/100002' },
        undefined,
      ),
      resolveCourse(
        { id: '100003', originalName: 'Example Ceramics', href: '/course/100003' },
        { courseId: '100003', hidden: true },
      ),
    ];

  it('lists visible courses by custom name, pinned first, hidden omitted', () => {
    const { document } = loadFixtureAtRoute('home');
    const switcher = renderCourseSwitcher(document, { courses: courses() });

    const names = Array.from(switcher.root.querySelectorAll('.bs-switcher__name')).map(
      (node) => node.textContent,
    );
    expect(names).toEqual(['AP Gov', 'Example Biology']);
  });

  it('preserves the original Schoology href for every course', () => {
    const { document } = loadFixtureAtRoute('home');
    const switcher = renderCourseSwitcher(document, { courses: courses() });

    const hrefs = Array.from(
      switcher.root.querySelectorAll<HTMLAnchorElement>('.bs-switcher__link'),
    ).map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['/course/100001', '/course/100002']);
  });

  it('finds a hidden course when it is searched for by name', () => {
    const { document } = loadFixtureAtRoute('home');
    const switcher = renderCourseSwitcher(document, { courses: courses() });
    document.body.appendChild(switcher.root);

    switcher.open();
    const search = switcher.root.querySelector<HTMLInputElement>('.bs-switcher__search')!;
    search.value = 'ceramics';
    search.dispatchEvent(new document.defaultView!.Event('input'));

    const names = Array.from(switcher.root.querySelectorAll('.bs-switcher__name')).map(
      (node) => node.textContent,
    );
    expect(names).toEqual(['Example Ceramics']);
  });

  it('opens and closes from the keyboard', () => {
    const { document } = loadFixtureAtRoute('home');
    const view = document.defaultView!;
    const switcher = renderCourseSwitcher(document, { courses: courses() });
    document.body.appendChild(switcher.root);

    expect(switcher.isOpen()).toBe(false);
    switcher.trigger.dispatchEvent(
      new view.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    expect(switcher.isOpen()).toBe(true);
    expect(switcher.trigger.getAttribute('aria-expanded')).toBe('true');

    switcher.root
      .querySelector('.bs-switcher__search')!
      .dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(switcher.isOpen()).toBe(false);
  });

  it('mounts beside the native header menu without altering it', () => {
    const { document } = loadFixtureAtRoute('home');
    const nativeTriggers = document.querySelectorAll('#header [data-sgy-sitenav="nav-trigger"]');
    const state = stateWith({
      courses: {
        '100001': {
          id: '100001',
          originalName: 'Example Government',
          href: '/course/100001',
          lastSeenAt: 0,
        },
      },
    });

    const context = contextFor(document, '/home', state);
    courseSwitcherEnhancement.apply(context);

    expect(document.querySelector('[data-better-schoology="course-switcher"]')).not.toBeNull();
    // Every native trigger is still exactly where Schoology put it.
    expect(document.querySelectorAll('#header [data-sgy-sitenav="nav-trigger"]').length).toBe(
      nativeTriggers.length,
    );

    courseSwitcherEnhancement.revert!(context);
    expect(document.querySelector('[data-better-schoology="course-switcher"]')).toBeNull();
  });

  it('stays away entirely when no course has been discovered yet', () => {
    const { document } = loadFixtureAtRoute('home');
    courseSwitcherEnhancement.apply(contextFor(document, '/home', stateWith({})));
    expect(document.querySelector('[data-better-schoology="course-switcher"]')).toBeNull();
  });
});

describe('better courses', () => {
  const courseState = (overrides: Partial<BetterSchoologyState> = {}) =>
    stateWith({
      settings: { ...defaultState().settings, betterCourses: true },
      courses: {
        '100001': {
          id: '100001',
          originalName: 'Example Government',
          sectionName: '1(A)',
          href: '/course/100001',
          lastSeenAt: 0,
        },
      },
      ...overrides,
    });

  it('detects the course materials page and adds a header', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const route = fixtureRoute('course-materials');

    expect(resolveRoute(`http://localhost:4173${route}`).type).toBe('course-materials');
    betterCoursesEnhancement.apply(contextFor(document, route, courseState()));

    const header = document.querySelector('.bs-course-header')!;
    expect(header).not.toBeNull();
    expect(header.querySelector('.bs-course-header__name')!.textContent).toBe(
      'Example Government',
    );
  });

  it('builds its nav from the native menu hrefs, in a student order', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const route = fixtureRoute('course-materials');
    const nativeLinks = document.querySelectorAll('#menu-s-main a[href]').length;

    betterCoursesEnhancement.apply(contextFor(document, route, courseState()));

    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.bs-course-nav-link'),
    );
    expect(links.map((link) => link.textContent)).toEqual([
      'Materials',
      'Updates',
      'Grades',
      'Members',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/course/100001/materials',
      '/course/100001/updates',
      '/course/100001/student_grades',
      '/course/100001/members',
    ]);
    // The native menu is untouched: same links, still there.
    expect(document.querySelectorAll('#menu-s-main a[href]').length).toBe(nativeLinks);
  });

  it('marks the current section in the nav', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    betterCoursesEnhancement.apply(
      contextFor(document, fixtureRoute('course-materials'), courseState()),
    );

    const active = document.querySelector('.bs-course-nav-link.is-active')!;
    expect(active.textContent).toBe('Materials');
    expect(active.getAttribute('aria-current')).toBe('page');
  });

  it('shows the custom course name and keeps the Schoology one visible', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const state = courseState();
    state.customizations['100001'] = { courseId: '100001', customName: 'AP Gov' };

    betterCoursesEnhancement.apply(
      contextFor(document, fixtureRoute('course-materials'), state),
    );

    expect(document.querySelector('.bs-course-header__name')!.textContent).toBe('AP Gov');
    expect(document.querySelector('.bs-course-header__subtitle')!.textContent).toContain(
      'Example Government',
    );
  });

  /**
   * The field regression: a tenant whose course page heads with the section
   * alone had its header read "8(B-D)". The registry knows the name; the page
   * knows the section; the header takes the best of each.
   */
  it('uses the known course name when the page heads with only a section', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    document.querySelector('#center-top h1.page-title')!.innerHTML =
      '<a href="/course/100001">8(B-D)</a>';

    const state = courseState();
    state.courses['100001'] = {
      id: '100001',
      originalName: 'Math Concepts & Applications L2',
      href: '/course/100001',
      lastSeenAt: 0,
    };

    betterCoursesEnhancement.apply(
      contextFor(document, fixtureRoute('course-materials'), state),
    );

    expect(document.querySelector('.bs-course-header__name')!.textContent).toBe(
      'Math Concepts & Applications L2',
    );
    expect(document.querySelector('.bs-course-header__subtitle')!.textContent).toBe('8(B-D)');
  });

  it('collapses third-party apps behind a disclosure button by default', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const appLinks = document.querySelectorAll('.app-link-wrapper').length;
    expect(appLinks).toBeGreaterThan(0);

    setAppsExpanded(false);
    betterCoursesEnhancement.apply(
      contextFor(document, fixtureRoute('course-materials'), courseState()),
    );

    const toggle = document.querySelector<HTMLButtonElement>('.bs-apps-toggle__button')!;
    expect(toggle.textContent).toContain(`Apps (${appLinks})`);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('#menu-s-apps-list')!.classList.contains(APPS_COLLAPSED_CLASS)).toBe(
      true,
    );
    // Collapsed, not removed: every app link is still in the document, with
    // its own href.
    expect(document.querySelectorAll('.app-link-wrapper').length).toBe(appLinks);
  });

  it('expands the app list when the disclosure is activated', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    setAppsExpanded(false);
    const context = contextFor(document, fixtureRoute('course-materials'), courseState());

    betterCoursesEnhancement.apply(context);
    document.querySelector<HTMLButtonElement>('.bs-apps-toggle__button')!.click();
    betterCoursesEnhancement.apply(context);

    expect(document.querySelector('#menu-s-apps-list')!.classList.contains(APPS_COLLAPSED_CLASS)).toBe(
      false,
    );
  });

  it('leaves the app list expanded when the setting says show', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const state = courseState();
    state.settings.appsVisibility = 'show';

    betterCoursesEnhancement.apply(
      contextFor(document, fixtureRoute('course-materials'), state),
    );

    expect(document.querySelector('.bs-apps-toggle__button')).toBeNull();
    expect(document.querySelector('#menu-s-apps-list')!.classList.contains(APPS_COLLAPSED_CLASS)).toBe(
      false,
    );
  });

  it('never alters an app link or its URL', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const before = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.app-link-wrapper a'),
    ).map((link) => `${link.getAttribute('href')}|${link.textContent}`);

    betterCoursesEnhancement.apply(
      contextFor(document, fixtureRoute('course-materials'), courseState()),
    );

    const after = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.app-link-wrapper a'),
    ).map((link) => `${link.getAttribute('href')}|${link.textContent}`);
    expect(after).toEqual(before);
  });

  it('restyles the materials table rather than rebuilding it', () => {
    const { document } = loadFixtureAtRoute('course-folder');
    const rows = Array.from(document.querySelectorAll('#folder-contents-table tr'));

    enhanceMaterials(document, 'comfortable');

    const after = Array.from(document.querySelectorAll('#folder-contents-table tr'));
    // The very same row elements, so every Schoology handler still applies.
    expect(after).toEqual(rows);
    expect(document.querySelector('#folder-contents-table')!.classList.contains('bs-materials')).toBe(
      true,
    );
  });

  it('keeps folder rows and their expanders intact', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const folder = document.querySelector('tr.material-row-folder')!;
    const expander = folder.querySelector('.folder-expander');

    enhanceMaterials(document, 'comfortable');

    expect(document.querySelector('tr.material-row-folder')).toBe(folder);
    expect(folder.querySelector('.folder-expander')).toBe(expander);
  });

  it('restores the page completely when reverted', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const context = contextFor(document, fixtureRoute('course-materials'), courseState());
    const before = normalizedHtml(document);

    betterCoursesEnhancement.apply(context);
    betterCoursesEnhancement.revert!(context);

    expect(normalizedHtml(document)).toBe(before);
    expect(document.querySelectorAll('[data-better-schoology]').length).toBe(0);
    expect(document.documentElement.hasAttribute('data-bs-course-layout')).toBe(false);
  });

  it('does nothing on a course page whose menu it does not recognize', () => {
    const dom = new JSDOM('<body><div id="center-top"><h1 class="page-title">Course</h1></div></body>', {
      url: 'http://localhost:4173/course/100001/materials',
    });
    const before = dom.window.document.body.innerHTML;

    betterCoursesEnhancement.apply(
      contextFor(dom.window.document, '/course/100001/materials', courseState()),
    );

    expect(dom.window.document.body.innerHTML).toBe(before);
  });
});

describe('materials parsing', () => {
  it('reads title, type, href and due text from folder contents', () => {
    const { document } = loadFixtureAtRoute('course-folder');
    const items = parseMaterialItems(document);

    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    expect(first.title).toBeTruthy();
    expect(first.type).toBe('assignment');
    expect(first.href).toMatch(/^\/assignment\/\d+$/);
    expect(first.dueText).toMatch(/^Due /);
  });

  it('reads folders from the materials root', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const folders = parseMaterialFolders(document);

    expect(folders.length).toBeGreaterThan(0);
    expect(folders[0]!.href).toMatch(/\?f=\d+$/);
  });
});

describe('better assignment', () => {
  const assignmentState = () =>
    stateWith({
      settings: { ...defaultState().settings, betterAssignments: true },
      courses: {
        '100001': {
          id: '100001',
          originalName: 'Example Government',
          href: '/course/100001',
          lastSeenAt: 0,
        },
      },
    });

  it('detects an assignment page and reorganizes it', () => {
    const { document } = loadFixtureAtRoute('assignment');
    const route = fixtureRoute('assignment');

    expect(resolveRoute(`http://localhost:4173${route}`).type).toBe('assignment');
    betterAssignmentEnhancement.apply(contextFor(document, route, assignmentState()));

    expect(document.querySelector('[data-better-schoology="better-assignment"]')).not.toBeNull();
    expect(document.querySelector('.bs-assignment__title')!.textContent).toBeTruthy();
  });

  it('shows the due date it parsed from the page', () => {
    const { document } = loadFixtureAtRoute('assignment');
    betterAssignmentEnhancement.apply(
      contextFor(document, fixtureRoute('assignment'), assignmentState()),
    );

    expect(document.querySelector('.bs-assignment__due')!.textContent).toContain('Due');
  });

  it('MOVES the native submit control instead of recreating it', () => {
    const { document } = loadFixtureAtRoute('assignment');
    const nativeSubmit = document.querySelector('.dropbox-submit')!;
    const nativeHref = nativeSubmit.getAttribute('href');

    betterAssignmentEnhancement.apply(
      contextFor(document, fixtureRoute('assignment'), assignmentState()),
    );

    // The exact same element, with every handler Schoology bound to it, now
    // inside our panel. Not a copy: there is still only one of them.
    expect(document.querySelectorAll('.dropbox-submit').length).toBe(1);
    expect(document.querySelector('.dropbox-submit')).toBe(nativeSubmit);
    expect(nativeSubmit.getAttribute('href')).toBe(nativeHref);
    expect(nativeSubmit.closest('[data-better-schoology="better-assignment"]')).not.toBeNull();
  });

  it('refuses to move a submission block containing an iframe', () => {
    const { document } = loadFixtureAtRoute('assignment');
    const block = document.querySelector('.drop-items')!;
    const originalParent = block.parentElement;
    block.appendChild(document.createElement('iframe'));

    betterAssignmentEnhancement.apply(
      contextFor(document, fixtureRoute('assignment'), assignmentState()),
    );

    // Reparenting would reload the editor and lose whatever was typed.
    expect(block.parentElement).toBe(originalParent);
    expect(document.querySelector('.bs-assignment__side')!.textContent).toContain('sidebar');
  });

  it('shows the grade as points and a derived percentage', () => {
    const { document } = loadFixtureAtRoute('assignment');
    betterAssignmentEnhancement.apply(
      contextFor(document, fixtureRoute('assignment'), assignmentState()),
    );

    expect(document.querySelector('.bs-assignment__grade-points')!.textContent).toBe('5 / 5');
    expect(document.querySelector('.bs-assignment__grade-percent')!.textContent).toBe('100%');
  });

  it('shows no grade block at all when there is no grade', () => {
    const { document } = loadFixtureAtRoute('assignment');
    document.querySelector('.received-grade')!.textContent = '--';

    betterAssignmentEnhancement.apply(
      contextFor(document, fixtureRoute('assignment'), assignmentState()),
    );

    expect(document.querySelector('.bs-assignment__grade')).toBeNull();
  });

  it('applies the custom course name to the assignment header', () => {
    const { document } = loadFixtureAtRoute('assignment');
    const state = assignmentState();
    state.customizations['100001'] = { courseId: '100001', customName: 'AP Gov' };

    betterAssignmentEnhancement.apply(
      contextFor(document, fixtureRoute('assignment'), state),
    );

    const course = document.querySelector<HTMLAnchorElement>('.bs-assignment__course')!;
    expect(course.textContent).toBe('AP Gov');
    expect(course.getAttribute('href')).toBe('/course/100001');
  });

  it('puts every moved native node back when reverted', () => {
    const { document } = loadFixtureAtRoute('assignment');
    const context = contextFor(document, fixtureRoute('assignment'), assignmentState());
    const before = normalizedHtml(document);

    betterAssignmentEnhancement.apply(context);
    betterAssignmentEnhancement.revert!(context);

    // Every moved element is back where Schoology had it, in the same order.
    expect(normalizedHtml(document)).toBe(before);
    expect(document.querySelectorAll('[data-bs-native-home]').length).toBe(0);
    expect(document.querySelector('.drop-items')!.closest('#right-column-inner')).not.toBeNull();
  });

  it('does nothing on a page that is not an assignment', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const before = document.body.innerHTML;

    betterAssignmentEnhancement.apply(
      contextFor(document, '/assignment/999999/info', assignmentState()),
    );

    expect(document.body.innerHTML).toBe(before);
  });
});

describe('assignment parsing', () => {
  it('parses grade, category, period and the submit control', () => {
    const { document } = loadFixtureAtRoute('assignment');
    const assignment = parseAssignmentPage(document, fixtureRoute('assignment'))!;

    expect(assignment).not.toBeNull();
    expect(assignment.earned).toBe(5);
    expect(assignment.possible).toBe(5);
    expect(assignment.category).toBe('classwork');
    expect(assignment.gradingPeriod).toBe('Q1 26-27');
    expect(assignment.hasSubmitControl).toBe(true);
    expect(assignment.status).toBe('graded');
  });

  it('reports a status only from signals the page proves', () => {
    const past = new Date('2026-09-01T00:00:00');
    const future = new Date('2026-12-01T00:00:00');
    const now = new Date('2026-09-08T12:00:00');

    expect(statusOf(5, past, now)).toBe('graded');
    expect(statusOf(undefined, past, now)).toBe('overdue');
    expect(statusOf(undefined, future, now)).toBe('due');
    expect(statusOf(undefined, undefined, now)).toBe('unknown');
  });

  it('returns no due date rather than a wrong one when the text will not parse', () => {
    expect(parseDueDate('Due: sometime next week')).toBeUndefined();
    expect(parseDueDate('')).toBeUndefined();
    expect(parseDueDate('Due: Thursday, September 3, 2026 at 11:59 pm')?.getFullYear()).toBe(2026);
  });
});

describe('better grades', () => {
  beforeEach(() => resetGradesUi());

  const gradesState = () =>
    stateWith({ settings: { ...defaultState().settings, betterGrades: true } });

  it('renders a summary above the native report and hides the native table', async () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const route = fixtureRoute('course-grades');
    const nativeTable = document.querySelector('#folder-contents-table, .gradebook-course-grades table')!;

    await betterGradesEnhancement.apply(contextFor(document, route, gradesState()));

    expect(document.querySelector('[data-better-schoology="better-grades"]')).not.toBeNull();
    expect(document.querySelector('.bs-grades__value')).not.toBeNull();
    // The native table is hidden, never removed.
    expect(document.querySelector('.gradebook-course-grades table')).toBe(nativeTable);
    expect(nativeTable.classList.contains('bs-hidden-by-grades')).toBe(true);
  });

  it('shows the percentage Schoology itself displayed', async () => {
    const { document } = loadFixtureAtRoute('course-grades');
    await betterGradesEnhancement.apply(
      contextFor(document, fixtureRoute('course-grades'), gradesState()),
    );

    expect(document.querySelector('.bs-grades__value')!.textContent).toBe('100%');
    expect(document.querySelector('.bs-grades__source')!.textContent).toBe('Shown by Schoology');
  });

  it('never shows a category weight Schoology did not render', async () => {
    const { document } = loadFixtureAtRoute('course-grades');
    await betterGradesEnhancement.apply(
      contextFor(document, fixtureRoute('course-grades'), gradesState()),
    );

    // The capture's courses are point-based.
    expect(document.querySelectorAll('.bs-grade-category__weight').length).toBe(0);
    expect(document.querySelector('.bs-grades__facts')!.textContent).toContain('Total points');
  });

  it('applies the letter from the student’s own scale and says so', async () => {
    const { document } = loadFixtureAtRoute('course-grades');
    await betterGradesEnhancement.apply(
      contextFor(document, fixtureRoute('course-grades'), gradesState()),
    );

    expect(document.querySelector('.bs-grades__letter')!.textContent).toBe('A');
    expect(document.querySelector('.bs-grades')!.textContent).toContain('your own grading scale');
  });

  it('expands a category to its assignments, linking to Schoology', async () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const context = contextFor(document, fixtureRoute('course-grades'), gradesState());

    await betterGradesEnhancement.apply(context);
    document.querySelector<HTMLButtonElement>('.bs-grade-category__head')!.click();
    await betterGradesEnhancement.apply(context);

    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.bs-grade-items a.bs-grade-item__title'),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/assignment\/\d+/);
  });

  it('parses every course on the global grades page', async () => {
    const { document } = loadFixtureAtRoute('global-grades');
    await betterGradesEnhancement.apply(
      contextFor(document, fixtureRoute('global-grades'), gradesState()),
    );

    const panels = document.querySelectorAll('[data-better-schoology="better-grades"]');
    expect(panels.length).toBeGreaterThan(5);
  });

  it('adds a GPA panel on the global page only, with its disclosures', async () => {
    const { document } = loadFixtureAtRoute('global-grades');
    await betterGradesEnhancement.apply(
      contextFor(document, fixtureRoute('global-grades'), gradesState()),
    );

    const gpa = document.querySelector('[data-better-schoology="better-gpa"]')!;
    expect(gpa).not.toBeNull();
    expect(gpa.textContent).toContain('not an official GPA');
    expect(gpa.textContent).toContain('Calculated by Better Schoology');
    // Above the course list, not inside a list item.
    expect(gpa.closest('li')).toBeNull();
  });

  it('does not add a GPA panel to a single course’s page', async () => {
    const { document } = loadFixtureAtRoute('course-grades');
    await betterGradesEnhancement.apply(
      contextFor(document, fixtureRoute('course-grades'), gradesState()),
    );

    expect(document.querySelector('[data-better-schoology="better-gpa"]')).toBeNull();
  });

  it('restores the native report completely when reverted', async () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const context = contextFor(document, fixtureRoute('course-grades'), gradesState());
    const before = normalizedHtml(document);

    await betterGradesEnhancement.apply(context);
    betterGradesEnhancement.revert!(context);

    expect(normalizedHtml(document)).toBe(before);
    expect(document.querySelectorAll('.bs-hidden-by-grades').length).toBe(0);
  });

  it('does nothing on a page with no grade report', async () => {
    const { document } = loadFixtureAtRoute('home');
    const before = document.body.innerHTML;

    await betterGradesEnhancement.apply(contextFor(document, '/grades/grades', gradesState()));

    expect(document.body.innerHTML).toBe(before);
  });

  it('leaves the page alone when the feature is off', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const state = stateWith({ settings: { ...defaultState().settings, betterGrades: false } });

    expect(
      betterGradesEnhancement.appliesTo(
        contextFor(document, fixtureRoute('course-grades'), state),
      ),
    ).toBe(false);
  });
});

describe('fail-open behaviour', () => {
  it('leaves an unknown Schoology page untouched', async () => {
    const dom = new JSDOM('<body><div id="main">Some other Schoology page</div></body>', {
      url: 'http://localhost:4173/resources',
    });
    const document = dom.window.document;
    const before = document.body.innerHTML;
    const state = stateWith({
      settings: { ...defaultState().settings, betterDashboard: true, betterTodo: true },
    });

    const context = contextFor(document, '/resources', state);
    expect(betterDashboardEnhancement.appliesTo(context)).toBe(false);
    await courseOverridesEnhancement.apply(context);

    expect(document.body.innerHTML).toBe(before);
  });

  it('keeps native Schoology usable when an enhancement throws', async () => {
    const { document } = loadFixtureAtRoute('home');
    const before = document.body.innerHTML;

    const lifecycle = new EnhancementLifecycle({ document, debounceMs: 0 });
    lifecycle.register({
      id: 'exploding',
      appliesTo: () => true,
      apply: () => {
        throw new Error('boom');
      },
    });

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    lifecycle.start(defaultState());
    await new Promise((resolve) => setTimeout(resolve, 20));
    lifecycle.stop();
    errors.mockRestore();

    expect(document.body.innerHTML).toBe(before);
  });

  /**
   * The master switch: with everything off, the page must be byte-identical to
   * what Schoology rendered.
   */
  it('leaves the page byte-identical when the extension is disabled', async () => {
    const { document } = loadFixtureAtRoute('home');
    const before = document.documentElement.outerHTML;

    const disabled = stateWith({
      settings: {
        ...defaultState().settings,
        enabled: false,
        theme: 'light',
        betterDashboard: false,
        betterTodo: false,
        compactCourseSwitcher: false,
      },
    });

    const context = contextFor(document, '/home', disabled);
    expect(betterDashboardEnhancement.appliesTo(context)).toBe(false);
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe('lifecycle', () => {
  it('runs a pass on start and again when Schoology mutates the DOM', async () => {
    const { document } = loadFixture('home', '/home');
    let passes = 0;

    const lifecycle = new EnhancementLifecycle({ document, debounceMs: 5 });
    lifecycle.register({
      id: 'counter',
      appliesTo: () => true,
      apply: () => {
        passes += 1;
      },
    });

    lifecycle.start(defaultState());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(passes).toBe(1);

    // Simulate Schoology's AJAX fragment insertion.
    document.querySelector('.upcoming-list')?.appendChild(document.createElement('div'));
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(passes).toBe(2);
    lifecycle.stop();
  });

  /**
   * The observer is disconnected while a pass runs, so an enhancement writing
   * to the DOM cannot re-trigger itself.
   */
  it('does not loop when an enhancement writes to the DOM', async () => {
    const { document } = loadFixture('home', '/home');
    let passes = 0;

    const lifecycle = new EnhancementLifecycle({ document, debounceMs: 5 });
    lifecycle.register({
      id: 'writer',
      appliesTo: () => true,
      apply: (context) => {
        passes += 1;
        context.document.body.appendChild(context.document.createElement('span'));
      },
    });

    lifecycle.start(defaultState());
    await new Promise((resolve) => setTimeout(resolve, 60));
    lifecycle.stop();

    expect(passes).toBe(1);
  });

  it('reverts an enhancement that stops applying', async () => {
    const { document } = loadFixture('home', '/home');
    let reverted = false;
    let enabled = true;

    const lifecycle = new EnhancementLifecycle({ document, debounceMs: 5 });
    lifecycle.register({
      id: 'toggling',
      appliesTo: () => enabled,
      apply: () => {},
      revert: () => {
        reverted = true;
      },
    });

    lifecycle.start(defaultState());
    await new Promise((resolve) => setTimeout(resolve, 20));

    enabled = false;
    lifecycle.setState(defaultState());
    await new Promise((resolve) => setTimeout(resolve, 30));
    lifecycle.stop();

    expect(reverted).toBe(true);
  });
});
