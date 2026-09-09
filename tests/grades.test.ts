import { describe, expect, it } from 'vitest';
import type { GradeCategory, GradeItem } from '@/src/grades';
import {
  applyWhatIf,
  bandFor,
  buildCourseGrade,
  calculateFromCategories,
  calculateGpa,
  currentPercentage,
  defaultPeriod,
  detectModel,
  formatFraction,
  formatPercent,
  letterFor,
  parseWeight,
  percentageOf,
  projectPeriod,
  requiredForPointItem,
  requiredForWeightedFinal,
  requiredOnRemainingPoints,
  roundTo,
} from '@/src/grades';
import { parseAllGradeReports, parseGradeReport } from '@/src/schoology/adapters/grades';
import { defaultGpaConfig, DEFAULT_GRADE_SCALE } from '@/src/storage/defaults';
import type { GpaConfig } from '@/src/types/settings';
import { loadFixtureAtRoute } from './helpers/fixtures';

/**
 * The grade engine is pure arithmetic over the normalized model, so it is
 * tested as arithmetic: fixed inputs, exact expected outputs, no DOM.
 *
 * The cases below are the ones that decide whether a projection is honest --
 * missing scores, excused work, empty categories, zero-point items, unreachable
 * targets. Getting any of them wrong produces a number that looks precise and
 * lies.
 */
let nextId = 0;

function item(overrides: Partial<GradeItem> = {}): GradeItem {
  nextId += 1;
  return {
    id: `i-${nextId}`,
    title: `Item ${nextId}`,
    hasGrade: overrides.earned !== undefined,
    ...overrides,
  };
}

function category(
  title: string,
  items: GradeItem[],
  weight?: number,
): GradeCategory {
  nextId += 1;
  return { id: `c-${nextId}`, title, items, ...(weight !== undefined ? { weight } : {}) };
}

describe('rounding helpers', () => {
  it('rounds half up without floating-point noise', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(91.79999999999998, 2)).toBe(91.8);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
  });

  it('is deterministic for the same input', () => {
    const values = Array.from({ length: 50 }, () => roundTo(88.88888, 1));
    expect(new Set(values).size).toBe(1);
  });

  it('never renders a display value with floating-point garbage', () => {
    expect(formatPercent(91.79999999999998)).toBe('91.8');
    expect(formatPercent(100)).toBe('100');
    expect(formatPercent(undefined)).toBe('—');
    expect(formatFraction(18, 20)).toBe('18 / 20');
    expect(formatFraction(undefined, 20)).toBe('—');
  });

  it('refuses to divide by zero rather than reporting a grade', () => {
    expect(percentageOf(5, 0)).toBeUndefined();
    expect(percentageOf(0, 10)).toBe(0);
  });
});

