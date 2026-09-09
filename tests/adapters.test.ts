import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  apiFixture,
  fixtureIds,
  fixtureRoute,
  loadFixture,
  loadFixtureAtRoute,
} from './helpers/fixtures';
import {
  parseCourseFromCoursePage,
  parseCoursesFromGradebook,
  splitCourseTitle,
} from '@/src/schoology/adapters/course';
import { parseTodoPanel, sortTasksByDue } from '@/src/schoology/adapters/todo';
import { parseFragmentTasks } from '@/src/schoology/endpoints/home';
import {
  childrenOf,
  courseGradePercentage,
  parseAllGradeReports,
} from '@/src/schoology/adapters/grades';
import { parseAssignmentPage } from '@/src/schoology/adapters/assignment';
import { parseMaterialFolders, parseMaterialItems } from '@/src/schoology/adapters/materials';
import { isRecognizableHome } from '@/src/schoology/adapters/home';
import { isCalendarRendered } from '@/src/schoology/adapters/calendar';

/**
 * Adapter tests run against the sanitized captures, so they assert what
 * Schoology actually renders rather than what we wish it rendered.
 */
describe('course discovery', () => {
  it('reads every course from the global grades page', () => {
    const { document } = loadFixture('global-grades', '/grades/grades');
    const courses = parseCoursesFromGradebook(document);

    expect(courses.length).toBe(18);
    expect(courses[0]).toMatchObject({
      id: expect.stringMatching(/^\d+$/),
      href: expect.stringMatching(/^\/course\/\d+$/),
    });
    // Names and sections are split, never conflated.
    expect(courses.every((course) => course.originalName.length > 0)).toBe(true);
    expect(courses.every((course) => !course.originalName.includes(':'))).toBe(true);
  });

  it('never derives a course ID from display text', () => {
    const { document } = loadFixture('global-grades', '/grades/grades');
    for (const course of parseCoursesFromGradebook(document)) {
      expect(course.href).toBe(`/course/${course.id}`);
    }
  });

  /**
   * Schoology names the course two different ways depending on the surface:
   * a `.course-title` breadcrumb on material-player pages, and the page
   * heading on course section-root pages. Both must resolve.
   */
  it.each(['course-materials', 'course-folder', 'course-grades', 'course-updates'] as const)(
    'reads the current course from %s',
    (fixture) => {
      const { document } = loadFixtureAtRoute(fixture);
      const pathname = new URL(fixtureRoute(fixture), 'http://x').pathname;
      const course = parseCourseFromCoursePage(document, pathname);

      expect(course).not.toBeNull();
      expect(course!.id).toBe(fixtureIds(fixture).courseId);
      expect(course!.originalName.length).toBeGreaterThan(0);
    },
  );

  it('does not mistake an assignment title for a course name', () => {
    const { document } = loadFixtureAtRoute('assignment');
    const ids = fixtureIds('assignment');
    const course = parseCourseFromCoursePage(document, `/course/${ids.courseId}/materials`);

    // The assignment page's own `h1.page-title` must not become the course name.
    const assignmentTitle = document.querySelector('h1.page-title')?.textContent?.trim() ?? '';
    expect(course?.originalName).not.toBe(assignmentTitle);
    expect(course?.id).toBe(ids.courseId);
  });

  /**
   * Tenants differ: some course pages head with `Name: Section`, others with
   * the section alone. A section is not a course name, and reporting it as one
   * is how a card ends up titled "8(B-D)".
   */
  it.each(['8(B-D)', '5(A,C-D)', '12(A)', '4(A-B,D)'])(
    'refuses to read %s as a course name',
    (heading) => {
      const dom = new JSDOM(
        `<div id="center-top"><h1 class="page-title"><a href="/course/100001">${heading}</a></h1></div>`,
      );
      const course = parseCourseFromCoursePage(dom.window.document, '/course/100001/updates');

      expect(course).not.toBeNull();
      expect(course!.id).toBe('100001');
      expect(course!.originalName).toBe('');
      // The section is still worth reporting -- the page is authoritative
      // about which section is open.
      expect(course!.sectionName).toBe(heading);
    },
  );

  it('still reads a real course name that happens to carry a section', () => {
    const dom = new JSDOM(
      '<div id="center-top"><h1 class="page-title"><a href="/course/100001">Math Concepts &amp; Applications L2: 8(B-D)</a></h1></div>',
    );
    const course = parseCourseFromCoursePage(dom.window.document, '/course/100001/updates');

    expect(course!.originalName).toBe('Math Concepts & Applications L2');
    expect(course!.sectionName).toBe('8(B-D)');
  });

  it('splits "Name: Section" headings', () => {
    expect(splitCourseTitle('Example Government: 5(A,C-D)')).toEqual({
      name: 'Example Government',
      section: '5(A,C-D)',
    });
    expect(splitCourseTitle('No Section Here')).toEqual({ name: 'No Section Here' });
  });
});

