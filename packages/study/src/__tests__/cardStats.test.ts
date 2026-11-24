// Tests the sums of a period, the retention, the cards by state and the series of the statistics page.
import { describe, expect, it } from 'vitest';
import {
  answersSeries,
  dueSeries,
  periodSums,
  retention,
  reviewsOf,
  stateBreakdown,
} from '../cardStats';
import type { CardStatsDay } from '../cardStats';

const day = (d: number, extra: Partial<CardStatsDay> = {}): CardStatsDay => ({
  day: d,
  answers: 10,
  newCards: 2,
  learning: 1,
  ms: 60_000,
  youngPassed: 4,
  youngFailed: 1,
  maturePassed: 2,
  matureFailed: 0,
  ...extra,
});

const data = { today: 100, days: [day(60), day(95), day(99), day(100, { answers: 0 })] };

describe('the statistics of the cards', () => {
  it('sum a period, from today back', () => {
    expect(periodSums(data, 1)).toEqual({
      answers: 0,
      ms: 60_000,
      studiedDays: 0,
      young: { passed: 4, failed: 1 },
      mature: { passed: 2, failed: 0 },
    });
    expect(periodSums(data, 7).answers).toBe(20);
    expect(periodSums(data, 7).studiedDays).toBe(2);
    expect(periodSums(data, 365).answers).toBe(30);
    expect(periodSums({ today: 59, days: data.days }, 7).answers).toBe(0);
  });

  it('give the retention of the reviews, never 100 with one failed, and none without reviews', () => {
    expect(retention({ passed: 4, failed: 1 })).toBe(80);
    expect(retention({ passed: 4, failed: 1 }, { passed: 5, failed: 0 })).toBe(90);
    expect(retention({ passed: 199, failed: 1 })).toBe(99);
    expect(retention({ passed: 0, failed: 0 })).toBeNull();
    expect(reviewsOf({ passed: 4, failed: 1 }, { passed: 2, failed: 0 })).toBe(7);
  });

  it('count the new cards as what the others leave, never below 0', () => {
    const cards = { learning: 2, relearning: 1, young: 10, mature: 5, suspended: 3, buried: 1 };
    expect(stateBreakdown(cards, 100)).toEqual({
      new: 78,
      learning: 3,
      young: 10,
      mature: 5,
      hidden: 4,
      seen: 18,
    });
    expect(stateBreakdown(cards, 10).new).toBe(0);
  });

  it('give the series of the chart, the days before today and the days to come', () => {
    expect(answersSeries(data, 3)).toEqual([0, 10, 0]);
    expect(
      dueSeries(
        {
          today: 100,
          due: [
            { day: 100, cards: 3 },
            { day: 102, cards: 1 },
          ],
        },
        4,
      ),
    ).toEqual([3, 0, 1, 0]);
  });
});
