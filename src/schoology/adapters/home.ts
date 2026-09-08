import { SGY, queryFirst } from '../selectors';

/**
 * Home page structure.
 *
 * Better Schoology never removes the native feed. The Dashboard view hides it
 * with a class that the Feed view removes, so switching back is one attribute
 * change and the native nodes -- with their jQuery handlers intact -- are never
 * detached, cloned or destroyed.
 */
export interface HomeSurfaces {
  tabs: HTMLElement | null;
  feedContainer: HTMLElement | null;
  todo: HTMLElement | null;
  rightColumn: HTMLElement | null;
  main: HTMLElement | null;
}

export function findHomeSurfaces(root: ParentNode): HomeSurfaces {
  return {
    tabs: queryFirst(root, SGY.home.tabs),
    feedContainer: queryFirst(root, SGY.home.feedContainer),
    todo: queryFirst(root, SGY.home.todo),
    rightColumn: queryFirst(root, SGY.shell.rightColumn),
    main: queryFirst(root, SGY.shell.main),
  };
}

/**
 * True when the page really is the Home surface we know how to enhance.
 *
 * The route says "home"; this confirms the DOM matches expectations before we
 * touch anything, so an unfamiliar Home variant is left alone instead of half
 * enhanced.
 */
export function isRecognizableHome(root: ParentNode): boolean {
  const surfaces = findHomeSurfaces(root);
  return surfaces.feedContainer !== null || surfaces.todo !== null;
}
