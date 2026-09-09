# Better Schoology

[![CI](https://github.com/autttor/betterschoology/actions/workflows/ci.yml/badge.svg)](https://github.com/autttor/betterschoology/actions/workflows/ci.yml)

A Firefox extension that makes Schoology more customizable and student-focused.

## Status

**Version 0.3.1 — Grades + GPA.**

Firefox desktop is the only browser actively built and tested. The project is
architected so Chromium (Chrome, Edge) support can be added later, but nothing
is optimized for it yet.

Home, course pages, assignment pages and grade pages are all enhanced. Grades
are parsed into a normalized model and fed to a calculation engine that handles
point-based and weighted courses, what-if scores, and "what do I need on the
final?" — with a GPA calculator built entirely from numbers you set yourself.

## Features

Working today:

- **Dark mode** — a real theme built on CSS custom properties, applied to the
  documented Schoology shell (home, courses, materials, grades, assignments,
  calendar). No `filter: invert()`. Light mode ships zero overrides.
- **System / Light / Dark** theme selection, with `System` following your OS
  live and theme changes applying without a page reload.
- **Course discovery** — Better Schoology learns your courses from Schoology's
  own pages and stores them locally so the customizer can list them.
- **Personal course overrides** — custom display name, short name, image URL,
  accent / background / text colours, plus pin, hide and ordering fields.
  These change only what *you* see.
- **Better Home** — a course-first **Dashboard** and Schoology's own **Feed**,
  as two keyboard-operable tabs. Dashboard leads with your courses, then what
  is due, then a small announcements summary. Native surfaces are hidden while
  the dashboard shows, never removed, and the Feed tab brings them straight
  back.
- **Course cards** — custom name (with Schoology's own name kept underneath),
  custom image and colours, pinned first, hidden omitted, an overdue count, the
  next few things due, and Materials / Updates / Grades links.
- **Better To Do** — every upcoming and overdue item Schoology returns, not
  just the handful the native panel displays, grouped into Overdue, Today,
  Tomorrow, This week and Later.
- **Compact course switcher** — a searchable, keyboard-operable course menu in
  the Schoology header that respects your custom names and pinned order.
  Schoology's own Courses menu is untouched beside it.
- **Better course pages** — a clear header with your own course name and the
  course's sections as one compact nav, third-party apps collapsed behind a
  disclosure, and a materials list with real hierarchy. Schoology's left menu,
  app links and materials table are all left exactly as they were.
- **Better assignment pages** — course, title, status, due date and grade in
  one header, then description, attachments, comments and submission.
  **Schoology's own submission panel is moved into place, never recreated**, so
  submitting works exactly as it always did.
- **Better Grades** — a summary that says where its number came from, grading
  periods, categories with their weights made explicit, and assignments
  underneath. Schoology's own report stays on the page, one toggle away.
- **What-if grades** — edit any score in place and watch the projection move.
  Labelled *Hypothetical* throughout; nothing is written anywhere and no
  teacher sees it.
- **"What do I need on the final?"** — for a final worth points or one carrying
  its own weight, derived from the course's real grading model. An unreachable
  target is reported as unreachable.
- **A GPA calculator** — your grading scale, your credits, your honors/AP
  boosts, all editable and stored on this device. Labelled *calculated by
  Better Schoology* and *not an official GPA*, because that is what it is.
- **A master switch** that returns Schoology to exactly what it rendered.

Also in this milestone, and just as important:

- **A local Schoology development environment.** Sanitized fixtures of real
  captured Schoology pages, served over HTTP at Schoology-shaped URLs, with the
  documented To Do fragment endpoints mocked. See
  [Local Schoology development](#local-schoology-development).

## Screenshots

Generate them locally against the reconstruction — nothing is committed, so
the repository never carries a school's branding:

```bash
npm run schoology:dev        # in one terminal
npm run build:firefox:dev
npm run qa:shots -- all      # -> .qa/*.png
```

`dev/qa/scenes.mjs` lists the scenes: dashboard in light and dark, the feed
view, the course switcher, customized courses, an empty To Do, very long course
names, and narrow and mobile widths.

> Move `.local-schoology/` aside first. With a capture present the fixture
> server serves your school's real logo and icons, so a screenshot taken in
> that state would put real branding in the repository.

## Install

Better Schoology is not on addons.mozilla.org yet, so installation depends on
which Firefox you run.

| Firefox | How | Survives restart? |
| --- | --- | --- |
| **Any** | `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick the `.xpi` | No |
| **Developer Edition / Nightly** | `about:config` → set `xpinstall.signatures.required` to `false`, then open the `.xpi` | Yes |
| **Release / ESR** | Requires a Mozilla-signed build — see [Signing](#signing) | Yes |

Download the `.xpi` from the
[latest release](https://github.com/autttor/betterschoology/releases/latest),
or build one yourself:

```bash
npm install
npm run xpi:firefox   # -> .output/better-schoology-<version>.xpi
```

Release and ESR Firefox enforce extension signing and will refuse an unsigned
add-on permanently — that is a Mozilla policy, not something the project can
work around. Temporary loading works everywhere and is the quickest way to try
it.

### Signing

Once you have [AMO API credentials](https://addons.mozilla.org/developers/addon/api/key/):

```bash
export WEB_EXT_API_KEY=user:...
export WEB_EXT_API_SECRET=...
npm run sign:firefox      # -> a signed, self-distributable .xpi in .output/
```

`--channel unlisted` means the signed build is self-distributed rather than
published on AMO, so it installs in release Firefox without a public listing.
Nothing in this repository stores or needs those credentials.

## Install for development

Requires **Node 22+**.

```bash
git clone https://github.com/autttor/betterschoology.git
cd betterschoology
npm install
```

`npm install` runs `wxt prepare`, which generates the TypeScript types WXT
needs. No Schoology capture is required to build, test or run the project —
sanitized fixtures are committed.

## Firefox development

```bash
npm run dev            # local Schoology fixtures + Firefox dev build together
npm run dev:firefox    # Firefox dev build only
npm run schoology:dev  # local Schoology fixture server only
```

`npm run dev:firefox` launches Firefox with the extension loaded via WXT. Point
it at `http://localhost:4173/home` to develop against the local reconstruction,
or at your real Schoology tenant to verify.

Development builds are granted `http://localhost:4173/*` in addition to
`*://*.schoology.com/*`. **Production builds are not** — the localhost
permission never ships.

## Build

```bash
npm run build:firefox  # -> .output/firefox-mv3/
npm run zip:firefox    # -> .output/better-schoology-<version>-firefox.zip
                       #    .output/better-schoology-<version>-sources.zip
npm run xpi:firefox    # -> .output/better-schoology-<version>.xpi  (installable)
npm run sign:firefox   # -> signed .xpi (needs AMO credentials)

npm run typecheck
npm run lint           # eslint
npm run lint:ext       # web-ext lint: checks the built extension is submittable
npm test               # vitest: parsers, storage, enhancements
npm run test:e2e       # playwright: the fixture environment + the built bundle
npm run qa:shots       # screenshots of the built bundle over the fixtures
```

`npm run lint:ext` reports two expected warnings, both accepted:

- `strict_min_version` (115) predates `data_collection_permissions`
  (Firefox 142). The key is additive metadata that older Firefox ignores;
  raising the minimum purely to silence the warning would lock out ESR users,
  which schools commonly run.
- Two `innerHTML` assignments inside React's own bundle, used by the popup and
  options pages. Better Schoology's own code contains no `innerHTML` at all —
  the content script bundle has zero occurrences — and every value written into
  a Schoology page goes through `textContent`.

## Local Schoology development

**This is the primary development target.** The project is built without
persistent authenticated access to a live Schoology instance, so most work —
CSS, DOM transforms, route detection, parsing, course customization, dark mode
— happens against a local reconstruction.

```bash
npm run schoology:dev
```

then open:

| URL | Surface |
| --- | --- |
| `http://localhost:4173/__fixtures` | Index of every route and scenario |
| `http://localhost:4173/home` | Home: To Do, feed, right rail |
| `http://localhost:4173/grades/grades` | Global grades (18 courses) |
| `http://localhost:4173/user-calendar` | Calendar |
| `http://localhost:4173/course/100001/materials` | Course materials |
| `http://localhost:4173/course/100001/materials?f=500001` | Folder contents |
| `http://localhost:4173/course/100001/student_grades` | Course grades |
| `http://localhost:4173/course/100001/updates` | Course updates |
| `http://localhost:4173/assignment/200002/info` | Assignment |

Every page carries a banner linking the other routes, the test scenarios, and a
**Better Schoology off** toggle for side-by-side comparison.

### Scenarios

Append `?fixture=<name>` to any route:

`default`, `empty`, `many-tasks`, `overdue`, `no-image`, `long-name`,
`ungraded`, `weighted`.

### What it can and cannot validate

It **can** validate: selectors, layout, CSS and dark mode, DOM transforms,
route detection, parsers, the customizer integration, idempotency across
Schoology's post-load DOM mutations, and the documented To Do fragment
endpoints.

It **cannot** validate, without a live Schoology instance: real
authentication, real assignment submission, quiz and assessment behaviour, LTI
apps, production backend changes, role and permission differences, uncaptured
Schoology pages, or undocumented production network behaviour.

It is **not** a Schoology emulator. It is a faithful client-side reconstruction
of captured Schoology surfaces, for extension development.

Full details, including how to import your own captures:
[`dev/schoology/README.md`](dev/schoology/README.md).

## Project structure

```
entrypoints/          WXT entrypoints
  background.ts       storage bootstrap; no network activity
  content/            content script + theme and component CSS
  popup/              React popup (fast controls)
  options/            React customizer (detailed controls)

src/
  schoology/          the ONLY layer that knows Schoology's DOM
    router.ts         pathname-based route detection
    selectors.ts      central selector registry + idempotency markers
    lifecycle.ts      idempotent enhancement passes, MutationObserver
    adapters/         DOM -> normalized models
    endpoints/        documented same-origin fragment reads
  features/           theme, courses, dashboard, todo, courseSwitcher,
                      course, assignment, grades
  grades/             pure grade maths: model, calculation, what-if,
                      target grades, GPA (no DOM, no storage, no clock)
  components/         Better Schoology UI helpers
  storage/            typed settings, migrations, customization resolution
  types/              normalized domain models

dev/schoology/        local Schoology fixture server
dev/qa/               visual QA harness (screenshots, not assertions)
scripts/              fixture importer and sanitizer
tests/                vitest suites, Playwright specs, sanitized fixtures
```

Data flows one way:

```
Schoology DOM / endpoints -> schoology/adapters -> normalized models -> features
```

React components never scrape Schoology DOM directly.

## Privacy

- **No Better Schoology account.** There is nothing to sign in to.
- **No analytics, no telemetry, no tracking.**
- **No external backend.** Better Schoology has no server.
- **No credential collection.** The extension never reads, stores, copies or
  transmits your password, cookies, session or any token.
- **Customizations are stored locally**, in this browser only, using the
  extension's own `storage.local`. They are never uploaded or synced.
- **One percentage per course** is stored locally so the dashboard can show a
  GPA away from the grades page — no assignment names, no individual scores,
  no comments. The customizer lists what is stored and forgets it on request.
- **Schoology requests stay between your browser and Schoology.** Better
  Schoology reads a small number of Schoology's own same-origin endpoints — the
  same ones Schoology's page already calls — using the session you are already
  signed in with. Nothing is sent anywhere else.
- **No remote code.** No remote scripts are loaded, and `eval` is not used.
- The Firefox manifest declares `data_collection_permissions: { required: ["none"] }`.

The only permission requested is `storage`.

## Roadmap

**0.4.0 — candidates**

- Better To Do: manual tasks, completion, per-course grouping
- grade-change notices ("Unit 3 Exam was graded"), computed locally from the
  percentages already stored
- custom (non-`schoology.com`) tenant domains, as optional host permissions the
  student grants per site
- Better Calendar, once its feed contract is characterized
- an accessibility audit against WCAG 2.2 AA with a real screen reader

Later:

- themes beyond light/dark
- Chromium (Chrome, Edge) packaging

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: work against the local
Schoology environment, keep Schoology knowledge inside `src/schoology/`, keep
enhancements idempotent, and never commit a raw Schoology capture.

## Disclaimer

Better Schoology is an independent project and is not affiliated with, endorsed
by, or sponsored by PowerSchool or Schoology.

Schoology is a trademark of PowerSchool. This project does not redistribute
Schoology's or PowerSchool's JavaScript, stylesheets or icon assets; the
committed fixtures contain only sanitized markup with original replacement
styling.

Better Schoology takes product inspiration from Better Canvas. No Better Canvas
code is used or included; this implementation is original and MIT licensed.
