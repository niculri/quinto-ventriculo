// The four figures under the heatmap, each with its label; without the stats yet, the labels alone.

import { answersText } from '@qv/study';
import type { HeatmapStats } from '@qv/study';
import { figuresStrings as f } from './strings/figures.strings';

export function figureItems(stats: HeatmapStats | null): [string, string][] {
  return stats
    ? [
        [f.figures.average, answersText(stats.dailyAverage)],
        [f.figures.studied, f.figures.percent(stats.studiedPercent)],
        [f.figures.longest, f.figures.days(stats.longestStreak)],
        [f.figures.current, f.figures.days(stats.currentStreak)],
      ]
    : [
        [f.figures.average, ''],
        [f.figures.studied, ''],
        [f.figures.longest, ''],
        [f.figures.current, ''],
      ];
}
