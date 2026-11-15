// The four figures under the heatmap, each with its label; without the stats yet, the labels alone.

import { answersText } from '@qv/study';
import type { HeatmapStats } from '@qv/study';
import { statsStrings as s } from '../strings';

export function figureItems(stats: HeatmapStats | null): [string, string][] {
  const f = s.figures;
  return stats
    ? [
        [f.average, answersText(stats.dailyAverage)],
        [f.studied, f.percent(stats.studiedPercent)],
        [f.longest, f.days(stats.longestStreak)],
        [f.current, f.days(stats.currentStreak)],
      ]
    : [
        [f.average, ''],
        [f.studied, ''],
        [f.longest, ''],
        [f.current, ''],
      ];
}
