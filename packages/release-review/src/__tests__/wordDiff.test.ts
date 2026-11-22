// Tests the words that change between two texts, as runs of the same, deleted and added text.
import { describe, expect, it } from 'vitest';
import { wordDiff } from '../wordDiff';

describe('wordDiff', () => {
  const text = (parts: ReturnType<typeof wordDiff>) => parts.map((p) => `${p.op}:${p.text}`);

  it('the same text is one same part, and an empty text has no parts', () => {
    expect(wordDiff('a b', 'a b')).toEqual([{ op: 'same', text: 'a b' }]);
    expect(wordDiff('', '')).toEqual([]);
  });

  it('keeps what both share and shows what went out and what came in, joined as runs', () => {
    expect(text(wordDiff('a b c d e', 'a x c y e'))).toEqual([
      'same:a ',
      'del:b',
      'add:x',
      'same: c ',
      'del:d',
      'add:y',
      'same: e',
    ]);
    expect(text(wordDiff('a b c', 'a c'))).toEqual(['same:a ', 'del:b ', 'same:c']);
    expect(text(wordDiff('a c', 'a b c'))).toEqual(['same:a ', 'add:b ', 'same:c']);
  });

  it('words that only come out, or only go in, at the end are runs of their own', () => {
    expect(text(wordDiff('a b c d', 'a'))).toEqual(['same:a', 'del: b c d']);
    expect(text(wordDiff('a', 'a b c d'))).toEqual(['same:a', 'add: b c d']);
    expect(text(wordDiff('x y', 'z w'))).toEqual(['del:x', 'add:z', 'same: ', 'del:y', 'add:w']);
  });

  it('a text too long for the table goes out and comes in whole, around what is shared at both ends', () => {
    const words = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
    const before = `start ${words('a', 2100)} end`;
    const after = `start ${words('b', 2100)} end`;
    const parts = wordDiff(before, after);
    expect(parts.map((p) => p.op)).toEqual(['same', 'del', 'add', 'same']);
    expect(parts[0]!.text).toBe('start ');
    expect(parts[3]!.text).toBe(' end');
    expect(parts[1]!.text.startsWith('a0 ')).toBe(true);
    expect(parts[2]!.text.startsWith('b0 ')).toBe(true);
  });

  it('too long and with nothing shared, there is no «same» part', () => {
    const words = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
    expect(wordDiff(words('a', 2100), words('b', 2100)).map((p) => p.op)).toEqual(['del', 'add']);
  });

  it('tells a changed word between what both share', () => {
    expect(
      wordDiff('el ribosoma tiene dos subunidades', 'el ribosoma tiene tres subunidades'),
    ).toEqual([
      { op: 'same', text: 'el ribosoma tiene ' },
      { op: 'del', text: 'dos' },
      { op: 'add', text: 'tres' },
      { op: 'same', text: ' subunidades' },
    ]);
    expect(wordDiff('', 'nuevo')).toEqual([{ op: 'add', text: 'nuevo' }]);
  });
});

describe('the edges of what counts as the same', () => {
  it('a change is told word by word up to 4 000 000 cells of its table, and as a whole after that', () => {
    const words = (prefix: string, count: number, lead: string) =>
      `${lead}${Array.from({ length: count }, (_, i) => `${prefix}${i}`).join(' ')}`;
    // 1 000 words and 1 000 spaces on each side: 2 000 × 2 000 cells, the last one the table takes.
    const exact = wordDiff(words('a', 1000, ' '), words('b', 1000, '\t'));
    expect(exact.some((part) => part.op === 'same')).toBe(true);
    const over = wordDiff(words('a', 1001, ' '), words('b', 1001, '\t'));
    expect(over.map((part) => part.op)).toEqual(['del', 'add']);
  });
});
