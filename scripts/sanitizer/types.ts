/** Kinds of Schoology identifier the sanitizer remaps to synthetic values. */
export type IdKind =
  | 'course'
  | 'assignment'
  | 'user'
  | 'school'
  | 'folder'
  | 'attachment'
  | 'period'
  | 'category'
  | 'app'
  | 'other';

/**
 * Base for each ID space. Chosen to be obviously synthetic, short enough to
 * read in a fixture, and wide enough that a capture cannot overflow into the
 * next space.
 */
export const ID_BASES: Record<IdKind, number> = {
  course: 100001,
  assignment: 200001,
  user: 300001,
  school: 400001,
  folder: 500001,
  attachment: 600001,
  period: 700001,
  category: 800001,
  app: 900001,
  other: 990001,
};

export interface SanitizerConfig {
  /** Explicit string replacements, applied before any generated ones. */
  replacements?: Record<string, string>;
  /** Hostname of the captured tenant, e.g. `district.schoology.com`. */
  captureHost?: string;
  /** Extra literal strings that must never appear in output. */
  forbidden?: string[];
}

/** Everything pass 1 learns, consumed by pass 2. */
export interface Registry {
  /** raw numeric ID -> synthetic numeric ID */
  ids: Map<string, string>;
  /** raw ID -> kind, for reporting */
  kinds: Map<string, IdKind>;
  /** raw literal string -> replacement (names, schools, courses, sections) */
  strings: Map<string, string>;
  /** hostnames seen in absolute URLs, rewritten to root-relative paths */
  hosts: Set<string>;
}

export function createRegistry(): Registry {
  return { ids: new Map(), kinds: new Map(), strings: new Map(), hosts: new Set() };
}
