// Tests the browser copy's card statistics on cases the battery against the database does not reach: new and
// learning cards, old answers, missing times, overdue cards and ties among the hardest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storedCard } from '../../../../../test/fixtures/storedCard';
import { cardStatsOf } from '../localStats';
import type { LocalData, LogRow } from '../localStore';

const NOW = new Date('2026-11-10T15:00:00Z');
const DAY = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const data = (over: Partial<LocalData>): LocalData => ({
  cards: [],
  log: [],
  presets: [],
  settings: [],
  preferences: null,
  activations: [],
  assessments: [],
  ...over,
});

let id = 0;
function log(over: Partial<LogRow>): LogRow {
  const card = storedCard('g', 0, '1');
  return {
    id: ++id,
    actionId: `a${String(id)}`,
    action: 'answer',
    noteGuid: 'g',
    ord: 0,
    deckId: '1',
    reviewedAt: NOW.toISOString(),
    rating: 3,
    queueBefore: 'review',
    before: card,
    after: card,
    ...over,
  };
}

describe('the browser copy’s card statistics', () => {
  it('leave out new cards, count learning answers and skip what is older than a year', () => {
    const r = cardStatsOf(
      data({
        cards: [
          storedCard('n', 0, '1', { phase: 'new', due: null, interday: false }),
          storedCard('l', 0, '1', { phase: 'learning', interday: false }),
          storedCard('m', 0, '1', { interval: 40 }),
        ],
        log: [
          log({ queueBefore: 'learn', durationMs: 1000 }),
          log({ queueBefore: 'day_learn' }),
          log({ before: null, rating: 1 }),
          log({ reviewedAt: new Date(NOW.getTime() - 400 * DAY).toISOString(), day: 1 }),
          log({ reviewedAt: new Date(NOW.getTime() - 2 * DAY).toISOString() }),
          log({ rating: null, queueBefore: null }),
        ],
      }),
      null,
    );
    expect(r.cards).toEqual({
      learning: 1,
      relearning: 0,
      young: 0,
      mature: 1,
      suspended: 0,
      buried: 0,
    });
    expect(
      r.days.map((d) => [d.day - r.today, d.answers, d.learning, d.ms, d.youngFailed]),
    ).toEqual([
      [-2, 1, 0, 0, 0],
      [0, 3, 2, 1000, 1],
    ]);
    expect(r.total).toEqual({ answers: 5, ms: 1000, days: 3 });
  });

  it('count what is overdue apart, and order the hardest by lapses, reps, card and order', () => {
    const r = cardStatsOf(
      data({
        cards: [
          storedCard('late', 0, '1', { due: new Date(NOW.getTime() - 5 * DAY).toISOString() }),
          storedCard('far', 0, '1', { due: new Date(NOW.getTime() + 90 * DAY).toISOString() }),
          storedCard('b', 1, '1', { lapses: 2, reps: 3 }),
          storedCard('b', 0, '1', { lapses: 2, reps: 3 }),
          storedCard('a', 0, '1', { lapses: 2, reps: 3 }),
          storedCard('c', 0, '1', { lapses: 2, reps: 5 }),
          storedCard('x', 0, '2', { lapses: 9 }),
        ],
      }),
      ['1'],
    );
    expect(r.overdue).toBe(1);
    expect(r.due).toEqual([{ day: r.today + 3, cards: 4 }]);
    expect(r.hardest.map((h) => `${h.noteGuid}:${String(h.ord)}`)).toEqual([
      'c:0',
      'a:0',
      'b:0',
      'b:1',
    ]);
  });
});
