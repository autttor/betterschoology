import type { GradeCategory, GradeItem, GradePeriod } from './model';
import { allCategories } from './model';
import { calculateFromCategories, type GradeResult } from './calculate';

/**
 * Hypothetical grades.
 *
 * Nothing here writes anywhere. A what-if is a *copy* of the parsed model with
 * overrides applied, calculated by the same functions that produce the real
 * grade -- so a projection can never diverge from the number it is projecting
 * from, and Schoology's own gradebook is untouched by construction.
 */
export interface ItemOverride {
  /** Replacement score. */
  earned?: number;
  /** Replacement total, for the rare case a student is told it changed. */
  possible?: number;
  /** Treat as excused: removed from the calculation entirely. */
  excused?: boolean;
  /** Treat an ungraded item as scored, e.g. a missing assignment as a zero. */
  include?: boolean;
}

/** An assignment that does not exist yet. */
export interface HypotheticalItem {
  categoryId: string;
  title: string;
  earned: number;
  possible: number;
}

export interface WhatIfInput {
  /** Keyed by grade-item id. */
  overrides?: Record<string, ItemOverride>;
  added?: HypotheticalItem[];
}

export interface WhatIfResult {
  current: GradeResult;
  projected: GradeResult;
  /** Percentage-point difference, or undefined when either side is unavailable. */
  delta?: number;
}

const HYPOTHETICAL_PREFIX = 'bs-hypothetical-';

export function isHypothetical(item: GradeItem): boolean {
  return item.id.startsWith(HYPOTHETICAL_PREFIX);
}

/** Applies overrides and additions to a copy of the categories. */
export function applyWhatIf(
  categories: GradeCategory[],
  input: WhatIfInput,
): GradeCategory[] {
  const overrides = input.overrides ?? {};
  const added = input.added ?? [];

  return categories.map((category) => {
    const items: GradeItem[] = category.items.map((item) => {
      const override = overrides[item.id];
      if (!override) return item;

      const earned = override.earned ?? item.earned;
      const possible = override.possible ?? item.possible;

      return {
        ...item,
        ...(earned !== undefined ? { earned } : {}),
        ...(possible !== undefined ? { possible } : {}),
        ...(override.excused !== undefined ? { excused: override.excused } : {}),
        // Scoring a previously ungraded item is what makes it count.
        hasGrade: override.excused ? item.hasGrade : (override.include ?? true) && earned !== undefined,
      };
    });

    for (const [index, hypothetical] of added.entries()) {
      if (hypothetical.categoryId !== category.id) continue;
      items.push({
        id: `${HYPOTHETICAL_PREFIX}${category.id}-${index}`,
        title: hypothetical.title,
        earned: hypothetical.earned,
        possible: hypothetical.possible,
        hasGrade: true,
      });
    }

    return { ...category, items };
  });
}

/** Current and projected grades for a period, side by side. */
export function projectPeriod(period: GradePeriod, input: WhatIfInput): WhatIfResult {
  const categories = allCategories(period);
  const current = calculateFromCategories(categories);
  const projected = calculateFromCategories(applyWhatIf(categories, input));

  return {
    current,
    projected,
    ...(current.percentage !== undefined && projected.percentage !== undefined
      ? { delta: projected.percentage - current.percentage }
      : {}),
  };
}
