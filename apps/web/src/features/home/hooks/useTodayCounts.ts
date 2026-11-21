// The counts of each course in «Hoy», computed again only when they can change by themselves.

import { useMemo } from 'react';
import type { Catalog } from '@qv/schema';
import { homeCourseCounts } from '@qv/study';
import { readClock } from '../../../shared/lib/clock';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useCountsTick } from './useCountsTick';
import { useHomeStudy } from './useHomeStudy';

export function useTodayCounts(catalog: Catalog, courses: CourseDeckNode[]) {
  const study = useHomeStudy(catalog, courses);
  const tick = useCountsTick(study.home?.decks ?? null, study.base?.prefs.learnAheadMinutes);
  // The counts read the clock: it is read again with new data and with each tick, and kept for any other render.
  const now = useMemo(
    () => readClock(study.base, study.home, tick),
    [study.base, study.home, tick],
  );
  const results = useMemo(() => {
    const { base, home } = study;
    if (!base || !home) return null;
    return new Map(
      courses.map((n) => [
        n.id,
        home.truncated ? null : homeCourseCounts(base, n.id, catalog.anki.decks, home.decks, now),
      ]),
    );
  }, [study, courses, catalog, now]);
  return { study, results };
}
