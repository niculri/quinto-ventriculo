// Beside a deck's screen, fetches the other screens of the course's Anki URLs once the browser is idle.
import { useEffect } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { savesData } from '../shared/lib/preload';
import { ankiScreens } from './ankiScreens';

let warmed = false;

/**
 * Rendered beside a screen, inside its boundary: once it is shown and its reads are done, it fetches the other screens
 * while the browser is idle, so they do not slow down what this one is loading. Not with the data saver on.
 */
export function WarmScreens() {
  const fetching = useIsFetching();
  useEffect(() => {
    if (warmed || fetching > 0 || savesData()) return;
    const run = () => {
      warmed = true;
      for (const s of Object.values(ankiScreens)) s.preload().catch(() => undefined);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, IDLE_FALLBACK_MS);
    return () => clearTimeout(id);
  }, [fetching]);
  return null;
}

// Safari has no `requestIdleCallback`: a short wait instead.
const IDLE_TIMEOUT_MS = 2000;
const IDLE_FALLBACK_MS = 200;
