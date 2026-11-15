// Tests the batches of practice answers: within the database's caps.
import { describe, expect, it } from 'vitest';
import { practiceBatches } from '../practiceBatches';

describe('the batches of practice', () => {
  it('never pass the database’s caps: 1,000 answers and 100 decks', () => {
    expect(practiceBatches([])).toEqual([]);
    expect(practiceBatches([{ deckId: '1', n: 3 }])).toEqual([[{ deckId: '1', n: 3 }]]);
    const big = practiceBatches([
      { deckId: '1', n: 1500 },
      { deckId: '2', n: 700 },
    ]);
    expect(big.map((b) => b.reduce((t, c) => t + c.n, 0))).toEqual([1000, 1000, 200]);
    expect(big.flat().reduce((t, c) => t + c.n, 0)).toBe(2200);
    const many = practiceBatches(Array.from({ length: 250 }, (_, i) => ({ deckId: `${i}`, n: 1 })));
    expect(many.map((b) => b.length)).toEqual([100, 100, 50]);
  });
});
