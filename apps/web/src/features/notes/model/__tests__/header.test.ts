// Tests the texts of an article's header: the line under the title, the code with its version and the dates.
import { describe, expect, it } from 'vitest';
import type { NoteHeader } from '@qv/schema';
import { headerParts, noteDates, versionedCode } from '../header';

const header: NoteHeader = { term: 'autumn', year: 2025 };

describe('headerParts', () => {
  it('a header without a number nor a base starts with the term, and skips what it lacks', () => {
    expect(headerParts('lecture', header)).toEqual(['Semestre de otoño 2025']);
  });

  it('a base for another lecture says so, before the number would', () => {
    expect(
      headerParts('lecture', { ...header, number: '7', baseFor: '8', lecturer: 'Prof. X' }),
    ).toEqual(['Apunte base para la clase 8 en adelante', 'Prof. X', 'Semestre de otoño 2025']);
    expect(headerParts('lecture', { ...header, number: '7' })[0]).toBe('Clase 7');
  });
});

describe('versionedCode', () => {
  it.each([
    [{ id: 'AP-1', code: 'QV-1', version: 3 }, 'QV-1.3'],
    [{ id: 'AP-1', code: 'QV-1' }, 'QV-1'],
    [{ id: 'AP-1', version: 3 }, 'AP-1'],
  ])('%j is shown as %s', (note, shown) => {
    expect(versionedCode(note)).toBe(shown);
  });
});

describe('noteDates', () => {
  const published = '2026-11-01T12:00:00.000Z';
  const changed = '2026-11-03T12:00:00.000Z';
  const updatedAt = '2026-10-30T12:00:00.000Z';

  it('a first version only says when it was published; later ones also when they changed', () => {
    expect(
      noteDates({ version: 1, publishedAt: published, versionAt: changed, updatedAt }),
    ).toEqual([expect.stringMatching(/^Creado/)]);
    expect(
      noteDates({ version: 2, publishedAt: published, versionAt: changed, updatedAt }),
    ).toEqual([expect.stringMatching(/^Creado/), expect.stringMatching(/^Actualizado/)]);
    expect(noteDates({ version: 2, publishedAt: published, updatedAt })).toHaveLength(1);
  });

  it('a note from before the articles gives its creation day, when known, and its last change', () => {
    expect(noteDates({ createdOn: '2026-09-01', updatedAt })).toEqual([
      expect.stringMatching(/^Creado/),
      expect.stringMatching(/^Actualizado/),
    ]);
    expect(noteDates({ updatedAt })).toEqual([expect.stringMatching(/^Actualizado/)]);
    expect(noteDates({ version: 2, updatedAt })).toEqual([expect.stringMatching(/^Actualizado/)]);
  });
});
