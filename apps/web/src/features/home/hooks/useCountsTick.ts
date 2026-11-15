// When «Hoy» on the home page counts again: only when the counts can change by themselves.

import { useEffect, useState } from 'react';
import type { HomeDeckCounts } from '../../progress/api/repository';
import { nextChangeAt } from '@qv/study';

/** Changes when the counts can change by themselves, so they are computed again then and not every minute. */
export function useCountsTick(
  home: ReadonlyMap<string, HomeDeckCounts> | null,
  learnAheadMinutes: number | undefined,
) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!home || learnAheadMinutes === undefined) return;
    const at = nextChangeAt(home, learnAheadMinutes);
    if (at === null) return;
    // setTimeout takes at most ~24 days; the day changes before that.
    const id = setTimeout(() => setTick((t) => t + 1), Math.min(at - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [home, learnAheadMinutes, tick]);
  return tick;
}
