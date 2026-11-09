import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREDITS_FILE, checkCredits } from './credits';
import { privateMaterial } from './private-folder';

const TODAY = '2026-11-09';
const person = (over: object = {}) => ({
  name: 'Persona Inventada',
  group: 'material',
  permission: { date: '2026-11-01', how: 'mensaje del 1-11' },
  ...over,
});

describe('content/credits.json: a name only with a written permission and its date (step 2.7)', () => {
  it('an empty list and a complete row pass', () => {
    expect(checkCredits({ people: [] }, TODAY)).toEqual([]);
    expect(checkCredits({ people: [person()] }, TODAY)).toEqual([]);
  });

  it('a row without the date or the way of the permission, or a teacher, does not', () => {
    expect(checkCredits({}, TODAY)).toEqual(['falta la lista «people»']);
    expect(checkCredits({ people: [person({ permission: { how: 'sí' } })] }, TODAY)).toEqual([
      'Persona Inventada: sin la fecha del permiso (AAAA-MM-DD)',
    ]);
    expect(
      checkCredits({ people: [person({ permission: { date: '2026-02-30', how: 'sí' } })] }, TODAY),
    ).toEqual(['Persona Inventada: sin la fecha del permiso (AAAA-MM-DD)']);
    expect(
      checkCredits({ people: [person({ permission: { date: '2026-12-01', how: 'sí' } })] }, TODAY),
    ).toEqual(['Persona Inventada: el permiso tiene fecha futura (2026-12-01)']);
    expect(
      checkCredits({ people: [person({ permission: { date: '2026-11-01', how: ' ' } })] }, TODAY),
    ).toEqual(['Persona Inventada: sin decir cómo dio el permiso']);
    expect(checkCredits({ people: [person({ group: 'teachers' })] }, TODAY)).toEqual([
      'Persona Inventada: grupo «teachers» (material, pad, reports, other)',
    ]);
    expect(checkCredits({ people: [person(), person()] }, TODAY)).toEqual([
      'Persona Inventada: repetido',
    ]);
    expect(checkCredits({ people: [person({ name: '' })] }, TODAY)).toEqual(['fila 1: sin nombre']);
  });

  // The private repository's file: where it is; skipped in the public CI.
  const PRIVATE = privateMaterial();
  it.skipIf(!PRIVATE.content)(
    PRIVATE.content
      ? 'the private content/credits.json names nobody without a dated permission'
      : `the private content/credits.json (se salta: ${PRIVATE.skipReason})`,
    () => {
      const file = join(PRIVATE.content!, CREDITS_FILE);
      expect(existsSync(file)).toBe(true);
      const today = new Date().toISOString().slice(0, 10);
      expect(checkCredits(JSON.parse(readFileSync(file, 'utf8')), today)).toEqual([]);
    },
  );
});
