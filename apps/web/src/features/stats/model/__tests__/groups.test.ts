// Tests how the heatmap groups a day's decks (by course on the home page, by assessment on a course's) and where each
// group links to.
import type { AnkiTreeDeck, Catalog } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { heatmapGroups } from '../groups';

const extra = (id: string, name: string, over: Partial<AnkiTreeDeck>): AnkiTreeDeck => ({
  ...CATALOG.anki.decks[0]!,
  id,
  name,
  parentId: null,
  ...over,
});

// Física has a deck but no page for it (no semester), and a deck points to a course the catalog does not have.
const catalog: Catalog = {
  ...CATALOG,
  anki: {
    ...CATALOG.anki,
    decks: [
      ...CATALOG.anki.decks,
      extra('40', 'Física suelta', { courseId: 'fisica' }),
      extra('41', 'Ramo que ya no existe', { courseId: 'borrado', semester: 2 }),
      extra('42', 'Sin::semestre::Biología::Certamen 2', {
        courseId: 'biologia-celular',
        assessmentId: 'biologia-celular/certamen-2',
      }),
    ],
  },
};

describe('on the home page, by course', () => {
  const groups = heatmapGroups(catalog, 'course');

  it('puts every deck of a course under the course, with its emoji', () => {
    expect(['3', '4', '20', '21'].map(groups.groupOf)).toEqual(Array(4).fill('🦴 Anatomía I'));
  });

  it('links the course to its own deck page', () => {
    expect(groups.placeOf('🦴 Anatomía I')?.id).toBe('3');
  });

  it('puts the decks without a known course under «Otros mazos», which is no link', () => {
    expect(groups.groupOf('41')).toBe('Otros mazos');
    expect(groups.groupOf('1')).toBe('Otros mazos');
    expect(groups.groupOf('nada')).toBe('Otros mazos');
    expect(groups.placeOf('Otros mazos')).toBeNull();
  });

  it('shows a course without a deck page as a group, but not as a link', () => {
    expect(groups.groupOf('40')).toBe('🧲 Física');
    expect(groups.placeOf('🧲 Física')).toBeNull();
  });

  it('has no whole course without one', () => {
    expect(groups.whole).toBeNull();
  });
});

describe('on a course’s page, by assessment', () => {
  const groups = heatmapGroups(catalog, 'assessment', 'anatomia-1');

  it('puts the decks under their assessment’s name, and links it to the assessment’s deck', () => {
    expect(['4', '5', '20', '21'].map(groups.groupOf)).toEqual(Array(4).fill('Certamen 1'));
    expect(groups.placeOf('Certamen 1')?.id).toBe('4');
  });

  it('puts the course’s own deck, which has no assessment, under the course’s name', () => {
    expect(groups.groupOf('3')).toBe('Anatomía I');
    expect(groups.placeOf('Anatomía I')?.id).toBe('3');
  });

  it('shows an assessment whose deck has no page as a group, but not as a link', () => {
    expect(groups.groupOf('42')).toBe('Certamen 2');
    expect(groups.placeOf('Certamen 2')).toBeNull();
  });

  it('links the whole to the course’s deck', () => {
    expect(groups.whole?.id).toBe('3');
  });
});
