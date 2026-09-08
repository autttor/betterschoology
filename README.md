# Better Schoology

[![CI](https://github.com/autttor/betterschoology/actions/workflows/ci.yml/badge.svg)](https://github.com/autttor/betterschoology/actions/workflows/ci.yml)

A Firefox extension that makes Schoology more customizable and student-focused.

## Status

**Version 0.0.1 — foundation and first working MVP.**

Firefox desktop is the only browser actively built and tested. The project is
architected so Chromium (Chrome, Edge) support can be added later, but nothing
is optimized for it yet.

This is an early milestone. The Schoology adapter layer, settings storage,
theme engine, course-customization engine and the local Schoology development
environment all work. The dashboard ships as a working shell rather than a
finished replacement homepage — see [Roadmap](#roadmap).

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
- **Better To Do** — parses every upcoming and overdue item Schoology returns,
  not just the handful the native panel displays. Schoology's own To Do stays
  visible underneath.
- **Better Dashboard (shell)** — an optional course-first view on the home
  page. The native feed is hidden, never removed, and one click brings it back.
- **A master switch** that returns Schoology to exactly what it rendered.

Also in this milestone, and just as important:

- **A local Schoology development environment.** Sanitized fixtures of real
  captured Schoology pages, served over HTTP at Schoology-shaped URLs, with the
  documented To Do fragment endpoints mocked. See
  [Local Schoology development](#local-schoology-development).

## Screenshots

_Placeholder. Screenshots will be added once the dashboard reaches its first
designed milestone._

> When taking them: move `.local-schoology/` aside first. With a capture
> present the fixture server serves your school's real logo and icons, so a
> screenshot taken in that state would put real branding in the repository.

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

`default`, `empty`, `many-tasks`, `overdue`, `no-image`, `long-name`, `ungraded`.

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
  features/           theme, courses, dashboard, todo
  components/         Better Schoology UI helpers
  storage/            typed settings, migrations, customization resolution
  types/              normalized domain models

dev/schoology/        local Schoology fixture server
scripts/              fixture importer and sanitizer
tests/                vitest suites, Playwright specs, sanitized fixtures
```

Data flows one way:

```
Schoology DOM / endpoints -> schoology/adapters -> normalized models -> features
```

React components never scrape Schoology DOM directly.

## Privacy

For 0.0.1:

- **No Better Schoology account.** There is nothing to sign in to.
- **No analytics, no telemetry, no tracking.**
- **No external backend.** Better Schoology has no server.
- **No credential collection.** The extension never reads, stores, copies or
  transmits your password, cookies, session or any token.
- **Customizations are stored locally**, in this browser only, using the
  extension's own `storage.local`. They are never uploaded or synced.
- **Schoology requests stay between your browser and Schoology.** Better
  Schoology reads a small number of Schoology's own same-origin endpoints — the
  same ones Schoology's page already calls — using the session you are already
  signed in with. Nothing is sent anywhere else.
- **No remote code.** No remote scripts are loaded, and `eval` is not used.
- The Firefox manifest declares `data_collection_permissions: { required: ["none"] }`.

The only permission requested is `storage`.

## Roadmap

Next milestone:

- rich dashboard course cards (current grade, next assignments, quick links)
- Better To Do: manual tasks, completion, per-course grouping
- course reordering, pinning and hiding applied to Schoology surfaces
- improved materials, grades and assignment layouts

Later:

- GPA and hypothetical-grade calculators
- themes beyond light/dark
- compact Courses switcher
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
