import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  cellLabel,
  cellValue,
  countsByDay,
  dayNumber,
  dueByDay,
  heatmapStats,
  isoOfDay,
  levelOf,
  roundHalfEven,
  weekdayOf,
  yearGrid,
  yearRange,
} from './heatmap';
import type { HeatmapDay } from './heatmap';

const D = dayNumber;
const studied = (entries: [string, number][]) => new Map(entries.map(([d, n]) => [D(d), n]));

describe('days', () => {
  it('go and come back from their date', () => {
    expect(D('1970-01-01')).toBe(0);
    expect(isoOfDay(D('2026-11-03'))).toBe('2026-11-03');
    expect(isoOfDay(D('2028-02-29'))).toBe('2028-02-29');
    expect(weekdayOf(D('2026-11-09'))).toBe(0); // a Monday
    expect(weekdayOf(D('2026-11-08'))).toBe(6); // a Sunday
  });

  it('count answers and practice, up to today, of the decks asked for', () => {
    const days: HeatmapDay[] = [
      { day: D('2026-11-01'), deckId: 'a', answers: 10, practice: 0 },
      { day: D('2026-11-01'), deckId: 'b', answers: 5, practice: 2 },
      { day: D('2026-11-02'), deckId: 'b', answers: 0, practice: 4 },
      // A day after today (another device's clock): not counted.
      { day: D('2026-11-04'), deckId: 'a', answers: 3, practice: 0 },
    ];
    const today = D('2026-11-03');
    expect([...countsByDay(days, today)]).toEqual([
      [D('2026-11-01'), 17],
      [D('2026-11-02'), 4],
    ]);
    expect([...countsByDay(days, today, new Set(['b']))]).toEqual([
      [D('2026-11-01'), 7],
      [D('2026-11-02'), 4],
    ]);
    expect([
      ...dueByDay(
        [
          { day: D('2026-11-02'), cards: 8 },
          { day: D('2026-11-05'), cards: 3 },
        ],
        today,
      ),
    ]).toEqual([[D('2026-11-05'), 3]]);
  });
});

describe('the four figures', () => {
  it('average per day studied, % of days since the first, longest and current streak', () => {
    // 1, 2, 3 (a streak of 3), a gap, 6, 7, 8, 9 (4), a gap, 11 (today).
    const map = studied([
      ['2026-11-01', 100],
      ['2026-11-02', 50],
      ['2026-11-03', 30],
      ['2026-11-06', 20],
      ['2026-11-07', 10],
      ['2026-11-08', 10],
      ['2026-11-09', 10],
      ['2026-11-11', 50],
    ]);
    const s = heatmapStats(map, D('2026-11-11'));
    expect(s).toEqual({
      activeDays: 8,
      total: 280,
      dailyAverage: 35,
      studiedPercent: 73, // 8 of 11
      longestStreak: 4,
      currentStreak: 1,
      scale: 35,
    });
  });

  it('the current streak is alive if the last day is yesterday, not before', () => {
    const map = studied([
      ['2026-11-08', 1],
      ['2026-11-09', 1],
      ['2026-11-10', 1],
    ]);
    expect(heatmapStats(map, D('2026-11-10')).currentStreak).toBe(3);
    expect(heatmapStats(map, D('2026-11-11')).currentStreak).toBe(3);
    expect(heatmapStats(map, D('2026-11-12')).currentStreak).toBe(0);
    expect(heatmapStats(map, D('2026-11-12')).longestStreak).toBe(3);
  });

  it('without anything: zeros, and the scale at its floor of 20', () => {
    expect(heatmapStats(new Map(), D('2026-11-10'))).toEqual({
      activeDays: 0,
      total: 0,
      dailyAverage: 0,
      studiedPercent: 0,
      longestStreak: 0,
      currentStreak: 0,
      scale: 20,
    });
  });

  it('a first day today is 100 %', () => {
    expect(heatmapStats(studied([['2026-11-10', 5]]), D('2026-11-10')).studiedPercent).toBe(100);
  });

  it('rounds as the add-on (Python): half way, to the even one; the scale is the rounded average', () => {
    expect([0.5, 1.5, 2.5, 12.5, 12.4, 12.6, 13.5].map(roundHalfEven)).toEqual([
      0, 2, 2, 12, 12, 13, 14,
    ]);
    // 1 day of 8 is 12.5 %: Math.round would say 13.
    expect(heatmapStats(studied([['2026-11-03', 41]]), D('2026-11-10')).studiedPercent).toBe(12);
    // 21 and 20 answers are 20.5 a day: Math.round would say 21.
    const s = heatmapStats(
      studied([
        ['2026-11-09', 21],
        ['2026-11-10', 20],
      ]),
      D('2026-11-10'),
    );
    expect(s.dailyAverage).toBe(20);
    // 61 and 62 are 61.5 a day: 62, the even one; and the scale is that 62, not 61.5.
    const t = heatmapStats(
      studied([
        ['2026-11-09', 61],
        ['2026-11-10', 62],
      ]),
      D('2026-11-10'),
    );
    expect(t.dailyAverage).toBe(62);
    expect(t.scale).toBe(62);
  });
});

