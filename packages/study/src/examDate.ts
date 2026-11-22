// Calendar days of an assessment's date and what is said about the days left.

const DAY_MS = 86_400_000;

// A day number is the date in the user's zone counted from 1970, so a calendar day needs no zone; before the
// rollover hour the scheduler's `today` is still yesterday.
export function dayOfDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d) / DAY_MS;
}

export function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** A complete date that makes sense (while somebody types a year, the field goes through 0002, 0020, 0202…). */
export function isExamDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const year = Number(text.slice(0, 4));
  return year >= 2000 && year <= 2100 && dateOfDay(dayOfDate(text)) === text;
}

const LONG_DATE = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export const longDate = (date: string) => LONG_DATE.format(new Date(dayOfDate(date) * DAY_MS));

const SHORT_DATE = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const shortDate = (date: string) =>
  SHORT_DATE.format(new Date(dayOfDate(date) * DAY_MS))
    .replace(/ de /, ' ')
    .replace(/\.$/, '');

export function daysLeftText(daysLeft: number): string {
  if (daysLeft === 0) return 'Hoy es la prueba';
  return daysLeft === 1 ? 'Falta 1 día' : `Faltan ${daysLeft.toLocaleString('es-CL')} días`;
}
