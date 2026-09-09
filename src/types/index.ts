/**
 * Normalized Better Schoology domain models.
 *
 * Everything above the Schoology adapter layer consumes these types. Feature
 * modules and React components must never reach into native Schoology DOM
 * directly -- if a field is missing here, add it to an adapter, not to a
 * component.
 */

/** Page kinds Better Schoology can recognize from a Schoology URL. */
export type SchoologyPageType =
  | 'home'
  | 'home-recent-activity'
  | 'home-course-dashboard'
  | 'home-assignments'
  | 'global-grades'
  | 'calendar'
  | 'course'
  | 'course-materials'
  | 'course-grades'
  | 'course-updates'
  | 'course-members'
  | 'assignment'
  | 'other';

/** Result of routing a Schoology URL. IDs are only present when the path proves them. */
export interface SchoologyRoute {
  type: SchoologyPageType;
  /** Course ID parsed from `/course/<id>/...`, when the route carries one. */
  courseId: string | null;
  /** Assignment ID parsed from `/assignment/<id>`, when the route carries one. */
  assignmentId: string | null;
  /** Folder ID from the `?f=<id>` query parameter on materials routes. */
  folderId: string | null;
  /** Materials `?list_filter=` value, when present. */
  materialsFilter: string | null;
  pathname: string;
  search: string;
}

/**
 * A course as Schoology describes it. This is native identity only -- student
 * customizations live separately in {@link CourseCustomization} so a rename
 * never has to touch anything Schoology owns.
 */
export interface SchoologyCourse {
  id: string;
  originalName: string;
  sectionName?: string;
  schoolName?: string;
  originalImageUrl?: string;
  href: string;
}

/** A course record persisted locally so the customizer can list it later. */
export interface StoredCourse extends SchoologyCourse {
  /** Epoch ms of the last time this course was seen on a Schoology page. */
  lastSeenAt: number;
}

/** Student-local presentation overrides. Never sent anywhere, never written back to Schoology. */
export interface CourseCustomization {
  courseId: string;

  customName?: string;
  shortName?: string;

  imageUrl?: string;

  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  mutedTextColor?: string;

  pinned?: boolean;
  hidden?: boolean;
  position?: number;
}

/**
 * A course after customization resolution: native identity preserved, display
 * fields resolved through `custom value -> native value -> default`.
 */
export interface ResolvedCourse extends SchoologyCourse {
  displayName: string;
  displayShortName: string;
  displayImageUrl?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  pinned: boolean;
  hidden: boolean;
  position: number | null;
  hasCustomizations: boolean;
}

export type TaskStatus = 'upcoming' | 'overdue' | 'completed' | 'unknown';

export type TaskSource = 'assignment' | 'assessment' | 'discussion' | 'event' | 'unknown';

/** A normalized To Do item, parsed from native rows or the documented fragment endpoints. */
export interface SchoologyTask {
  id?: string;
  title: string;
  href?: string;

  courseId?: string;
  courseName?: string;

  dueAt?: Date;

  status: TaskStatus;
  source: TaskSource;
}

/**
 * A Recent Activity post, summarized.
 *
 * Only the envelope is normalized: who posted, where, when, and an excerpt.
 * Announcements are *information*, so Better Schoology summarizes them and
 * links back to Schoology's own rendering rather than re-hosting the content.
 */
export interface HomeAnnouncement {
  id?: string;
  author?: string;
  courseId?: string;
  courseName?: string;
  excerpt?: string;
  /** Schoology's own rendered time text, e.g. "Today at 11:47 am". */
  createdText?: string;
  postedAt?: Date;
  /** In-page anchor to the native feed item. */
  href?: string;
}

/** A row of a hierarchical grade report, keyed by Schoology's own `data-id` tree. */
export interface GradeNode {
  nodeId: string;
  parentId: string | null;
  kind: 'course' | 'period' | 'category' | 'item' | 'unknown';
  title: string;
  href?: string;
  assignmentId?: string;
  /** Points earned on item rows. */
  earned?: number;
  /** Maximum points on item rows. */
  possible?: number;
  /** Percentage shown on aggregate rows. */
  percentage?: number;
  /** Displayed contribution/weight text such as `(16.67%)`, when Schoology renders one. */
  contributionText?: string;
  dueText?: string;
  hasGrade: boolean;
}

/** A whole course grade report as rendered by `.hierarchical-grading-report`. */
export interface CourseGradeReport {
  courseId: string;
  courseTitle?: string;
  nodes: GradeNode[];
}

/**
 * What Better Schoology can prove about an assignment's state.
 *
 * `graded` and `overdue` come from the page; `submitted`, `late` and `excused`
 * are Schoology states whose markers the reference pack does not capture, so
 * they are modelled but never inferred. See
 * docs/schoology-integration-assumptions.md.
 */
export type AssignmentStatus = 'graded' | 'overdue' | 'due' | 'unknown';

/** Assignment detail parsed from an assignment page. */
export interface SchoologyAssignment {
  id: string | null;
  title: string;
  /** Schoology's own rendered due sentence. */
  dueText?: string;
  /** Best-effort parse of `dueText`; absent when it could not be read. */
  dueAt?: Date;
  earned?: number;
  possible?: number;
  category?: string;
  gradingPeriod?: string;
  description?: string;
  status: AssignmentStatus;
  hasSubmitControl: boolean;
  attachmentCount: number;
}
