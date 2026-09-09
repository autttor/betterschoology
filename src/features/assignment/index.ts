import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { ResolvedCourse, SchoologyAssignment } from '@/src/types';
import { SGY, clearEnhancedAll, dropClasses, markEnhanced, queryFirst } from '@/src/schoology/selectors';
import {
  findSubmissionBlock,
  findSubmitControl,
  parseAssignmentPage,
} from '@/src/schoology/adapters/assignment';
import { courseIdFromHref, textWithoutHiddenNodes } from '@/src/schoology/adapters/course';
import { resolveCourse } from '@/src/storage/courses';
import {
  binder,
  findOwned,
  icon,
  moveNative,
  ownedRoot,
  removeOwned,
  replaceChildren,
  restoreAllNative,
} from '@/src/components/dom';
import { ICONS } from '@/src/components/icons';
import { note, panel, pill } from '@/src/components/ui';
import { decorativeCourseAccent } from '@/src/utils/url';
import { formatPercentage } from '@/src/features/dashboard/courseCard';
import { log } from '@/src/utils/log';

/**
 * Better Assignment.
 *
 * Schoology scatters an assignment across three columns: the title and grade in
 * the page chrome, the description and attachments in the centre, the
 * submission panel in the right rail. This reorganizes them into one readable
 * order -- what it is, when it is due, how you are doing, what to hand in.
 *
 * The rule that governs the whole feature: **the native submission machinery is
 * moved, never recreated.** `betterPanel.appendChild(nativeSubmitElement)`
 * keeps every handler, every form token and every popup binding Schoology
 * attached to that element. A Better Schoology "Submit" button that tried to
 * drive the same transaction would be a bug that costs a student a grade.
 *
 * Anything containing an `<iframe>` is refused a move (see `moveNative`):
 * reparenting an iframe reloads it, which would wipe an in-progress rich-text
 * submission.
 */
const FEATURE_ID = 'better-assignment';
const COMPONENT_NAME = 'better-assignment';
const LAYOUT_ATTR = 'data-bs-assignment-layout';

const STATUS_LABEL = {
  graded: 'Graded',
  overdue: 'Overdue',
  due: 'Due',
  unknown: '',
} as const;

const STATUS_TONE = {
  graded: 'success',
  overdue: 'danger',
  due: 'accent',
  unknown: 'neutral',
} as const;

export interface AssignmentSection {
  title: string;
  node: HTMLElement | null;
  icon?: keyof typeof ICONS;
}

export interface AssignmentRenderData {
  assignment: SchoologyAssignment;
  course?: ResolvedCourse;
  /** Native nodes to relocate, in render order. */
  sections: AssignmentSection[];
  /** Schoology's own submission block, moved rather than reproduced. */
  submission: HTMLElement | null;
}

/**
 * True when a native node has something worth giving a panel to.
 *
 * Schoology renders empty containers freely (an assignment with no description
 * still has `.info-container`), and an empty "Description" heading is worse
 * than no heading.
 */
export function hasContent(node: HTMLElement | null): boolean {
  if (!node) return false;
  if ((node.textContent ?? '').trim().length > 0) return true;
  // Media and controls count even with no text.
  return node.querySelector('img, a, input, textarea, button, iframe, video, embed') !== null;
}

/** The header: identity, timing and grade, in that order. */
export function renderAssignmentHeader(
  doc: Document,
  assignment: SchoologyAssignment,
  course?: ResolvedCourse,
): HTMLElement {
  const e = binder(doc);

  const header = e('header', { className: 'bs-assignment__header' });
  if (course) {
    header.setAttribute('data-bs-course-id', course.id);
    header.style.setProperty(
      '--bs-course-accent',
      course.accentColor ?? decorativeCourseAccent(course.id),
    );
  }

  const meta: Array<Node | null> = [];
  if (assignment.status !== 'unknown') {
    meta.push(pill(doc, STATUS_LABEL[assignment.status], STATUS_TONE[assignment.status]));
  }
  if (assignment.dueText) {
    meta.push(
      e('span', {
        className: 'bs-assignment__due',
        children: [
          icon(doc, assignment.status === 'overdue' ? ICONS.alert : ICONS.clock, 'bs-icon bs-icon--sm'),
          e('span', { text: assignment.dueText }),
        ],
      }),
    );
  }
  for (const label of [assignment.category, assignment.gradingPeriod]) {
    if (label) meta.push(e('span', { className: 'bs-assignment__tag', text: label }));
  }

  header.appendChild(
    e('div', {
      className: 'bs-assignment__identity',
      children: [
        course
          ? e('a', {
              className: 'bs-assignment__course',
              text: course.displayName,
              attrs: { href: course.href },
            })
          : null,
        e('h1', { className: 'bs-assignment__title', text: assignment.title }),
        meta.length > 0 ? e('div', { className: 'bs-assignment__meta', children: meta }) : null,
      ],
    }),
  );

  const grade = renderGrade(doc, assignment);
  if (grade) header.appendChild(grade);

  return header;
}

