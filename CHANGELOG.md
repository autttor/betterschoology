# Changelog

All notable changes to Better Schoology are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).
While the extension is pre-1.0, minor versions mark feature milestones.

## [0.4.0] — A dashboard worth looking at

The home page rearranged around what a student actually does, plus everything
from the customization branch: per-panel control, hideable work, renameable
navigation and rotating headings.

### Added

- **A two-column Home.** Courses and To Do — the things you act on — hold the
  main column at full width; the grade tile, notifications, recent feedback and
  announcements move into a sticky rail beside them, typeset a step down so they
  read as reference rather than competition. Below 1040px the rail becomes the
  bottom of the page.
- **Per-panel control.** To Do, notifications, recent feedback, announcements
  and the grade summary each switch on and off independently, in the
  customizer's Dashboard section. Turn the last one off and the grid gives up
  the rail column instead of leaving a hole. Courses are never a toggle: they
  are the point of the page.
- **Hiding a single piece of work.** A hover-revealed, keyboard-reachable
  control on any To Do row, and a Hidden assignments section in the customizer
  to bring it back. Offered only where Schoology gave the row a stable identity
  — a title is not an identity, and hiding by one would hide its namesakes in
  every course.
- **Recent feedback and notifications panels.** Feedback comes from your own
  grade report and says so, rather than implying a recency Schoology does not
  publish; the notifications panel reads a count only from an accessible label
  and clicks Schoology's own control rather than reimplementing a popover.
- **Renameable top navigation and a local display name.** Courses, Groups,
  Resources and Grade Report can be relabelled, and Better Schoology can address
  you by a name you choose — in its own UI by default, and in Schoology's header
  only if you ask. Every change edits one existing text node and is reversible.
- **Rotating headings.** 750 contextual lines, chosen from what is actually
  due, with history so a line does not repeat immediately. Switchable off.
- **A course card that says "Nothing due"** rather than leaving a gap — and only
  when a To Do source was genuinely readable.

### Fixed

- **Schoology's own Courses / Groups mega-menu now follows the dark theme.**
  Reported from a real tenant: the menu is React-portalled, sets no
  `aria-controls`, and is built from plain `div`s carrying tenant-white inline
  backgrounds, so the previous role-based rules never reached it. It is now
  found three ways — ARIA ownership, a panel rendered inside the trigger's own
  nav item, and a portalled overlay while a header trigger is open — none of
  which reads a generated class name, and none of which marks anything while no
  menu is open.
- **A native menu that opens by flipping `aria-expanded` alone now triggers a
  pass.** The lifecycle observes that one attribute in addition to structure,
  and ignores mutations coming from Better Schoology's own nodes so opening our
  switcher costs nothing.

### Changed

- The row of summary tiles is gone. The counts it repeated ("8 overdue",
  "1 due soon") now sit inline in the header's date line, two inches above the
  same numbers in To Do rather than duplicating them.
- The course grid sits directly on the page under a section heading instead of
  inside its own card. A grid of cards inside a card is a box around a box.
- `showAnnouncements` and `showGpaWidget` moved into the `dashboard` settings
  group beside the other panel toggles. Existing settings migrate (schema 5).

### Notes

- No new data leaves the device. Recent feedback is a same-origin read of your
  own `/grades/grades` page, exactly as the rest of the extension works.

## [0.3.1] — Colours and themes

A styling release, from real-tenant feedback: dark mode covered Better
Schoology's own surfaces and Schoology's page shell, but not the controls in
between.

### Fixed

- **Native Schoology buttons and menus now follow the dark theme.** A course
  page was rendering a dark panel with a white `Notifications` button, a white
  course-switcher and a white filter menu beside Better Schoology's own dark
  controls. `.link-btn`, `.ui-selectmenu`, `#edge-filters-btn`, the action-link
  menus, the notification-settings popup, infotips and the feed's like bar are
  all themed now — every one of them a semantic Schoology class, never a
  generated one.
