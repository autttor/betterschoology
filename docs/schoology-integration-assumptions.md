# Schoology integration assumptions

Everything here needs verification against a live Schoology tenant before it
can be treated as settled. It is written down because the alternative — quiet
assumptions buried in code — is how extensions break silently after a Schoology
release.

Confidence tiers follow the client reference pack: **observed** (present in the
capture), **inferred** (implied but not proven), **assumed** (our design
decision).

## Verified against the capture, unverified against a live tenant

| Assumption | Confidence | Risk if wrong |
| --- | --- | --- |
| `#todo`, `.upcoming-event`, `.overdue-submissions-wrapper`, `.upcoming-submissions-wrapper` are the To Do structure | observed | Better To Do shows nothing; native panel unaffected |
| `.upcoming-event[data-start]` is Unix seconds | observed | Due dates render wrongly |
| `data-exception="3"` means *missing* | observed (in native module source) | An item is mis-flagged as overdue |
| `/home/{overdue,upcoming}_submissions_ajax` return `{ html }` | observed source | Endpoint read fails; DOM fallback takes over |
| `.report-row[data-id][data-parent-id]` describes the grade tree | observed | Grade parsing returns a flat or empty tree |
| Category rows use a `<periodId>-<categoryId>` composite `data-id` | observed | Category grouping breaks; items still parse |
| Item rows use `I-<assignmentId>` | observed | Assignment links are not associated with grade rows |
| `#s-js-gradebook-course-<courseId>` identifies a course panel | observed | Course discovery finds nothing on `/grades/grades` |
| Materials rows use `n-<materialId>` / `f-<folderId>` | observed | Materials parsing returns nothing |
| `.submit-assignment .dropbox-submit` is the native submission control | observed | We only *detect* it, never replace it — low risk |

## Surfaces with no capture, and therefore no selectors

The reference pack has no saved source for these. Better Schoology does not
guess at their markup.

- `/home/course-dashboard` — **this matters**: it is the natural home for a
  course-card grid, and the whole reason the Better Dashboard ships as a shell
  rather than a full replacement in 0.0.1.
- `/home/assignments`
- the modern **Courses** global dropdown (screenshot only)
- course Members and course Profile content
- the assignment submission modal and its upload flow
- notification and message popovers
- discussion detail pages, group pages, assessment-taking flows

The fixture server routes the first two to the Home fixture so the route
resolves, and labels them `(not captured)`. That is a routing convenience, not
a claim about their markup.

## Known gaps in the current implementation

**Custom course images are not applied to native Schoology surfaces.** There is
no documented course-card selector to apply them to — the course-dashboard page
was never captured. Custom images currently render only on Better Schoology's
own dashboard cards. Once a course-card fixture exists, extend
`src/features/courses/index.ts`.

**To Do rows carry a course *name*, not a course ID.** Schoology's To Do rows
link to the assignment, so associating a task with a course is done by matching
the name against the locally discovered course registry
(`findCourseIdByName`). This is a display-only convenience, it refuses to
resolve ambiguous names, and it is never used to write a customization —
customizations are always keyed by an ID proven by a native href.

**`s_realm_info.realm_id` is not assumed to equal the URL course ID.** The
reference explicitly warns they can differ. Navigation identity always comes
from the URL.

**`Drupal.settings` is not read at all.** The extension runs in an isolated
world, and the reference's rule is to avoid depending on page-world settings
unless DOM and URL data are insufficient. They have been sufficient so far. If
that changes, bridge an allow-listed subset via `CustomEvent` — never the whole
object, and never `s_common`, which holds CSRF and session context.

**Tenant variation is untested.** Schools differ in theme styles, enabled
modules, installed apps, grading periods and categories, custom domains, and
role permissions. Selectors here are considered stable because they carry
semantic meaning in Schoology's own module code, not merely because they
appeared in one capture.

**Custom (non-`schoology.com`) tenant domains are not supported yet.** The
manifest is scoped to `*://*.schoology.com/*`. Support should arrive as
optional host permissions the student grants per site, not as a broad match.

## Two structural corrections we made to the reference pack

Both found by testing adapters against the captures, and worth knowing about:

1. **The right column nests inside `#center`,** as a sibling of `#main` — not as
   a sibling of `#center`, which the reference's simplified tree diagram
   suggests. The fixture stylesheet and layout assumptions follow the capture.
2. **Course pages name their course two different ways.** Material/folder
   *player* pages (folder contents, course grades, assignment) use a
   `.course-title` breadcrumb whose `title` attribute holds the unsectioned
   name; course section-root pages (materials, updates) put the name in
   `h1.page-title` instead. `SGY.course.breadcrumbCourseTitle` checks both, and
   the adapter only trusts an anchor that actually links to a course — otherwise
   an assignment page's own heading would be read as the course name.
