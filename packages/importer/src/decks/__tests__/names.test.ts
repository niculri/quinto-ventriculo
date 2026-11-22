// Tests the rules of the names and ids of the decks: their levels, the dates of Anki's ids and the container ids.
import { describe, expect, it } from 'vitest';
import { ImportError } from '../../ImportError';
import {
  checkDeckName,
  containerDeckId,
  createdAt,
  levelOf,
  safeDecode,
  sameConfig,
} from '../names';

const EXPECTED = ['() Medicina UCH', '1° Semestre', '🦴 Anatomía I', 'Certamen 1'];

describe('createdAt', () => {
  it('is the date in the id of the note, between 2006 and 2100 and no other (the bounds are in)', () => {
    expect(createdAt(String(Date.UTC(2026, 9, 31, 12)))).toBe('2026-10-31T12:00:00.000Z');
    expect(createdAt(String(Date.UTC(2006, 0, 1)))).toBe('2006-01-01T00:00:00.000Z');
    expect(createdAt(String(Date.UTC(2005, 11, 31, 23, 59, 59)))).toBeNull();
    expect(createdAt(String(Date.UTC(2100, 0, 1)))).toBe('2100-01-01T00:00:00.000Z');
    expect(createdAt(String(Date.UTC(2100, 0, 1) + 1))).toBeNull();
  });

  it('an id that is not a number is not a date', () => {
    expect(createdAt('abc')).toBeNull();
  });
});

describe('containerDeckId', () => {
  it('has 19 digits, never starts with 0, and is a function of the whole name', () => {
    const id = containerDeckId('() Medicina UCH::1° Semestre');
    expect(id).toMatch(/^[1-9]\d{18}$/);
    expect(containerDeckId('() Medicina UCH::1° Semestre')).toBe(id);
    expect(containerDeckId('() Medicina UCH::1° Semestre ')).not.toBe(id);
  });
});

describe('levelOf', () => {
  it('a deck knows the semester from the second level, the course from the third and the assessment from the fourth', () => {
    expect(levelOf('A', 1, 'c', 'c/x')).toEqual({
      semester: null,
      courseId: null,
      assessmentId: null,
    });
    expect(levelOf('A::B', 1, 'c', 'c/x')).toEqual({
      semester: 1,
      courseId: null,
      assessmentId: null,
    });
    expect(levelOf('A::B::C', 1, 'c', 'c/x')).toEqual({
      semester: 1,
      courseId: 'c',
      assessmentId: null,
    });
    expect(levelOf('A::B::C::D::E', 1, 'c', 'c/x')).toEqual({
      semester: 1,
      courseId: 'c',
      assessmentId: 'c/x',
    });
  });
});

describe('checkDeckName', () => {
  const message = (name: string, hasCards = false) => {
    try {
      checkDeckName('a.apkg', name, EXPECTED, hasCards);
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      return (e as Error).message;
    }
    return '';
  };

  it('names the level that does not match and what it should say', () => {
    expect(message('() Medicina UCH::2° Semestre')).toContain(
      '«2° Semestre» donde va el semestre («1° Semestre»',
    );
    expect(message('Otra::1° Semestre')).toContain('«Otra» donde va la raíz');
    expect(message('() Medicina UCH::1° Semestre::🦴 Otro::Certamen 1')).toContain(
      'donde va el ramo',
    );
    expect(message('() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 2')).toContain(
      'donde va el certamen',
    );
  });

  it('only the levels the name has are compared, and a deeper name is not', () => {
    expect(message('() Medicina UCH')).toBe('');
    expect(message(`${EXPECTED.join('::')}::S1 - Semana::Mazo`, true)).toBe('');
  });

  it('a deck with cards must be inside an assessment; one without cards may be a parent', () => {
    expect(message('() Medicina UCH::1° Semestre', true)).toContain(
      'tiene tarjetas, pero no está dentro de un certamen',
    );
    expect(message(EXPECTED.join('::'), true)).toBe('');
    expect(message('() Medicina UCH::1° Semestre', false)).toBe('');
  });
});

describe('sameConfig', () => {
  it('ignores the id, the modification time and the sync counter, and nothing else', () => {
    const a = { id: 1, mod: 2, usn: 3, new: { perDay: 20 } };
    expect(sameConfig(a, { id: 9, mod: 8, usn: 7, new: { perDay: 20 } })).toBe(true);
    expect(sameConfig(a, { id: 1, mod: 2, usn: 3, new: { perDay: 21 } })).toBe(false);
    expect(sameConfig({ new: 1 }, { new: 1, extra: 0 })).toBe(false);
  });
});

describe('safeDecode', () => {
  it('decodes escapes and leaves a name with a broken one as it is', () => {
    expect(safeDecode('a%20b.png')).toBe('a b.png');
    expect(safeDecode('100%.png')).toBe('100%.png');
  });
});
