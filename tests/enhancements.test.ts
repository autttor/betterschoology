import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { fixtureIds, fixtureRoute, loadFixture, loadFixtureAtRoute } from './helpers/fixtures';
import { EnhancementLifecycle, type EnhancementContext } from '@/src/schoology/lifecycle';
import { resolveRoute } from '@/src/schoology/router';
import { defaultState } from '@/src/storage/defaults';
import type { BetterSchoologyState } from '@/src/types/settings';
import { DARK_ATTR, THEME_ATTR, applyTheme, clearTheme, resolveIsDark } from '@/src/features/theme';
import { courseOverridesEnhancement } from '@/src/features/courses';
import { betterDashboardEnhancement, setActiveView } from '@/src/features/dashboard';
import { renderTodoPanel, resetTodoCache } from '@/src/features/todo';
import { parseTodoPanel } from '@/src/schoology/adapters/todo';
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
  it('uses its own namespace, not Schoology\'s -processed convention', () => {
    const { document } = loadFixtureAtRoute('home');
    const before = document.querySelectorAll('.sEventUpcoming-processed').length;
    expect(before).toBeGreaterThan(0);

    const state = stateWith({ settings: { ...defaultState().settings, betterDashboard: true } });
    betterDashboardEnhancement.apply(contextFor(document, '/home', state));

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
  beforeEach(() => setActiveView('dashboard'));

  const dashboardState = () =>
    stateWith({
      settings: { ...defaultState().settings, betterDashboard: true },
      courses: {
        '100001': {
          id: '100001',
          originalName: 'Example Government',
          href: '/course/100001',
          lastSeenAt: 0,
        },
      },
    });

  it('adds a dashboard and hides — never removes — the native feed', () => {
    const { document } = loadFixtureAtRoute('home');
    const feed = document.querySelector('#home-feed-container')!;

    betterDashboardEnhancement.apply(contextFor(document, '/home', dashboardState()));

    expect(document.querySelector('[data-better-schoology="better-dashboard"]')).not.toBeNull();
    // The native node is still in the document, with its handlers intact.
    expect(document.querySelector('#home-feed-container')).toBe(feed);
    expect(feed.classList.contains('better-schoology-hidden-by-dashboard')).toBe(true);
  });

  it('restores the native feed when switched to Feed view', () => {
    const { document } = loadFixtureAtRoute('home');
    const context = contextFor(document, '/home', dashboardState());

    betterDashboardEnhancement.apply(context);
    setActiveView('feed');
    betterDashboardEnhancement.apply(context);

    expect(
      document.querySelector('#home-feed-container')!.classList.contains(
        'better-schoology-hidden-by-dashboard',
      ),
    ).toBe(false);
  });

  it('restores the native feed when the feature is turned off', () => {
    const { document } = loadFixtureAtRoute('home');
    const context = contextFor(document, '/home', dashboardState());

    betterDashboardEnhancement.apply(context);
    betterDashboardEnhancement.revert!(context);

    expect(document.querySelector('[data-better-schoology="better-dashboard"]')).toBeNull();
    expect(
      document.querySelector('#home-feed-container')!.classList.contains(
        'better-schoology-hidden-by-dashboard',
      ),
    ).toBe(false);
  });

  it('renders course cards that link to the original course', () => {
    const { document } = loadFixtureAtRoute('home');
    betterDashboardEnhancement.apply(contextFor(document, '/home', dashboardState()));

    const link = document.querySelector<HTMLAnchorElement>(
      '.better-schoology-course-card__name a',
    )!;
    expect(link.getAttribute('href')).toBe('/course/100001');
  });

  it('renders a custom name and image on its own card without changing the href', () => {
    const { document } = loadFixtureAtRoute('home');
    const state = dashboardState();
    state.customizations['100001'] = {
      courseId: '100001',
      customName: 'AP Gov',
      imageUrl: 'https://example.com/cover.png',
    };

    betterDashboardEnhancement.apply(contextFor(document, '/home', state));

    const link = document.querySelector<HTMLAnchorElement>('.better-schoology-course-card__name a')!;
    expect(link.textContent).toBe('AP Gov');
    expect(link.getAttribute('href')).toBe('/course/100001');

    const image = document.querySelector<HTMLElement>('.better-schoology-course-card__image')!;
    expect(image.style.backgroundImage).toContain('https://example.com/cover.png');
  });

  it('does nothing on a page that is not a recognizable home', () => {
    const { document } = loadFixtureAtRoute('assignment');
    const before = document.body.innerHTML;

    betterDashboardEnhancement.apply(
      contextFor(document, fixtureRoute('assignment'), dashboardState()),
    );

    expect(document.body.innerHTML).toBe(before);
  });

  it('is idempotent across repeated passes', () => {
    const { document } = loadFixtureAtRoute('home');
    const context = contextFor(document, '/home', dashboardState());

    betterDashboardEnhancement.apply(context);
    betterDashboardEnhancement.apply(context);
    betterDashboardEnhancement.apply(context);

    expect(document.querySelectorAll('[data-better-schoology="better-dashboard"]').length).toBe(1);
    expect(document.querySelectorAll('.better-schoology-course-card').length).toBe(1);
  });
});

describe('better to do', () => {
  beforeEach(() => resetTodoCache());

  it('renders every parsed task, not just the ones Schoology shows', () => {
    const { document } = loadFixtureAtRoute('home');
    const tasks = parseTodoPanel(document);

    const panel = renderTodoPanel(document, tasks, { now: new Date('2026-09-08T12:00:00Z') });

    expect(panel.querySelectorAll('.better-schoology-task').length).toBe(tasks.length);
    expect(tasks.length).toBeGreaterThan(7);
  });

  it('reuses the same panel element when re-rendered', () => {
    const { document } = loadFixtureAtRoute('home');
    const tasks = parseTodoPanel(document);

    const first = renderTodoPanel(document, tasks);
    document.body.appendChild(first);
    const second = renderTodoPanel(document, tasks);

    expect(second).toBe(first);
    expect(document.querySelectorAll('[data-better-schoology="better-todo"]').length).toBe(1);
  });

  it('shows an empty state rather than an error when there is nothing due', () => {
    const { document } = loadFixtureAtRoute('home');
    const panel = renderTodoPanel(document, []);

    expect(panel.querySelector('.better-schoology-empty')).not.toBeNull();
  });

  it('carries Schoology hrefs through untouched', () => {
    const { document } = loadFixtureAtRoute('home');
    const tasks = parseTodoPanel(document);
    const panel = renderTodoPanel(document, tasks);

    const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>('a[href]'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/assignment\/\d+/);
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
      },
    });

    const context = contextFor(document, '/home', disabled);
    expect(betterDashboardEnhancement.appliesTo(context)).toBe(false);
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe('lifecycle', () => {
  it('reverts Home features after in-page navigation and releases their timers on stop', async () => {
    const { document, dom } = loadFixtureAtRoute('home');
    const lifecycle = new EnhancementLifecycle({ document, debounceMs: 0 });
    const revert = vi.fn();
    lifecycle.register({ id: 'home-only', appliesTo: (context) => context.route.type === 'home', apply: () => {}, revert });
    lifecycle.start(defaultState());
    await new Promise((resolve) => setTimeout(resolve, 10));
    dom.window.history.pushState({}, '', '/course/123/materials');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(revert).toHaveBeenCalledOnce();
    lifecycle.stop();
    expect(revert).toHaveBeenCalledOnce();
  });

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
