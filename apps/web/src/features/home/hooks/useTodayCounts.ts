// The counts of each course in «Hoy», counted again when they can change by themselves.

import { homeCourseCounts } from '@qv/study';
import { readClock } from '../../../shared/lib/clock';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useCountsTick } from './useCountsTick';
import { useHomeStudy } from './useHomeStudy';

export function useTodayCounts(courses: CourseDeckNode[]) {
  const study = useHomeStudy(courses);
  const tick = useCountsTick(study.home?.decks ?? null, study.base?.prefs.learnAheadMinutes);
  // The counts read the clock: it is read again with new data and with each tick.
  const now = readClock(study.base, study.home, tick);
  const { base, home, catalogDecks } = study;
  const results =
    base && home && catalogDecks
      ? new Map(
          courses.map((n) => [
            n.id,
            home.truncated ? null : homeCourseCounts(base, n.id, catalogDecks, home.decks, now),
          ]),
        )
      : null;
  return { study, results };
}
