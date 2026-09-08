import { useCallback, useEffect, useState } from 'react';
import type { BetterSchoologyState } from '@/src/types/settings';
import type { CourseCustomization } from '@/src/types';
import {
  loadState,
  resetCustomization,
  updateCustomization,
  updateSettings,
  watchState,
} from '@/src/storage';
import { defaultState } from '@/src/storage/defaults';

/**
 * Shared state hook for the popup and the options page.
 *
 * Both surfaces read and write the same `storage.local` record, so both
 * subscribe to change events -- opening the customizer while the popup is
 * showing keeps the two in step, and a Schoology tab updates at the same time.
 */
export function useBetterSchoologyState() {
  const [state, setState] = useState<BetterSchoologyState>(defaultState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void loadState().then((loaded) => {
      if (cancelled) return;
      setState(loaded);
      setLoading(false);
    });

    const unwatch = watchState((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
      unwatch();
    };
  }, []);

  const setSettings = useCallback(
    async (patch: Partial<BetterSchoologyState['settings']>) => {
      // Optimistic update keeps toggles feeling instant; the storage change
      // event reconciles shortly after.
      setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
      setState(await updateSettings(patch));
    },
    [],
  );

  const setCustomization = useCallback(
    async (courseId: string, patch: Partial<Omit<CourseCustomization, 'courseId'>>) => {
      setState(await updateCustomization(courseId, patch));
    },
    [],
  );

  const clearCustomization = useCallback(async (courseId: string) => {
    setState(await resetCustomization(courseId));
  }, []);

  return { state, loading, setSettings, setCustomization, clearCustomization };
}
