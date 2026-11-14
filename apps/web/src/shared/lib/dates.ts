// Dates and times written out in Spanish, in Chile time («31 de octubre de 2026»).
const DATE = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Santiago',
});

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/** A date without time («2026-10-31»), without shifting a day because of the time zone. */
export function formatDay(day: string): string {
  return formatDate(`${day}T12:00:00Z`);
}

const DATE_TIME = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Santiago',
});

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
