// Tests the cloud target's batches.
import { describe, expect, it } from 'vitest';
import { batches } from '../cloud';

describe('the image cache, --assessment and the batches', () => {
  it('batches: in order, by bytes and by count; a piece bigger than the limit goes alone', () => {
    const items = ['a'.repeat(10), 'b'.repeat(10), 'c'.repeat(50), 'd', 'e', 'f'];
    expect(batches(items, 30, 10).map((b) => b.map((x) => x[0]).join(''))).toEqual([
      'ab',
      'c',
      'def',
    ]);
    expect(batches(items, 1000, 2).map((b) => b.length)).toEqual([2, 2, 2]);
    expect(batches([], 10, 10)).toEqual([]);
  });
});
