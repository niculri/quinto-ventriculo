// Tests the count with its noun: only 1 takes the singular, and the grouped one writes the thousands as Chile does.
import { describe, expect, it } from 'vitest';
import { plural, pluralGrouped } from '../plural';

describe('plural', () => {
  it('takes the singular only for 1', () => {
    expect(plural(1, 'pregunta', 'preguntas')).toBe('1 pregunta');
    expect(plural(0, 'pregunta', 'preguntas')).toBe('0 preguntas');
    expect(plural(2, 'pregunta', 'preguntas')).toBe('2 preguntas');
  });
  it('writes the number as it is, without a thousands separator', () => {
    expect(plural(1234, 'tarjeta', 'tarjetas')).toBe('1234 tarjetas');
  });
});

describe('pluralGrouped', () => {
  it('takes the singular only for 1', () => {
    expect(pluralGrouped(1, 'nota', 'notas')).toBe('1 nota');
    expect(pluralGrouped(0, 'nota', 'notas')).toBe('0 notas');
  });
  it('writes the thousands with a dot, as Chile does', () => {
    expect(pluralGrouped(1234, 'tarjeta', 'tarjetas')).toBe('1.234 tarjetas');
    expect(pluralGrouped(999, 'tarjeta', 'tarjetas')).toBe('999 tarjetas');
  });
});
