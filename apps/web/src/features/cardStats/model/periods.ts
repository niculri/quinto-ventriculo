// The rows of the statistics' table: for each period, the answers, the time and the % of reviews not failed (all,
// young and mature).

import { PERIODS, periodSums, retention, reviewsOf } from '@qv/study';
import type { CardStatsData, Period } from '@qv/study';

export interface PeriodRow {
  period: Period;
  answers: number;
  ms: number;
  reviews: number;
  retention: number | null;
  young: number | null;
  mature: number | null;
}

export function periodRows(data: Pick<CardStatsData, 'days' | 'today'>): PeriodRow[] {
  return PERIODS.map((period) => {
    const s = periodSums(data, period);
    return {
      period,
      answers: s.answers,
      ms: s.ms,
      reviews: reviewsOf(s.young, s.mature),
      retention: retention(s.young, s.mature),
      young: retention(s.young),
      mature: retention(s.mature),
    };
  });
}
