// Tests which removed and added notes are one note with a changed GUID, how alike two masks are and which ords
// changed meaning.
import { describe, expect, it } from 'vitest';
import { changedGuids, maskOverlap, renumbered, similarity } from '../cardChanges';

describe('the helpers', () => {
  it('similarity and the codes of a changed GUID', () => {
    expect(similarity('El ribosoma', 'el  ribosoma')).toBe(1);
    expect(similarity('abc', 'xyz')).toBe(0);
    expect(
      changedGuids(
        [{ guid: 'a', code: 'T-A1-S3-01-047', text: 'x' }],
        [{ guid: 'b', code: 'T-A1-S3-01-047.2', text: 'y' }],
      ),
    ).toEqual([expect.objectContaining({ why: 'code' })]);
  });

  it('mask overlap, and renumbered or moved', () => {
    const a = 'rect:left=0.1:top=0.1:width=0.1:height=0.1';
    expect(maskOverlap(a, a)).toBe(1);
    expect(maskOverlap(a, 'rect:left=0.5:top=0.5:width=0.1:height=0.1')).toBe(0);
    expect(renumbered({ 0: '7' }, { 0: '7', 1: '8' }, false)).toEqual({
      renumbered: [],
      moved: [],
    });
  });
});

describe('the text helpers of the review', () => {
  it('similarity is 0 when either text has fewer than two letters, and 1 when they are the same after trimming and folding case', () => {
    expect(similarity('a', 'b')).toBe(0);
    expect(similarity('abc', 'x')).toBe(0);
    expect(similarity('', 'abc')).toBe(0);
    expect(similarity(' Hola  Mundo ', 'hola mundo')).toBe(1);
    expect(similarity('night', 'nacht')).toBeCloseTo(0.25, 5);
  });

  it('a removed note with a very short text is never paired by its text, even with the same text added', () => {
    expect(
      changedGuids(
        [{ guid: 'a', code: null, text: 'corto' }],
        [{ guid: 'b', code: null, text: 'corto' }],
      ),
    ).toEqual([]);
    expect(
      changedGuids(
        [{ guid: 'a', code: null, text: 'abcdefgh' }],
        [{ guid: 'b', code: null, text: 'short' }],
      ),
    ).toEqual([]);
  });
});

