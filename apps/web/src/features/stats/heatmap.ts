/**
 * The study heatmap (plan step 3.1): the numbers and the grid, without React. The rules are those of the «Review
 * Heatmap» add-on for Anki: every answer counts (also learning and practice that does not change dates), the scale
 * follows the student's own average, the future shows the reviews already scheduled, and today shows what was
 * answered or, before answering anything, what is due.
 *
 * Days are numbers of days since 1970-01-01 (as @qv/srs's dayOf): the student's day, with their rollover hour.
 */

const MS_DAY = 86_400_000;

/** One day of one deck, as the database keeps it (study_days). */
export interface HeatmapDay {
  day: number;
  deckId: string;
  /** Answers that changed dates. */
  answers: number;
  /** Practice that did not (the final review). */
  practice: number;
}

/** Reviews already scheduled for a day (today or later). */
export interface HeatmapDue {
  day: number;
  cards: number;
}

export interface HeatmapData {
  days: HeatmapDay[];
  due: HeatmapDue[];
}

export const emptyHeatmap = (): HeatmapData => ({ days: [], due: [] });

/** «2026-11-03» → its day number. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / MS_DAY);
}

/** Its day number → «2026-11-03». */
export function isoOfDay(day: number): string {
  return new Date(day * MS_DAY).toISOString().slice(0, 10);
}

/** The calendar year of a day. */
export const yearOf = (day: number): number => new Date(day * MS_DAY).getUTCFullYear();

/** The first day of a year. */
export const firstDayOf = (year: number): number => Math.round(Date.UTC(year, 0, 1) / MS_DAY);

/** 0 = Monday … 6 = Sunday (1970-01-01 was a Thursday). */
export const weekdayOf = (day: number): number => (((day + 3) % 7) + 7) % 7;

/** What was studied each day (answers and practice), only up to today; the decks of `only`, if given. */
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

/** What is due each day from today on. */
export function dueByDay(due: readonly HeatmapDue[], today: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const d of due) {
    if (d.day < today || d.cards <= 0) continue;
    out.set(d.day, (out.get(d.day) ?? 0) + d.cards);
  }
  return out;
}

export interface HeatmapStats {
  /** Days with something studied. */
  activeDays: number;
  /** Answers in all. */
  total: number;
  /** «Promedio diario»: answers per day studied (rounded). */
  dailyAverage: number;
  /** «Días estudiados»: days studied over the days since the first one, today included (%, rounded). */
  studiedPercent: number;
  /** «Racha más larga», in days. */
  longestStreak: number;
  /** «Racha actual»: alive while the last day studied is today or yesterday. */
  currentStreak: number;
  /** The average the colors are relative to: at least 20, as the add-on. */
  scale: number;
}

/** The add-on's floor for the scale: with fewer answers a day, a short day does not look like a full one. */
export const MIN_SCALE = 20;

/**
 * Python's round(), which the add-on uses: to the nearest integer and, half way, to the even one (2.5 → 2, 12.5 → 12;
 * Math.round gives 3 and 13). Only for numbers ≥ 0.
 */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const rest = x - floor;
  if (rest !== 0.5) return Math.round(x);
  return floor % 2 === 0 ? floor : floor + 1;
}

export function heatmapStats(byDay: ReadonlyMap<number, number>, today: number): HeatmapStats {
  const days = [...byDay.keys()].filter((d) => d <= today).sort((a, b) => a - b);
  const total = days.reduce((t, d) => t + byDay.get(d)!, 0);
  // As the add-on: the average rounded, and the scale from that rounded average.
  const average = days.length ? roundHalfEven(total / days.length) : 0;
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i]! - days[i - 1]! === 1 ? run + 1 : 1;
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

/** The add-on's thresholds, times the scale: 10 shades for the days with something. */
export const THRESHOLDS = [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;
export const LEVELS = THRESHOLDS.length + 1;

/**
 * 0 (nothing) or 1–10: 1 up to an eighth of the scale, 10 above four times it. As the add-on's calendar (cal-heatmap,
 * whose legend for what is due is the same one, negative): a day studied exactly on a threshold stays in the shade
 * below it, and a day due exactly on one goes to the shade above it.
 */
export function levelOf(value: number, scale: number, kind: 'past' | 'due' = 'past'): number {
  if (value <= 0) return 0;
  let level = 1;
  for (const t of THRESHOLDS) {
    if (kind === 'past' ? value > t * scale : value >= t * scale) level++;
  }
  return level;
}

/** Always 54 weeks: the longest a year can need (a leap year starting on a Sunday), so that no year moves anything. */
export const COLUMNS = 54;

export interface YearGrid {
  year: number;
  first: number;
  last: number;
  /** columns[week][weekday]: the day, or null outside the year. Always COLUMNS weeks of 7 days. */
  columns: (number | null)[][];
  /** Where each month starts: its week (the column of its 1st). */
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

/** What a cell of the grid shows. */
export interface CellValue {
  /** 'past': studied (or nothing); 'due': scheduled. */
  kind: 'past' | 'due';
  value: number;
  level: number;
}

/** A day of the grid: studied before today; today, what was studied or, if nothing, what is due; after, what is due. */
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

/** The years the arrows reach: from the first one with something to the last one with something due (at least today’s). */
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

// Words ------------------------------------------------------------------------------------------------------------

export const MONTHS = [
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

/** «3 de noviembre de 2026». */
export function dateText(day: number, withWeekday = false): string {
  const d = new Date(day * MS_DAY);
  const text = `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  return withWeekday ? `${WEEKDAYS[weekdayOf(day)]} ${text}` : text;
}

/** «1.572 respuestas», «1 respuesta». */
export const answersText = (n: number) => `${number(n)} ${n === 1 ? 'respuesta' : 'respuestas'}`;

/** «239 por repasar». */
export const dueText = (n: number) => `${number(n)} por repasar`;

/** What a cell says to a screen reader: its date and its figure. */
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
