import type { HomeAnnouncement } from '@/src/types';
import { SGY, queryAll, queryFirst } from '../selectors';
import { textWithoutHiddenNodes, courseIdFromHref } from './course';

/**
 * Home page structure.
 *
 * Better Schoology never removes the native feed or the native right rail.
 * The Dashboard view hides them with a class that the Feed view removes, so
 * switching back is one attribute change and the native nodes -- with their
 * jQuery handlers intact -- are never detached, cloned or destroyed.
 */
export interface HomeSurfaces {
  tabs: HTMLElement | null;
  feedContainer: HTMLElement | null;
  todo: HTMLElement | null;
  upcomingEvents: HTMLElement | null;
  recentlyCompleted: HTMLElement | null;
  rightColumn: HTMLElement | null;
  main: HTMLElement | null;
  mainInner: HTMLElement | null;
}

export function findHomeSurfaces(root: ParentNode): HomeSurfaces {
  return {
    tabs: queryFirst(root, SGY.home.tabs),
    feedContainer: queryFirst(root, SGY.home.feedContainer),
    todo: queryFirst(root, SGY.home.todo),
    upcomingEvents: queryFirst(root, SGY.home.upcomingEvents),
    recentlyCompleted: queryFirst(root, SGY.home.recentlyCompleted),
    rightColumn: queryFirst(root, SGY.shell.rightColumn),
    main: queryFirst(root, SGY.shell.main),
    mainInner: queryFirst(root, SGY.shell.mainInner),
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

/**
 * Parses Recent Activity update posts into announcement summaries.
 *
 * Only the post *envelope* is read -- author, course, time, and a plain-text
 * excerpt of the body. The full body, its attachments and its comments stay
 * where Schoology rendered them; the summary exists so the dashboard can say
 * "three new posts" without turning announcements into the page's centrepiece.
 *
 * Row shape (observed on `/home` and `/home/recent-activity`):
 *   li[id^="edge-assoc-"][timestamp]
 *     .s-edge-type-update-post
 *       .edge-item
 *         .update-sentence-inner
 *           .long-username > a[href^="/user/"]
 *           a[href^="/course/<id>"]        <- realm the post went to
 *           .update-body                   <- rich text
 *         .edge-footer .created            <- rendered time
 */
export function parseAnnouncements(root: ParentNode, limit = 20): HomeAnnouncement[] {
  const announcements: HomeAnnouncement[] = [];

  for (const item of queryAll(root, SGY.home.feedItem)) {
    if (announcements.length >= limit) break;

    const id = item.id || undefined;
    const sentence = queryFirst(item, SGY.feed.updateSentence);
    const authorEl = sentence ? queryFirst(sentence, SGY.feed.author) : null;
    const author = authorEl ? textWithoutHiddenNodes(authorEl) : '';

    // The realm link is the first `/course/<id>` anchor in the sentence; the
    // ID is what makes a custom course name applicable to a feed post.
    const realm = sentence
      ? Array.from(sentence.querySelectorAll<HTMLAnchorElement>('a[href]')).find((anchor) =>
          courseIdFromHref(anchor.getAttribute('href')),
        )
      : undefined;
    const courseId = courseIdFromHref(realm?.getAttribute('href') ?? null) ?? undefined;

    const bodyEl = queryFirst(item, SGY.feed.updateBody) ?? queryFirst(item, SGY.feed.postBody);
    const body = bodyEl ? textWithoutHiddenNodes(bodyEl) : '';

    const createdEl = queryFirst(item, SGY.feed.created);
    const createdText = createdEl ? textWithoutHiddenNodes(createdEl) : '';

    const timestampAttr = Number(item.getAttribute('timestamp') ?? '');
    const postedAt =
      Number.isFinite(timestampAttr) && timestampAttr > 0
        ? new Date(timestampAttr * 1000)
        : undefined;

    // A post with neither an author nor any text is not worth summarizing.
    if (!author && !body) continue;

    announcements.push({
      ...(id ? { id } : {}),
      ...(author ? { author } : {}),
      ...(courseId ? { courseId } : {}),
      ...(realm ? { courseName: textWithoutHiddenNodes(realm) } : {}),
      ...(body ? { excerpt: body } : {}),
      ...(createdText ? { createdText } : {}),
      ...(postedAt ? { postedAt } : {}),
      ...(id ? { href: `#${id}` } : {}),
    });
  }

  return announcements;
}