describe('masks as boxes', () => {
  const rect = (left: number, top: number, w: number, h: number) =>
    `rect:left=${left}:top=${top}:width=${w}:height=${h}`;

  it('an ellipse is read as the box of its radii, so one that is the same ellipse overlaps itself', () => {
    const ellipse = 'ellipse:left=.1:top=.1:rx=.05:ry=.03';
    expect(maskOverlap(ellipse, ellipse)).toBe(1);
    expect(maskOverlap(ellipse, rect(0.1, 0.1, 0.1, 0.06))).toBe(1);
    expect(maskOverlap(ellipse, 'ellipse:left=.5:top=.5:rx=.05:ry=.03')).toBe(0);
  });

  it('a shape that cannot be put in a box is left out, and if nothing is left the masks are equal only if the text is', () => {
    expect(maskOverlap('polygon:points=1,2', 'polygon:points=1,2')).toBe(1);
    expect(maskOverlap('polygon:points=1,2', 'polygon:points=3,4')).toBe(0);
    expect(maskOverlap('polygon:points=1,2', rect(0, 0, 1, 1))).toBe(0);
    expect(maskOverlap(`polygon:points=1,2;${rect(0, 0, 1, 1)}`, rect(0, 0, 1, 1))).toBe(1);
    expect(maskOverlap('ellipse:left=.1:top=.1:rx=.05', 'ellipse:left=.1:top=.1:rx=.05')).toBe(1);
  });

  it('boxes with no area never overlap, and a box inside another overlaps by the share it covers', () => {
    expect(maskOverlap(rect(0, 0, 0, 0), rect(0, 0, 0, 0))).toBe(0);
    expect(maskOverlap(rect(0, 0, 2, 1), rect(0, 0, 1, 1))).toBe(0.5);
  });

  it('with several shapes the worse side decides, so adding a shape lowers the overlap', () => {
    const one = rect(0, 0, 0.1, 0.1);
    const two = `${one};${rect(0.5, 0.5, 0.1, 0.1)}`;
    expect(maskOverlap(one, two)).toBe(0.5);
    expect(maskOverlap(two, one)).toBe(0.5);
  });

  it('negative coordinates are read, and a missing one makes the shape unreadable', () => {
    expect(
      maskOverlap(
        'rect:left=-.1:top=-.1:width=.2:height=.2',
        'rect:left=-.1:top=-.1:width=.2:height=.2',
      ),
    ).toBe(1);
    expect(maskOverlap('rect:left=.1:width=.2:height=.2', 'rect:left=.1:width=.2:height=.2')).toBe(
      1,
    );
    expect(maskOverlap('rect:left=.1:width=.2:height=.2', 'rect:left=.2:width=.2:height=.2')).toBe(
      0,
    );
  });

  it('two masks that move are listed in order of their number', () => {
    const r = renumbered(
      { '0': rect(0, 0, 0.1, 0.1), '1': rect(0.5, 0.5, 0.1, 0.1), '2': rect(0.2, 0.2, 0.05, 0.05) },
      {
        '0': rect(0.8, 0.8, 0.1, 0.1),
        '1': rect(0.9, 0.1, 0.1, 0.1),
        '2': rect(0.2, 0.2, 0.05, 0.05),
      },
      true,
    );
    expect(r).toEqual({ renumbered: [], moved: [0, 1] });
    expect(
      renumbered({ '0': 'a', '1': 'b', '2': 'c' }, { '0': 'b', '1': 'a', '2': 'c' }, false),
    ).toEqual({
      renumbered: [0, 1],
      moved: [],
    });
  });

  it('a new ord, or one with the same text, changes nothing', () => {
    expect(renumbered({ '0': 'a' }, { '0': 'a', '1': 'b' }, false)).toEqual({
      renumbered: [],
      moved: [],
    });
  });
});

describe('how alike two texts must be to be one note', () => {
  const note = (guid: string, text: string) => ({ guid, code: null, text });

  it('exactly 80 % is enough, and a little less is not', () => {
    expect(similarity('abcdefghijk', 'abcdefghizz')).toBeCloseTo(0.8, 10);
    expect(changedGuids([note('a', 'abcdefghijk')], [note('b', 'abcdefghizz')])).toHaveLength(1);
    expect(changedGuids([note('a', 'abcdefghijk')], [note('b', 'abcdefghzzz')])).toEqual([]);
  });

  it('a removed text of 7 characters is too short to pair by its text, one of 8 is not', () => {
    expect(changedGuids([note('a', 'abcdefg')], [note('b', 'abcdefgh')])).toEqual([]);
    expect(changedGuids([note('a', 'abcdefgh')], [note('b', 'abcdefgh')])).toHaveLength(1);
    expect(changedGuids([note('a', 'abcdefgh')], [note('b', 'abcdefg')])).toEqual([]);
  });
});

describe('the edges of what counts as the same', () => {
  it('two letters are enough to compare: «ab» is two thirds of «abc»', () => {
    expect(similarity('ab', 'abc')).toBeCloseTo(2 / 3, 5);
  });

  it('a mask that keeps half of its box is still the same mask, one that keeps less is another', () => {
    const whole = 'rect:left=0:top=0:width=.5:height=.5';
    const half = 'rect:left=0:top=0:width=.25:height=.5';
    const less = 'rect:left=0:top=0:width=.125:height=.5';
    expect(renumbered({ 1: whole }, { 1: half }, true)).toEqual({ renumbered: [], moved: [] });
    expect(renumbered({ 1: whole }, { 1: less }, true)).toEqual({ renumbered: [], moved: [1] });
  });
});
