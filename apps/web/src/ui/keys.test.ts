import { describe, expect, it } from 'vitest';
import { formatKeys } from './keys';

describe('shortcuts as the system writes them', () => {
  it('on Windows and Linux they stay as written', () => {
    expect(formatKeys('Ctrl+K', false)).toBe('Ctrl+K');
    expect(formatKeys('Ctrl+Mayús+J', false)).toBe('Ctrl+Mayús+J');
  });

  it('on a Mac Ctrl is ⌘, Alt is ⌥ and Mayús is ⇧, without the plus signs', () => {
    expect(formatKeys('Ctrl+K', true)).toBe('⌘K');
    expect(formatKeys('Ctrl+Mayús+J', true)).toBe('⌘⇧J');
    expect(formatKeys('Ctrl+Alt+N', true)).toBe('⌘⌥N');
    expect(formatKeys('Ctrl+3', true)).toBe('⌘3');
  });
});