- **The compact course switcher no longer renders as a white button on a dark
  header.** Schoology styles its header with ID-based rules, which outrank any
  single class — including ours. The switcher's rules are now `#header` plus a
  class: enough to win, narrow enough to touch nothing but our own nodes.
- **A course page that heads with only its section no longer renames the
  course.** On tenants whose course pages show `8(B-D)` rather than
  `Name: Section`, that section was being read as the course name, stored in
  the registry, and shown on the card and the header. The parser now reports a
  section-only heading as a section with no name, the registry refuses to store
  a nameless course or to let one overwrite a good name, and the course header
  takes the name from the registry and the section from the page.

### Notes

- Schoology's own global **Courses** mega-menu is a React tree with generated
  class names and no capture in the reference pack, so it is themed only
  best-effort, through the ARIA roles its navigation code sets. Where those do
  not match, the menu stays exactly as Schoology rendered it.
  *(Superseded in 0.4.0, which finds it without relying on roles.)*
- Light mode is untouched: every rule added here is scoped to `[data-bs-dark]`.

## [0.3.0] — Grades + GPA

The first real grades system: normalized parsing, an honest calculator, and a
GPA built entirely from numbers the student controls.

### Added

- **A normalized grade model.** Schoology's flat report table, with its
  `data-id` / `data-parent-id` pointers, becomes a course -> periods ->
  categories -> items tree in the adapter layer. Nothing above that layer reads
  grade DOM.
- **A pure calculation engine** (`src/grades/`): point-based and weighted
  courses, category renormalization when a category has nothing graded yet,
  excused items, missing scores, zero-point items, and shared rounding helpers
  so no two surfaces can disagree about the same course.
- **Better Grades** on `/grades/grades` and `/course/<id>/student_grades`: a
  summary that says where its number came from, grading-period selection,
  categories with their weights made explicit, and assignments underneath.
- **What-if grades.** Edit any score in place and see current versus projected
  side by side, labelled *Hypothetical* throughout. Nothing is written
  anywhere: a projection is a copy of the parsed model with overrides applied.
- **"What do I need?"** for a final worth points *or* a final carrying its own
  weight, derived from the course's real model rather than a generic formula.
  An unreachable target is reported as unreachable, with the number.
- **A GPA calculator**: your grading scale, your credits, your honors/AP
  boosts, all editable and stored on this device. A panel on the global grades
  page and a tile on the dashboard, both labelled *Calculated by Better
  Schoology* and *not an official GPA*.
- **A `weighted` fixture scenario**, giving category rows the
  `.percentage-contrib` markup that period rows already carry in the capture,
  so the weighted code path is exercised against real Schoology structure.
- A grade-calculation unit suite covering point-based, weighted, GPA and
  target-grade cases, including the ones that decide whether a projection is
  honest: missing scores, excused work, empty categories, zero-point items and
  unreachable targets.

### Changed

- Storage schema version 4, migrated from 1, 2 and 3 without resetting
  anything -- including a grading scale the student has edited.
- The customizer gains a **Grades & GPA** section: scale editor, boosts,
  per-course credits and inclusion, and a button to forget stored grades.

### Privacy

- To show a GPA away from the grades page, Better Schoology now stores **one
  percentage per course** locally -- no assignment names, no individual scores,
  no comments. It is listed in the customizer, and one button forgets all of
  it. Nothing is uploaded; there is still no backend.

## [0.2.0] — Better Courses / Assignments

Course and assignment pages that put the important things first.

### Added

- **Better course pages**: a clear header carrying your own course name, the
  Schoology name underneath it when you have renamed the course, and the
  course's own sections — Materials, Updates, Grades, Members — as one compact
  nav built from the native menu's own hrefs.
- **Collapsible third-party apps.** A course with a dozen installed apps pushes
  Materials and Grades below the fold; they now sit behind an `Apps (n)`
  disclosure. Show / Collapse / Hide is a setting. No app URL, handler or
  element is touched — collapsing is a class on Schoology's own container.
