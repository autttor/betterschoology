import './style.css';
import { EnhancementLifecycle } from '@/src/schoology/lifecycle';
import { resolveRoute, describeRoute } from '@/src/schoology/router';
import { isSupportedSchoologyHost } from '@/src/utils/hosts';
import { loadState, watchState } from '@/src/storage';
import { defaultState } from '@/src/storage/defaults';
import { setLoggingEnabled, log } from '@/src/utils/log';
import { themeEnhancement, watchColorScheme } from '@/src/features/theme';
import { courseOverridesEnhancement } from '@/src/features/courses';
import { betterDashboardEnhancement } from '@/src/features/dashboard';
import { betterTodoEnhancement } from '@/src/features/todo';
import { courseSwitcherEnhancement } from '@/src/features/courseSwitcher';
import { betterCoursesEnhancement } from '@/src/features/course';
import { betterAssignmentEnhancement } from '@/src/features/assignment';
import { betterGradesEnhancement } from '@/src/features/grades';
import type { BetterSchoologyState } from '@/src/types/settings';

/**
 * Content script entry.
 *
 * Host matching is split in two on purpose:
 *  - the manifest `matches` below decide where the script is *injected*, and
 *    include the local fixture server in development builds only;
 *  - `isSupportedSchoologyHost` is the runtime guard, so a production build
 *    cannot be talked into enhancing localhost even if injected there.
 *
 * Page routing never consults the hostname at all (see `schoology/router.ts`).
 */
const SCHOOLOGY_MATCHES = ['*://*.schoology.com/*'];
const FIXTURE_MATCHES = ['http://localhost:4173/*', 'http://127.0.0.1:4173/*'];

export default defineContentScript({
  matches: import.meta.env.DEV ? [...SCHOOLOGY_MATCHES, ...FIXTURE_MATCHES] : SCHOOLOGY_MATCHES,
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',

  async main() {
    setLoggingEnabled(import.meta.env.DEV);

    if (!isSupportedSchoologyHost(location.hostname, import.meta.env.DEV)) {
      log.info('host not supported, standing down:', location.hostname);
      return;
    }

    /*
     * Development-only escape hatch so a fixture page can be compared with and
     * without Better Schoology. Never honoured in a production build, so it can
     * never become a way to disable the extension on real Schoology.
     */
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(location.search);
      if (params.get('betterSchoology') === 'off') {
        log.info('disabled for this page by ?betterSchoology=off');
        return;
      }
    }

    const route = resolveRoute(location.href);
    log.info('page detected:', route.type, `(${describeRoute(route.type)})`);

    const lifecycle = new EnhancementLifecycle({ document });
    lifecycle.register(themeEnhancement);
    lifecycle.register(courseOverridesEnhancement);
    // Order matters: the dashboard decides whether it owns the To Do list, so
    // it must run before Better To Do considers mounting in the right rail.
    lifecycle.register(betterDashboardEnhancement);
    lifecycle.register(betterTodoEnhancement);
    lifecycle.register(courseSwitcherEnhancement);
    lifecycle.register(betterCoursesEnhancement);
    lifecycle.register(betterAssignmentEnhancement);
    lifecycle.register(betterGradesEnhancement);

    /**
     * The master switch is implemented by feeding the lifecycle a state whose
     * features are all off. Every enhancement then reverts itself through its
     * normal `revert` path, which means "disabled" and "never ran" produce the
     * same page -- exactly what Schoology rendered.
     */
    const effectiveState = (state: BetterSchoologyState): BetterSchoologyState =>
      state.settings.enabled
        ? state
        : {
            ...state,
            settings: {
              ...defaultState().settings,
              enabled: false,
              theme: 'light',
              betterDashboard: false,
              betterTodo: false,
              compactCourseSwitcher: false,
              betterCourses: false,
              betterAssignments: false,
              appsVisibility: 'show',
              betterGrades: false,
              gpaEnabled: false,
              showGpaWidget: false,
            },
          };

    let currentState = await loadState();
    lifecycle.start(effectiveState(currentState));

    // React to popup/options changes without requiring a reload.
    watchState((next) => {
      currentState = next;
      lifecycle.setState(effectiveState(next));
    });

    // `system` theme must follow the OS live, not just at page load.
    watchColorScheme(document, () => lifecycle.setState(effectiveState(currentState)));
  },
});