describe('point-based courses', () => {
  it('computes a simple total', () => {
    const result = calculateFromCategories([
      category('Work', [item({ earned: 18, possible: 20 }), item({ earned: 9, possible: 10 })]),
    ]);

    expect(result.model).toBe('points');
    expect(currentPercentage(result)).toBe(90);
  });

  it('leaves an ungraded item out instead of scoring it zero', () => {
    const result = calculateFromCategories([
      category('Work', [item({ earned: 18, possible: 20 }), item({ possible: 100 })]),
    ]);

    // A missing score is not a zero: 18/20, not 18/120.
    expect(currentPercentage(result)).toBe(90);
    expect(result.gradedCount).toBe(1);
  });

  it('reports zero earned as zero, not as missing', () => {
    const result = calculateFromCategories([
      category('Work', [item({ earned: 0, possible: 20, hasGrade: true })]),
    ]);

    expect(currentPercentage(result)).toBe(0);
    expect(result.gradedCount).toBe(1);
  });

  it('handles a perfect score', () => {
    const result = calculateFromCategories([
      category('Work', [item({ earned: 25, possible: 25 })]),
    ]);
    expect(currentPercentage(result)).toBe(100);
  });

  it('excludes an excused item from both sides of the fraction', () => {
    const result = calculateFromCategories([
      category('Work', [
        item({ earned: 18, possible: 20 }),
        item({ earned: 0, possible: 50, hasGrade: true, excused: true }),
      ]),
    ]);

    expect(currentPercentage(result)).toBe(90);
  });

  it('survives a zero-point item without dividing by zero', () => {
    const result = calculateFromCategories([
      category('Work', [
        item({ earned: 18, possible: 20 }),
        item({ earned: 0, possible: 0, hasGrade: true }),
      ]),
    ]);

    expect(currentPercentage(result)).toBe(90);
  });

  it('reports no grade at all when nothing is graded', () => {
    const result = calculateFromCategories([category('Work', [item({ possible: 20 })])]);

    expect(result.model).toBe('unknown');
    expect(result.percentage).toBeUndefined();
  });

  it('includes a hypothetical future item', () => {
    const categories = [category('Work', [item({ earned: 18, possible: 20 })])];
    const projected = calculateFromCategories(
      applyWhatIf(categories, {
        added: [
          { categoryId: categories[0]!.id, title: 'Unit 3 Exam', earned: 88, possible: 100 },
        ],
      }),
    );

    expect(currentPercentage(projected)).toBe(roundTo((106 / 120) * 100, 2));
  });
});

describe('weighted courses', () => {
  it('weights two categories', () => {
    const result = calculateFromCategories([
      category('Tests', [item({ earned: 90, possible: 100 })], 60),
      category('Homework', [item({ earned: 100, possible: 100 })], 40),
    ]);

    expect(result.model).toBe('weighted');
    // 0.6*90 + 0.4*100
    expect(currentPercentage(result)).toBe(94);
  });

  it('weights three categories with unequal weights', () => {
    const result = calculateFromCategories([
      category('Tests', [item({ earned: 92.3, possible: 100 })], 40),
      category('Homework', [item({ earned: 97.1, possible: 100 })], 30),
      category('Projects', [item({ earned: 93.8, possible: 100 })], 30),
    ]);

    expect(currentPercentage(result)).toBe(roundTo(0.4 * 92.3 + 0.3 * 97.1 + 0.3 * 93.8, 2));
  });

  it('renormalizes when a category has nothing graded yet', () => {
    const result = calculateFromCategories([
      category('Tests', [item({ earned: 90, possible: 100 })], 50),
      category('Homework', [item({ earned: 80, possible: 100 })], 30),
      category('Final', [item({ possible: 100 })], 20),
    ]);

    // The empty category drops out and the remaining weights are renormalized:
    // (50*90 + 30*80) / 80, not / 100.
    expect(currentPercentage(result)).toBe(roundTo((50 * 90 + 30 * 80) / 80, 2));
    expect(result.categories.find((entry) => entry.category.title === 'Final')!.counted).toBe(
      false,
    );
  });

  it('drops an excused item from its category', () => {
    const result = calculateFromCategories([
      category('Tests', [
        item({ earned: 90, possible: 100 }),
        item({ earned: 0, possible: 100, hasGrade: true, excused: true }),
      ], 100),
    ]);

    expect(currentPercentage(result)).toBe(90);
  });

  it('does not treat a partly-weighted course as weighted', () => {
    // One category out of three carrying a weight is a points course with an
    // oddity, not a weighted course; treating it as weighted would silently
    // rescale the grade.
    const model = detectModel([
      category('Tests', [item({ earned: 90, possible: 100 })], 50),
      category('Homework', [item({ earned: 80, possible: 100 })]),
      category('Labs', [item({ earned: 70, possible: 100 })]),
    ]);
    expect(model).toBe('points');
  });

  it('accepts a hypothetical item in a weighted category', () => {
    const categories = [
      category('Tests', [item({ earned: 90, possible: 100 })], 60),
      category('Homework', [item({ earned: 100, possible: 100 })], 40),
    ];

    const projected = calculateFromCategories(
      applyWhatIf(categories, {
        added: [{ categoryId: categories[0]!.id, title: 'Final', earned: 70, possible: 100 }],
      }),
    );

    // Tests becomes 160/200 = 80.
    expect(currentPercentage(projected)).toBe(roundTo(0.6 * 80 + 0.4 * 100, 2));
  });
});