describe('to do parsing', () => {
  it('parses every row the native panel returned, not only the visible ones', () => {
    const { document } = loadFixture('home', '/home');
    const tasks = parseTodoPanel(document);

    expect(tasks.length).toBeGreaterThan(7);
    expect(tasks.some((task) => task.status === 'overdue')).toBe(true);
    expect(tasks.some((task) => task.status === 'upcoming')).toBe(true);
  });

  it('normalizes each row into the shared task model', () => {
    const { document } = loadFixture('home', '/home');
    const task = parseTodoPanel(document)[0]!;

    expect(task.title.length).toBeGreaterThan(0);
    expect(task.href).toMatch(/^\/assignment\/\d+/);
    expect(task.id).toMatch(/^\d+$/);
    expect(task.dueAt).toBeInstanceOf(Date);
    expect(task.courseName).toBeTruthy();
    expect(['assignment', 'assessment', 'discussion', 'event', 'unknown']).toContain(task.source);
  });

  it('sorts by due date with undated items last', () => {
    const sorted = sortTasksByDue([
      { title: 'c', status: 'upcoming', source: 'assignment' },
      { title: 'a', status: 'upcoming', source: 'assignment', dueAt: new Date(2000, 0, 2) },
      { title: 'b', status: 'upcoming', source: 'assignment', dueAt: new Date(2000, 0, 1) },
    ]);

    expect(sorted.map((task) => task.title)).toEqual(['b', 'a', 'c']);
  });

  it('parses the documented fragment envelope the same way', () => {
    const payload = apiFixture('overdue-submissions');
    const parser = new DOMParser();
    const tasks = parseFragmentTasks(payload.html, 'overdue', parser);

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.status === 'overdue')).toBe(true);
  });

  it('treats an empty fragment as no tasks rather than an error', () => {
    expect(parseFragmentTasks('', 'upcoming', new DOMParser())).toEqual([]);
  });
});

describe('grade report parsing', () => {
  it('parses every course report on the global grades page', () => {
    const { document } = loadFixture('global-grades', '/grades/grades');
    const reports = parseAllGradeReports(document);

    expect(reports.length).toBe(18);
    expect(reports.every((report) => report.nodes.length > 0)).toBe(true);
  });

  it('rebuilds the hierarchy from data-id / data-parent-id', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const report = parseAllGradeReports(document)[0]!;

    const courseRow = report.nodes.find((node) => node.kind === 'course')!;
    expect(courseRow.parentId).toBeNull();

    // Periods hang off the course row, and the tree is walkable without clicks.
    const periods = childrenOf(report, courseRow.nodeId);
    expect(periods.length).toBeGreaterThan(0);
    expect(periods.every((node) => node.kind === 'period')).toBe(true);

    expect(report.nodes.some((node) => node.kind === 'category')).toBe(true);
    expect(report.nodes.some((node) => node.kind === 'item')).toBe(true);
  });

  it('reads assignment IDs from the I-<id> item convention', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const report = parseAllGradeReports(document)[0]!;
    const items = report.nodes.filter((node) => node.kind === 'item');

    expect(items.length).toBeGreaterThan(0);
    expect(items.some((item) => item.assignmentId?.match(/^\d+$/))).toBe(true);
    expect(items.some((item) => item.href?.startsWith('/assignment/'))).toBe(true);
  });

  it('distinguishes an ungraded item from a zero', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const report = parseAllGradeReports(document)[0]!;
    const ungraded = report.nodes.filter((node) => node.kind === 'item' && !node.hasGrade);

    expect(ungraded.length).toBeGreaterThan(0);
    for (const node of ungraded) expect(node.earned).toBeUndefined();
  });

  it('reads the course percentage from the root row', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const report = parseAllGradeReports(document)[0]!;

    expect(courseGradePercentage(report)).toBeTypeOf('number');
  });

  it('captures displayed weight contributions when Schoology renders them', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const report = parseAllGradeReports(document)[0]!;

    expect(report.nodes.some((node) => node.contributionText?.includes('%'))).toBe(true);
  });
});

describe('assignment parsing', () => {
  it('reads the assignment detail', () => {
    const url = fixtureRoute('assignment');
    const { document } = loadFixtureAtRoute('assignment');
    const assignment = parseAssignmentPage(document, url)!;

    expect(assignment.id).toBe(fixtureIds('assignment').assignmentId);
    expect(assignment.title.length).toBeGreaterThan(0);
    expect(assignment.dueText).toMatch(/Due/);
    expect(assignment.earned).toBeTypeOf('number');
    expect(assignment.possible).toBeTypeOf('number');
    expect(assignment.category).toBeTruthy();
    expect(assignment.gradingPeriod).toBeTruthy();
  });

  it('detects the native submit control without recreating it', () => {
    const url = fixtureRoute('assignment');
    const { document } = loadFixtureAtRoute('assignment');

    expect(parseAssignmentPage(document, url)!.hasSubmitControl).toBe(true);
    // The native anchor must still be exactly what Schoology rendered.
    const submit = document.querySelector<HTMLAnchorElement>('.submit-assignment .dropbox-submit')!;
    expect(submit.getAttribute('href')).toBe(
      `/assignment/${fixtureIds('assignment').assignmentId}/dropbox/submit`,
    );
  });

  it('returns null on a page that is not an assignment', () => {
    const { document } = loadFixture('home', '/home');
    expect(parseAssignmentPage(document, '/home')).toBeNull();
  });
});

describe('materials parsing', () => {
  it('reads folder rows from the materials root', () => {
    const { document } = loadFixtureAtRoute('course-materials');
    const folders = parseMaterialFolders(document);

    expect(folders.length).toBeGreaterThan(0);
    expect(folders[0]!.folderId).toMatch(/^\d+$/);
    expect(folders[0]!.href).toContain('?f=');
  });

  it('reads material rows and their Schoology type', () => {
    const { document } = loadFixtureAtRoute('course-folder');
    const items = parseMaterialItems(document);

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.type === 'assignment')).toBe(true);
    expect(items.every((item) => item.href?.startsWith('/assignment/'))).toBe(true);
    expect(items.every((item) => typeof item.displayWeight === 'number')).toBe(true);
  });
});

describe('surface recognition', () => {
  it('recognizes the home layout', () => {
    expect(isRecognizableHome(loadFixture('home', '/home').document)).toBe(true);
    expect(isRecognizableHome(loadFixture('assignment', '/assignment/200001').document)).toBe(false);
  });

  it('recognizes the calendar', () => {
    expect(isCalendarRendered(loadFixture('calendar', '/user-calendar').document)).toBe(true);
  });
});
