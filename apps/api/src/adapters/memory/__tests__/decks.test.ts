// Tests for the decks of a bundle answered in memory: the counts of a tree, the order of subdecks and cards, the kinds.
import { describe, expect, it } from 'vitest';
import type { ContentBundle } from '@qv/schema';
import { bundle } from '../../../test/draftApp';
import { memoryDecks } from '../decks';

type Deck = ContentBundle['ankiDecks'][number];
type Note = ContentBundle['ankiNotes'][number];

const deck = (id: string, name: string, over: Partial<Deck> = {}): Deck => ({
  id,
  name,
  description: '',
  parentId: null,
  semester: 2,
  courseId: 'biologia-celular',
  assessmentId: null,
  preset: null,
  position: 0,
  ...over,
});

const note = (guid: string, code: string | null, cards: [number, string][], type = '1'): Note => ({
  guid,
  noteTypeId: type,
  fields: {},
  tags: [],
  code,
  version: 1,
  createdAt: null,
  cards: cards.map(([ord, deckId]) => ({
    ord,
    deckId,
    frontHtml: `f${guid}${ord}`,
    backHtml: `b${guid}${ord}`,
    sortField: `${guid}-${ord}`,
  })),
  hash: guid,
  updatedAt: '2026-10-31T12:00:00.000Z',
  media: [],
});

const noteType = (id: string, kind: 'normal' | 'cloze', occlusion: boolean) => ({
  id,
  name: `tipo ${id}`,
  kind,
  occlusion,
  fields: ['A'],
  templates: [{ name: 't', qfmt: '', afmt: '' }],
  css: `.t${id} {}`,
  sortField: 0,
});

const base: ContentBundle = {
  ...bundle('x'),
  ankiNoteTypes: [
    noteType('1', 'normal', false),
    noteType('2', 'cloze', false),
    noteType('3', 'cloze', true),
  ],
  ankiDecks: [
    deck('root', 'A::Raiz'),
    deck('b', 'A::Raiz::B', { parentId: 'root' }),
    deck('a', 'A::Raiz::A', { parentId: 'root' }),
    deck('deep', 'A::Raiz::B::Hondo', { parentId: 'b' }),
    deck('c', 'A::Raiz::C', { parentId: 'root' }),
    deck('orphan', 'Sin ramo', { courseId: null }),
  ],
  ankiNotes: [
    note('n1', 'T-2', [[0, 'root']]),
    note('n2', null, [[0, 'a']], '2'),
    note(
      'n3',
      'T-1',
      [
        [1, 'deep'],
        [0, 'b'],
      ],
      '3',
    ),
    note(
      'n4',
      'T-1',
      [
        [0, 'a'],
        [1, 'root'],
      ],
      '9',
    ),
  ],
};

const decks = memoryDecks(base);

describe('the tree', () => {
  const byId = () => new Map(decks.tree().decks.map((d) => [d.id, d]));

  it('a deck counts the notes and cards of everything below it, a note once', () => {
    expect(byId().get('root')).toMatchObject({ noteCount: 4, cardCount: 6 });
    expect(byId().get('b')).toMatchObject({ noteCount: 1, cardCount: 2 });
    expect(byId().get('orphan')).toMatchObject({ noteCount: 0, cardCount: 0 });
  });

  it('own, exclusive and closed notes tell where a note’s cards are', () => {
    const root = byId().get('root')!;
    expect([root.ownNoteCount, root.exclusiveNoteCount, root.closedNoteCount]).toEqual([2, 1, 2]);
    const a = byId().get('a')!;
    expect([a.ownNoteCount, a.exclusiveNoteCount, a.closedNoteCount]).toEqual([2, 1, 1]);
  });

  it('a note type is listed with the names of its templates', () => {
    expect(decks.tree().noteTypes[0]).toMatchObject({ id: '1', templates: ['t'] });
  });
});

describe('a deck', () => {
  it('without a course it is as if it did not exist, and so is an unknown one', () => {
    expect(decks.deck('orphan')).toBeNull();
    expect(decks.deck('nada')).toBeNull();
    expect(decks.courseOf('orphan')).toBeNull();
    expect(decks.courseOf('nada')).toBeNull();
    expect(decks.courseOf('b')).toBe('biologia-celular');
  });

  it('its subdecks go by depth first and by name inside a depth, with their own names', () => {
    const d = decks.deck('root')!;
    expect(d.subdecks.map((s) => [s.id, s.name, s.cardCount])).toEqual([
      ['a', 'A', 2],
      ['b', 'B', 2],
      ['c', 'C', 0],
      ['deep', 'Hondo', 1],
    ]);
    expect(d).toMatchObject({ name: 'Raiz', fullName: 'A::Raiz' });
  });

  it('its cards go by code, with the ones without a code last, then by guid and ord', () => {
    const d = decks.deck('root')!;
    expect(d.cards.map((c) => `${c.noteGuid}/${c.ord}`)).toEqual([
      'n3/0',
      'n3/1',
      'n4/0',
      'n4/1',
      'n1/0',
      'n2/0',
    ]);
  });

  it('a card is a cloze, an occlusion, or a basic one when its type is a plain one or unknown', () => {
    const kinds = Object.fromEntries(decks.deck('root')!.cards.map((c) => [c.noteGuid, c.kind]));
    expect(kinds).toEqual({ n1: 'basic', n2: 'cloze', n3: 'occlusion', n4: 'basic' });
  });
});

describe('a card', () => {
  it('is found by note and order, with the css of its type or none if the type is unknown', () => {
    expect(decks.card('n2', 0)).toMatchObject({ kind: 'cloze', css: '.t2 {}', front: 'fn20' });
    expect(decks.card('n4', 1)).toMatchObject({ deckId: 'root', css: '' });
  });

  it('a note without that order is not there', () => {
    expect(decks.card('n2', 1)).toBeNull();
    expect(decks.card('nada', 0)).toBeNull();
  });
});
