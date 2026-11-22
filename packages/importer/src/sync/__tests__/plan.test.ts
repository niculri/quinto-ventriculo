// Tests the pure decisions of a save: moved cards and what a scoped import must not change.
import { ContentBundle } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import {
  cardMoves,
  partitionByHash,
  planIndexes,
  pruneKeep,
  sharedConflictError,
  sharedConflicts,
} from '../plan';

describe('cardMoves', () => {
  it('counts the cards in another deck and those that are gone; the same deck is nothing', () => {
    const before = [
      {
        guid: 'a',
        cards: [
          { ord: 0, deckId: '1' },
          { ord: 1, deckId: '1' },
        ],
      },
      { guid: 'b', cards: [{ ord: 0, deckId: '1' }] },
    ];
    const after = [
      { guid: 'a', cards: [{ ord: 0, deckId: '2' }] },
      { guid: 'c', cards: [{ ord: 0, deckId: '1' }] },
    ];
    expect(cardMoves(before, after)).toEqual({ moved: 1, retired: 2 });
    expect(cardMoves(before, before)).toEqual({ moved: 0, retired: 0 });
  });
});

describe('sharedConflicts (--assessment and what the whole site shares)', () => {
  const type = {
    id: '1',
    name: 'Básica',
    kind: 'normal' as const,
    occlusion: false,
    fields: ['Frente'],
    templates: [{ name: 'Tarjeta 1', qfmt: '{{Frente}}', afmt: '{{Frente}}' }],
    css: '',
    sortField: 0,
  };
  const deck = (id: string, assessmentId: string | null, preset = 'Default') =>
    ({ id, assessmentId, preset }) as never;
  const note = (guid: string, deckId: string) =>
    ({ guid, noteTypeId: '1', cards: [{ deckId }] }) as never;
  const before = {
    ankiNoteTypes: [type],
    ankiPresets: [{ name: 'Default', config: { new: { perDay: 20 } } }],
    ankiDecks: [deck('9', null), deck('10', 'a/c1'), deck('20', 'b/c1')],
    ankiNotes: [note('x', '10'), note('y', '20')],
  };
  const scope = { notes: true, decks: true, tests: true, assessments: ['a/c1'] };

  it('what another assessment uses and would change, by name and by who uses it', () => {
    expect(
      sharedConflicts(
        before,
        {
          ankiNoteTypes: [{ ...type, css: 'p {}' }],
          ankiPresets: [{ name: 'Default', config: {} }],
        },
        scope,
      ),
    ).toEqual([
      { kind: 'noteType', id: '1', name: 'Básica', usedBy: ['b/c1'] },
      { kind: 'preset', id: 'Default', name: 'Default', usedBy: ['b/c1'] },
    ]);
  });

  it('nothing if it is the same (whatever the order of the keys), new, only theirs, or a whole import', () => {
    const same = {
      ankiNoteTypes: [{ ...type }],
      ankiPresets: [{ config: { new: { perDay: 20 } }, name: 'Default' }],
    };
    expect(sharedConflicts(before, same, scope)).toEqual([]);
    const changed = {
      ankiNoteTypes: [
        { ...type, id: '2' },
        { ...type, css: 'p {}' },
      ],
      ankiPresets: [{ name: 'Otro', config: {} }],
    };
    const onlyA = {
      ...before,
      ankiNotes: [note('x', '10')],
      ankiDecks: before.ankiDecks.slice(0, 2),
    };
    expect(sharedConflicts(onlyA, changed, scope)).toEqual([]);
    expect(sharedConflicts(before, changed, { ...scope, assessments: undefined })).toEqual([]);
    expect(sharedConflicts(before, changed, { ...scope, decks: false })).toEqual([]);
  });
});

describe('partitionByHash', () => {
  it('splits the items by whether their hash is the one already saved, keeping the order', () => {
    const items = [
      { id: 'a', hash: '1' },
      { id: 'b', hash: '2' },
      { id: 'c', hash: '3' },
    ];
    const saved = new Map([
      ['a', '1'],
      ['b', 'old'],
    ]);
    expect(partitionByHash(items, (i) => saved.get(i.id))).toEqual({
      changed: [items[1], items[2]],
      unchanged: [items[0]],
    });
  });
});

describe('planIndexes', () => {
  const index = (assessmentId: string, hash: string) => ({ record: { assessmentId, hash } });
  const packed = [index('a/1', 'h1'), index('a/2', 'h2')];

  it('writes the indexes whose hash is not the saved one and removes the saved ones that are gone', () => {
    const known = new Map([
      ['a/1', 'h1'],
      ['a/2', 'old'],
      ['b/3', 'h3'],
    ]);
    expect(planIndexes(packed, known, null)).toEqual({
      changed: [packed[1]],
      unchanged: 1,
      remove: ['b/3'],
    });
  });

  it('with a scope, removes only inside it', () => {
    const known = new Map([
      ['b/3', 'h3'],
      ['c/4', 'h4'],
    ]);
    expect(planIndexes([], known, ['c/4']).remove).toEqual(['c/4']);
  });
});

describe('pruneKeep', () => {
  const bundle = ContentBundle.parse({
    semesters: [],
    courses: [],
    assessments: [],
    notes: [],
  });

  it('keeps what the import brings complete: nothing of the notes of a partial import', () => {
    expect(pruneKeep(bundle, { notes: true, decks: false, partialNotes: true })).toEqual({
      assessments: null,
      quizzes: [],
    });
    expect(pruneKeep(bundle, { notes: true, decks: false, tests: false })).toEqual({
      assessments: null,
      notes: [],
    });
  });

  it('names the assessments it is limited to, and the decks when it brings them', () => {
    const keep = pruneKeep(bundle, { notes: false, decks: true, assessments: ['a/1'] });
    expect(keep).toEqual({
      assessments: ['a/1'],
      quizzes: [],
      anki: { noteGuids: [], deckIds: [], noteTypeIds: [], presets: [] },
    });
  });
});

describe('sharedConflictError', () => {
  it('is an error of the material that names each note type and preset and who uses it', () => {
    const e = sharedConflictError([
      { kind: 'noteType', id: '1', name: 'Básica', usedBy: ['a/1', 'b/2'] },
      { kind: 'preset', id: 'P', name: 'P', usedBy: ['a/1'] },
    ]);
    expect(e.kind).toBe('material');
    expect(e.message).toContain(
      'el tipo de nota «Básica» (lo usa a/1, b/2); el preset «P» (lo usa a/1)',
    );
  });
});
