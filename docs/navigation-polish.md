# Navigation and native dark surfaces

The September 2026 polish uses the sanitized captured `#header`,
`[data-sgy-sitenav="nav-trigger"]`, `header-groups-menu` and
`header-my-account-menu` structures. Resources and Grade Report identity comes
from their existing same-origin `/resources` and `/grades/grades` links. The
Courses trigger lacks a more specific semantic identity in the capture, so its
original exact label is the final fallback. No generated classes are selected.

The account name adapter accepts a single visible text node inside the current
account trigger. Optional replacement changes that text node only. It never
changes account/profile URLs, form fields or coursework author names. Original
text is retained in document-local memory, and resetting restores it unless
Schoology itself has since replaced that value. Nav labels follow the same
reversible approach. Local persistence is handled by the shared settings store.

Native menus inside the header use semantic roles. Portalled menus are found
three ways, in order of how much Schoology tells us:

1. `aria-controls` / `aria-owns` on the trigger — unambiguous, and used
   whenever it is present.
2. A panel rendered inside the trigger's own `li`, while that trigger is open.
3. A `body`-level element outside the page shell, while a header trigger is
   open — the portalled case.

Live verification (September 2026) established that the global **Courses**
mega-menu takes route 3: it sets `aria-haspopup` but no `aria-controls`, and is
a React tree of plain `div`s carrying tenant-white inline backgrounds, so
role-based rules alone never reached it. Routes 2 and 3 require the candidate to
be an *open* panel — not `hidden`, not `display: none`, and offering something
to click — so an empty portal root such as `.sgy-singleton-container` is never
marked, and nothing at all is marked while no menu is open. Better Schoology's
own nodes are excluded explicitly.

Because such a menu can open by flipping `aria-expanded` and nothing else, the
lifecycle observes that one attribute in addition to structure, and drops
mutation records originating inside `[data-better-schoology]` so our own
switcher does not schedule passes. Markers are removed when a menu closes and on
disable. No notification item structure or backend endpoint is inferred from
these menus.

The modern footer lives under `#site-navigation-footer`, outside `#wrapper`.
Both it and legacy `#footer` are themed. Header controls and footer links/buttons
need scoped `!important` backgrounds and text because Schoology puts tenant
colors in inline styles. Feed cards use `ul.s-edge-feed > li`; To Do includes
`#todo`, its `aside`, `.upcoming-list` and native task wrappers. Course toolbar,
left nav, content and right rail rules use semantic classes/IDs in the capture.

All colors reuse the existing Better Schoology theme tokens. Icons with an
explicit `fill="none"` retain their outline geometry. Hover, open and keyboard
focus states are distinct. Rules disappear when `data-bs-dark` is removed.

`?polish=1` on local fixture routes opts into a hand-authored contract header and
footer. It deliberately includes white inline styles, icon paths, an accessible
notification count and a keyboard-operable Courses menu. These additions are
synthetic verification cases; they do not claim to capture live menu internals.
The original sanitized capture stays unchanged without this query parameter.

Verification:

- `tests/navigation-theme.test.ts` validates captured navigation parsing,
  chosen-name fallback, reset, native event/href preservation and safe no-ops.
- `tests/e2e/navigation-theme.spec.ts` checks computed CSS in a real browser,
  including header controls/icons, inner Feed To Do surfaces, footer, feed cards,
  focus, open menu state and restoration to light mode.
- On this Windows setup, `PLAYWRIGHT_CHANNEL=msedge` uses installed Edge for the
  browser suite. These CSS tests inject the shipped stylesheet and theme
  attributes, not the extension. Firefox extension loading remains a separate
  verification step.
