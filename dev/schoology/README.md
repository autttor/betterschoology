# Local Schoology fixture environment

A faithful client-side reconstruction of captured Schoology surfaces, for
Better Schoology development.

**It is not a Schoology emulator.** It reproduces the client — the DOM,
the routes, the layout and the documented fragment endpoints — and nothing of
the backend.

## Why this exists

Better Schoology is developed without persistent authenticated access to a live
Schoology instance. Live Schoology is therefore used for final verification
only, and this reconstruction is the primary development target.

## Running it

```bash
npm run schoology:dev   # http://localhost:4173
npm run dev             # this plus the Firefox extension dev build
```

`http://localhost:4173/__fixtures` lists every route and scenario. Each page
also carries a banner with the same links plus a **Better Schoology off**
toggle.

## Routes

Paths mirror real Schoology exactly, which matters more than it might sound:
route matching, relative asset resolution, same-origin `fetch` behaviour and
extension host permissions all differ under `file://`. Fixtures are served over
HTTP for that reason, never opened as files.

Concrete IDs are listed in `tests/fixtures/schoology/manifest.json`, which the
importer writes. Nothing hardcodes them — the sanitizer allocates synthetic IDs
in discovery order, so re-importing a different capture legitimately changes
them.

## Scenarios

Append `?fixture=<name>` to any route.

| Scenario | Effect |
| --- | --- |
| `default` | The capture as-is |
| `empty` | No To Do items, no grade rows, empty lists |
| `many-tasks` | To Do rows duplicated to 40+ items |
| `overdue` | Every To Do row moved into the overdue block |
| `no-image` | All images removed |
| `long-name` | Course names replaced with a very long one |
| `ungraded` | Grade values replaced with the ungraded state |

Scenarios only ever *transform* the sanitized capture. Nothing invents Schoology
markup the capture did not demonstrate — synthetic data is fine, synthetic DOM
architecture is not.

## Mocked endpoints

Only endpoints the reference pack documents as *observed source*, with the
response envelope it observed (`{ "html": "<fragment>" }`):

```
GET /home/overdue_submissions_ajax
GET /home/upcoming_submissions_ajax
GET /home/upcoming_ajax
GET /home/recently_completed_ajax
```

Anything else returns 404 on purpose, so the extension's fallback path gets
exercised rather than papered over.

Payloads live in `tests/fixtures/schoology/api/` and reuse the real sanitized
row markup rather than a hand-written approximation.

## What runs in the page

`assets/bootstrap.js` is **original** code. Captured Schoology JavaScript is
deliberately not shipped: the bundles are PowerSchool's, they expect production
endpoints and server-generated settings, and their failures would make the
environment unusable.

What it does reproduce is the part the extension has to survive:

- `Drupal.settings` with the documented *shape* (never real values)
- `Drupal.behaviors` and `Drupal.attachBehaviors`
- `s_home`'s deferred To Do fragment fetch → insert → `attachBehaviors` cycle

That last one is the point. Without it the fixture would be a static page and
would never exercise the extension's MutationObserver, idempotency markers or
re-enhancement path.

## Styling and captured assets

Two tiers:

1. **`assets/schoology-shell.css`** — original CSS written for this project. It
   approximates the captured layout (column widths, panel chrome, table
   density, tab bar) using only documented stable IDs and semantic classes. This
   is what ships in the repository, and it is why the environment is usable
   without a capture.
2. **Real captured assets**, if you have a capture in the gitignored
   `.local-schoology/` directory. `assets.ts` indexes it and serves matching
   files at `/__schoology_assets/<name>`, including an optional `captured.css`
   layer, giving near-pixel fidelity locally.

Anything not captured degrades gracefully — images resolve to a transparent
pixel, stylesheets to empty — so a missing asset never breaks a page.

PowerSchool's stylesheets, scripts and icon sprites are **not** committed. They
are not ours to redistribute, and they were also ~90% of each captured page's
size.

## Importing your own captures

```bash
# 1. Save a Schoology page: "Web Page, Complete"
# 2. Put the .htm and its _files/ folder in .local-schoology/raw/
# 3. Optionally add explicit replacements:
#    cp docs/sanitizer-map.example.json .local-schoology/sanitizer-map.json
npm run schoology:import
```

The importer:

1. **Scans** every capture to build one consistent replacement map — IDs, person
   names, school names, course names and sections — so a course is the same
   synthetic course across every page.
2. **Rewrites** each page: strips scripts, styles, inline SVG artwork and
   third-party extension nodes; remaps every identifier; replaces identifying
   text everywhere including HTML-entity-encoded forms; replaces author-written
   prose and the `title`/`alt` attributes that mirror it; rewrites the tenant
   host to root-relative paths; drops query parameters the router does not read.
3. **Verifies** the result and **refuses to write** if anything survives: an
   original identifier, a registered name, the capture host, an
   operator-forbidden string, or a credential-shaped value.

Structure is preserved throughout: element hierarchy, semantic IDs and classes,
`data-id`/`data-parent-id` relationships, `data-start` semantics, ARIA
structure, and route shapes.

**Assignment and material titles are kept** — they are teacher-authored
coursework names and identify no one, and they make the fixtures worth testing
against. Add them to `replacements` in your sanitizer map if you want them gone.

## Limitations

Validated here:

- selectors, layout, CSS and dark mode
- DOM transforms and idempotency under post-load mutation
- route detection and ID extraction
- parsers (To Do, grades, materials, assignments, courses)
- customizer integration
- the documented fragment endpoints

**Not** validated here — live Schoology required:

- real authentication and session handling
- real assignment submission and file upload
- quiz and assessment behaviour
- LTI / external tool apps
- production backend changes
- role and permission differences not present in the capture
- Schoology pages that were never captured, including
  `/home/course-dashboard` and `/home/assignments`
- undocumented production network behaviour
