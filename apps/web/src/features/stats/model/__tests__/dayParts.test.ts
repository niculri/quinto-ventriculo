// Tests the groups of a day in the heatmap's box: summed by group with the practice, from most to fewest, only that day.
import type { CellValue, HeatmapData } from '@qv/study';
import { describe, expect, it } from 'vitest';
import { dayParts } from '../dayParts';

const DAY = 20_400;
const past = (value: number): CellValue => ({ kind: 'past', value, level: 1 });
const groupOf = (deckId: string) =>
  ({ a: 'Anatomía', b: 'Anatomía', c: 'Física', d: 'Biología' })[deckId] ?? 'Otros';

const days: HeatmapData['days'] = [
  { day: DAY, deckId: 'a', answers: 3, practice: 2 },
  { day: DAY, deckId: 'b', answers: 4, practice: 0 },
  { day: DAY, deckId: 'c', answers: 0, practice: 9 },
  { day: DAY, deckId: 'd', answers: 9, practice: 0 },
  { day: DAY, deckId: 'z', answers: 0, practice: 0 },
  { day: DAY + 1, deckId: 'c', answers: 50, practice: 0 },
];

describe('the groups of a day', () => {
  it('sum the answers and the practice of each group’s decks, only of that day, most first and ties by name', () => {
    expect(dayParts(past(27), days, groupOf, DAY)).toEqual([
      ['Anatomía', 9],
      ['Biología', 9],
      ['Física', 9],
    ]);
  });

  it('leave out a group with nothing that day', () => {
    expect(dayParts(past(27), days, groupOf, DAY).map(([g]) => g)).not.toContain('Otros');
  });

  it('are none for a day without study, or one still to come', () => {
    expect(dayParts(past(0), days, groupOf, DAY)).toEqual([]);
    expect(dayParts({ kind: 'due', value: 12, level: 2 }, days, groupOf, DAY)).toEqual([]);
  });
});
