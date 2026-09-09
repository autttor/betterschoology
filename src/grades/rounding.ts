/**
 * Shared rounding and formatting.
 *
 * Every grade number Better Schoology displays goes through here, for two
 * reasons: a grade that reads `91.79999999999998%` destroys trust in the whole
 * feature, and two surfaces that round differently will eventually disagree
 * about the same course.
 *
 * Rounding is half-up on the absolute value, corrected for the binary
 * representation error that makes `Math.round(1.005 * 100)` return 100. It is
 * deterministic: the same input always produces the same output.
 */
export function roundTo(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return Number.NaN;

  const factor = 10 ** decimals;
  const scaled = value * factor;
  // `Number.EPSILON` scaled to the magnitude of the value, so the correction
  // stays proportional instead of vanishing on large numbers.
  const corrected = scaled + Math.sign(scaled) * Math.abs(scaled) * Number.EPSILON;
  return Math.round(corrected) / factor;
}

/** A percentage as a string, with trailing zeros dropped. `91.8`, not `91.80`. */
export function formatPercent(value: number | undefined, decimals = 1): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const rounded = roundTo(value, decimals);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Points, which are usually whole and should not gain a decimal point. */
export function formatPoints(value: number | undefined, decimals = 2): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const rounded = roundTo(value, decimals);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** `18 / 20`, or `18` when the total is unknown. */
export function formatFraction(earned: number | undefined, possible: number | undefined): string {
  if (earned === undefined) return '—';
  if (possible === undefined) return formatPoints(earned);
  return `${formatPoints(earned)} / ${formatPoints(possible)}`;
}

/** Percentage of a fraction, or undefined when it cannot be computed. */
export function percentageOf(earned: number, possible: number): number | undefined {
  // A zero-point item has no percentage. Reporting one would mean dividing by
  // zero and calling the result a grade.
  if (!Number.isFinite(earned) || !Number.isFinite(possible) || possible === 0) return undefined;
  return (earned / possible) * 100;
}

/** Clamps a weight expressed as a percentage into a sane range. */
export function normalizeWeight(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}
