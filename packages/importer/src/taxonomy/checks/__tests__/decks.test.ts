// Tests the deck checks: which deck is of which unit, and what a card's deck and topic must agree on.
import { describe, expect, it } from 'vitest';
import { checkDecks } from '../decks';
import { A, B, ankiNote, contextOf, deck, mapOf, taxonomyOf } from './contexts';

const unit = (id: string, decks: string[] | undefined, topics: string[]) => ({
  id,
  title: id,
  ...(decks ? { decks } : {}),
  topics: topics.map((t) => ({ id: t, title: t })),
});

const DECKS = [
  deck('1', 'Raíz::C1', A),
  deck('2', 'Raíz::C1::Semana', A, '1'),
  deck('3', 'Raíz::C1::Semana::Mazo', A, '2'),
  deck('9', 'Raíz::C2::Otro', B),
];

describe('checkDecks', () => {
  it('a card is of the unit of its closest deck that belongs to one, and its topic has to be of that unit', () => {
    const ctx = contextOf(
      taxonomyOf([unit('u1', ['Semana'], ['t1']), unit('u2', ['Mazo'], ['t2'])]),
      mapOf([
        { guid: 'g1', topic: 't2' },
        { guid: 'g2', topic: 't1' },
      ]),
      { decks: DECKS, ankiNotes: [ankiNote('g1', ['3']), ankiNote('g2', ['3'])] },
    );
    expect(checkDecks(ctx)).toBe(2);
    expect(ctx.problems.all()).toEqual([
      'La tarjeta 0 de la nota g2 es de la unidad u2 (su mazo), y su tema t1 «t1» es de la unidad u1.',
    ]);
  });

  it('the unit of a card is inherited from the deck above, and a card out of every unit is said with its deck’s name', () => {
    const ctx = contextOf(
      taxonomyOf([unit('u1', ['Semana'], ['t1'])]),
      mapOf([{ guid: 'g1', topic: 't1' }]),
      { decks: DECKS, ankiNotes: [ankiNote('g1', ['3', '1'])] },
    );
    checkDecks(ctx);
    expect(ctx.problems.all()).toEqual([
      'La tarjeta 1 de la nota g1 está en el mazo «Raíz::C1», que no es de ninguna unidad.',
    ]);
  });

  it('a deck that the reference matches twice is ambiguous, and the message lists them by their name from the assessment', () => {
    const decks = [
      ...DECKS,
      deck('4', 'Raíz::C1::Otra', A, '1'),
      deck('5', 'Raíz::C1::Otra::Mazo', A, '4'),
    ];
    const ctx = contextOf(taxonomyOf([unit('u1', ['Mazo'], ['t1'])]), mapOf(), { decks });
    checkDecks(ctx);
    expect(ctx.problems.all()).toEqual([
      `La unidad u1 nombra el mazo «Mazo», y en ${A} hay 2 así: usa el nombre desde el certamen («Semana::Mazo», «Otra::Mazo»).`,
    ]);
  });

  it('a deck that does not exist is said, and the reference may be the whole name from the assessment', () => {
    const ctx = contextOf(
      taxonomyOf([unit('u1', ['Semana::Mazo', 'No existe'], ['t1'])]),
      mapOf([{ guid: 'g1', topic: 't1' }]),
      { decks: DECKS, ankiNotes: [ankiNote('g1', ['3'])] },
    );
    expect(checkDecks(ctx)).toBe(1);
    expect(ctx.problems.all()).toEqual([
      `La unidad u1 nombra el mazo «No existe», que no está en ${A}.`,
    ]);
  });

  it('a deck that is outside the tree of the assessment keeps its whole name in the messages', () => {
    const decks = [deck('1', 'Raíz::C1', A), deck('2', 'Suelto', A)];
    const ctx = contextOf(taxonomyOf([unit('u1', ['Raíz::C1'], ['t1'])]), mapOf(), {
      decks,
      ankiNotes: [ankiNote('g1', ['2'])],
    });
    checkDecks(ctx);
    expect(ctx.problems.all()).toContain(
      'La tarjeta 0 de la nota g1 está en el mazo «Suelto», que no es de ninguna unidad.',
    );
  });

  it('a note with no card in the assessment’s decks is not looked at, and one whose map code is another says what it is', () => {
    const ctx = contextOf(
      taxonomyOf([unit('u1', ['Semana'], ['t1'])]),
      mapOf([
        { guid: 'g1', topic: 't1', code: 'T-X-1' },
        { guid: 'g2', topic: 't1', code: 'T-X-2' },
      ]),
      {
        decks: DECKS,
        ankiNotes: [
          ankiNote('g1', ['3']),
          ankiNote('g2', ['3'], { code: 'T-X-2' }),
          ankiNote('g3', ['9']),
        ],
      },
    );
    expect(checkDecks(ctx)).toBe(2);
    expect(ctx.problems.all()).toEqual([
      'El mapa dice que la nota g1 es T-X-1, y es una nota sin código.',
    ]);
  });

  it('a note of the map whose cards are in another assessment’s decks is an error that names its code', () => {
    const ctx = contextOf(
      taxonomyOf([unit('u1', ['Semana'], ['t1'])]),
      mapOf([
        { guid: 'g3', topic: 't1', code: 'T-X-3' },
        { guid: 'g4', topic: 't1' },
      ]),
      { decks: DECKS, ankiNotes: [ankiNote('g3', ['9']), ankiNote('g4', ['9'])] },
    );
    checkDecks(ctx);
    expect(ctx.problems.all()).toEqual([
      `La nota T-X-3 del mapa no es de ${A}: sus tarjetas están en mazos de otra evaluación.`,
      `La nota g4 del mapa no es de ${A}: sus tarjetas están en mazos de otra evaluación.`,
    ]);
  });

  it('without decks in this import the check is skipped and says so', () => {
    const ctx = contextOf(taxonomyOf([]), mapOf(), { op: { decks: false } });
    expect(checkDecks(ctx)).toBe(0);
    expect(ctx.unchecked).toEqual(['mazos']);
  });
});
