import * as cheerio from 'cheerio';
import { ID_BASES, createRegistry, type IdKind, type Registry, type SanitizerConfig } from './types';

/**
 * Pass 1 of the fixture import: learn what has to be replaced.
 *
 * Every real identifier and every piece of identifying text is discovered here
 * and given a deterministic synthetic replacement. Because the whole capture
 * set is scanned before anything is rewritten, a real course ID becomes
 * `course 100001` in *every* page, keeping cross-page relationships (a To Do
 * row, its assignment page, its grade row) intact.
 *
 * Nothing in this module is ever written to the repository: it runs against
 * `.local-schoology/`, which is gitignored.
 */

/** Synthetic course names. Deliberately generic, and obviously not real. */
const COURSE_NAME_POOL = [
  'Example Government',
  'Example Biology',
  'Example Algebra',
  'Example World History',
  'Example English',
  'Example Chemistry',
  'Example Studio Art',
  'Example Physics',
  'Example Spanish',
  'Example Computer Science',
  'Example Health',
  'Example Economics',
  'Example Geometry',
  'Example Music',
  'Example Physical Education',
  'Example Journalism',
  'Example Statistics',
  // Deliberately long, so the "very long course name" layout case is covered
  // by a real fixture rather than a hand-written one.
  'Example Advanced Interdisciplinary Research Seminar and Capstone Workshop',
];

const SECTION_POOL = ['1(A)', '2(B)', '3(C)', '4(D)', '5(A-B)', '6(C-D)', '7(A,C)', '8(B-D)'];

/** The capture's own student becomes this. Other people become numbered stand-ins. */
const OWN_USER_NAME = 'Test Student';
const OTHER_USER_NAMES = [
  'Alex Rivera',
  'Jordan Blake',
  'Sam Ellis',
  'Casey Nguyen',
  'Morgan Patel',
  'Riley Okafor',
];

const SCHOOL_NAME = 'Example High School';

interface ScanInput {
  /** Page label, used only in diagnostics. */
  name: string;
  html: string;
}

export interface ScanResult {
  registry: Registry;
  /** Raw `s_common.user.uid`, so the capture's own student can be identified. */
  ownUserId: string | null;
}

/**
 * Shortest identifier worth remapping.
 *
 * Real Schoology object IDs are long. Short values that look like IDs are
 * usually structural -- grading period `0` means "(no grading period)" -- and
 * remapping them would rewrite every stray digit in the document.
 */
const MIN_ID_LENGTH = 4;

/** Assigns the next synthetic ID in a kind's space, or returns an existing one. */
function mapId(registry: Registry, raw: string, kind: IdKind): string {
  if (raw.length < MIN_ID_LENGTH) return raw;

  const existing = registry.ids.get(raw);
  if (existing) return existing;

  const used = Array.from(registry.kinds.values()).filter((k) => k === kind).length;
  const synthetic = String(ID_BASES[kind] + used);

  registry.ids.set(raw, synthetic);
  registry.kinds.set(raw, kind);
  return synthetic;
}

function addString(registry: Registry, raw: string | undefined, replacement: string): void {
  const value = raw?.replace(/\s+/g, ' ').trim();
  // Very short strings would match far too much during global replacement.
  if (!value || value.length < 3) return;
  if (!registry.strings.has(value)) registry.strings.set(value, replacement);
}

/**
 * Reads `Drupal.settings` out of the raw HTML to learn the capture's own user
 * and school IDs. Only these two fields are read; the settings object also
 * carries CSRF and session tokens, which are never extracted, logged or stored.
 */
