# Contributing to Better Schoology

Thanks for helping. This document covers the rules that are specific to this
project — the ones that are easy to get wrong because Schoology is an unusual
integration target.

## Setup

```bash
npm install            # Node 22+
npm run dev            # fixture server + Firefox dev build
```

No Schoology capture is needed. Sanitized fixtures are committed.

## Never commit a raw Schoology capture

Raw saved Schoology pages contain **real student names, user and school IDs,
CSRF and session tokens, private announcements and grade data**.

- Raw captures belong in `.local-schoology/`, which is gitignored.
- Committed fixtures live in `tests/fixtures/schoology/` and are produced by
  `npm run schoology:import`, which sanitizes and then **verifies** its own
  output — the import fails rather than writing a file that still contains an
  original identifier, name, host or credential-shaped string.
- `tests/sanitizer.test.ts` re-checks the committed fixtures in CI.

**Screenshots are a capture too.** When you have a capture in
`.local-schoology/`, the fixture server serves your school's *real* logo and
icons — that is the whole point of the high-fidelity mode. A screenshot taken
in that state therefore contains real branding. Take screenshots for the README
with the capture directory moved aside, so the reconstruction falls back to
placeholder assets.

If you capture a new Schoology surface:

1. Save the page (`Web Page, Complete`) into `.local-schoology/raw/`.
2. Optionally add explicit replacements in `.local-schoology/sanitizer-map.json`
   (see `docs/sanitizer-map.example.json`).
3. Run `npm run schoology:import`.
4. Read the diff before committing. The sanitizer is thorough, not omniscient.

## Architecture rules

**All Schoology knowledge lives in `src/schoology/`.** Feature modules and React
components consume normalized models and must never query Schoology's DOM
directly. If a field is missing, add it to an adapter.

**Selectors live in `src/schoology/selectors.ts`,** nowhere else.

**Never target a generated class.** Anything resembling `_24avl`, `_1Z0RM` or
`_3LeCL` is a build artifact of Schoology's React bundles and will change.
Prefer, in order: a stable ID, a semantic legacy class, a route-aware
structural selector, an ARIA hook. Text matching is a last resort.

**Every enhancement must be idempotent.** Schoology inserts DOM fragments after
load and calls `Drupal.attachBehaviors` on them, so passes run repeatedly. Gate
on `markEnhanced(element, feature)` and never enhance an element twice.

**Never strip Schoology's own `*-processed` markers.** Schoology uses them to
prevent duplicate handler binding. Better Schoology has its own namespace:
`data-bs-enhanced`, `data-better-schoology`, `better-schoology-*`, `bs-*`.

**Move native nodes; do not clone them.** Schoology binds jQuery handlers
directly to elements. A cloned node looks right and silently does nothing.

**Fail open.** If a selector is missing, a parse fails, or an endpoint behaves
unexpectedly, leave native Schoology alone. A working native panel always beats
a Better Schoology error box. Never make completing coursework depend on this
extension — assignment submission, quizzes, grade interactions, uploads and
comments are preserve-native boundaries.

## Feature levels

Classify what you are building:

- **Level 1 — CSS.** Dark mode, spacing, density, hiding optional panels.
  Lowest risk.
- **Level 2 — DOM rearrangement.** Moving existing Schoology nodes while
  preserving their handlers.
- **Level 3 — Better Schoology components.** Our own UI, built from normalized
  models and local storage.

Keep the distinction visible in the code.

## Privacy rules

- No analytics, no telemetry, no external requests.
- No remote code, no `eval`.
- Never read, store, copy or transmit cookies, passwords, session values or
  tokens. Same-origin requests ride the browser's existing session; that is all.
- Never bridge `Drupal.settings.s_common` — it holds runtime CSRF and session
  context. Document field *shapes*, never values.
- Treat student-supplied image URLs as untrusted strings. They are validated in
  `src/utils/url.ts` and rendered only as image sources.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build:firefox
```

All five must pass. CI runs the same set.

Add a fixture-backed test for any parser change. If a parser bug is reported,
capture the surface and add a fixture rather than loosening a selector globally.

## Commit style

Conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`) and
a working tree at every commit. Do not commit broken code between milestones.
