// Tests what «Días de estudio» counts with the tests: by day, by scope, the current streak and the split of a stretch.
import { describe, expect, it } from 'vitest';
import { dayNumber as D } from '../heatmap';
import type { HeatmapData } from '../heatmap';
import { streakDays, studiedByDay, studySplit, testsByDay } from '../studyDays';

const today = D('2026-11-10');
const heat: HeatmapData = {
  days: [
    { day: D('2026-11-08'), deckId: 'a', answers: 10, practice: 2 },
    { day: D('2026-11-09'), deckId: 'b', answers: 4, practice: 0 },
    { day: D('2026-11-12'), deckId: 'a', answers: 9, practice: 0 },
  ],
  due: [],
  tests: [
    { day: D('2026-11-09'), quizId: 'q1', answers: 3 },
    { day: D('2026-11-10'), quizId: 'q2', answers: 5 },
    { day: D('2026-11-10'), quizId: 'q1', answers: 0 },
    { day: D('2026-11-11'), quizId: 'q1', answers: 7 },
  ],
};

describe('the days studied with the tests', () => {
  it('add the questions of tests to the answers of Anki, up to today', () => {
    expect([...studiedByDay(heat, today)]).toEqual([
      [D('2026-11-08'), 12],
      [D('2026-11-09'), 7],
      [D('2026-11-10'), 5],
    ]);
  });

  it('count only the decks and tests of the scope', () => {
    const only = { decks: new Set(['b']), quizzes: new Set(['q1']) };
    expect([...studiedByDay(heat, today, only)]).toEqual([[D('2026-11-09'), 7]]);
    expect([...testsByDay(heat.tests!, today, new Set(['q2']))]).toEqual([[D('2026-11-10'), 5]]);
  });

  it('a heatmap without tests counts Anki alone', () => {
    expect([...studiedByDay({ days: heat.days }, today)]).toEqual([
      [D('2026-11-08'), 12],
      [D('2026-11-09'), 4],
    ]);
  });

  it('a day with only tests keeps the streak', () => {
    const by = studiedByDay(heat, today);
    expect(streakDays(by, today)).toEqual([D('2026-11-08'), D('2026-11-09'), D('2026-11-10')]);
    expect(streakDays(by, D('2026-11-11'))).toEqual([
      D('2026-11-08'),
      D('2026-11-09'),
      D('2026-11-10'),
    ]);
    expect(streakDays(by, D('2026-11-13'))).toEqual([]);
  });

  it('say how much of some days was Anki and how much tests', () => {
    expect(studySplit(heat, today)).toEqual({ anki: 16, tests: 8 });
    expect(studySplit(heat, today, {}, [D('2026-11-09')])).toEqual({ anki: 4, tests: 3 });
    expect(studySplit({ days: [] }, today)).toEqual({ anki: 0, tests: 0 });
  });
});
