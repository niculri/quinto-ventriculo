// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * The scheduler's day, as Anki's v3 (rslib/src/scheduler/timing.rs, sched_timing_today_v2_new): a day starts at the
 * configured hour in the user's time zone.
 */

export interface SchedTiming {
  now: number;
  /** Days since 1970-01-01 (Anki counts from the collection's creation: the differences are the same). */
  today: number;
  nextDayAt: number;
}

const DAY = 86_400;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** In seconds, negative west of UTC (Santiago in summer: −10800). */
export function utcOffset(unixSecs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(Math.floor(unixSecs) * 1000))
      .map((p) => [p.type, p.value]),
  );
  const wall =
    Date.UTC(
      Number(parts['year']),
      Number(parts['month']) - 1,
      Number(parts['day']),
      Number(parts['hour']),
      Number(parts['minute']),
      Number(parts['second']),
    ) / 1000;
  return wall - Math.floor(unixSecs);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function schedTiming(nowSecs: number, timeZone: string, rolloverHour: number): SchedTiming {
  const now = Math.floor(nowSecs);
  // As Anki: the date and the rollover with the current offset (a fixed offset, not the next day's).
  const offset = utcOffset(now, timeZone);
  const wall = now + offset;
  const localDay = Math.floor(wall / DAY);
  const rolloverToday = localDay * DAY + (rolloverHour % 24) * 3600 - offset;
  const passed = rolloverToday <= now;
  return {
    now,
    today: Math.max(0, passed ? localDay : localDay - 1),
    nextDayAt: passed ? rolloverToday + DAY : rolloverToday,
  };
}

/** With that day's own offset, unlike `schedTiming`. */
export function dayStartsAt(day: number, timeZone: string, rolloverHour: number): number {
  const wall = day * DAY + (rolloverHour % 24) * 3600;
  let guess = wall - utcOffset(wall, timeZone);
  guess = wall - utcOffset(guess, timeZone);
  return guess;
}

export function dayOf(unixSecs: number, timeZone: string, rolloverHour: number): number {
  return schedTiming(unixSecs, timeZone, rolloverHour).today;
}

/**
 * The day a stored `dayStartsAt` stands for: the nearest start. A card keeps its day when the rollover hour or zone
 * changes by under 12 h, as Anki's day numbers do (`dayOf` would give the day before).
 */
export function dayOfStart(unixSecs: number, timeZone: string, rolloverHour: number): number {
  const wall = Math.floor(unixSecs) + utcOffset(unixSecs, timeZone);
  return Math.max(0, Math.round((wall - (rolloverHour % 24) * 3600) / DAY));
}
