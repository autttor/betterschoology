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
| Feed items are `li[id^="edge-assoc-"][timestamp]`, with the post's realm as a `/course/<id>` anchor inside `.update-sentence-inner` | observed | Announcement summaries and feed-based course discovery return nothing; the native feed is unaffected |
| `#header [data-sgy-sitenav="nav-trigger"]` marks a header navigation control | observed | The compact course switcher does not mount; the native Courses menu is unaffected |
| Course menu items carry semantic classes (`course-materials-left-menu`, `course-updates-left-menu`, `course-student-grade-left-menu`, `course-member-left-menu`) | observed | The Better course nav is empty and the feature stands down; the native menu is unaffected |
| `#menu-s-apps-list` holds `.app-link-wrapper` entries for installed apps | observed | Apps are not collapsed; nothing about them changes |
| `.drop-items` is the assignment submission block, containing `.submit-assignment .dropbox-submit` | observed | The submission panel is not relocated and stays in the sidebar, working |
| `#center-top .grade-item-header-buttons` holds `.received-grade` / `.max-points` | observed | No grade is shown on the assignment header; the native block is still there |
| `.percentage-contrib` renders a row's weight as `(16.67%)` | observed (on period rows) | Weights are not shown and the course is treated as point-based |
| A period's categories sum to the period, and a category's items sum to the category | observed structure, **inferred** arithmetic | A computed grade differs from Schoology's; Schoology's own percentage is preferred wherever it renders one |
| `.summary-course` is the "Course Grade: n%" line under a report | observed | A duplicated grade line remains visible; nothing breaks |

## Surfaces with no capture, and therefore no selectors

The reference pack has no saved source for these. Better Schoology does not
guess at their markup.

- `/home/course-dashboard` — it is Schoology's own course-card grid, and the
  reason Better Home builds its cards from the course registry rather than by
  enhancing Schoology's cards in place.
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

**The compact course switcher is added beside the native Courses menu, not in
place of it.** The native menu is a React tree of generated class names and was
never captured, so replacing it would mean guessing at markup that changes
between Schoology releases. Better Schoology therefore appends its own control
to the end of the header nav list — the position least likely to disturb
React's child reconciliation — and never modifies, hides or rebinds anything
native. If React drops our node during a re-render, the next enhancement pass
puts it back and nothing is lost in the meantime.

**Course accent colours are decorative when the student has not chosen one.**
No captured Schoology surface exposes a course colour, so rather than painting
every card the same blue, an accent is derived from the course ID. It is
presentational only, stable per course, and always overridden by a student's
own choice.

**Announcement summaries link back to the native feed item, and deliberately do
not re-host the post.** Schoology renders rich text, attachments, polls, likes
and comments inside a feed item; a summary that tried to reproduce all of that
would be lying by omission. The panel carries author, course, time and an
excerpt, and points at the real thing.

**Hiding the right rail on the dashboard is conditional.** Better Home hides
`#right-column` while the Dashboard view is showing, because Better To Do,
announcements and upcoming events replace everything in it. That only happens
once a To Do source was actually read — if every read failed, the native rail
stays exactly where it is. Losing a To Do list to a Better Schoology parse
failure is not an acceptable outcome.

**Category weights are read, never derived.** The capture's own courses are
point-based: their category rows carry no `.percentage-contrib`, and Better
Schoology therefore shows no weights for them and computes a total-points grade.
A course is treated as weighted only when *every* category with graded work
carries a weight -- one weighted category among five is a points course with an
oddity, and rescaling it would silently change the student's grade. The
`weighted` fixture scenario exercises the weighted path by putting the same
`.percentage-contrib` span the capture demonstrates on period rows onto category
rows; that is a transform of demonstrated markup, not invented DOM.

**Schoology's own course percentage wins over ours wherever it renders one.**
Better Schoology's arithmetic reproduces the standard model -- points, or
weighted categories with empty categories dropped and the remaining weights
renormalized -- but a school can configure rules the report does not expose
(dropped lowest scores, rounding rules, extra credit handling). Where the two
differ, the page says both: Schoology's number as the headline, ours named as a
calculation.

**GPA inputs are entirely the student's.** Schoology publishes no GPA, no
grading scale and no course credits on any captured surface. The default 4.0
scale is a starting point, credits default to 1.0 per course, and both are said
to be local defaults wherever they appear. The widget is labelled *not an
official GPA* in every place it renders.

**One course percentage per course is stored locally.** It is the smallest thing
that makes the dashboard's GPA tile work away from the grades page: a course ID,
a percentage and a timestamp. No assignment titles, no individual scores, no
comments -- and the customizer lists what is stored with a button that forgets
it. Nothing is transmitted anywhere; there is still no backend.

**Hypothetical grades are never persisted.** A what-if lives for the life of the
page. Storing one would invite it to be mistaken later for a real grade, which
is the single worst thing this feature could do.

**Assignment submission status is not shown, because no captured surface
exposes it.** Schoology's `Submitted` / `Late` / `Excused` indicators live
inside the submission panel, which the reference pack does not capture. Better
Assignment therefore reports only what the page proves — `Graded` from a real
grade, `Overdue` from a due date it managed to parse — and shows Schoology's own
submission panel for everything else. The type (`AssignmentStatus`) models the
other states so a future capture can fill them in without a redesign.

**The assignment due date is parsed from rendered text, best-effort.** Schoology
renders a locale sentence ("Due: Thursday, September 3, 2026 at 11:59 pm"), not
a machine value. Anything that does not parse cleanly, or lands more than ten
years from now, yields no due date at all rather than a wrong one — and the
sentence itself is always displayed verbatim regardless.

**Native nodes are moved, and a move is refused when an `<iframe>` is inside.**
Reparenting an element preserves its handlers; reparenting an iframe reloads its
document. An assignment's submission block can contain a TinyMCE editor, so a
block with an iframe stays where Schoology put it and Better Assignment says so
in the panel rather than silently doing nothing.

**Materials rows are restyled, never rebuilt.** `sCourseMaterialsFolders` binds
folder expanders, completion tracking and lock behaviour to those exact rows.
Better Materials only adds classes; it inserts no content into a row, so a row
still states its due date exactly once — its own.

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
