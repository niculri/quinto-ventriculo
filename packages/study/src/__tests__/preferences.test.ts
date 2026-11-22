// What a student starts studying with and the time zone it comes from.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserTimeZone, defaultPreferences } from '../preferences';

afterEach(() => vi.restoreAllMocks());

describe('defaultPreferences', () => {
  it('starts in simple mode, with the day turning over at 4:00 and a 20-minute learn-ahead', () => {
    expect(defaultPreferences('America/Santiago')).toMatchObject({
      timeZone: 'America/Santiago',
      dayStartsAt: 4,
      learnAheadMinutes: 20,
      fullAnki: false,
      fourButtons: false,
      welcomeSeen: false,
      newCardsIgnoreReviewLimit: false,
      applyAllParentLimits: false,
      semester: null,
    });
  });

  it('each call gives lists nobody else shares', () => {
    const a = defaultPreferences('UTC');
    a.dismissed.push('tip');
    expect(defaultPreferences('UTC').dismissed).toEqual([]);
  });

  it('takes the device’s zone when none is given', () => {
    expect(defaultPreferences().timeZone).toBe(browserTimeZone());
  });
});

describe('browserTimeZone', () => {
  const stub = (resolvedOptions: () => { timeZone: string | undefined }) =>
    vi
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(() => ({ resolvedOptions }) as unknown as Intl.DateTimeFormat);

  it('is the zone the device reports', () => {
    stub(() => ({ timeZone: 'Asia/Tokyo' }));
    expect(browserTimeZone()).toBe('Asia/Tokyo');
  });

  it('falls back to Santiago when the device reports an empty zone', () => {
    stub(() => ({ timeZone: '' }));
    expect(browserTimeZone()).toBe('America/Santiago');
  });

  it('falls back to Santiago when the device cannot tell', () => {
    stub(() => {
      throw new Error('no Intl');
    });
    expect(browserTimeZone()).toBe('America/Santiago');
  });
});
