// The heatmap's data for a scope and the year shown: the days studied and due, their stats, and the years with
// something.

import { useMemo, useState } from 'react';
import { countsByDay, dueByDay, heatmapStats, yearOf, yearRange } from '@qv/study';
import { usePreferences } from '../../progress/hooks/usePreferences';
import { useToday } from '../../progress/hooks/useToday';
import { useHeatmapData } from './useHeatmapData';

export function useHeatmap(scope: string, deckIds: string[] | null) {
  const query = useHeatmapData(scope, deckIds);
  const { prefs } = usePreferences();
  const today = useToday(prefs);
  const data = query.data;
  const ready = !!data && today !== null;

  const studied = useMemo(
    () => (data && today !== null ? countsByDay(data.days, today) : new Map<number, number>()),
    [data, today],
  );
  const due = useMemo(
    () => (data && today !== null ? dueByDay(data.due, today) : new Map<number, number>()),
    [data, today],
  );
  const stats = useMemo(
    () => (today !== null ? heatmapStats(studied, today) : null),
    [studied, today],
  );
  const range = today !== null ? yearRange(studied, due, today) : null;
  const thisYear = today !== null ? yearOf(today) : new Date().getFullYear();
  const [chosen, setChosen] = useState<number | null>(null);
  const year = chosen ?? thisYear;
  return { query, today, data, ready, studied, due, stats, range, thisYear, year, setChosen };
}
