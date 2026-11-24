// The bars of the activity chart: the answers of the last days and the cards due in the next ones, on one scale.

import { answersSeries, dueSeries } from '@qv/study';
import type { CardStatsData } from '@qv/study';

export const CHART_DAYS = 30;

interface ChartBar {
  /** Days from today: negative before, 0 today, positive after. */
  offset: number;
  value: number;
  kind: 'past' | 'due';
  /** 0 to 1 of the chart's height. */
  height: number;
}

export interface Chart {
  bars: ChartBar[];
  max: number;
}

/** The last 30 days with today, then the next 30; today's bar is what was answered, its due one follows it. */
export function activityChart(data: Pick<CardStatsData, 'days' | 'due' | 'today'>): Chart {
  const past = answersSeries(data, CHART_DAYS);
  const due = dueSeries({ ...data, today: data.today + 1 }, CHART_DAYS);
  const max = Math.max(1, ...past, ...due);
  return {
    max,
    bars: [
      ...past.map((value, i) => ({
        offset: i - CHART_DAYS + 1,
        value,
        kind: 'past' as const,
        height: value / max,
      })),
      ...due.map((value, i) => ({
        offset: i + 1,
        value,
        kind: 'due' as const,
        height: value / max,
      })),
    ],
  };
}
