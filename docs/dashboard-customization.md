# Dashboard customization and polish

This pass extends the existing WXT, TypeScript, DOM enhancement and React options architecture. Preferences remain in `browser.storage.local`; the manifest still requests only `storage`. No server, telemetry, sync storage or tabs permission was added.

## Local preferences

Schema version 2 preserves existing settings and course customizations, adding:

- `displayNameOverride` and opt-in `applyDisplayNameToSchoologyHeader`.
- `navLabels`: Courses, Groups, Resources and Grade Report, with reset controls.
- `dashboard`: `showTodo`, `showNotifications`, `showRecentFeedback`, `showAnnouncements`, and optional `hideHiddenCourseTasks`.
- `splash`: enabled, contextual, holidays and Easter eggs.
- `hiddenTasks` and a ten-ID `splashHistory` with restore/reset controls.

Nested patches preserve sibling settings. Writes are serialized within each extension context, and unchanged course discovery no longer writes again. As before, courses become available after the student visits their native Grades or course pages. Hidden courses remain in that registry for the Customizer's **Show hidden courses** control, but disappear from cards, the compact course switcher and course counts. Native enrollments and course navigation stay intact.

Better To Do's overflow action hides only its local representation. Assignment IDs and native URLs take priority for task identity. Read-only external-tool rows in the capture have neither ID nor link; those use a hash of source, course, exact due timestamp and title together. Changing one of those fields can make a read-only task visible again. Rows without enough identity are never hidden by title alone. The same deduplicated visibility function drives To Do and dashboard counts. Hidden assignments can be restored in Customize. The dashboard To Do toggle does not turn off Better To Do in Feed.

## Splash source and selection

`src/features/splash/source.md` is a verbatim copy of the supplied `better-schoology-splash-texts-v2.md`, containing all 750 numbered candidates. The separately requested `(1)` filename was not present. Style-rule paragraphs are documentation, not executable instructions.

The parser retains each source number, category and original text. Typed requirements annotate time of day, weekday, holiday, pending tasks, exact remaining deadline minutes, visible feedback, recently loaded/changed grades, tabs and explicit academic periods. Unknown conditions are ineligible. General candidates are also annotated when their wording makes a contextual claim.

Selection uses contextual/general/Easter-egg buckets weighted 60/35/5, with general fallback and recent ID/text suppression. The dashboard holds a selection across DOM changes, revalidates at clock/deadline minute boundaries, and changes it only when it expires or relevant settings/name change. Override name wins, then the safely read native first name; missing names remove the placeholder and adjoining punctuation. Literal `[name]` cannot leak from a candidate or entered name.

Implemented holidays: January 1, February 14, March 14, April 1, October 31, US Thanksgiving's fourth Thursday, and December 20–January 2. Academic calendar candidates remain disabled because this version has no configured school dates. The pure selector supports explicit date ranges for future calendar integration. Tab-count candidates remain disabled because no tab API/permission is requested. Exact countdowns require a real pending due date; the 11:54 PM line also requires a due item at 11:59 PM that day. Grade context expires after five minutes or applies on a grades surface.

## Notifications, feedback and announcements

Notifications use accessible labels on existing header buttons/links. When a native unread count is reliable, the dashboard shows it; the action retains the original href or clicks the existing control with its existing event handlers. Unlabeled icons are not identified by DOM order. No notification popover item parser or unread/mark-read behavior is invented. Tenants without usable accessible labels get a plain instruction to use the native bell.

Recent Feedback reads the existing documented `/grades/grades` page once per dashboard document, using same-origin credentials and an eight-second timeout. HTML is parsed in a detached document; it is never inserted or executed. The panel consumes existing `.report-row[data-id][data-parent-id]`, grade values, native assignment links, and visible `.comment-column` content. Grade-only and percentage-only items are supported; “No comment” accessibility placeholders are excluded. Comments are rendered as short plain-text previews. There are no grading timestamps in the capture, so the panel explicitly describes these as available report grades without claiming chronological recency. Grades/comments stay in memory and are not stored as preferences. A clean empty/unavailable state links to the native grade report.

Announcements preview existing feed update bodies and course links, with an **Open Feed** action. The native feed is hidden only in Dashboard and never replaced or cloned. Native submission, upload and assessment flows remain untouched. GPA displays an unavailable marker because no GPA field or verified grading scale exists in the current capture.

## Theme and verification

See [navigation-polish.md](navigation-polish.md) for stable selectors, native text replacement, footer/header contracts and dark token rules. The polish fixture also adds synthetic feedback to an observed comment cell. Original sanitized capture files remain unchanged.

`npm run test:e2e` now builds Firefox before running browser checks. `dashboard-bundle.spec.ts` executes the actual emitted content script and CSS against fully intercepted sanitized fixtures, with a local browser-storage API shim. It exercises name/nav changes, panels, task hide/restore, native links, Feed switching and course theming, and writes dashboard/feed/course screenshots to the gitignored `test-results` directory. This complements unit tests and computed-style tests, but does not claim to validate Firefox extension installation or IPC.

Manual Firefox inspection could not complete in this session because Computer Use app approval timed out. The supplied live screenshot was also absent from the available attachments. Live tenant verification is still needed for actual dropdown/popover ownership, notification labels/counts, grading comments/availability, course layout variation, assignment submission/uploads, and assessment/LTI interactions. Do not treat fixture checks as proof of those live behaviors.
