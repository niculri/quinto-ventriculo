// Tests what the dry-run folder keeps, replaces and removes of a previous import, by the scope of the new one.
import type { ContentBundle } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { planAnki, planNotes, planQuizzes } from '../folderPlan';

const note = (id: string, assessmentId: string, hash = 'h', over: object = {}) =>
  ({ id, assessmentId, hash, updatedAt: `antes-${id}`, ...over }) as never;
const quiz = (id: string, assessmentId: string, hash = 'h', updatedAt = `antes-${id}`) =>
  ({ id, assessmentId, hash, updatedAt }) as never;
const bundleOf = (parts: object) =>
  ({
    notes: [],
    quizzes: [],
    ankiNotes: [],
    ankiDecks: [],
    ankiNoteTypes: [],
    ankiPresets: [],
    ...parts,
  }) as unknown as ContentBundle;

describe('planNotes', () => {
  const before = bundleOf({ notes: [note('a', 'x/1'), note('b', 'x/1'), note('c', 'y/1')] });
  const brought = bundleOf({
    notes: [note('a', 'x/1'), note('b', 'x/1', 'nuevo'), note('d', 'x/1')],
  });
  const scope = { notes: true, decks: false, assessments: ['x/1'] };

  it('tells the new and changed notes from the unchanged ones, and keeps the date of an unchanged one', () => {
    const plan = planNotes(before, brought, scope, false);
    expect(plan.changed).toEqual(['b', 'd']);
    expect(plan.unchanged).toEqual(['a']);
    expect(plan.notes.find((n) => n.id === 'a')!.updatedAt).toBe('antes-a');
  });

  it('a note of the scope that is not brought any more leaves; those of other assessments stay', () => {
    const gone = bundleOf({ notes: [note('a', 'x/1')] });
    const plan = planNotes(before, gone, scope, false);
    expect(plan.notes.map((n) => n.id)).toEqual(['c', 'a']);
    expect(plan.removed).toBe(1);
  });

  it('a partial import (keepOthers) removes nothing, and without notes in the scope everything stays', () => {
    const gone = bundleOf({ notes: [note('a', 'x/1')] });
    expect(planNotes(before, gone, scope, true)).toMatchObject({ removed: 0 });
    expect(
      planNotes(before, gone, scope, true)
        .notes.map((n) => n.id)
        .sort(),
    ).toEqual(['a', 'b', 'c']);
    const none = planNotes(before, brought, { notes: false, decks: true }, false);
    expect(none.notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(none).toMatchObject({ changed: [], unchanged: [], removed: 0 });
  });

  it('without --assessment a whole import removes every note that was not brought', () => {
    const plan = planNotes(
      before,
      bundleOf({ notes: [note('a', 'x/1')] }),
      { notes: true, decks: true },
      false,
    );
    expect(plan.notes.map((n) => n.id)).toEqual(['a']);
    expect(plan.removed).toBe(2);
  });
});

describe('planQuizzes', () => {
  const before = bundleOf({ quizzes: [quiz('a', 'x/1'), quiz('b', 'x/1'), quiz('c', 'y/1')] });

  it('keeps the date of an unchanged test, reports the changed, and removes only inside the scope', () => {
    const brought = bundleOf({
      quizzes: [quiz('a', 'x/1', 'h', 'ahora'), quiz('b', 'x/1', 'nuevo', 'ahora')],
    });
    const plan = planQuizzes(before, brought, { notes: false, decks: false, assessments: ['x/1'] });
    expect(plan).toMatchObject({ changed: ['b'], unchanged: ['a'], removed: 0 });
    expect(plan.quizzes.find((q) => q.id === 'a')!.updatedAt).toBe('antes-a');
    expect(plan.quizzes.find((q) => q.id === 'b')!.updatedAt).toBe('ahora');
    const gone = planQuizzes(before, bundleOf({ quizzes: [quiz('a', 'x/1')] }), {
      notes: false,
      decks: false,
      assessments: ['x/1'],
    });
    expect(gone.quizzes.map((q) => q.id)).toEqual(['c', 'a']);
    expect(gone.removed).toBe(1);
  });

  it('a test that was removed from every assessment goes when there is no --assessment', () => {
    const plan = planQuizzes(before, bundleOf({}), { notes: false, decks: false });
    expect(plan.quizzes).toEqual([]);
    expect(plan.removed).toBe(3);
  });
});

describe('planAnki', () => {
  const deck = (id: string, name: string, assessmentId: string | null, preset = 'P') =>
    ({ id, name, assessmentId, preset }) as never;
  const ankiNote = (guid: string, deckId: string, hash = 'h', noteTypeId = 't') =>
    ({ guid, hash, noteTypeId, updatedAt: `antes-${guid}`, cards: [{ ord: 0, deckId }] }) as never;
  const type = (id: string) => ({ id, name: id }) as never;
  const preset = (name: string) => ({ name, config: {} }) as never;

  const before = bundleOf({
    ankiDecks: [deck('1', 'Raíz', null), deck('2', 'Raíz::X', 'x/1'), deck('3', 'Raíz::Y', 'y/1')],
    ankiNotes: [ankiNote('a', '2'), ankiNote('b', '2'), ankiNote('c', '3', 'h', 'u')],
    ankiNoteTypes: [type('t'), type('u'), type('viejo')],
    ankiPresets: [preset('P'), preset('Q')],
  });
  const brought = bundleOf({
    ankiDecks: [deck('2', 'Raíz::X', 'x/1')],
    ankiNotes: [ankiNote('a', '2'), ankiNote('b', '9', 'nuevo')],
    ankiNoteTypes: [type('t')],
    ankiPresets: [preset('P')],
  });
  const scope = { notes: false, decks: true, assessments: ['x/1'] };

  it('keeps the date of an unchanged note, counts the changed, the removed, the moved and the retired cards', () => {
    const plan = planAnki(before, brought, scope);
    expect(plan.changed).toEqual(['b']);
    expect(plan.unchanged).toEqual(['a']);
    expect(plan.removed).toBe(0);
    expect(plan.moved).toBe(1);
    expect(plan.anki.ankiNotes.find((n) => n.guid === 'a')!.updatedAt).toBe('antes-a');
  });

  it('with --assessment the notes and decks of the others stay, and so do the parents above the scope', () => {
    const plan = planAnki(before, brought, scope);
    expect(plan.anki.ankiNotes.map((n) => n.guid)).toEqual(['c', 'a', 'b']);
    expect(plan.anki.ankiDecks.map((d) => d.name)).toEqual(['Raíz', 'Raíz::X', 'Raíz::Y']);
  });

  it('a whole import removes the notes and decks that were not brought; the shared types go only when nothing uses them', () => {
    const plan = planAnki(before, brought, { notes: true, decks: true });
    expect(plan.anki.ankiNotes.map((n) => n.guid)).toEqual(['a', 'b']);
    expect(plan.removed).toBe(1);
    expect(plan.anki.ankiDecks.map((d) => d.id)).toEqual(['2']);
    expect(plan.anki.ankiNoteTypes.map((t) => t.id)).toEqual(['t']);
    expect(plan.anki.ankiPresets.map((p) => p.name)).toEqual(['P']);
  });

  it('keeps the gymkana of a deck that stays, takes the new one of a deck brought again and drops one whose deck left', () => {
    const gym = (deckId: string, label: string) => ({
      deckId,
      regions: [{ tag: 'r', label }],
      sources: [],
    });
    const plan = planAnki(
      { ...before, ankiGymkanas: [gym('2', 'vieja'), gym('3', 'otra'), gym('9', 'sin mazo')] },
      { ...brought, ankiGymkanas: [gym('2', 'nueva')] },
      scope,
    );
    expect(plan.anki.ankiGymkanas.map((g) => g.regions[0]!.label)).toEqual(['otra', 'nueva']);
    expect(planAnki(before, brought, scope).anki.ankiGymkanas).toEqual([]);
  });

  it('a type or preset of the previous import that the notes and decks left still use is kept next to the new ones', () => {
    const plan = planAnki(before, brought, scope);
    expect(plan.anki.ankiNoteTypes.map((t) => t.id)).toEqual(['u', 't']);
    expect(plan.anki.ankiPresets.map((p) => p.name)).toEqual(['P']);
  });

  it('a card of a deck that the previous catalog does not know is not of any assessment', () => {
    const odd = bundleOf({ ankiNotes: [ankiNote('z', 'fantasma')] });
    const plan = planAnki(odd, bundleOf({}), scope);
    expect(plan.removed).toBe(0);
    expect(plan.anki.ankiNotes.map((n) => n.guid)).toEqual(['z']);
  });
});
