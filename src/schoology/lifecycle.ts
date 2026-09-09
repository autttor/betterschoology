import type { SchoologyRoute } from '@/src/types';
import type { BetterSchoologyState } from '@/src/types/settings';
import { debounce } from '@/src/utils/schedule';
import { log } from '@/src/utils/log';
import { resolveRoute } from './router';

/**
 * Everything an enhancement needs to do its job. Features receive this instead
 * of reaching for globals, which is also what makes them testable against a
 * fixture document rather than a live page.
 */
export interface EnhancementContext {
  document: Document;
  route: SchoologyRoute;
  state: BetterSchoologyState;
  /** Ask for another pass, e.g. after an async fetch resolves. */
  requestPass(): void;
}

export interface Enhancement {
  /** Stable identifier, also used as the `data-bs-enhanced` marker value. */
  id: string;
  /** Return false to skip this enhancement entirely for the current context. */
  appliesTo(context: EnhancementContext): boolean;
  /** Must be idempotent: it runs again on every mutation burst and route change. */
  apply(context: EnhancementContext): void | Promise<void>;
  /**
   * Undo anything visible. Called when the enhancement stops applying (feature
   * disabled, master switch off, route change). Must tolerate being called when
   * `apply` never ran.
   */
  revert?(context: EnhancementContext): void;
}

export interface LifecycleOptions {
  document?: Document;
  /** Coalescing window for mutation bursts. Schoology fires many per fragment. */
  debounceMs?: number;
}

/**
 * Runs enhancements idempotently across Schoology's dynamic page lifecycle.
 *
 * Schoology inserts HTML fragments and then calls `Drupal.attachBehaviors` on
 * them, so a single DOMContentLoaded pass is never sufficient. Three things
 * keep that from becoming a feedback loop:
 *
 *  1. the observer is disconnected while a pass runs, so our own writes are
 *     never observed as input;
 *  2. mutation bursts are debounced into one pass;
 *  3. every enhancement gates on a `data-bs-enhanced` marker.
 */
export class EnhancementLifecycle {
  private readonly doc: Document;
  private readonly enhancements: Enhancement[] = [];
  private readonly appliedIds = new Set<string>();
  private readonly scheduledPass: ReturnType<typeof debounce>;

  private observer: MutationObserver | null = null;
  private state: BetterSchoologyState | null = null;
  private route: SchoologyRoute;
  private running = false;
  private started = false;
  private navigationCleanup: (() => void) | null = null;

  constructor(options: LifecycleOptions = {}) {
    this.doc = options.document ?? document;
    this.route = resolveRoute(this.doc.location?.href);
    this.scheduledPass = debounce(() => {
      void this.runPass();
    }, options.debounceMs ?? 120);
  }

  register(enhancement: Enhancement): void {
    this.enhancements.push(enhancement);
  }

  /** Replaces the settings snapshot and re-runs. Called when storage changes. */
  setState(state: BetterSchoologyState): void {
    this.state = state;
    if (this.started) this.scheduledPass();
  }

  start(state: BetterSchoologyState): void {
    if (this.started) {
      this.setState(state);
      return;
    }

    this.state = state;
    this.started = true;

    void this.runPass();
    this.observeMutations();
    this.observeNavigation();
  }

  stop(): void {
    this.started = false;
    this.scheduledPass.cancel();
    this.observer?.disconnect();
    this.observer = null;
    this.navigationCleanup?.();
    this.navigationCleanup = null;
    if (this.state) {
      const context: EnhancementContext = { document: this.doc, route: this.route, state: this.state, requestPass: () => {} };
      for (const enhancement of this.enhancements) {
        if (!this.appliedIds.has(enhancement.id)) continue;
        try { enhancement.revert?.(context); }
        catch (error) { log.error(`enhancement "${enhancement.id}" failed to stop:`, error); }
      }
    }
    this.appliedIds.clear();
  }

  private observeMutations(): void {
    const target = this.doc.documentElement;
    if (!target || typeof MutationObserver === 'undefined') return;

    this.observer = new MutationObserver(() => {
      // A pass in flight is already going to pick these up.
      if (this.running) return;
      this.scheduledPass();
    });
    this.connectObserver();
  }

  private connectObserver(): void {
    const target = this.doc.documentElement;
    if (!this.observer || !target) return;
    // Attributes are deliberately not observed: our own marker writes would
    // otherwise re-trigger the very pass that made them.
    this.observer.observe(target, { childList: true, subtree: true });
  }

  /**
   * Schoology is mostly server-rendered, but some surfaces navigate in-place.
   * A cheap history hook plus popstate covers both without polling.
   */
  private observeNavigation(): void {
    const win = this.doc.defaultView;
    if (!win) return;

    const onNavigate = (): void => {
      const next = resolveRoute(this.doc.location?.href);
      if (next.pathname === this.route.pathname && next.search === this.route.search) return;

      log.info('route changed:', this.route.type, '->', next.type);
      this.route = next;
      // Keep applied IDs so features leaving this route get their normal revert.
      this.scheduledPass();
    };

    win.addEventListener('popstate', onNavigate);
    win.addEventListener('hashchange', onNavigate);
    const restoreHistory: Array<() => void> = [];

    for (const method of ['pushState', 'replaceState'] as const) {
      const original = win.history[method];
      if (typeof original !== 'function') continue;
      const patched = function(this: History, ...args: Parameters<History['pushState']>) {
        const result = original.apply(this, args);
        onNavigate();
        return result;
      };
      win.history[method] = patched;
      restoreHistory.push(() => { if (win.history[method] === patched) win.history[method] = original; });
    }
    this.navigationCleanup = () => {
      win.removeEventListener('popstate', onNavigate);
      win.removeEventListener('hashchange', onNavigate);
      for (const restore of restoreHistory) restore();
    };
  }

  private async runPass(): Promise<void> {
    const state = this.state;
    if (!state || this.running || !this.started) return;

    this.running = true;
    this.observer?.disconnect();

    try {
      this.route = resolveRoute(this.doc.location?.href);
      const context: EnhancementContext = {
        document: this.doc,
        route: this.route,
        state,
        requestPass: () => { if (this.started) this.scheduledPass(); },
      };

      for (const enhancement of this.enhancements) {
        // The master switch is enforced by the caller (it swaps in a disabled
        // state), so an enhancement only has to answer for its own feature flag.
        const applies = safeBoolean(() => enhancement.appliesTo(context), false, enhancement.id);

        if (applies) {
          try {
            await enhancement.apply(context);
            this.appliedIds.add(enhancement.id);
          } catch (error) {
            // Fail open: one broken enhancement must not take the page with it.
            log.error(`enhancement "${enhancement.id}" failed:`, error);
          }
        } else if (this.appliedIds.has(enhancement.id)) {
          try {
            enhancement.revert?.(context);
          } catch (error) {
            log.error(`enhancement "${enhancement.id}" failed to revert:`, error);
          }
          this.appliedIds.delete(enhancement.id);
        }
      }
    } finally {
      this.running = false;
      this.connectObserver();
    }
  }
}

function safeBoolean(fn: () => boolean, fallback: boolean, id: string): boolean {
  try {
    return fn();
  } catch (error) {
    log.error(`enhancement "${id}" appliesTo threw:`, error);
    return fallback;
  }
}
