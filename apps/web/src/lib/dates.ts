const DATE = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Santiago',
});

/** «2026-10-31T12:00:00Z» → «31 de octubre de 2026» (Chile time). */
export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/** «2026-10-31» (date without time) → «31 de octubre de 2026», without shifting a day because of the time zone. */
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

/** «2026-11-01T12:30:00Z» → «1 de noviembre de 2026 a las 09:30» (Chile time). */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
