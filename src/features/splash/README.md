# Splash text

`source.md` is the supplied 750-line candidate file, copied without rewriting its
wording. Vite imports it as text. `catalog.ts` reads only numbered entries under
the eight named content headings and attaches typed eligibility requirements.
Source numbers form stable IDs, so names and wording never become storage keys.

`selectSplash(context, options, history)` returns `{ id, text, history }`. Its
caller retains that selection for the page/session and saves the ten-entry
history through the existing local settings store. `isSplashIdEligible` lets
the caller recheck on a one-minute interval and replace only an expired splash.
The selection function performs no DOM access, network requests or storage I/O.

Contextual, general and Easter egg buckets receive 60%, 35% and 5% of random
rolls. Missing contextual candidates fall back to general text, keeping rare
lines at 5%. Recent IDs and duplicate source wording are suppressed. Name
interpolation prefers the override, then the native display name, then omits
the placeholder and its adjacent comma naturally. Render the result as text.

Eligibility uses local wall-clock dates and hours: morning is 05:00–11:59,
afternoon is 12:00–17:59, evening is 18:00–23:59, and explicitly late-night
wording also covers 00:00–04:59. Weekday sections use the source's seven groups
of ten, so indirect lines inherit the correct weekday too.

Holiday groups cover January 1, February 14, March 14, April 1, October 31,
the fourth Thursday in November, and December 20 through January 2. School
periods always require explicit inclusive local calendar dates. No academic
calendar is inferred from the season or the student's current assignments.

Exact countdowns require the earliest future incomplete task to match their
minute count, rounded up. Hour-count lines require that exact number of
minutes, avoiding loose claims about deadlines. The 11:54 PM line additionally
requires a task due that same evening at 11:59 PM. Other deadline annotations
distinguish today, tonight, tomorrow, overdue, yesterday and within an hour.

Grade references require a grade surface or data loaded/changed within five
minutes. A new-grade claim additionally requires an actual change timestamp;
a feedback claim requires real feedback. Tab counts can be supplied only if
already available safely; this feature requests no browser permissions.

All source candidates remain included, even if they cannot currently render.
Claims about tab contents/age/audio, first-period schedules, first annual login,
grade quality/trends, tools the extension does not provide, completed actions,
and unobserved details have explicit unsupported requirements. They remain
ineligible until a future adapter can prove their conditions. Do not enable
these by moving them into a generic pool.
