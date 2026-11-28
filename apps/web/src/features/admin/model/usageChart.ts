// The chart of «Uso» without React: the round marks of its axis, and what each column says (its day in full, its figure
// with its unit, and the figure that goes with it that same day).
import { FEW } from '@qv/schema';
import type { UsageCount, UsageReport } from '@qv/schema';
import { NUMBER, chartPoints, figure } from './usage';
import type { Metric } from './usage';
import { usageChartStrings as s } from './strings/usageChart.strings';

/**
 * 3 or 4 marks from 0, a step of 1, 2 or 5 × 10ⁿ apart, the last one at or above `max`; at least up to 2, so that a
 * chart all in zeros still has its axis.
 */
export function axisTicks(max: number): number[] {
  const top = Math.max(2, max);
  let i = 0;
  let step = 1;
  while (Math.ceil(top / step) > 3) {
    i += 1;
    step = [1, 2, 5][i % 3]! * 10 ** Math.floor(i / 3);
  }
  return Array.from({ length: Math.ceil(top / step) + 1 }, (_, k) => k * step);
}

/** The widest mark the axis keeps room for, so that nothing moves when the figure or the period changes. */
export const WIDEST_MARK = NUMBER.format(100000);

const LONG_DAY = new Intl.DateTimeFormat('es-CL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** «lunes 23 de noviembre», or «Semana del lunes 23 de noviembre». */
export function longDay(day: string, byWeek: boolean): string {
  const parts = LONG_DAY.formatToParts(new Date(`${day}T12:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  const text = s.day(part('weekday'), part('day'), part('month'));
  return byWeek ? s.week(text) : text;
}

/** A figure with its unit: «703 respuestas de Anki», «1 alumno activo», «menos de 5 alumnos activos». */
export function amount(value: UsageCount, metric: Metric): string {
  const [one, many] = s.units[metric];
  if (value === FEW)
    return metric === 'activeStudents' || metric === 'newStudents' ? s.few(many) : figure(value);
  return `${NUMBER.format(value)} ${value === 1 ? one : many}`;
}

/** The figure shown under a column's own: the one that explains it, from the same day or week. */
const RELATED: Partial<Record<Metric, Metric>> = {
  activeStudents: 'newStudents',
  newStudents: 'activeStudents',
  ankiAnswers: 'newCards',
  newCards: 'ankiAnswers',
  roundsStarted: 'roundsFinished',
  roundsFinished: 'roundsStarted',
};

export interface ChartColumn {
  key: string;
  value: UsageCount;
  when: string;
  figure: string;
  detail: string | null;
  /** What a screen reader says of the column. */
  name: string;
}

export function chartColumns(
  report: UsageReport | null,
  metric: Metric,
  byWeek: boolean,
): ChartColumn[] {
  const related = RELATED[metric];
  const others = related ? chartPoints(report, related, byWeek) : [];
  return chartPoints(report, metric, byWeek).map((p, i) => {
    const other = others[i];
    const when = longDay(p.label, byWeek);
    const value = amount(p.value, metric);
    const detail = related && other ? amount(other.value, related) : null;
    return {
      key: p.label,
      value: p.value,
      when,
      figure: value,
      detail,
      name: s.name(when, value, detail),
    };
  });
}