describe('what-if projections', () => {
  const period = () => ({
    id: 'p1',
    title: 'Q1',
    categories: [
      category('Tests', [
        item({ earned: 90, possible: 100 }),
        { ...item({ possible: 100 }), id: 'missing', title: 'Unit 3 Exam' },
      ]),
    ],
    periods: [],
  });

  it('shows current and projected side by side', () => {
    const target = period();
    const missing = target.categories[0]!.items[1]!;

    const result = projectPeriod(target, {
      overrides: { [missing.id]: { earned: 88 } },
    });

    expect(currentPercentage(result.current)).toBe(90);
    expect(currentPercentage(result.projected)).toBe(89);
    expect(roundTo(result.delta!, 2)).toBe(-1);
  });

  it('models a missing assignment scored as a zero', () => {
    const target = period();
    const missing = target.categories[0]!.items[1]!;

    const result = projectPeriod(target, { overrides: { [missing.id]: { earned: 0 } } });
    expect(currentPercentage(result.projected)).toBe(45);
  });

  it('models excusing an assignment', () => {
    const target = period();
    const graded = target.categories[0]!.items[0]!;

    const result = projectPeriod(target, { overrides: { [graded.id]: { excused: true } } });
    expect(result.projected.percentage).toBeUndefined();
  });

  it('never mutates the model it projected from', () => {
    const target = period();
    const missing = target.categories[0]!.items[1]!;
    const before = JSON.stringify(target);

    projectPeriod(target, { overrides: { [missing.id]: { earned: 100 } } });

    expect(JSON.stringify(target)).toBe(before);
  });
});

describe('target grade calculator', () => {
  const categories = () => [
    category('Tests', [item({ earned: 85, possible: 100 })], 70),
    category('Homework', [item({ earned: 95, possible: 100 })], 30),
  ];

  it('answers a reachable target for a final worth points', () => {
    const cats = categories();
    const result = requiredForPointItem({
      categories: cats,
      categoryId: cats[0]!.id,
      possible: 100,
      target: 90,
    });

    expect(result.achievable).toBe(true);
    // Tests becomes (85 + x) / 200; 0.7 * that + 0.3 * 95 = 90  ->  x = 90.71
    expect(result.requiredPoints).toBeCloseTo(90.71, 1);
    expect(result.requiredPercentage).toBeCloseTo(90.71, 1);
  });

  it('says plainly when a target is out of reach', () => {
    const cats = categories();
    const result = requiredForPointItem({
      categories: cats,
      categoryId: cats[0]!.id,
      possible: 100,
      target: 99,
    });

    expect(result.achievable).toBe(false);
    expect(result.requiredPercentage!).toBeGreaterThan(100);
  });

  it('lands exactly on the boundary', () => {
    const cats = [category('Everything', [item({ earned: 80, possible: 100 })])];
    const result = requiredForPointItem({
      categories: cats,
      categoryId: cats[0]!.id,
      possible: 100,
      target: 90,
    });

    expect(result.requiredPoints).toBe(100);
    expect(result.achievable).toBe(true);
  });

  it('answers a final expressed as a percentage weight', () => {
    const result = requiredForWeightedFinal({
      currentPercentage: 93.2,
      weight: 20,
      target: 90,
    });

    // 90 = 93.2*0.8 + f*0.2
    expect(result.requiredPercentage).toBeCloseTo(77.2, 1);
    expect(result.achievable).toBe(true);
  });

  it('reports an unreachable weighted final honestly', () => {
    const result = requiredForWeightedFinal({
      currentPercentage: 80,
      weight: 10,
      target: 95,
    });

    expect(result.requiredPercentage).toBeCloseTo(230, 0);
    expect(result.achievable).toBe(false);
  });

  it('answers the general "what do I need on the rest" question', () => {
    const result = requiredOnRemainingPoints({
      earned: 450,
      possible: 500,
      remainingPoints: 100,
      target: 90,
    });

    // (450 + x) / 600 = 0.9  ->  x = 90
    expect(result.requiredPoints).toBe(90);
    expect(result.requiredPercentage).toBe(90);
    expect(result.achievable).toBe(true);
  });

  it('refuses to answer when the inputs cannot support it', () => {
    expect(
      requiredOnRemainingPoints({ earned: 10, possible: 10, remainingPoints: 0, target: 90 })
        .unavailable,
    ).toBe('insufficient-data');

    const cats = [category('Empty', [])];
    expect(
      requiredForPointItem({ categories: cats, categoryId: cats[0]!.id, possible: 0, target: 90 })
        .unavailable,
    ).toBe('insufficient-data');
  });

  it('says so when the final cannot move the grade at all', () => {
    const cats = [
      category('Tests', [item({ earned: 90, possible: 100 })], 100),
      category('Extra', [item({ earned: 50, possible: 100 })], 0),
    ];

    const result = requiredForPointItem({
      categories: cats,
      categoryId: cats[1]!.id,
      possible: 100,
      target: 95,
    });

    expect(result.unavailable).toBe('no-effect');
  });
});

