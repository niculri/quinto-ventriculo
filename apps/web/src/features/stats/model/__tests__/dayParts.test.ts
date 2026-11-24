// Tests the groups of a day in the heatmap's box: summed by group with the practice and the questions of tests, from
// most to fewest, only that day, and the day's totals of each kind.
import type { CellValue, HeatmapData } from '@qv/study';
import { describe, expect, it } from 'vitest';
import { dayParts, dayTotals } from '../dayParts';

const DAY = 20_400;
const past = (value: number): CellValue => ({ kind: 'past', value, level: 1 });
const groups = {
  groupOf: (deckId: string) =>
    ({ a: 'Anatomía', b: 'Anatomía', c: 'Física', d: 'Biología' })[deckId] ?? 'Otros',
  groupOfQuiz: (quizId: string) => ({ q1: 'Física', q2: 'Histología' })[quizId] ?? 'Otros tests',
};

const data: HeatmapData = {
  days: [
    { day: DAY, deckId: 'a', answers: 3, practice: 2 },
    { day: DAY, deckId: 'b', answers: 4, practice: 0 },
    { day: DAY, deckId: 'c', answers: 0, practice: 9 },
    { day: DAY, deckId: 'd', answers: 9, practice: 0 },
    { day: DAY, deckId: 'z', answers: 0, practice: 0 },
    { day: DAY + 1, deckId: 'c', answers: 50, practice: 0 },
  ],
  due: [],
  tests: [
    { day: DAY, quizId: 'q1', answers: 4 },
    { day: DAY, quizId: 'q2', answers: 6 },
    { day: DAY, quizId: 'q9', answers: 0 },
    { day: DAY + 1, quizId: 'q2', answers: 30 },
  ],
};

describe('the groups of a day', () => {
  it('sum the answers, the practice and the tests of each group, only of that day, most first and ties by name', () => {
    expect(dayParts(past(37), data, groups, DAY)).toEqual([
      { label: 'Física', anki: 9, tests: 4 },
      { label: 'Anatomía', anki: 9, tests: 0 },
      { label: 'Biología', anki: 9, tests: 0 },
      { label: 'Histología', anki: 0, tests: 6 },
    ]);
  });

  it('leave out a group with nothing that day, and count Anki alone without tests', () => {
    const labels = dayParts(past(37), data, groups, DAY).map((p) => p.label);
    expect(labels).not.toContain('Otros');
    expect(labels).not.toContain('Otros tests');
    expect(dayParts(past(27), { days: data.days }, groups, DAY)).toHaveLength(3);
  });

  it('give the day’s totals of Anki and of tests', () => {
    expect(dayTotals(dayParts(past(37), data, groups, DAY))).toEqual({ anki: 27, tests: 10 });
  });

  it('are none for a day without study, or one still to come', () => {
    expect(dayParts(past(0), data, groups, DAY)).toEqual([]);
    expect(dayParts({ kind: 'due', value: 12, level: 2 }, data, groups, DAY)).toEqual([]);
  });
});
