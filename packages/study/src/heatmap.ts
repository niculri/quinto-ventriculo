// Numbers and grid of the study heatmap, by the rules of Anki's «Review Heatmap» add-on. Days are numbers of days
// since 1970-01-01 (as @qv/srs's dayOf): the student's day, with their rollover hour.

const MS_DAY = 86_400_000;

export interface HeatmapDay {
  day: number;
  deckId: string;
  answers: number;
  practice: number;
}

export interface HeatmapDue {
  day: number;
  cards: number;
}

/** The questions answered in a test on a day. */
export interface HeatmapTest {
  day: number;
  quizId: string;
  answers: number;
}

/** `tests` is absent in what a database without them gives. */
export interface HeatmapData {
  days: HeatmapDay[];
  due: HeatmapDue[];
  tests?: HeatmapTest[];
}

export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d) / MS_DAY);
}

export function isoOfDay(day: number): string {
  return new Date(day * MS_DAY).toISOString().slice(0, 10);
}

export const yearOf = (day: number): number => new Date(day * MS_DAY).getUTCFullYear();

const firstDayOf = (year: number): number => Math.round(Date.UTC(year, 0, 1) / MS_DAY);

/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (day: number): number => (((day + 3) % 7) + 7) % 7;

export function countsByDay(
  days: readonly HeatmapDay[],
  today: number,
  only?: ReadonlySet<string>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of days) {
    if (d.day > today || (only && !only.has(d.deckId))) continue;
    const n = d.answers + d.practice;
    if (n > 0) out.set(d.day, (out.get(d.day) ?? 0) + n);
  }
  return out;
}

export function dueByDay(due: readonly HeatmapDue[], today: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of due) {
    if (d.day < today || d.cards <= 0) continue;
    out.set(d.day, (out.get(d.day) ?? 0) + d.cards);
  }
  return out;
}

export interface HeatmapStats {
  activeDays: number;
  total: number;
  dailyAverage: number;
  studiedPercent: number;
  longestStreak: number;
  currentStreak: number;
  scale: number;
}

const MIN_SCALE = 20;

/** Python's round(), which the add-on uses: half way, to the even integer (2.5 → 2). Only for numbers ≥ 0. */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const rest = x - floor;
  if (rest !== 0.5) return Math.round(x);
  return floor % 2 === 0 ? floor : floor + 1;
}

export function heatmapStats(byDay: ReadonlyMap<number, number>, today: number): HeatmapStats {
  const days = [...byDay.keys()].filter((d) => d <= today).sort((a, b) => a - b);
  const total = days.reduce((t, d) => t + byDay.get(d)!, 0);
  const average = days.length ? roundHalfEven(total / days.length) : 0;
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    const previous = days[i - 1];
    run = previous !== undefined && days[i]! - previous === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const last = days.at(-1);
  const current = last !== undefined && today - last <= 1 ? run : 0;
  return {
    activeDays: days.length,
    total,
    dailyAverage: average,
    studiedPercent: days.length ? roundHalfEven((days.length / (today - days[0]! + 1)) * 100) : 0,
    longestStreak: longest,
    currentStreak: current,
    scale: Math.max(MIN_SCALE, average),
  };
}

const THRESHOLDS = [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;

// As the add-on's calendar: a day studied exactly on a threshold stays in the shade below it, and a day due exactly
// on one goes to the shade above it.
export function levelOf(value: number, scale: number, kind: 'past' | 'due' = 'past'): number {
  if (value <= 0) return 0;
  let level = 1;
  for (const t of THRESHOLDS) {
    if (kind === 'past' ? value > t * scale : value >= t * scale) level++;
  }
  return level;
}

/** The most weeks a year can touch (a leap year starting on a Sunday), so no year changes the grid's size. */
export const COLUMNS = 54;

export interface YearGrid {
  year: number;
  first: number;
  last: number;
  columns: (number | null)[][];
  months: { month: number; column: number }[];
}

export function yearGrid(year: number): YearGrid {
  const first = firstDayOf(year);
  const last = firstDayOf(year + 1) - 1;
  const start = first - weekdayOf(first);
  const columns = Array.from({ length: COLUMNS }, (_, c) =>
    Array.from({ length: 7 }, (_, r) => {
      const day = start + c * 7 + r;
      return day >= first && day <= last ? day : null;
    }),
  );
  const months = Array.from({ length: 12 }, (_, month) => ({
    month,
    column: Math.floor((Math.round(Date.UTC(year, month, 1) / MS_DAY) - start) / 7),
  }));
  return { year, first, last, columns, months };
}

export interface CellValue {
  kind: 'past' | 'due';
  value: number;
  level: number;
}

export function cellValue(
  day: number,
  today: number,
  studied: ReadonlyMap<number, number>,
  due: ReadonlyMap<number, number>,
  scale: number,
): CellValue {
  const done = day <= today ? (studied.get(day) ?? 0) : 0;
  if (day < today || done > 0) return { kind: 'past', value: done, level: levelOf(done, scale) };
  const value = due.get(day) ?? 0;
  return { kind: 'due', value, level: levelOf(value, scale, 'due') };
}

export function yearRange(
  studied: ReadonlyMap<number, number>,
  due: ReadonlyMap<number, number>,
  today: number,
): { from: number; to: number } {
  const thisYear = yearOf(today);
  let from = thisYear;
  let to = thisYear;
  for (const d of studied.keys()) from = Math.min(from, yearOf(d));
  for (const d of due.keys()) to = Math.max(to, yearOf(d));
  return { from, to };
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;
export const SHORT_MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sept',
  'oct',
  'nov',
  'dic',
] as const;
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const number = (n: number) => n.toLocaleString('es-CL');

export function dateText(day: number, withWeekday = false): string {
  const d = new Date(day * MS_DAY);
  const text = `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]!} de ${d.getUTCFullYear()}`;
  return withWeekday ? `${WEEKDAYS[weekdayOf(day)]!} ${text}` : text;
}

export const answersText = (n: number) => `${number(n)} ${n === 1 ? 'respuesta' : 'respuestas'}`;

export const dueText = (n: number) => `${number(n)} por repasar`;

export function cellLabel(day: number, cell: CellValue, today: number): string {
  const what =
    cell.kind === 'past'
      ? cell.value > 0
        ? answersText(cell.value)
        : 'sin estudio'
      : cell.value > 0
        ? dueText(cell.value)
        : 'nada por repasar';
  return `${dateText(day)}${day === today ? ' (hoy)' : ''}: ${what}`;
}