describe('the levels of the add-on', () => {
  it('avg × [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4]: ten shades, 0 for nothing', () => {
    const scale = 100;
    expect(
      [
        0, 1, 12.5, 13, 25, 26, 50, 51, 75, 76, 100, 101, 125, 126, 150, 151, 200, 201, 400, 401,
        9999,
      ].map((v) => levelOf(v, scale)),
    ).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]);
  });

  it('what is due exactly on a threshold goes to the shade above it (the add-on’s negative legend)', () => {
    const scale = 20; // thresholds 2.5, 5, 10, 15, 20, 25, 30, 40, 80
    expect([1, 2.5, 4, 5, 20, 79, 80].map((v) => levelOf(v, scale, 'due'))).toEqual([
      1, 2, 2, 3, 6, 9, 10,
    ]);
    expect([5, 20, 80].map((v) => levelOf(v, scale))).toEqual([2, 5, 9]);
    const today = D('2026-11-10');
    expect(
      cellValue(D('2026-11-12'), today, new Map(), new Map([[D('2026-11-12'), 20]]), 20),
    ).toEqual({ kind: 'due', value: 20, level: 6 });
  });

  it('with few answers a day the scale is 20', () => {
    const s = heatmapStats(studied([['2026-11-10', 4]]), D('2026-11-10'));
    expect(s.scale).toBe(20);
    expect(levelOf(4, s.scale)).toBe(2); // above 20 × 0.125 = 2.5, up to 20 × 0.25 = 5
  });
});

describe('the grid of a year', () => {
  it('always has 54 weeks of 7 days, Monday first, and every day of the year once', () => {
    for (const year of [2026, 2027, 2028, 2033, 2000]) {
      const g = yearGrid(year);
      expect(g.columns).toHaveLength(COLUMNS);
      expect(g.columns.every((c) => c.length === 7)).toBe(true);
      const days = g.columns.flat().filter((d): d is number => d !== null);
      expect(days[0]).toBe(D(`${year}-01-01`));
      expect(days.at(-1)).toBe(D(`${year}-12-31`));
      expect(new Set(days).size).toBe(days.length);
      expect(days.length).toBe(year % 4 === 0 ? 366 : 365);
      // Rows are weekdays.
      for (const [c, column] of g.columns.entries()) {
        for (const [r, day] of column.entries())
          if (day !== null) expect(weekdayOf(day), `${c}`).toBe(r);
      }
    }
  });

  it('a leap year starting on a Sunday uses the 54 weeks', () => {
    // 2040 starts on a Sunday and is a leap year: its 31 December is in the 54th week.
    const g = yearGrid(2040);
    expect(weekdayOf(g.first)).toBe(6);
    expect(g.columns[COLUMNS - 1]!.some((d) => d !== null)).toBe(true);
  });

  it('puts each month in the week of its 1st', () => {
    const g = yearGrid(2026); // 1-1-2026 was a Thursday
    expect(g.months[0]).toEqual({ month: 0, column: 0 });
    expect(g.columns[g.months[10]!.column]).toContain(D('2026-11-01'));
  });
});

describe('what each cell shows', () => {
  const today = D('2026-11-10');
  const done = studied([
    ['2026-11-09', 40],
    ['2026-11-10', 12],
  ]);
  const due = new Map([
    [D('2026-11-10'), 30],
    [D('2026-11-12'), 7],
  ]);

  it('the past and today studied; today without answers and the future, what is due', () => {
    expect(cellValue(D('2026-11-09'), today, done, due, 20)).toMatchObject({
      kind: 'past',
      value: 40,
    });
    expect(cellValue(D('2026-11-08'), today, done, due, 20)).toMatchObject({
      kind: 'past',
      value: 0,
      level: 0,
    });
    expect(cellValue(today, today, done, due, 20)).toMatchObject({ kind: 'past', value: 12 });
    expect(cellValue(today, today, new Map(), due, 20)).toMatchObject({ kind: 'due', value: 30 });
    expect(cellValue(D('2026-11-12'), today, done, due, 20)).toMatchObject({
      kind: 'due',
      value: 7,
    });
  });

  it('says its date and its figure', () => {
    expect(cellLabel(D('2026-11-03'), { kind: 'past', value: 1572, level: 9 }, today)).toBe(
      '3 de noviembre de 2026: 1.572 respuestas',
    );
    expect(cellLabel(D('2026-11-12'), { kind: 'due', value: 239, level: 9 }, today)).toBe(
      '12 de noviembre de 2026: 239 por repasar',
    );
    expect(cellLabel(today, { kind: 'past', value: 1, level: 1 }, today)).toBe(
      '10 de noviembre de 2026 (hoy): 1 respuesta',
    );
    expect(cellLabel(D('2026-11-01'), { kind: 'past', value: 0, level: 0 }, today)).toBe(
      '1 de noviembre de 2026: sin estudio',
    );
  });

  it('the arrows reach from the first year studied to the last with something due', () => {
    expect(yearRange(studied([['2024-03-01', 1]]), new Map([[D('2027-01-05'), 3]]), today)).toEqual(
      {
        from: 2024,
        to: 2027,
      },
    );
    expect(yearRange(new Map(), new Map(), today)).toEqual({ from: 2026, to: 2026 });
  });
});
