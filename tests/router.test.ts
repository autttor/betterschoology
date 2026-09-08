import { describe, expect, it } from 'vitest';
import {
  assignmentIdFromPath,
  courseIdFromPath,
  describeRoute,
  identifySchoologyPage,
  isCourseRoute,
  isHomeRoute,
  resolveRoute,
} from '@/src/schoology/router';
import { isSchoologyHost, isSupportedSchoologyHost } from '@/src/utils/hosts';

/**
 * Route detection must be identical on real Schoology and on the local fixture
 * server, because the fixture server is the primary development target.
 */
describe('identifySchoologyPage', () => {
  it.each([
    ['/home', 'home'],
    ['/home/recent-activity', 'home-recent-activity'],
    ['/home/course-dashboard', 'home-course-dashboard'],
    ['/home/assignments', 'home-assignments'],
    ['/grades/grades', 'global-grades'],
    ['/user-calendar', 'calendar'],
    ['/calendar', 'calendar'],
    ['/course/100001/materials', 'course-materials'],
    ['/course/100001/student_grades', 'course-grades'],
    ['/course/100001/updates', 'course-updates'],
    ['/course/100001/members', 'course-members'],
    ['/course/100001', 'course'],
    ['/assignment/200001', 'assignment'],
    ['/assignment/200001/info', 'assignment'],
    ['/resources', 'other'],
    ['/user/300001', 'other'],
    ['/', 'other'],
  ])('classifies %s as %s', (pathname, expected) => {
    expect(identifySchoologyPage(pathname)).toBe(expected);
  });

  it('does not classify non-numeric course paths as courses', () => {
    expect(identifySchoologyPage('/course/templates/materials')).toBe('other');
  });

  it('tolerates trailing slashes', () => {
    expect(identifySchoologyPage('/course/100001/materials/')).toBe('course-materials');
    expect(identifySchoologyPage('/grades/grades/')).toBe('global-grades');
  });
});

describe('resolveRoute', () => {
  it('extracts course and folder IDs from a materials URL', () => {
    const route = resolveRoute('https://district.schoology.com/course/100001/materials?f=500001');

    expect(route.type).toBe('course-materials');
    expect(route.courseId).toBe('100001');
    expect(route.folderId).toBe('500001');
    expect(route.assignmentId).toBeNull();
  });

  it('extracts the materials list filter', () => {
    const route = resolveRoute('/course/100001/materials?list_filter=assignments');
    expect(route.materialsFilter).toBe('assignments');
  });

  it('ignores a non-numeric folder parameter', () => {
    expect(resolveRoute('/course/100001/materials?f=abc').folderId).toBeNull();
  });

  it('extracts the assignment ID', () => {
    expect(resolveRoute('/assignment/200001/info').assignmentId).toBe('200001');
  });

  /**
   * The whole point of pathname-only routing: the adapter must behave the same
   * against a real tenant and against localhost.
   */
  it('classifies identically on a Schoology host and on the fixture server', () => {
    const live = resolveRoute('https://district.schoology.com/course/100001/materials');
    const local = resolveRoute('http://localhost:4173/course/100001/materials');

    expect(local.type).toBe(live.type);
    expect(local.courseId).toBe(live.courseId);
  });
});

describe('ID extraction', () => {
  it('reads IDs from paths', () => {
    expect(courseIdFromPath('/course/100001/updates')).toBe('100001');
    expect(assignmentIdFromPath('/assignment/200001')).toBe('200001');
  });

  it('returns null when the path carries no ID', () => {
    expect(courseIdFromPath('/home')).toBeNull();
    expect(assignmentIdFromPath('/grades/grades')).toBeNull();
  });
});

describe('route groups and labels', () => {
  it('groups home and course routes', () => {
    expect(isHomeRoute('home-course-dashboard')).toBe(true);
    expect(isHomeRoute('assignment')).toBe(false);
    expect(isCourseRoute('course-grades')).toBe(true);
    expect(isCourseRoute('global-grades')).toBe(false);
  });

  it('produces a human label for every page type', () => {
    expect(describeRoute('course-materials')).toBe('Course Materials');
    expect(describeRoute('other')).toBe('Other Schoology page');
  });
});

/** Host authorization is a separate concern from routing, and stays that way. */
describe('host authorization', () => {
  it('accepts Schoology tenant hosts', () => {
    expect(isSchoologyHost('district.schoology.com')).toBe(true);
    expect(isSchoologyHost('schoology.com')).toBe(true);
    expect(isSchoologyHost('notschoology.com')).toBe(false);
    expect(isSchoologyHost('schoology.com.evil.test')).toBe(false);
  });

  it('allows localhost only when development hosts are enabled', () => {
    expect(isSupportedSchoologyHost('localhost', true)).toBe(true);
    expect(isSupportedSchoologyHost('localhost', false)).toBe(false);
    expect(isSupportedSchoologyHost('127.0.0.1', true)).toBe(true);
  });
});
