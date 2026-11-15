// When the home page's sections appear: all together, once the catalog, the preferences, the plan and the tests half
// done are there, in a space as tall as the page was the last time; then it keeps the height for the next visit.

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Catalog } from '@qv/schema';
import { usePreferences, useStudyPlan } from '../../progress/queries';
import { saveHeight, savedHeight } from '../api/height';
import { useOpenRounds } from './useOpenRounds';

export function useHomeBody(catalog: Catalog | undefined) {
  const { prefs } = usePreferences();
  const plan = useStudyPlan();
  const rounds = useOpenRounds();
  const reserved = useMemo(() => savedHeight(), []);
  const box = useRef<HTMLDivElement>(null);
  // Once shown it stays: a later refetch changes what is inside, never the whole page.
  const [shown, setShown] = useState(false);
  const ready =
    !!catalog &&
    !!prefs &&
    !!plan.data &&
    (shown || (rounds.isFetchedAfterMount && !rounds.isFetching));
  if (ready && !shown) setShown(true);
  useLayoutEffect(() => {
    if (!ready || !box.current) return;
    saveHeight(box.current.offsetHeight);
  });
  return { prefs, plan, rounds, reserved, box, ready };
}
