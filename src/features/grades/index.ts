import type { Enhancement, EnhancementContext } from '@/src/schoology/lifecycle';
import type { CourseGrade } from '@/src/grades';
import { buildCourseGrade } from '@/src/grades';
import { SGY, clearEnhancedAll, dropClasses, markEnhanced, queryAll, queryFirst } from '@/src/schoology/selectors';
import { parseGradeReport } from '@/src/schoology/adapters/grades';
import { resolveCourse } from '@/src/storage/courses';
import { recordGradeSnapshots } from '@/src/storage';
import { calculateFromCategories, currentPercentage, allCategories } from '@/src/grades';
import { findOwned, ownedRoot, removeOwned, replaceChildren } from '@/src/components/dom';
import { log } from '@/src/utils/log';
import { renderCourseGrades, preferredPeriod, usablePeriods } from './render';
import { renderGpaPanel, gpaInputsFrom } from './gpaWidget';
import { resetGradesUi, uiStateFor } from './state';

/**
 * Better Grades.
 *
 * Inserted *inside* each `.gradebook-course-grades` container, above the native
 * table -- so Schoology's own per-course collapse still works on it, and the
 * native report is one class away from being back.
 *
 * The native table is hidden rather than removed, and hidden only once ours has
 * rendered: a student must never be left on a grade page with no grades.
 */
const FEATURE_ID = 'better-grades';
const COMPONENT_NAME = 'better-grades';
const HIDDEN_CLASS = 'bs-hidden-by-grades';
const GPA_COMPONENT_NAME = 'better-gpa';
const GRADES_ROUTES = new Set(['global-grades', 'course-grades']);

export { resetGradesUi } from './state';
export { renderCourseGrades, leafPeriods, usablePeriods, preferredPeriod } from './render';
export { renderGpaTile, renderGpaPanel, gpaInputsFrom } from './gpaWidget';

/** Every course report on the page, normalized. */
export function parseCourseGrades(root: ParentNode): Array<{ report: HTMLElement; course: CourseGrade }> {
  const out: Array<{ report: HTMLElement; course: CourseGrade }> = [];

  for (const element of queryAll<HTMLElement>(root, SGY.grades.report)) {
    const parsed = parseGradeReport(element);
    if (!parsed) continue;
    out.push({ report: element, course: buildCourseGrade(parsed) });
  }

  return out;
}

export const betterGradesEnhancement: Enhancement = {
  id: FEATURE_ID,

  appliesTo: (context) =>
    context.state.settings.betterGrades && GRADES_ROUTES.has(context.route.type),

  async apply(context: EnhancementContext) {
    const doc = context.document;
    const reports = parseCourseGrades(doc);

    if (reports.length === 0) {
      log.info('better grades: no grade report found, leaving native page alone');
      return;
    }

    /*
     * Course percentages Better Schoology computed, so the GPA panel here and
     * the dashboard tile elsewhere agree. Schoology's own course-row value wins
     * when it renders one.
     */
    const computed = new Map<string, number | undefined>();

    for (const { course } of reports) {
      const leaf = preferredPeriod(usablePeriods(course));
      computed.set(
        course.courseId,
        leaf ? currentPercentage(calculateFromCategories(allCategories(leaf))) : undefined,
      );
    }

    for (const { report, course } of reports) {
      const container = queryFirst<HTMLElement>(report, SGY.grades.gradebookCourseGrades) ?? report;
      const table = container.querySelector('table');

      const stored = context.state.courses[course.courseId];
      const resolved = resolveCourse(
        stored ?? {
          id: course.courseId,
          originalName: course.courseName ?? '',
          href: `/course/${course.courseId}`,
        },
        context.state.customizations[course.courseId],
      );

      const ui = uiStateFor(course.courseId);
      const host =
        findOwned(container, COMPONENT_NAME) ??
        ownedRoot(doc, 'div', COMPONENT_NAME, { className: 'bs-grades-host' });

      replaceChildren(host, [
        renderCourseGrades(
          doc,
          { course, resolved, ui, gpa: context.state.gpa },
          { onChange: () => context.requestPass() },
        ),
      ]);

      if (!host.isConnected) {
        container.insertBefore(host, container.firstChild);
        markEnhanced(container, FEATURE_ID);
      }

      // Only now, with ours on the page, is it safe to fold the native table
      // away. It stays in the DOM with every handler Schoology bound to it.
      if (table) table.classList.add(HIDDEN_CLASS);
      // The "Course Grade: n%" line under it says what our summary now says.
      queryFirst<HTMLElement>(container, SGY.grades.summaryCourse)?.classList.add(HIDDEN_CLASS);
    }

    if (context.state.settings.gpaEnabled) {
      mountGpaPanel(context, reports.map((entry) => entry.course), computed);
    }

    /*
     * One percentage per course, kept locally so the dashboard's GPA tile works
     * away from this page. Nothing else about a grade is stored -- no
     * assignment titles, no individual scores, no comments.
     */
    const snapshots = reports
      .map((entry) => ({
        courseId: entry.course.courseId,
        percentage: entry.course.currentPercentage ?? computed.get(entry.course.courseId),
      }))
      .filter(
        (entry): entry is { courseId: string; percentage: number } =>
          entry.percentage !== undefined,
      );

    const updated = await recordGradeSnapshots(snapshots);
    if (updated) context.state.gradeSnapshots = updated.gradeSnapshots;
  },

  revert(context: EnhancementContext) {
    const doc = context.document;

    for (const node of Array.from(doc.querySelectorAll(`.${HIDDEN_CLASS}`))) {
      dropClasses(node, HIDDEN_CLASS);
    }

    removeOwned(doc, COMPONENT_NAME);
    removeOwned(doc, GPA_COMPONENT_NAME);
    clearEnhancedAll(doc, FEATURE_ID);
    resetGradesUi();
  },
};

/**
 * The GPA panel, above the first course report on the global grades page.
 *
 * Only there: a single course's page has one grade, and a GPA computed from one
 * course would be a number pretending to be an average.
 */
function mountGpaPanel(
  context: EnhancementContext,
  courses: CourseGrade[],
  computed: Map<string, number | undefined>,
): void {
  const doc = context.document;
  if (context.route.type !== 'global-grades' || courses.length < 2) return;

  /*
   * Schoology wraps each report in `ul.s-grades-course-list > li`, so the
   * panel goes *above the list*, not inside a list item -- otherwise it
   * inherits the list's own bullet and indentation.
   */
  const first = queryFirst<HTMLElement>(doc, SGY.grades.report);
  const mainInner = queryFirst<HTMLElement>(doc, SGY.shell.mainInner);
  const anchor = first?.closest('ul, ol') ?? first;
  const parent = anchor?.parentElement ?? mainInner;
  if (!anchor || !parent) return;

  const host =
    findOwned(doc, GPA_COMPONENT_NAME) ??
    ownedRoot(doc, 'div', GPA_COMPONENT_NAME, { className: 'better-schoology bs-gpa-host' });

  replaceChildren(host, [
    renderGpaPanel(doc, {
      courses: gpaInputsFrom(courses, context.state, computed),
      state: context.state,
    }),
  ]);

  if (!host.isConnected) parent.insertBefore(host, anchor);
}
