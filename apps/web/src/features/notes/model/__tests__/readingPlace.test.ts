// Tests the reading place of an article: which block is on the reading line, how to come back to it, and when.
import { describe, expect, it } from 'vitest';
import { READING_LINE, placeAt, restores, scrollToPlace } from '../readingPlace';

const at = (...tops: number[]) => tops.map((top) => ({ top, height: 100 }));

describe('the reading place', () => {
  it('is the last block that starts above the line, and how far into it; none above the first', () => {
    expect(placeAt(at(-50, 22, 300))).toEqual({ block: 1, within: 0.5, past: 0 });
    expect(placeAt(at(100, 200))).toBeNull();
    expect(placeAt([{ top: 0, height: 0 }, ...at(500)])).toEqual({ block: 0, within: 0, past: 0 });
  });

  it('in the order of the article, as a figure beside the text that starts lower than the next paragraph', () => {
    expect(placeAt(at(-150, 120, 40, 300))).toEqual({ block: 2, within: 0.32, past: 0 });
  });

  it('below the last block, how far below', () => {
    expect(placeAt(at(-400, -250))).toEqual({ block: 1, within: 1, past: READING_LINE + 150 });
  });

  it('comes back to the line whatever the width, and not to a block the article no longer has', () => {
    const place = { block: 1, within: 0.5, past: 0 };
    expect(scrollToPlace(at(400, 600), place)).toBe(600 + 50 - READING_LINE);
    expect(
      scrollToPlace(
        [
          { top: 400, height: 40 },
          { top: 440, height: 300 },
        ],
        place,
      ),
    ).toBe(440 + 150 - READING_LINE);
    expect(scrollToPlace(at(400), place)).toBeNull();
    expect(scrollToPlace(at(0, 10), { ...place, past: 30 })).toBe(10 + 50 + 30 - READING_LINE);
  });

  it('comes back only to the same entry of the history, without a section asked for, on the same page', () => {
    const place = { path: '/a', block: 0, within: 0, past: 0 };
    const back = { path: '/a', hash: '', pop: true };
    expect(restores(place, back)).toBe(true);
    expect(restores(null, back)).toBe(false);
    expect(restores(place, { ...back, pop: false })).toBe(false);
    expect(restores(place, { ...back, hash: '#uno' })).toBe(false);
    expect(restores(place, { ...back, path: '/b' })).toBe(false);
  });
});