/**
 * The grade block.
 *
 * Points earned over points possible, and a percentage derived from them.
 * No letter grade: Schoology does not expose a grading scale on this page, and
 * inventing one would be a guess about the student's school.
 */
export function renderGrade(doc: Document, assignment: SchoologyAssignment): HTMLElement | null {
  const { earned, possible } = assignment;
  if (earned === undefined) return null;

  const e = binder(doc);
  const percentage =
    possible !== undefined && possible > 0 ? (earned / possible) * 100 : undefined;

  return e('div', {
    className: 'bs-assignment__grade',
    children: [
      e('div', {
        className: 'bs-assignment__grade-points',
        text: possible !== undefined ? `${earned} / ${possible}` : String(earned),
      }),
      percentage !== undefined
        ? e('div', {
            className: 'bs-assignment__grade-percent',
            text: `${formatPercentage(percentage)}%`,
          })
        : null,
    ],
  });
}

export function renderAssignment(doc: Document, data: AssignmentRenderData): HTMLElement[] {
  const e = binder(doc);
  const children: HTMLElement[] = [renderAssignmentHeader(doc, data.assignment, data.course)];

  const body = e('div', { className: 'bs-assignment__body' });
  const main = e('div', { className: 'bs-assignment__main' });
  const side = e('div', { className: 'bs-assignment__side' });

  for (const section of data.sections) {
    if (!hasContent(section.node)) continue;
    const holder = panel(
      doc,
      { title: section.title, headingLevel: 'h2', ...(section.icon ? { icon: section.icon } : {}) },
      [],
    );
    const target = holder.querySelector('.bs-panel__body')!;
    if (moveNative(section.node!, target)) {
      hideNativeHeading(section.node!);
      main.appendChild(holder);
    }
  }

  if (data.submission) {
    const holder = panel(doc, { title: 'Submission', icon: 'check', headingLevel: 'h2' }, []);
    const target = holder.querySelector('.bs-panel__body')!;

    if (moveNative(data.submission, target)) {
      hideNativeHeading(data.submission);
      target.appendChild(
        note(doc, 'Schoology’s own submission panel, moved here — not a copy of it.'),
      );
      side.appendChild(holder);
    } else {
      // A rich-text editor is loaded inside it. Reparenting would reload the
      // iframe and lose whatever the student has typed, so it stays put.
      target.appendChild(
        note(
          doc,
          'Schoology’s submission panel is still in the sidebar. Better Schoology left it there so nothing you have typed is lost.',
        ),
      );
      side.appendChild(holder);
    }
  }

  body.appendChild(main);
  if (side.childElementCount > 0) body.appendChild(side);
  children.push(body);

  return children;
}

/**
 * Hides a heading Schoology put on a block we have now given a panel title to.
 *
 * "Comments" above "Comments" is noise. Only headings inside the moved block
 * are touched, and only with a class the revert path clears.
 */
function hideNativeHeading(moved: Element): void {
  const heading = moved.querySelector('h2, h3');
  if (heading) heading.classList.add('bs-native-heading-replaced');
}

