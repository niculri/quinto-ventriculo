// Tests the reading places kept in the tab: one per entry of the history, the newest kept, and blocked storage.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readingPlace, saveReadingPlace } from '../readingPlace';

const KEY = 'qv-reading-places';
const place = (block: number) => ({ path: '/a', block, within: 0.25, past: 0 });

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('the reading places of the tab', () => {
  it('keeps one per entry, and forgets one saved as none', () => {
    saveReadingPlace('k1', place(3));
    saveReadingPlace('k2', place(5));
    expect(readingPlace('k1')).toEqual(place(3));
    saveReadingPlace('k1', null);
    expect(readingPlace('k1')).toBeNull();
    expect(readingPlace('k2')).toEqual(place(5));
  });

  it('keeps the 30 newest', () => {
    for (let i = 0; i < 35; i++) saveReadingPlace(`k${i}`, place(i));
    expect(readingPlace('k4')).toBeNull();
    expect(readingPlace('k5')).toEqual(place(5));
    saveReadingPlace('k5', place(6));
    expect(Object.keys(JSON.parse(window.sessionStorage.getItem(KEY)!) as object).at(-1)).toBe(
      'k5',
    );
  });

  it('reads nothing from what is not a place or not JSON', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ k: { block: -1 } }));
    expect(readingPlace('k')).toBeNull();
    window.sessionStorage.setItem(KEY, '[1]');
    expect(readingPlace('k')).toBeNull();
    window.sessionStorage.setItem(KEY, '{');
    expect(readingPlace('k')).toBeNull();
  });

  it('without storage, nothing is kept and nothing fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveReadingPlace('k', place(1))).not.toThrow();
    expect(readingPlace('k')).toBeNull();
  });
});
