// Tests how the catalog counts decks and groups an assessment's notes.
import { describe, expect, it } from 'vitest';
import type { AnkiTreeDeck, Catalog, NoteSummary } from '@qv/schema';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { countDecks, materialLabel, noteBlocks } from '../catalog';

const withDecks = (decks: AnkiTreeDeck[]): Catalog => ({
  ...CATALOG,
  anki: { ...CATALOG.anki, decks },
});
const deck = (
  id: string,
  parentId: string | null,
  cardCount: number,
  assessmentId = 'a/1',
): AnkiTreeDeck => ({
  ...CATALOG.anki.decks[0]!,
  id,
  name: id,
  parentId,
  courseId: 'c',
  assessmentId,
  cardCount,
});

describe('countDecks', () => {
  it('a deck with its subdecks is one, and the decks above them with no cards of their own are none', () => {
    expect(countDecks(CATALOG, 'anatomia-1')).toBe(1);
    expect(countDecks(CATALOG, 'anatomia-1', 'anatomia-1/certamen-1')).toBe(1);
    expect(countDecks(CATALOG, 'anatomia-1', 'anatomia-1/otro')).toBe(0);
    expect(countDecks(CATALOG, 'biologia-celular')).toBe(0);
  });

  it('subdecks of a deck without cards of its own count each; of one with cards, not', () => {
    const decks = [deck('p', null, 5), deck('p::a', 'p', 2), deck('p::b', 'p', 3)];
    expect(countDecks(withDecks(decks), 'c')).toBe(2);
    expect(countDecks(withDecks([...decks.slice(0, 2), deck('p::b', 'p', 2)]), 'c')).toBe(1);
  });

  it('a deck whose parent is not in the catalog counts by itself', () => {
    expect(countDecks(withDecks([deck('x', 'gone', 3)]), 'c')).toBe(1);
  });
});

describe('materialLabel', () => {
  it.each([
    [1, 1, '1 apunte · 1 mazo'],
    [2, 0, '2 apuntes'],
    [0, 3, '3 mazos'],
    [0, 0, ''],
  ])('%i notes and %i decks read «%s»', (notes, decks, label) => {
    expect(materialLabel(notes, decks)).toBe(label);
  });
});

describe('noteBlocks', () => {
  const note = (id: string, kind: NoteSummary['kind'], group?: string): NoteSummary => ({
    ...CATALOG.semesters[1]!.courses[0]!.assessments[0]!.notes[0]!,
    id,
    slug: id,
    kind,
    ...(group ? { group } : {}),
  });

  it('the weeks in the order of their first note, a week cut by another starting again, then the rest by kind', () => {
    const blocks = noteBlocks([
      note('s1', 'seminar'),
      note('a', 'lecture', 'Semana 1'),
      note('b', 'seminar', 'Semana 1'),
      note('c', 'lecture', 'Semana 2'),
      note('d', 'lecture', 'Semana 1'),
      note('r', 'summary'),
      note('l', 'lecture'),
    ]);
    expect(blocks.map((b) => [b.title, b.notes.map((n) => n.id)])).toEqual([
      ['Semana 1', ['a', 'b']],
      ['Semana 2', ['c']],
      ['Semana 1', ['d']],
      ['Clases', ['l']],
      ['Seminarios', ['s1']],
      ['Resúmenes', ['r']],
    ]);
    expect(new Set(blocks.map((b) => b.key)).size).toBe(blocks.length);
  });
});
