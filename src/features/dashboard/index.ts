import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { ResolvedCourse } from '@/src/types';
import { SGY, markEnhanced, queryFirst } from '@/src/schoology/selectors';
import { isHomeRoute } from '@/src/schoology/router';
import { findHomeSurfaces, isRecognizableHome } from '@/src/schoology/adapters/home';
import { resolveAllCourses } from '@/src/storage/courses';
import { el, findOwned, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { safeImageUrl } from '@/src/utils/url';
import { log } from '@/src/utils/log';

/**
 * Better Home: Dashboard / Feed.
 *
 * 0.0.1 ships the architecture and a working course-first dashboard shell, not
 * a finished replacement homepage. The two rules that matter:
 *
 *  1. the native feed is *hidden*, never removed. `#home-feed-container` keeps
 *     its jQuery handlers, its Drupal behaviors and its position in the DOM;
 *     switching to Feed just drops a class.
 *  2. the native home tabs are left untouched, so Recent Activity, Course
 *     Dashboard and Assignments remain one click away even if this feature
 *     breaks entirely.
 *
 * Rich per-card content (grades, next assignments) waits for the next
 * milestone: the capture set contains no `/home/course-dashboard` page, so
 * there is no course-card markup to parse and nothing to validate against.
 */
const FEATURE_ID = 'better-dashboard';
const COMPONENT_NAME = 'better-dashboard';
const HIDDEN_CLASS = 'better-schoology-hidden-by-dashboard';

export type HomeView = 'dashboard' | 'feed';

/** Per-tab view choice. Not persisted: it is a momentary preference, not a setting. */
let activeView: HomeView = 'dashboard';

export function setActiveView(view: HomeView): void {
  activeView = view;
}

export function getActiveView(): HomeView {
  return activeView;
}

function renderCourseCard(doc: Document, course: ResolvedCourse): HTMLElement {
  const card = el(doc, 'li', { className: 'better-schoology-course-card' });

  for (const [property, value] of [
    ['--bs-course-accent', course.accentColor],
    ['--bs-course-bg', course.backgroundColor],
    ['--bs-course-text', course.textColor],
    ['--bs-course-muted', course.mutedTextColor],
  ] as const) {
    if (value) card.style.setProperty(property, value);
  }

  // Student-supplied image URLs are validated before use and rendered only as
  // a background image -- never injected as markup.
  const imageUrl = safeImageUrl(course.displayImageUrl);
  if (imageUrl) {
    const image = el(doc, 'div', { className: 'better-schoology-course-card__image' });
    image.style.backgroundImage = `url("${encodeURI(imageUrl)}")`;
    card.appendChild(image);
  }

  card.appendChild(
    el(doc, 'div', {
      className: 'better-schoology-course-card__name',
      children: [
        el(doc, 'a', {
          text: course.displayShortName,
          // Always the original Schoology href: a renamed course still
          // navigates to the real course.
          attrs: { href: course.href },
        }),
      ],
    }),
  );

  const meta = [course.sectionName, course.pinned ? 'Pinned' : ''].filter(Boolean).join(' · ');
  if (meta) {
    card.appendChild(el(doc, 'div', { className: 'better-schoology-course-card__meta', text: meta }));
  }

  return card;
}

function renderViewToggle(doc: Document, onSelect: (view: HomeView) => void): HTMLElement {
  const make = (view: HomeView, label: string): HTMLElement => {
    const button = el(doc, 'button', {
      text: label,
      attrs: { type: 'button', 'aria-pressed': String(activeView === view) },
    });
    button.addEventListener('click', () => onSelect(view));
    return button;
  };

  return el(doc, 'div', {
    className: 'better-schoology-view-toggle',
    attrs: { role: 'group', 'aria-label': 'Home view' },
    children: [make('dashboard', 'Dashboard'), make('feed', 'Feed')],
  });
}

/** Builds the dashboard shell. Exported so tests can render it without a lifecycle. */
export function renderDashboard(
  doc: Document,
  courses: ResolvedCourse[],
  onSelectView: (view: HomeView) => void,
): HTMLElement {
  const existing = findOwned(doc, COMPONENT_NAME);
  const root =
    existing ??
    ownedRoot(doc, 'section', COMPONENT_NAME, {
      className: 'better-schoology-dashboard better-schoology-panel',
      attrs: { 'aria-label': 'Better Schoology dashboard' },
    });

  const visible = courses.filter((course) => !course.hidden);

  const header = el(doc, 'div', {
    className: 'better-schoology-panel__header',
    children: [
      el(doc, 'h2', { className: 'better-schoology-panel__title', text: 'Courses' }),
      renderViewToggle(doc, onSelectView),
    ],
  });

  const body =
    visible.length > 0
      ? el(doc, 'ul', {
          className: 'better-schoology-course-grid',
          children: visible.map((course) => renderCourseCard(doc, course)),
        })
      : el(doc, 'p', {
          className: 'better-schoology-empty',
          text: 'No courses discovered yet. Open your Grades page once so Better Schoology can list them.',
        });

  replaceChildren(root, [
    header,
    body,
    el(doc, 'p', {
      className: 'better-schoology-panel__note',
      text: 'Grades and upcoming work per course arrive in the next milestone.',
    }),
  ]);

  return root;
}

function setFeedHidden(doc: Document, hidden: boolean): void {
  const feed = queryFirst<HTMLElement>(doc, SGY.home.feedContainer);
  if (!feed) return;
  feed.classList.toggle(HIDDEN_CLASS, hidden);
}

export const betterDashboardEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: (context) =>
    context.state.settings.betterDashboard && isHomeRoute(context.route.type),

  apply(context: EnhancementContext) {
    const doc = context.document;

    // If Home does not look like the Home we know, do nothing at all rather
    // than half-enhance an unfamiliar layout.
    if (!isRecognizableHome(doc)) {
      log.info('dashboard: unrecognized home layout, leaving native page alone');
      return;
    }

    const surfaces = findHomeSurfaces(doc);
    const mount = surfaces.main ?? queryFirst<HTMLElement>(doc, SGY.shell.mainInner);
    if (!mount) return;

    const dashboard = renderDashboard(doc, resolveAllCourses(context.state), (view) => {
      setActiveView(view);
      context.requestPass();
    });

    if (!dashboard.isConnected) {
      mount.insertBefore(dashboard, mount.firstChild);
      markEnhanced(mount, FEATURE_ID);
    }

    dashboard.classList.toggle('better-schoology-dashboard--feed', activeView === 'feed');
    setFeedHidden(doc, activeView === 'dashboard');
  },

  revert(context: EnhancementContext) {
    // Restoring the native feed comes first: even if removing our own node
    // failed, the student must not be left staring at a hidden homepage.
    setFeedHidden(context.document, false);
    removeOwned(context.document, COMPONENT_NAME);
  },
};
