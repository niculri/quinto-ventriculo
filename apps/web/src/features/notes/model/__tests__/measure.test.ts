// Tests the measure of an article's lines: 70 letters unless the address asks for another one it knows.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MEASURE, MEASURES, measureOf } from '../measure';
import { COLUMN_PX } from '../figures';

describe('the measure of an article', () => {
  it('is 70 letters by default, and 65, 75 or the whole column when the address asks', () => {
    expect(DEFAULT_MEASURE).toBe('70');
    expect(measureOf('')).toBe('70');
    expect(measureOf('?measure=65')).toBe('65');
    expect(measureOf('?x=1&measure=75')).toBe('75');
    expect(measureOf('?measure=full')).toBe('full');
    expect(MEASURES.full).toBe(COLUMN_PX);
  });

  it('ignores what it does not know, also what an object has on its prototype', () => {
    expect(measureOf('?measure=90')).toBe('70');
    expect(measureOf('?measure=toString')).toBe('70');
  });

  it('grows with the letters, and never past the column', () => {
    expect(MEASURES['65']).toBeLessThan(MEASURES['70']);
    expect(MEASURES['70']).toBeLessThan(MEASURES['75']);
    expect(MEASURES['75']).toBeLessThan(COLUMN_PX);
  });
});
