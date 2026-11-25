// Tests what is turned on: a switch per topic and per lecture, a week as all its topics, the rows saved before topics
// had switches, what was studied, and which decks give new cards.
import { describe, expect, it } from 'vitest';
import {
  activation,
  anyOn,
  decksGivingNew,
  switchesUnder,
  unitRows,
  unitState,
} from '../activation';
import { EMPTY_PLAN } from '../simple';
import type { StudyPlan } from '../simple';

// A course with a lecture (with Extras), a week with two topics (one with Extras) and its own Extras, and a week
// without topics.
const DECKS = [
  { id: 'c', name: 'R::S::C' },
  { id: 'a', name: 'R::S::C::A' },
  { id: 'l', name: 'R::S::C::A::L' },
  { id: 'l-x', name: 'R::S::C::A::L::Extras' },
  { id: 'w', name: 'R::S::C::A::W' },
  { id: 'v1', name: 'R::S::C::A::W::V1' },
  { id: 'v1-x', name: 'R::S::C::A::W::V1::Extras' },
  { id: 'v2', name: 'R::S::C::A::W::V2' },
  { id: 'w-x', name: 'R::S::C::A::W::Extras' },
  { id: 'k', name: 'R::S::C::A::K' },
];

const plan = (over: Partial<StudyPlan> = {}): StudyPlan => ({ ...EMPTY_PLAN, ...over });
const rows = (...pairs: [string, boolean][]) =>
  pairs.map(([deckId, active]) => ({ deckId, active }));
const onOf = (p: StudyPlan) => [...activation(DECKS, p).on].sort();

describe('the switches', () => {
  it('are the topics of a week and the units with nothing but Extras under them', () => {
    const a = activation(DECKS, EMPTY_PLAN);
    expect([...a.switches].sort()).toEqual(['k', 'l', 'v1', 'v2']);
    expect(a.topicsOf).toEqual(new Map([['w', ['v1', 'v2']]]));
    expect(a.on.size).toBe(0);
    expect(anyOn(DECKS, EMPTY_PLAN)).toBe(false);
  });

  it('a week turned on before topics had switches turns all its topics on', () => {
    expect(onOf(plan({ activations: rows(['w', true]) }))).toEqual(['v1', 'v2']);
  });

  it('a topic’s own row beats its week’s, in both directions', () => {
    expect(onOf(plan({ activations: rows(['w', true], ['v2', false]) }))).toEqual(['v1']);
    expect(onOf(plan({ activations: rows(['w', false], ['v2', true]) }))).toEqual(['v2']);
  });

  it('what was studied counts as on, by topic; a row made by hand beats it', () => {
    expect(onOf(plan({ answeredDecks: ['v1-x', 'l-x'] }))).toEqual(['l', 'v1']);
    expect(onOf(plan({ answeredDecks: ['v1'], activations: rows(['v1', false]) }))).toEqual([]);
    expect(onOf(plan({ answeredDecks: ['v1'], activations: rows(['w', false]) }))).toEqual([]);
  });

  it('a card answered in the week itself or its own Extras counts for all its topics', () => {
    expect(onOf(plan({ answeredDecks: ['w'] }))).toEqual(['v1', 'v2']);
    expect(onOf(plan({ answeredDecks: ['w-x'] }))).toEqual(['v1', 'v2']);
  });

  it('above a unit nothing is a switch, and decks missing from the list say nothing', () => {
    expect(onOf(plan({ activations: rows(['a', true], ['c', true]) }))).toEqual([]);
    expect(onOf(plan({ answeredDecks: ['a', 'nobody'] }))).toEqual([]);
    const lonely = [{ id: 'x', name: 'R::S::C::A::U::Sub' }];
    expect([...activation(lonely, plan({ answeredDecks: ['x'] })).on]).toEqual(['x']);
    expect([...activation(lonely, plan({ activations: rows(['u', true]) })).on]).toEqual([]);
  });
});

describe('a week or a lecture as a whole', () => {
  it('counts its topics that are on; a lecture is one; above, nothing', () => {
    const a = activation(DECKS, plan({ activations: rows(['v2', true]) }));
    expect(unitState(a, 'w')).toEqual({ on: 1, total: 2 });
    expect(unitState(a, 'l')).toEqual({ on: 0, total: 1 });
    expect(unitState(a, 'a')).toBeNull();
  });

  it('is saved as the week and each of its topics, or the lecture alone', () => {
    const a = activation(DECKS, EMPTY_PLAN);
    expect(unitRows(a, 'w', true)).toEqual(rows(['w', true], ['v1', true], ['v2', true]));
    expect(unitRows(a, 'l', false)).toEqual(rows(['l', false]));
  });

  it('the switches under a deck: its own, its topic’s, all its topics, or all of them below', () => {
    const a = activation(DECKS, EMPTY_PLAN);
    expect(switchesUnder(DECKS, a, 'v1-x')).toEqual(['v1']);
    expect(switchesUnder(DECKS, a, 'l')).toEqual(['l']);
    expect(switchesUnder(DECKS, a, 'w')).toEqual(['v1', 'v2']);
    expect(switchesUnder(DECKS, a, 'a').sort()).toEqual(['k', 'l', 'v1', 'v2']);
    expect(switchesUnder(DECKS, a, 'gone')).toEqual([]);
    expect(switchesUnder([{ id: 'x', name: 'R::S::C::A::U::Sub' }], a, 'x')).toEqual(['x']);
  });
});

describe('which decks give new cards', () => {
  it('above a unit always; a topic, its Extras only with the assessment’s Extras; a week’s own, with any topic', () => {
    const p = plan({ activations: rows(['v1', true]) });
    expect([...decksGivingNew(DECKS, p)].sort()).toEqual(['a', 'c', 'v1', 'w']);
    const withExtras = plan({
      activations: rows(['v1', true]),
      assessments: [{ deckId: 'a', includeExtras: true, newPerDay: null }],
    });
    expect([...decksGivingNew(DECKS, withExtras)].sort()).toEqual([
      'a',
      'c',
      'v1',
      'v1-x',
      'w',
      'w-x',
    ]);
  });

  it('a lecture turned on gives its cards; a deck under a unit missing from the list gives none', () => {
    expect(decksGivingNew(DECKS, plan({ activations: rows(['l', true]) })).has('l')).toBe(true);
    const lonely = [{ id: 'x', name: 'R::S::C::A::U::Sub::Deeper' }];
    expect([...decksGivingNew(lonely, plan({ activations: rows(['u', true]) }))]).toEqual([]);
  });

  it('an Extras whose assessment is missing from the list is left out', () => {
    const decks = [
      { id: 'u', name: 'R::S::C::A::U' },
      { id: 'e', name: 'R::S::C::A::U::Extras' },
    ];
    expect([...decksGivingNew(decks, plan({ activations: rows(['u', true]) }))]).toEqual(['u']);
  });
});
