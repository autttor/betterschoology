/**
 * The grade calculation layer.
 *
 * Everything here is pure: models built by the adapter go in, numbers come out.
 * No DOM, no storage, no clock -- which is what makes the projections testable
 * and what keeps a UI bug from ever becoming a wrong grade.
 */
export * from './rounding';
export * from './model';
export * from './calculate';
export * from './whatIf';
export * from './target';
export * from './gpa';
