# Testing

Three layers, each covering what it can actually cover.

## 1. Unit and integration tests — `npm test`

Vitest, jsdom, run against the **sanitized captures**, not hand-written markup.
A hand-written fixture only proves the parser agrees with whoever wrote it.

| Suite | Covers |
| --- | --- |
| `tests/router.test.ts` | Route detection, ID extraction, host authorization |
| `tests/adapters.test.ts` | Course, To Do, grades, assignment and materials parsing |
| `tests/storage.test.ts` | Settings migration, customization resolution, URL/colour validation |
| `tests/enhancements.test.ts` | The real enhancements through the real lifecycle |
| `tests/sanitizer.test.ts` | The sanitizer, plus a standing privacy check on the committed fixtures |

`tests/enhancements.test.ts` is where the behavioural guarantees live: dark mode
marks the document, the master switch leaves the page byte-identical, a custom
course name never changes an `href`, the native feed is hidden and never
removed, unknown pages are untouched, a throwing enhancement cannot damage the
page, and nothing is enhanced twice.

## 2. Browser tests — `npm run test:e2e`

Playwright against the local Schoology fixture server. These validate the
reconstruction itself in a real browser: routes resolve, scenarios apply, the
documented fragment endpoints answer with the documented envelope, the To Do
panel is repopulated after load the way Schoology does it, and no served page
references a Schoology tenant host.

## 3. Manual Firefox verification — `npm run dev:firefox`

**The extension itself is not loaded in automated tests.** Driving a Firefox
WebExtension from Playwright is not supported well enough to depend on, and a
test suite that pretended otherwise would be worse than none. So:

```bash
npm run dev        # fixture server + Firefox with the extension loaded
```

then work through:

- `http://localhost:4173/home` — To Do panel appears above the native one
- toggle the master switch — the page returns to native Schoology
- switch theme to Dark — home, course, grades and assignment shells go dark
- open **Customize**, rename a course, set an accent colour — the name changes
  on the grades page and course header while every link still works
- `?betterSchoology=off` — compare native and enhanced side by side
- `?fixture=empty` and `?fixture=many-tasks` — empty and heavy states

Finally, verify against a real Schoology tenant before release. The fixture
environment cannot validate authentication, submission, assessments, LTI apps
or role differences.

## Adding coverage

When a parser bug is reported, capture the surface and add a fixture. Do not
loosen a selector globally on the strength of one anecdote.