describe('GPA', () => {
  const config = (overrides: Partial<GpaConfig> = {}): GpaConfig => ({
    ...defaultGpaConfig(),
    ...overrides,
  });

  it('maps percentages to letters on the configured scale', () => {
    expect(letterFor(95, DEFAULT_GRADE_SCALE)).toBe('A');
    expect(letterFor(90, DEFAULT_GRADE_SCALE)).toBe('A-');
    expect(letterFor(89.99, DEFAULT_GRADE_SCALE)).toBe('B+');
    expect(letterFor(0, DEFAULT_GRADE_SCALE)).toBe('F');
    expect(letterFor(undefined, DEFAULT_GRADE_SCALE)).toBeUndefined();
    expect(bandFor(93, DEFAULT_GRADE_SCALE)!.points).toBe(4);
  });

  it('computes a simple 4.0', () => {
    const result = calculateGpa(
      [
        { courseId: '1', courseName: 'A', percentage: 95 },
        { courseId: '2', courseName: 'B', percentage: 94 },
      ],
      config(),
    );

    expect(result.gpa).toBe(4);
    expect(result.countedCourses).toBe(2);
  });

  it('averages mixed letter grades', () => {
    const result = calculateGpa(
      [
        { courseId: '1', courseName: 'A', percentage: 95 },   // A  4.0
        { courseId: '2', courseName: 'B', percentage: 85 },   // B  3.0
        { courseId: '3', courseName: 'C', percentage: 75 },   // C  2.0
      ],
      config(),
    );

    expect(result.gpa).toBe(3);
  });

  it('uses a custom scale exactly as the student set it', () => {
    const result = calculateGpa(
      [{ courseId: '1', courseName: 'A', percentage: 88 }],
      config({
        scale: [
          { letter: 'A', minPercentage: 85, points: 5 },
          { letter: 'B', minPercentage: 70, points: 4 },
          { letter: 'F', minPercentage: 0, points: 0 },
        ],
      }),
    );

    expect(result.courses[0]!.letter).toBe('A');
    expect(result.gpa).toBe(5);
  });

  it('adds an honors/AP boost per course', () => {
    const result = calculateGpa(
      [
        { courseId: '1', courseName: 'AP Gov', percentage: 95 },
        { courseId: '2', courseName: 'Ceramics', percentage: 95 },
      ],
      config({ courses: { '1': { boost: 1 } } }),
    );

    expect(result.gpa).toBe(4.5);
    // The unweighted figure ignores every boost, which is what makes the
    // weighted one honest.
    expect(result.unweightedGpa).toBe(4);
  });

  it('excludes a course the student excluded', () => {
    const result = calculateGpa(
      [
        { courseId: '1', courseName: 'A', percentage: 95 },
        { courseId: '2', courseName: 'Study hall', percentage: 60 },
      ],
      config({ courses: { '2': { included: false } } }),
    );

    expect(result.gpa).toBe(4);
    expect(result.countedCourses).toBe(1);
    expect(result.courses[1]!.excludedReason).toBe('excluded-by-student');
  });

  it('respects different credit values', () => {
    const result = calculateGpa(
      [
        { courseId: '1', courseName: 'Full year', percentage: 95 }, // 4.0 x 1
        { courseId: '2', courseName: 'Half', percentage: 75 },      // 2.0 x 0.5
      ],
      config({ courses: { '2': { credits: 0.5 } } }),
    );

    expect(result.gpa).toBe(roundTo((4 * 1 + 2 * 0.5) / 1.5, 2));
    expect(result.totalCredits).toBe(1.5);
  });

  it('leaves out a course with no grade rather than scoring it zero', () => {
    const result = calculateGpa(
      [
        { courseId: '1', courseName: 'A', percentage: 95 },
        { courseId: '2', courseName: 'Not started' },
      ],
      config(),
    );

    expect(result.gpa).toBe(4);
    expect(result.courses[1]!.excludedReason).toBe('no-grade');
  });

  it('reports no GPA at all when nothing counts', () => {
    const result = calculateGpa([{ courseId: '1', courseName: 'A' }], config());
    expect(result.gpa).toBeUndefined();
    expect(result.countedCourses).toBe(0);
  });
});

