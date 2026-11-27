// Tests the notes of the cards page: their text without the spaces the index leaves around signs, and their lectures in
// the order of the deck list.
import { describe, expect, it } from 'vitest';
import type { CardIndexNote } from '@qv/schema';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { explorerNotes, tidyText } from '../explorer';

describe('tidyText', () => {
  it.each([
    ['con el esqueleto axial .', 'con el esqueleto axial.'],
    ['plano frontal puro : sí', 'plano frontal puro: sí'],
    ['la « pequeña llave »', 'la «pequeña llave»'],
    ['( C1 ) , C2 ; C3 ! ¿ por qué ?', '(C1), C2; C3! ¿por qué?'],
    ['[ hueco ] …', '[hueco]…'],
    ['{{c1:: atlas ::hint}}', '{{c1:: atlas::hint}}'],
    ['nada que cambiar', 'nada que cambiar'],
  ])('«%s» is «%s»', (text, tidy) => {
    expect(tidyText(text)).toBe(tidy);
  });
});

describe('explorerNotes', () => {
  const note = (guid: string, deckId: string): CardIndexNote => ({
    ...CARD_INDEX.notes[0]!,
    guid,
    topic: 'Tema ,',
    front: 'Frente .',
    back: '« Reverso »',
    cards: [{ ord: 0, deckId }],
  });
  const indexes = [
    { assessmentId: 'c/c3', notes: [note('s10-a', 'S10'), note('s10-b', 'S10')] },
    { assessmentId: 'c/c3', notes: [note('s11-a', 'S11'), note('s09-a', 'S09')] },
  ];

  it('puts the lectures in the deck list’s order, and keeps the index’s order within each', () => {
    const order = ['S09', 'S10', 'S11'];
    const notes = explorerNotes(
      indexes,
      (d) => d,
      new Map(),
      (id) => order.indexOf(id),
    );
    expect(notes.map((n) => [n.note.guid, n.index])).toEqual([
      ['s09-a', 0],
      ['s10-a', 1],
      ['s10-b', 2],
      ['s11-a', 3],
    ]);
  });

  it('without an order, keeps the indexes’ one, and shows the text without the spaces around signs', () => {
    const notes = explorerNotes(indexes, (d) => d, new Map());
    expect(notes.map((n) => n.note.guid)).toEqual(['s10-a', 's10-b', 's11-a', 's09-a']);
    expect(notes[0]!.note).toMatchObject({ topic: 'Tema,', front: 'Frente.', back: '«Reverso»' });
  });
});
