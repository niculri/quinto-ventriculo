// The heatmap's data for a scope and the year shown: the days studied (cards and tests) and due, their stats, how
// much of the streak was each, and the years with something.

import { useState } from 'react';
import {
  dueByDay,
  heatmapStats,
  streakDays,
  studiedByDay,
  studySplit,
  yearOf,
  yearRange,
} from '@qv/study';
import { readClock } from '../../../shared/lib/clock';
import { usePreferences, useToday } from '../../progress/queries';
import { useHeatmapData } from './useHeatmapData';

export function useHeatmap(scope: string, deckIds: string[] | null, quizIds: string[] | null) {
  const query = useHeatmapData(scope, deckIds, quizIds);
  const { prefs } = usePreferences();
  const today = useToday(prefs);
  const data = query.data;
  const ready = !!data && today !== null;

  const studied = data && today !== null ? studiedByDay(data, today) : new Map<number, number>();
  const due = data && today !== null ? dueByDay(data.due, today) : new Map<number, number>();
  const stats = today !== null ? heatmapStats(studied, today) : null;
  const streak = today !== null ? streakDays(studied, today) : [];
  const split =
    data && today !== null
      ? { streak: streak.length > 0, ...studySplit(data, today, {}, streak.length ? streak : null) }
      : null;
  const range = today !== null ? yearRange(studied, due, today) : null;
  const thisYear = today !== null ? yearOf(today) : new Date(readClock(today)).getFullYear();
  const [chosen, setChosen] = useState<number | null>(null);
  const year = chosen ?? thisYear;
  return {
    query,
    today,
    data,
    ready,
    studied,
    due,
    stats,
    split,
    range,
    thisYear,
    year,
    setChosen,
  };
}