describe('grade model from the captured DOM', () => {
  it('builds a course tree from a real course grades page', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const report = parseGradeReport(document.querySelector('.hierarchical-grading-report')!)!;
    const course = buildCourseGrade(report);

    expect(course.courseId).toMatch(/^\d+$/);
    expect(course.periods.length).toBeGreaterThan(0);

    const period = defaultPeriod(course)!;
    expect(period).toBeDefined();
    expect(period.categories.length).toBeGreaterThan(0);
    expect(period.categories[0]!.items.length).toBeGreaterThan(0);
  });

  it('parses every course on the global grades page', () => {
    const { document } = loadFixtureAtRoute('global-grades');
    const courses = parseAllGradeReports(document).map(buildCourseGrade);

    expect(courses.length).toBeGreaterThan(5);
    for (const course of courses) expect(course.courseId).toMatch(/^\d+$/);
  });

  it('reads a weight only when Schoology rendered one', () => {
    expect(parseWeight('(16.67%)')).toBe(16.67);
    expect(parseWeight('(100%)')).toBe(100);
    expect(parseWeight('')).toBeUndefined();
    expect(parseWeight('Category')).toBeUndefined();

    const { document } = loadFixtureAtRoute('course-grades');
    const report = parseGradeReport(document.querySelector('.hierarchical-grading-report')!)!;
    const course = buildCourseGrade(report);

    // The capture's own courses are point-based: no category carries a weight,
    // and Better Schoology must not invent one.
    const weights = course.periods
      .flatMap((period) => [...period.categories, ...period.periods.flatMap((p) => p.categories)])
      .map((cat) => cat.weight);
    expect(weights.every((weight) => weight === undefined)).toBe(true);
  });

  it('computes a course grade from the captured tree', () => {
    const { document } = loadFixtureAtRoute('course-grades');
    const report = parseGradeReport(document.querySelector('.hierarchical-grading-report')!)!;
    const course = buildCourseGrade(report);
    const period = defaultPeriod(course)!;

    const result = calculateFromCategories([
      ...period.categories,
      ...period.periods.flatMap((nested) => nested.categories),
    ]);

    expect(result.model).toBe('points');
    expect(result.percentage).toBeDefined();
    expect(result.percentage!).toBeGreaterThanOrEqual(0);
    expect(result.percentage!).toBeLessThanOrEqual(100);
  });
});
