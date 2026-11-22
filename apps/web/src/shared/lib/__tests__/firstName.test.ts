// Tests firstName: the first word of the full name, or nothing.
import { describe, expect, it } from 'vitest';
import { firstName } from '../firstName';

describe('firstName', () => {
  it('takes the first word of the full name', () => {
    expect(firstName('Ana María Pérez Soto')).toBe('Ana');
    expect(firstName('  Ana   Pérez ')).toBe('Ana');
  });

  it('is undefined without a name', () => {
    expect(firstName(null)).toBeUndefined();
    expect(firstName(undefined)).toBeUndefined();
    expect(firstName('')).toBeUndefined();
    expect(firstName('   ')).toBeUndefined();
  });
});
