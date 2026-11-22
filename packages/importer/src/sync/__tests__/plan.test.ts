// Tests the pure decisions of a save: moved cards and what a scoped import must not change.
import { describe, expect, it } from 'vitest';
import { cardMoves, sharedConflicts } from '../plan';

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
