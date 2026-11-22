// The scheduler’s day numbers: which day an instant belongs to, when a day starts and how a stored start maps back.
import { describe, expect, it } from 'vitest';
import { dayOf, dayOfStart, dayStartsAt, schedTiming, utcOffset } from '../timing';

const DAY = 86_400;
const HOUR = 3600;
const tz = 'America/Santiago';

describe('dayOf', () => {
  it('is the day of schedTiming, so the hours before the rollover still belong to the day before', () => {
    const start = dayStartsAt(20_000, tz, 4);
    expect(dayOf(start, tz, 4)).toBe(20_000);
    expect(dayOf(start - 1, tz, 4)).toBe(19_999);
    expect(dayOf(start, tz, 4)).toBe(schedTiming(start, tz, 4).today);
  });

  it('never goes below day zero', () => {
    expect(dayOf(-10 * DAY, 'UTC', 4)).toBe(0);
  });
});

describe('dayStartsAt', () => {
  it('uses the offset in force on that day, so a day with a clock change starts at its own hour', () => {
    const summer = dayStartsAt(Date.UTC(2026, 0, 15) / 1000 / DAY, tz, 4);
    const winter = dayStartsAt(Date.UTC(2026, 6, 15) / 1000 / DAY, tz, 4);
    expect(utcOffset(summer, tz)).toBe(-3 * HOUR);
    expect(utcOffset(winter, tz)).toBe(-4 * HOUR);
    expect(new Date(summer * 1000).getUTCHours()).toBe(7);
    expect(new Date(winter * 1000).getUTCHours()).toBe(8);
  });

  it('wraps a rollover hour of 24 or more back into the day', () => {
    expect(dayStartsAt(20_000, 'UTC', 24)).toBe(dayStartsAt(20_000, 'UTC', 0));
  });
});

describe('dayOfStart', () => {
  it('gives back the day a start was computed for', () => {
    for (const day of [19_999, 20_000, 20_150, 20_300]) {
      expect(dayOfStart(dayStartsAt(day, tz, 4), tz, 4)).toBe(day);
    }
  });

  it('keeps the day when the rollover hour moves less than half a day, and takes the nearest start beyond that', () => {
    const start = dayStartsAt(20_000, tz, 4);
    expect(dayOfStart(start, tz, 0)).toBe(20_000);
    expect(dayOfStart(start, tz, 15)).toBe(20_000);
    expect(dayOfStart(start, tz, 17)).toBe(19_999);
  });

  it('is not what dayOf says for a start that falls before the new rollover hour', () => {
    const start = dayStartsAt(20_000, tz, 4);
    expect(dayOf(start, tz, 15)).toBe(19_999);
    expect(dayOfStart(start, tz, 15)).toBe(20_000);
  });

  it('never goes below day zero', () => {
    expect(dayOfStart(-30 * DAY, 'UTC', 4)).toBe(0);
  });
});