export function readOwnIdentity(html: string): { uid: string | null; schoolNid: string | null } {
  const start = html.indexOf('jQuery.extend(Drupal.settings, {"basePath"');
  if (start === -1) return { uid: null, schoolNid: null };

  const objectStart = html.indexOf('{', start);
  let depth = 0;
  let end = objectStart;
  for (let i = objectStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  try {
    const settings = JSON.parse(html.slice(objectStart, end)) as {
      s_common?: { user?: { uid?: string; school_nid?: string } };
    };
    return {
      uid: settings.s_common?.user?.uid ?? null,
      schoolNid: settings.s_common?.user?.school_nid ?? null,
    };
  } catch {
    return { uid: null, schoolNid: null };
  }
}

/** URL patterns that prove an identifier's kind. */
const ID_PATTERNS: Array<{ re: RegExp; kind: IdKind }> = [
  { re: /\/course\/(\d+)/g, kind: 'course' },
  { re: /\/course-templates\/(\d+)/g, kind: 'course' },
  { re: /\/assignment\/(\d+)/g, kind: 'assignment' },
  { re: /\/user\/(\d+)/g, kind: 'user' },
  { re: /\/school\/(\d+)/g, kind: 'school' },
  { re: /\/attachment\/(\d+)/g, kind: 'attachment' },
  { re: /[?&]f=(\d+)/g, kind: 'folder' },
  { re: /\/apps\/(\d+)\//g, kind: 'app' },
];

export function scanCaptures(pages: ScanInput[], config: SanitizerConfig = {}): ScanResult {
  const registry = createRegistry();
  let ownUserId: string | null = null;

  // Caller-supplied replacements win over anything derived below.
  for (const [from, to] of Object.entries(config.replacements ?? {})) {
    registry.strings.set(from, to);
  }
  if (config.captureHost) registry.hosts.add(config.captureHost);

  // --- identifiers -------------------------------------------------------
  for (const page of pages) {
    const identity = readOwnIdentity(page.html);
    if (identity.uid) {
      ownUserId ??= identity.uid;
      mapId(registry, identity.uid, 'user');
    }
    if (identity.schoolNid) mapId(registry, identity.schoolNid, 'school');

    for (const { re, kind } of ID_PATTERNS) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(page.html))) mapId(registry, match[1]!, kind);
    }

    for (const host of page.html.matchAll(/https?:\/\/([a-z0-9-]+\.schoology\.com)/gi)) {
      // `asset-cdn` / `ui` are Schoology's own shared CDNs, not tenant hosts.
      const host_ = host[1]!.toLowerCase();
      if (!/^(asset-cdn|ui|app|www)\./.test(host_)) registry.hosts.add(host_);
    }
  }

  // --- DOM-derived identifiers and identifying text ----------------------
  for (const page of pages) {
    const $ = cheerio.load(page.html);

    // Grade tree IDs: periods and the `<periodId>-<categoryId>` composites.
    $('[data-id]').each((_, node) => {
      const raw = $(node).attr('data-id') ?? '';
      const className = $(node).attr('class') ?? '';
      if (className.includes('period-row') && /^\d+$/.test(raw)) mapId(registry, raw, 'period');
      if (className.includes('category-row')) {
        const parts = raw.split('-');
        if (parts.length === 2 && /^\d+$/.test(parts[1]!)) mapId(registry, parts[1]!, 'category');
      }
    });

    /*
     * Any other long number appearing inside a link or asset URL is a
     * Schoology object ID: update posts, likes, link redirects, events, videos.
     * The named patterns above cannot enumerate every route Schoology has, so
     * URL-bearing attributes are swept generically. Numbers outside URLs (such
     * as the `data-start` epoch on To Do rows) are deliberately left alone --
     * those are semantics the extension parses, not identity.
     */
    $('[href], [src], [action], [caption_href], [data-url]').each((_, node) => {
      const attrs = (node as { attribs?: Record<string, string> }).attribs ?? {};
      for (const value of Object.values(attrs)) {
        if (!value || !/[/?=]/.test(value)) continue;
        for (const match of value.matchAll(/\d{7,}/g)) {
          if (!registry.ids.has(match[0])) mapId(registry, match[0], 'other');
        }
      }
    });

    // Material and folder row IDs (`n-<id>`, `f-<id>`).
    $('tr[id]').each((_, node) => {
      const id = $(node).attr('id') ?? '';
      const material = id.match(/^n-(\d+)$/);
      if (material) mapId(registry, material[1]!, 'assignment');
      const folder = id.match(/^f-(\d+)$/);
      if (folder) mapId(registry, folder[1]!, 'folder');
    });

    // People: every `/user/<id>` link carries the person's name in `title`,
    // in its text, or in a nested avatar's `alt`.
    $('a[href*="/user/"]').each((_, node) => {
      const el = $(node);
      const href = el.attr('href') ?? '';
      const uid = href.match(/\/user\/(\d+)/)?.[1];
      if (!uid) return;

      const isOwn = uid === ownUserId || el.closest('.own-picture').length > 0;
      const index = Number(mapId(registry, uid, 'user')) - ID_BASES.user;
      const replacement = isOwn
        ? OWN_USER_NAME
        : OTHER_USER_NAMES[index % OTHER_USER_NAMES.length]!;

      for (const candidate of [el.attr('title'), el.text(), el.find('img').attr('alt')]) {
        addString(registry, candidate, replacement);
      }
    });

    // School / building names, from To Do tooltips and course headers.
    $('.realm-title-building, .upcoming-tooltip-subtitle').each((_, node) => {
      addString(registry, $(node).text(), SCHOOL_NAME);
    });

    // Courses: the global grades page names every enrolled course next to its ID.
    $('.gradebook-course').each((_, node) => {
      const el = $(node);
      const courseId = (el.attr('id') ?? '').match(/^s-js-gradebook-course-(\d+)$/)?.[1];
      if (!courseId) return;

      const titleEl = el.find('.gradebook-course-title').first().clone();
      titleEl.find('.visually-hidden').remove();
      registerCourseTitle(registry, courseId, titleEl.text());
    });

    // Course pages carry their own name in the breadcrumb.
    $('#center-top .course-title').each((_, node) => {
      const el = $(node);
      const courseId = (el.find('a').attr('href') ?? '').match(/\/course\/(\d+)/)?.[1];
      if (!courseId) return;
      registerCourseTitle(registry, courseId, el.find('a').text());
      addString(registry, el.attr('title'), syntheticCourseName(registry, courseId));
    });

    // To Do tooltips render `Course Name : Section`, which is the only place
    // some courses appear at all.
    $('.realm-main-titles').each((_, node) => {
      const clone = $(node).clone();
      clone.find('.realm-title-building').remove();
      const text = clone.text().replace(/\s+/g, ' ').trim();
      const separator = text.lastIndexOf(' : ');
      if (separator > 0) addString(registry, text.slice(0, separator), 'Example Course');
    });
  }

  /*
   * Building names are discovered above from `.realm-title-building`. District
   * names are not reliably marked up anywhere, so they cannot be discovered the
   * same way -- supply them through `replacements` in
   * `.local-schoology/sanitizer-map.json`, and add them to `forbidden` so the
   * verification pass fails if one survives. Never hardcode a real school or
   * district name in this repository.
   */
  return { registry, ownUserId };
}

/** Maps a `Name: Section` heading, registering both halves. */
function registerCourseTitle(registry: Registry, courseId: string, raw: string): void {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return;

  const name = syntheticCourseName(registry, courseId);
  const separator = text.lastIndexOf(': ');

  if (separator > 0) {
    const realName = text.slice(0, separator).trim();
    const realSection = text.slice(separator + 2).trim();
    const index = courseIndex(registry, courseId);

    addString(registry, realName, name);
    addString(registry, realSection, SECTION_POOL[index % SECTION_POOL.length]!);
    addString(registry, text, `${name}: ${SECTION_POOL[index % SECTION_POOL.length]!}`);
  } else {
    addString(registry, text, name);
  }
}

function courseIndex(registry: Registry, courseId: string): number {
  const synthetic = registry.ids.get(courseId);
  return synthetic ? Number(synthetic) - ID_BASES.course : 0;
}

function syntheticCourseName(registry: Registry, courseId: string): string {
  return COURSE_NAME_POOL[courseIndex(registry, courseId) % COURSE_NAME_POOL.length]!;
}
