// Tests the chart of «Uso» without React: the round marks of its axis, a day in full, a figure with its unit, and the
// figure that goes with each column.
import { FEW } from '@qv/schema';
import type { UsageFigures, UsageReport } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { amount, axisTicks, chartColumns, longDay } from '../usageChart';

describe('the marks of the axis', () => {
  it.each([
    [0, [0, 1, 2]],
    [1, [0, 1, 2]],
    [2, [0, 1, 2]],
    [3, [0, 1, 2, 3]],
    [4, [0, 2, 4]],
    [5, [0, 2, 4, 6]],
    [7, [0, 5, 10]],
    [11, [0, 5, 10, 15]],
    [15, [0, 5, 10, 15]],
    [16, [0, 10, 20]],
    [101, [0, 50, 100, 150]],
    [703, [0, 500, 1000]],
    [1000, [0, 500, 1000]],
    [2331, [0, 1000, 2000, 3000]],
    [1234567, [0, 500000, 1000000, 1500000]],
  ])('up to %s: %j', (max, ticks) => {
    expect(axisTicks(max)).toEqual(ticks);
  });

  it('always 3 or 4 marks, the last at or above the maximum, a step of 1, 2 or 5 × 10ⁿ', () => {
    for (let max = 0; max <= 20000; max += 7) {
      const ticks = axisTicks(max);
      const step = ticks[1]!;
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.length).toBeLessThanOrEqual(4);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(max);
      expect(step / 10 ** Math.floor(Math.log10(step))).toBeOneOf([1, 2, 5]);
    }
  });
});

describe('a day in full', () => {
  it('by day and by week', () => {
    expect(longDay('2026-11-23', false)).toBe('lunes 23 de noviembre');
    expect(longDay('2026-09-30', true)).toBe('Semana del miércoles 30 de septiembre');
  });
});

describe('a figure with its unit', () => {
  it.each([
    [703, 'ankiAnswers', '703 respuestas de Anki'],
    [1, 'ankiAnswers', '1 respuesta de Anki'],
    [2331, 'newCards', '2.331 tarjetas nuevas vistas'],
    [1, 'activeStudents', '1 alumno activo'],
    [0, 'searches', '0 búsquedas'],
    [FEW, 'newStudents', 'menos de 5 alumnos nuevos'],
    [FEW, 'activeStudents', 'menos de 5 alumnos activos'],
    [FEW, 'decks', '—'],
  ] as const)('%s %s: %s', (value, metric, text) => {
    expect(amount(value, metric)).toBe(text);
  });
});

describe('the columns', () => {
  const figures = (n: number): UsageFigures => ({
    activeStudents: n,
    newStudents: 1,
    ankiAnswers: n,
    newCards: n,
    roundsStarted: 3,
    roundsFinished: 2,
  });
  const report = {
    days: [{ day: '2026-11-23', ...figures(12) }],
    weeks: [{ week: '2026-11-16', ...figures(40) }],
    opens: { days: [{ day: '2026-11-23', notes: 4, decks: 1, quizzes: 0, searches: 2 }] },
  } as UsageReport;

  it('each says its day, its figure and the one that goes with it', () => {
    expect(chartColumns(report, 'roundsFinished', false)).toEqual([
      {
        key: '2026-11-23',
        value: 2,
        when: 'lunes 23 de noviembre',
        figure: '2 rondas de tests terminadas',
        detail: '3 rondas de tests empezadas',
        name: 'lunes 23 de noviembre: 2 rondas de tests terminadas; 3 rondas de tests empezadas',
      },
    ]);
    expect(chartColumns(report, 'newStudents', true)[0]?.detail).toBe('40 alumnos activos');
  });

  it('an open has nothing that goes with it, and without a report there are no columns', () => {
    expect(chartColumns(report, 'notes', false)[0]).toMatchObject({
      detail: null,
      name: 'lunes 23 de noviembre: 4 apuntes abiertos',
    });
    expect(chartColumns(null, 'ankiAnswers', false)).toEqual([]);
  });
});
