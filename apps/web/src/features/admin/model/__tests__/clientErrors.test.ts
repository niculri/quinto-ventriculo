// Tests «Errores» without React: who an account is, and the letters that stand for the people in what is copied.
import { describe, expect, it } from 'vitest';
import type { ClientErrorGroup } from '@qv/schema';
import { aliasesOf, personName } from '../clientErrors';

const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

describe('personName', () => {
  it('the name with the email, the email alone, or the start of the id', () => {
    const labels = [
      { id: id(1), email: 'ana@ug.uchile.cl', name: 'Ana' },
      { id: id(2), email: 'luis@ug.uchile.cl', name: null },
    ];
    expect(personName(id(1), labels)).toBe('Ana (ana@ug.uchile.cl)');
    expect(personName(id(2), labels)).toBe('luis@ug.uchile.cl');
    expect(personName(id(3), labels)).toBe('cuenta 00000000…');
  });
});

describe('aliasesOf', () => {
  it('a letter per account in the order they show up, the same person with the same letter, then AA, AB…', () => {
    const group = (accounts: string[]) => ({ accounts }) as unknown as ClientErrorGroup;
    const many = Array.from({ length: 28 }, (_, i) => id(i));
    const aliases = aliasesOf([group([id(5), id(0)]), group(many)]);
    expect(aliases.get(id(5))).toBe('alumno A');
    expect(aliases.get(id(0))).toBe('alumno B');
    expect(aliases.get(id(1))).toBe('alumno C');
    expect(aliases.get(id(27))).toBe('alumno AB');
    expect(aliases.size).toBe(28);
  });
});