- **Better materials**: Schoology's own table, restyled into readable rows with
  a real title, a clamped description and the due date as a value rather than
  the tail of a sentence. Folders stay visually distinct and keep every
  expander, lock and completion behaviour Schoology bound to them.
- **Better assignment pages**: course, title, status, due date, category and
  grade in one header, then description, attachments and comments as sections,
  with the submission panel beside them.
- Assignment status from signals the page actually proves — `Graded` from a
  real grade, `Overdue` from a parsed due date — and nothing inferred from
  colours or button labels.
- New settings: better course pages, better assignment pages, app visibility
  and material density.

### Changed

- Course and assignment pages use the full content width while Better
  Schoology is showing.
- Storage schema version 3, migrated from 1 and 2 without resetting anything.

### Notes on how this is built

- **Schoology's submission machinery is moved, never recreated.** The real
  `.drop-items` block — with its form tokens, its popup bindings and its
  handlers — is relocated into the Better Assignment layout with
  `appendChild`. A block containing an `<iframe>` is refused a move, because
  reparenting an iframe reloads it and would wipe an in-progress rich-text
  submission; in that case it stays in the sidebar and Better Schoology says so.
- Every native heading our layout replaces is hidden by a class, never removed,
  and turning the feature off restores the page's markup exactly.

## [0.1.0] — Better Home

A genuinely course-first home page.

### Added

- **Better Home** with two views, **Dashboard** and **Feed**, exposed as a
  keyboard-operable tab bar. Dashboard is the default; Feed shows Schoology's
  own Recent Activity, unchanged.
- **Course cards** that dominate the page: custom name with the Schoology name
  kept visible beneath it, custom image, custom accent and colours, pinned
  ordering, hidden courses omitted, an overdue indicator, the next few pieces
  of work, and Materials / Updates / Grades quick links.
- **Better To Do** grouped into Overdue, Today, Tomorrow, This week, Later and
  No due date, reading every item the Schoology fragment endpoints return
  rather than the handful the native panel displays.
- **Compact course switcher** in the Schoology header: searchable, keyboard
  operable, uses custom names and pinned order, and finds hidden courses when
  you search for them. Schoology's own Courses menu is left untouched beside it.
- **Announcements panel** summarizing Recent Activity posts beside To Do, so
  information stops competing with action items.
- **Upcoming events panel**, when Schoology's own upcoming list has anything in
  it.
- **Course discovery from Recent Activity**, so the dashboard has courses on
  Home before the Grades page has ever been opened.
- New settings: default home view, course card density, announcements panel,
  grade summary tile, and the compact course switcher.
- A visual QA harness (`npm run qa:shots`) that drives the built content script
  over the local Schoology reconstruction and writes one screenshot per scene.

### Changed

- A complete visual system for Better Schoology's own surfaces — panels, tabs,
  pills, stat tiles, task rows — shared by every feature, in light and dark.
- The dashboard now hides Schoology's right rail while it is showing, and only
  once Better To Do actually has a task source to replace it with.
- Better To Do stands down in the rail when the dashboard is displaying the
  same list, instead of rendering it twice.
- Storage schema version 2. Existing settings and course customizations are
  migrated, never reset.

## [0.0.1] — Foundation

### Added

- Firefox MV3 extension scaffolding (WXT, TypeScript, React).
- Schoology route detection, selector registry and idempotent enhancement
  lifecycle.
- Adapter layer translating Schoology's DOM into normalized models.
- Dark mode built on CSS custom properties, with no `filter: invert()`.
- Local course customization: name, short name, image, colours, pin, hide,
  position.
- Better To Do reading the documented same-origin fragment endpoints.
- A dashboard shell on the home page.
- React popup and options/customizer pages.
- The local Schoology fixture environment, capture sanitizer and importer.
- Vitest and Playwright suites, CI, and an installable XPI.
