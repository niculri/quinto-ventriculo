// Tests the rows a history step keeps and puts back, without changing the ones it is given.
import { describe, expect, it } from 'vitest';
import { blankRow } from '../../session';
import { restoreRows, snapshotRows, withRows } from '../history';
import { deepFreeze } from './freeze';

const a = { noteGuid: 'a', ord: 0, deckId: '1' };
const b = { noteGuid: 'b', ord: 0, deckId: '1' };
const key = (c: { noteGuid: string; ord: number }) => `${c.noteGuid}\u001f${c.ord}`;

describe('the rows before a step', () => {
  const rows = deepFreeze(new Map([[key(a), { ...blankRow(a), reps: 2 }]]));

  it('a card without a row is kept as absent, and putting it back takes the new row away', () => {
    const before = snapshotRows(rows, [a, b]);
    expect(before).toEqual([
      [key(a), rows.get(key(a))],
      [key(b), undefined],
    ]);
    const changed = withRows(rows, [{ ...blankRow(a), reps: 3 }, blankRow(b)]);
    expect(changed.size).toBe(2);
    expect(restoreRows(changed, before)).toEqual(rows);
  });

  it('changes nothing it is given', () => {
    const before = deepFreeze(snapshotRows(rows, [a]));
    expect(() => restoreRows(rows, before)).not.toThrow();
    expect(() => withRows(rows, [blankRow(b)])).not.toThrow();
    expect(rows.size).toBe(1);
  });

  it('a card named twice is kept once', () => {
    expect(snapshotRows(rows, [a, a])).toHaveLength(1);
  });
});
