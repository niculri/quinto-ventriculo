// The statistics of a student's own cards in a scope, as my_card_stats() gives them, and what the page computes from
// them: the cards by state, the sums of a period (answers, time, reviews passed and failed) and the series of the chart.

import { correctPercent } from './daySummary';

export interface CardStatsDay {
  day: number;
  answers: number;
  newCards: number;
  learning: number;
  ms: number;
  youngPassed: number;
  youngFailed: number;
  maturePassed: number;
  matureFailed: number;
}

export interface CardStateCounts {
  learning: number;
  relearning: number;
  young: number;
  mature: number;
  suspended: number;
  buried: number;
}

export interface HardCard {
  noteGuid: string;
  ord: number;
  deckId: string;
  lapses: number;
  reps: number;
}

export interface CardStatsData {
  today: number;
  cards: CardStateCounts;
  /** The last 365 days with answers, oldest first. */
  days: CardStatsDay[];
  /** From today to 30 days ahead. */
  due: { day: number; cards: number }[];
  overdue: number;
  hardest: HardCard[];
  total: { answers: number; ms: number; days: number };
}

/** The periods of the page, in days back from today (1 is today alone). */
export const PERIODS = [1, 7, 30, 365] as const;
export type Period = (typeof PERIODS)[number];

export interface PeriodSums {
  answers: number;
  ms: number;
  studiedDays: number;
  young: { passed: number; failed: number };
  mature: { passed: number; failed: number };
}

export function periodSums(
  data: Pick<CardStatsData, 'days' | 'today'>,
  length: number,
): PeriodSums {
  const out: PeriodSums = {
    answers: 0,
    ms: 0,
    studiedDays: 0,
    young: { passed: 0, failed: 0 },
    mature: { passed: 0, failed: 0 },
  };
  for (const d of data.days) {
    if (d.day > data.today || d.day <= data.today - length) continue;
    out.answers += d.answers;
    out.ms += d.ms;
    if (d.answers > 0) out.studiedDays++;
    out.young.passed += d.youngPassed;
    out.young.failed += d.youngFailed;
    out.mature.passed += d.maturePassed;
    out.mature.failed += d.matureFailed;
  }
  return out;
}

/** The % of reviews not failed, rounded as «Listo por hoy» does; null without reviews. */
export function retention(...parts: { passed: number; failed: number }[]): number | null {
  const passed = parts.reduce((t, p) => t + p.passed, 0);
  const failed = parts.reduce((t, p) => t + p.failed, 0);
  return correctPercent({ answers: passed + failed, correct: passed });
}

export const reviewsOf = (...parts: { passed: number; failed: number }[]) =>
  parts.reduce((t, p) => t + p.passed + p.failed, 0);

export interface StateBreakdown {
  new: number;
  learning: number;
  young: number;
  mature: number;
  hidden: number;
  seen: number;
}

/** The cards of a scope by state: the new ones are its cards minus the others (never below 0). */
export function stateBreakdown(cards: CardStateCounts, totalCards: number): StateBreakdown {
  const learning = cards.learning + cards.relearning;
  const hidden = cards.suspended + cards.buried;
  const seen = learning + cards.young + cards.mature;
  return {
    new: Math.max(0, totalCards - seen - hidden),
    learning,
    young: cards.young,
    mature: cards.mature,
    hidden,
    seen,
  };
}

/** The answers of each of the last `length` days, oldest first, ending today. */
export function answersSeries(
  data: Pick<CardStatsData, 'days' | 'today'>,
  length: number,
): number[] {
  const by = new Map(data.days.map((d) => [d.day, d.answers]));
  return Array.from({ length }, (_, i) => by.get(data.today - length + 1 + i) ?? 0);
}

/** The cards due on each of the next `length` days, starting today. */
export function dueSeries(data: Pick<CardStatsData, 'due' | 'today'>, length: number): number[] {
  const by = new Map(data.due.map((d) => [d.day, d.cards]));
  return Array.from({ length }, (_, i) => by.get(data.today + i) ?? 0);
}
