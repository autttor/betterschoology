/**
 * Trailing-edge debounce used to batch MutationObserver bursts.
 *
 * Schoology inserts fragments and then calls `Drupal.attachBehaviors` on them,
 * which produces a flurry of mutations for one logical change. Running an
 * enhancement pass per mutation record would be both slow and a good way to
 * build a feedback loop, so passes are coalesced.
 */
export interface Debounced {
  (): void;
  cancel(): void;
}

export function debounce(fn: () => void, waitMs: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, waitMs);
  };

  debounced.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  return debounced;
}
