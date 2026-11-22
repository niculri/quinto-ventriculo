// «Listo por hoy»: which answers count, how a failed card is counted once, the streaks, and the percent that never
// rounds into 100 or 0 by mistake.
import { describe, expect, it } from 'vitest';
import { correctPercent, daySummary } from '../daySummary';

const TODAY = 20_000;
const answer = (noteGuid: string, rating: 1 | 2 | 3 | 4, deckId = 'd1', ord = 0) => ({
  noteGuid,
  ord,
  rating,
  reviewedAt: '2026-11-18T15:00:00Z',
  deckId,
});
const heat = (days: [number, string, number][]) => ({
  days: days.map(([day, deckId, answers]) => ({ day, deckId, answers, practice: 0 })),
  due: [],
});

describe('daySummary', () => {
  const decks = new Set(['d1', 'd2']);

  it('counts the answers of the decks in view and leaves the others out', () => {
    const s = daySummary(
      [answer('a', 3), answer('b', 1), answer('c', 4, 'elsewhere')],
      decks,
      heat([]),
      TODAY,
    );
    expect(s).toMatchObject({ answers: 2, correct: 1, failedCards: 1 });
  });

  it('a card failed twice is one failed card, and a card failed then answered right still counts as failed', () => {
    const s = daySummary(
      [answer('a', 1), answer('a', 1), answer('a', 3), answer('a', 1, 'd1', 1)],
      decks,
      heat([]),
      TODAY,
    );
    expect(s.failedCards).toBe(2);
    expect(s.answers).toBe(4);
    expect(s.correct).toBe(1);
  });

  it('every rating but «Otra vez» is correct', () => {
    const s = daySummary([answer('a', 2), answer('b', 3), answer('c', 4)], decks, heat([]), TODAY);
    expect(s).toMatchObject({ correct: 3, failedCards: 0 });
  });

  it('the streak is the days in a row up to today or yesterday, and the course streak counts only the course’s decks', () => {
    const days = heat([
      [TODAY, 'd1', 3],
      [TODAY - 1, 'd2', 1],
      [TODAY - 2, 'd2', 4],
    ]);
    const all = daySummary([], decks, days, TODAY);
    expect(all.streak).toBe(3);
    expect(all.courseStreak).toBeNull();
    const course = daySummary([], decks, days, TODAY, new Set(['d2']));
    expect(course.courseStreak).toBe(2);
    expect(course.streak).toBe(3);
  });

  it('a streak that stopped before yesterday is zero', () => {
    const s = daySummary([], decks, heat([[TODAY - 2, 'd1', 5]]), TODAY, new Set(['d1']));
    expect([s.streak, s.courseStreak]).toEqual([0, 0]);
  });
});

describe('correctPercent', () => {
  it('has nothing to say without answers', () => {
    expect(correctPercent({ answers: 0, correct: 0 })).toBeNull();
  });

  it('is 100 only when every answer was right', () => {
    expect(correctPercent({ answers: 8, correct: 8 })).toBe(100);
    expect(correctPercent({ answers: 200, correct: 199 })).toBe(99);
  });

  it('is 0 only when none was right', () => {
    expect(correctPercent({ answers: 5, correct: 0 })).toBe(0);
    expect(correctPercent({ answers: 300, correct: 1 })).toBe(1);
  });

  it('otherwise rounds to the nearest percent', () => {
    expect(correctPercent({ answers: 3, correct: 2 })).toBe(67);
    expect(correctPercent({ answers: 8, correct: 5 })).toBe(63);
  });
});
