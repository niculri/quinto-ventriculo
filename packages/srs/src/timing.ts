// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * The scheduler's day, as Anki's v3 (rslib/src/scheduler/timing.rs, sched_timing_today_v2_new): a day starts
 * at the configured hour (4 by default) in the user's time zone. Anki counts days since the collection was
 * created; here, since 1970-01-01 in the user's zone (a «collection» created that day), which gives the same
 * differences between days.
 */

export interface SchedTiming {
  /** Unix time, in seconds. */
  now: number;
  /** Day number (days since 1970-01-01 in the user's zone, the day starting at the rollover hour). */
  today: number;
  /** Unix time (seconds) of the next rollover. */
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

/** Offset of the zone from UTC at a moment, in seconds (Santiago in summer: −3 h = −10800). */
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

/** Is `timeZone` a zone the browser knows? */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The day's timing at `nowSecs`, with the day starting at `rolloverHour` (0–23) in `timeZone`. */
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

/** Unix time (seconds) when day `day` starts, in `timeZone` (with that day's own offset). */
export function dayStartsAt(day: number, timeZone: string, rolloverHour: number): number {
  const wall = day * DAY + (rolloverHour % 24) * 3600;
  let guess = wall - utcOffset(wall, timeZone);
  guess = wall - utcOffset(guess, timeZone);
  return guess;
}

/** The day number that contains the moment `unixSecs`. */
export function dayOf(unixSecs: number, timeZone: string, rolloverHour: number): number {
  return schedTiming(unixSecs, timeZone, rolloverHour).today;
}

/**
 * The day a stored «start of the day» (`dayStartsAt`) stands for: the day whose start, at the rollover hour
 * in the zone, is the nearest. With the same hour and zone it is the day it was saved for; after the user
 * moves the hour the day starts (4 → 5) or the browser's zone changes, the card keeps its day, as Anki's due
 * day numbers do (`dayOf` would put it a day earlier: 4:00 is still yesterday when the day starts at 5:00).
 * It holds while the hour and the zone move less than 12 hours between them.
 */
export function dayOfStart(unixSecs: number, timeZone: string, rolloverHour: number): number {
  const wall = Math.floor(unixSecs) + utcOffset(unixSecs, timeZone);
  return Math.max(0, Math.round((wall - (rolloverHour % 24) * 3600) / DAY));
}
