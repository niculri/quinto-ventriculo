// The flags of the study screen.
import { describe, expect, it } from 'vitest';
import { FLAGS } from '../flags';

describe('FLAGS', () => {
  it('are Anki’s seven, numbered from 1 with a distinct color each', () => {
    expect(FLAGS.map((f) => f.flag)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(FLAGS.map((f) => f.color)).size).toBe(7);
    expect(new Set(FLAGS.map((f) => f.label)).size).toBe(7);
  });

  it('have colors a stylesheet can read', () => {
    for (const f of FLAGS) expect(f.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
