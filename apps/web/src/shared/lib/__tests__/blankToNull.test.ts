// Tests that blankToNull() turns none and the empty text into null and keeps any other text as it is.
import { describe, expect, it } from 'vitest';
import { blankToNull } from '../blankToNull';

describe('blankToNull', () => {
  it('gives null for none and for the empty text', () => {
    expect(blankToNull(undefined)).toBeNull();
    expect(blankToNull(null)).toBeNull();
    expect(blankToNull('')).toBeNull();
  });

  it('keeps any other text, spaces included', () => {
    expect(blankToNull('a')).toBe('a');
    expect(blankToNull(' ')).toBe(' ');
  });
});
