# Changelog

All notable changes to Better Schoology are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).
While the extension is pre-1.0, minor versions mark feature milestones.

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
