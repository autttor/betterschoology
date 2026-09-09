import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import { SGY, clearEnhancedAll, markEnhanced, queryFirst } from '@/src/schoology/selectors';
import { resolveAllCourses } from '@/src/storage/courses';
import { findOwned, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { needsRender } from '@/src/components/memo';
import { log } from '@/src/utils/log';
import { renderCourseSwitcher } from './render';
import { openCustomizer } from '@/src/utils/messaging';

/**
 * Mounts the compact course switcher in Schoology's header.
 *
 * The header is a React tree, so two rules apply:
 *
 *  1. nothing native is modified, hidden or rebound. The native Courses menu
 *     keeps working; ours is an additional control beside it. If React ever
 *     drops our node during a re-render, the next enhancement pass simply puts
 *     it back -- and in the meantime the student has lost nothing.
 *  2. our node is appended at the *end* of the nav list, the position least
 *     likely to interfere with React's own child reconciliation.
 *
 * If the header does not look like the header we know, the switcher is mounted
 * by the dashboard instead (see `features/dashboard`), and on pages with
 * neither it simply does not appear.
 */
const FEATURE_ID = 'course-switcher';
const COMPONENT_NAME = 'course-switcher';

export { renderCourseSwitcher } from './render';

/** The header nav list, but only when this really is the header we documented. */
export function findHeaderMount(doc: Document): HTMLElement | null {
  const trigger = queryFirst<HTMLElement>(doc, SGY.header.navTrigger);
  if (!trigger) return null;

  const list = queryFirst<HTMLElement>(doc, SGY.header.navList);
  // The trigger has to actually live in that list, or this is a header layout
  // we do not recognize.
  return list && list.contains(trigger) ? list : null;
}

export const courseSwitcherEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: (context) => context.state.settings.compactCourseSwitcher,

  apply(context: EnhancementContext) {
    const doc = context.document;
    const mount = findHeaderMount(doc);
    if (!mount) {
      log.info('course switcher: header not recognized, standing down');
      return;
    }

    const courses = resolveAllCourses(context.state);
    // With no courses discovered yet the control would open onto an empty
    // list, which is worse than not being there at all.
    if (courses.length === 0) return;

    const host =
      findOwned(doc, COMPONENT_NAME) ??
      ownedRoot(doc, 'li', COMPONENT_NAME, { className: 'better-schoology bs-switcher-host' });

    // Rebuilding on every pass would slam the menu shut the moment Schoology
    // touched the DOM, so the list is only rebuilt when it actually changed.
    const signature = courses
      .map((course) => `${course.id}:${course.displayShortName}:${course.pinned}:${course.hidden}`)
      .join('|');

    if (needsRender(host, signature)) {
      replaceChildren(host, [
        renderCourseSwitcher(doc, { courses, onCustomize: () => void openCustomizer() }).root,
      ]);
    }

    if (!host.isConnected) {
      mount.appendChild(host);
      markEnhanced(mount, FEATURE_ID);
    }
  },

  revert(context: EnhancementContext) {
    removeOwned(context.document, COMPONENT_NAME);
    clearEnhancedAll(context.document, FEATURE_ID);
  },
};
