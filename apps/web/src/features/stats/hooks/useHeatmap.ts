// The heatmap's data for a scope and the year shown: the days studied and due, their stats, and the years with
// something.

import { useState } from 'react';
import { countsByDay, dueByDay, heatmapStats, yearOf, yearRange } from '@qv/study';
import { readClock } from '../../../shared/lib/clock';
import { usePreferences, useToday } from '../../progress/queries';
import { useHeatmapData } from './useHeatmapData';

export function useHeatmap(scope: string, deckIds: string[] | null) {
  const query = useHeatmapData(scope, deckIds);
  const { prefs } = usePreferences();
  const today = useToday(prefs);
  const data = query.data;
  const ready = !!data && today !== null;

  const studied =
    data && today !== null ? countsByDay(data.days, today) : new Map<number, number>();
  const due = data && today !== null ? dueByDay(data.due, today) : new Map<number, number>();
  const stats = today !== null ? heatmapStats(studied, today) : null;
  const range = today !== null ? yearRange(studied, due, today) : null;
  const thisYear = today !== null ? yearOf(today) : new Date(readClock(today)).getFullYear();
  const [chosen, setChosen] = useState<number | null>(null);
  const year = chosen ?? thisYear;
  return { query, today, data, ready, studied, due, stats, range, thisYear, year, setChosen };
}
