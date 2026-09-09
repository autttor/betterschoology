# Changelog

All notable changes to Better Schoology are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).
While the extension is pre-1.0, minor versions mark feature milestones.

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