export const betterAssignmentEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: (context) =>
    context.state.settings.betterAssignments && context.route.type === 'assignment',

  apply(context: EnhancementContext) {
    const doc = context.document;
    const assignment = parseAssignmentPage(doc, context.route.pathname);

    // An assignment page we do not recognize is left entirely alone.
    if (!assignment) {
      log.info('better assignment: unrecognized layout, leaving native page alone');
      return;
    }

    const mount = queryFirst<HTMLElement>(doc, SGY.shell.mainInner);
    if (!mount) return;

    const root =
      findOwned(doc, COMPONENT_NAME) ??
      ownedRoot(doc, 'section', COMPONENT_NAME, {
        className: 'better-schoology bs-assignment',
        attrs: { 'aria-label': 'Assignment' },
      });

    // Sections are built once. Rebuilding would mean moving native nodes back
    // and forth on every mutation burst, which is exactly what we must not do.
    if (!root.isConnected) {
      const course = courseFor(context);

      replaceChildren(
        root,
        renderAssignment(doc, {
          assignment,
          ...(course ? { course } : {}),
          sections: [
            {
              title: 'Description',
              node: queryFirst<HTMLElement>(doc, SGY.assignment.infoText)?.parentElement ?? null,
              icon: 'book',
            },
            {
              title: 'Attachments',
              node: queryFirst<HTMLElement>(doc, SGY.assignment.attachments),
              icon: 'external',
            },
            {
              title: 'Comments',
              node: queryFirst<HTMLElement>(doc, SGY.assignment.comments),
              icon: 'megaphone',
            },
          ],
          // The whole native submission block when there is one, otherwise the
          // submit control on its own.
          submission: findSubmissionBlock(doc) ?? findSubmitControl(doc),
        }),
      );

      mount.insertBefore(root, mount.firstChild);
      markEnhanced(mount, FEATURE_ID);
      doc.documentElement.setAttribute(LAYOUT_ATTR, '');

      /*
       * Our header repeats what the native chrome said, so hide the parts it
       * duplicates -- reversibly, and only once ours actually rendered.
       * `.assignment-details` holds only the due date, which is now in the
       * header.
       */
      for (const selectors of [
        SGY.shell.pageTitle,
        SGY.assignment.gradeHeader,
        SGY.assignment.details,
      ]) {
        queryFirst<HTMLElement>(doc, selectors)?.classList.add('bs-native-heading-replaced');
      }

      hideEmptyRail(doc);
    }
  },

  revert(context: EnhancementContext) {
    const doc = context.document;

    // Native nodes go home first: even if our own teardown failed, the page
    // must be left with everything Schoology rendered, where it rendered it.
    restoreAllNative(doc);
    removeOwned(doc, COMPONENT_NAME);

    for (const node of Array.from(
      doc.querySelectorAll('.bs-native-heading-replaced, .bs-rail-emptied'),
    )) {
      dropClasses(node, 'bs-native-heading-replaced', 'bs-rail-emptied');
    }

    clearEnhancedAll(doc, FEATURE_ID);

    doc.documentElement.removeAttribute(LAYOUT_ATTR);
  },
};

/** The course this assignment belongs to, from its own breadcrumb. */
function courseFor(context: EnhancementContext): ResolvedCourse | null {
  const breadcrumb = queryFirst(context.document, SGY.course.breadcrumbCourseTitle);
  const anchor = breadcrumb?.querySelector<HTMLAnchorElement>('a[href]') ?? null;
  const courseId = courseIdFromHref(anchor?.getAttribute('href'));
  if (!courseId) return null;

  const title = breadcrumb?.getAttribute('title')?.trim() ?? '';
  const stored = context.state.courses[courseId];

  return resolveCourse(
    stored ?? {
      id: courseId,
      originalName: title || (anchor ? textWithoutHiddenNodes(anchor) : ''),
      href: `/course/${courseId}`,
    },
    context.state.customizations[courseId],
  );
}

/**
 * Collapses the right rail once everything in it has been moved.
 *
 * Only when it is genuinely empty -- a rail that still holds native content
 * keeps its place, because that content is Schoology's, not ours to hide.
 */
function hideEmptyRail(doc: Document): void {
  const inner = queryFirst<HTMLElement>(doc, SGY.shell.rightColumnInner);
  const rail = queryFirst<HTMLElement>(doc, SGY.shell.rightColumn);
  if (!inner || !rail) return;
  if (inner.childElementCount === 0) rail.classList.add('bs-rail-emptied');
}

export { LAYOUT_ATTR };
