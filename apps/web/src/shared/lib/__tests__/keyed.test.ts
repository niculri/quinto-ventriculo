// Tests that keyed() gives each item a different key, the same one while the text and its place among the identical ones stay.
import { describe, expect, it } from 'vitest';
import { keyed } from '../keyed';

describe('keyed', () => {
  it('numbers the items that say the same, and only those', () => {
    const list = keyed(['a', 'b', 'a', 'a'], (t) => t);
    expect(list.map((x) => x.key)).toEqual(['a#0', 'b#0', 'a#1', 'a#2']);
    expect(list.map((x) => x.item)).toEqual(['a', 'b', 'a', 'a']);
  });

  it('keeps the key of what is before a change at the end', () => {
    const before = keyed(['a', 'b', 'a'], (t) => t);
    const after = keyed(['a', 'b', 'a', 'c'], (t) => t);
    expect(after.slice(0, 3).map((x) => x.key)).toEqual(before.map((x) => x.key));
  });

  it('is empty for no items', () => {
    expect(keyed([], String)).toEqual([]);
  });
});
