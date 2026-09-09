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

Native menus inside the header use semantic roles. Portalled menus can also be
themed when their existing native trigger supplies `aria-controls`. The
enhancement marks only those explicitly associated elements, and removes its
markers on disable. Unknown popover structures need live verification. No
notification item structure or backend endpoint is inferred from these menus.

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
