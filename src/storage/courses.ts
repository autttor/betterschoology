import type { CourseCustomization, ResolvedCourse, SchoologyCourse } from '@/src/types';
import type { BetterSchoologyState } from '@/src/types/settings';
import { safeCssColor, safeImageUrl } from '@/src/utils/url';

/**
 * Course customization resolution.
 *
 * "Schoology supplies the course. The student decides how that course looks to
 * them." Native identity (`id`, `href`, `originalName`) is carried through
 * untouched; only the `display*` fields change. Resolution order is
 * `custom value -> native value -> Better Schoology default`.
 */
export function resolveCourse(
  course: SchoologyCourse,
  customization: CourseCustomization | undefined,
): ResolvedCourse {
  const displayName = customization?.customName?.trim() || course.originalName;
  const displayShortName =
    customization?.shortName?.trim() || customization?.customName?.trim() || course.originalName;

  // Student-supplied URLs and colors are validated here rather than at the
  // point of use, so an unsafe value can never reach the DOM.
  const displayImageUrl = safeImageUrl(customization?.imageUrl) ?? course.originalImageUrl;

  return {
    ...course,
    displayName,
    displayShortName,
    ...(displayImageUrl ? { displayImageUrl } : {}),
    ...(safeCssColor(customization?.accentColor)
      ? { accentColor: safeCssColor(customization?.accentColor)! }
      : {}),
    ...(safeCssColor(customization?.backgroundColor)
      ? { backgroundColor: safeCssColor(customization?.backgroundColor)! }
      : {}),
    ...(safeCssColor(customization?.textColor)
      ? { textColor: safeCssColor(customization?.textColor)! }
      : {}),
    ...(safeCssColor(customization?.mutedTextColor)
      ? { mutedTextColor: safeCssColor(customization?.mutedTextColor)! }
      : {}),
    pinned: customization?.pinned === true,
    hidden: customization?.hidden === true,
    position: typeof customization?.position === 'number' ? customization.position : null,
    hasCustomizations: hasAnyOverride(customization),
  };
}

export function hasAnyOverride(customization: CourseCustomization | undefined): boolean {
  if (!customization) return false;
  return Object.entries(customization).some(
    ([key, value]) => key !== 'courseId' && value !== undefined && value !== '',
  );
}

/** Every stored course, resolved and ordered for the customizer and dashboard. */
export function resolveAllCourses(state: BetterSchoologyState): ResolvedCourse[] {
  return Object.values(state.courses)
    .map((course) => resolveCourse(course, state.customizations[course.id]))
    .sort(compareForDisplay);
}

/** Pinned first, then explicit position, then name. */
export function compareForDisplay(a: ResolvedCourse, b: ResolvedCourse): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

  const aPos = a.position ?? Number.MAX_SAFE_INTEGER;
  const bPos = b.position ?? Number.MAX_SAFE_INTEGER;
  if (aPos !== bPos) return aPos - bPos;

  return a.displayName.localeCompare(b.displayName);
}

/**
 * Best-effort course lookup by display text.
 *
 * Used only where Schoology gives a course *name* but no ID -- To Do rows link
 * to the assignment, not the course. This is a heuristic and is never used to
 * write a customization: customizations are always keyed by the course ID
 * proven by a native href, because names are neither unique nor stable.
 */
export function findCourseIdByName(
  state: BetterSchoologyState,
  name: string | undefined,
): string | null {
  if (!name) return null;
  const needle = normalize(name);
  if (!needle) return null;

  const matches = Object.values(state.courses).filter(
    (course) => normalize(course.originalName) === needle,
  );

  // An ambiguous name (two sections of the same course) resolves to nothing
  // rather than to a coin flip.
  return matches.length === 1 ? matches[0]!.id : null;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}
