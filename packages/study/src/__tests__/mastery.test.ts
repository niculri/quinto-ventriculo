// Dominio: the average of what one would remember today over a deck’s seen cards, which leave it out, how it reads, and
// how many cards of each deck were seen.
import { describe, expect, it } from 'vitest';
import { retrievability } from '@qv/srs';
import { masteryByDeck, masteryPercent, seenByDeck } from '../mastery';
import {
  ASSESSMENT,
  CARDS,
  EXTRAS,
  NOON,
  ROOT,
  UNIT1,
  UNIT2,
  makeData,
  reviewRow,
  rowFor,
  summary,
} from './studyData';

const [n1o0, n1o1, n2o0, n3o0, n4o0] = CARDS as [
  ReturnType<typeof summary>,
  ReturnType<typeof summary>,
  ReturnType<typeof summary>,
  ReturnType<typeof summary>,
  ReturnType<typeof summary>,
];
/** With the default FSRS parameters, a card is 90 % remembered once as many days as its stability have passed. */
const atNinety = (c: typeof n1o0, over = {}) =>
  reviewRow(c, { stability: 10, lastDaysAgo: 10, ...over });

describe('masteryByDeck', () => {
  it('a card seen as long ago as its stability is 90 % remembered; one never seen does not count', () => {
    const data = makeData({ rows: [atNinety(n1o0)] });
    const m = masteryByDeck(data, NOON);
    expect(m.get(UNIT1)).toBeCloseTo(0.9, 6);
    expect(m.has(UNIT2)).toBe(false);
  });

  it('every deck of the tree gets the average of the cards below it', () => {
    const data = makeData({ rows: [atNinety(n1o0), atNinety(n3o0)] });
    const m = masteryByDeck(data, NOON);
    expect(m.get(UNIT1)).toBeCloseTo(0.9, 6);
    expect(m.get(UNIT2)).toBeCloseTo(0.9, 6);
    expect(m.get(ASSESSMENT)).toBeCloseTo(0.9, 6);
    expect(m.get(ROOT)).toBe(m.get(ASSESSMENT));
  });

  it('the longer ago a card was seen, the less of it is remembered, and just seen is nearly all', () => {
    const at = (lastDaysAgo: number) =>
      masteryByDeck(makeData({ cards: [n3o0], rows: [atNinety(n3o0, { lastDaysAgo })] }), NOON).get(
        UNIT2,
      )!;
    expect(at(0)).toBe(1);
    expect(at(40)).toBeLessThan(at(10));
    expect(at(10)).toBeLessThan(at(1));
  });

  it('a suspended card is not part of the average', () => {
    const data = makeData({
      rows: [atNinety(n1o0), atNinety(n1o1, { suspended: true, lastDaysAgo: 0 })],
    });
    expect(masteryByDeck(data, NOON).get(UNIT1)).toBeCloseTo(0.9, 6);
  });

  it('a forgotten card (new again, with a memory still stored) does not count, and one without a last review counts 0', () => {
    const forgotten = rowFor(n1o0, {
      stability: 10,
      difficulty: 5,
      lastReview: new Date(NOON).toISOString(),
    });
    const noLast = atNinety(n1o1, { lastReview: null });
    const m = masteryByDeck(makeData({ rows: [forgotten, noLast, atNinety(n2o0)] }), NOON);
    expect(m.get(UNIT1)).toBeCloseTo(0.9 / 2, 6);
  });

  it('a card with stability but no difficulty is read as medium difficulty', () => {
    const noDifficulty = atNinety(n3o0, { difficulty: null });
    const same = atNinety(n3o0);
    const only = (row: typeof same) =>
      masteryByDeck(makeData({ cards: [n3o0], rows: [row] }), NOON).get(UNIT2);
    expect(only(noDifficulty)).toBe(only(same));
  });

  it('Extras count only when the assessment includes them', () => {
    const rows = [atNinety(n4o0)];
    const without = masteryByDeck(makeData({ rows }), NOON);
    expect(without.has(EXTRAS)).toBe(false);
    expect(without.has(ASSESSMENT)).toBe(false);
    const plan = {
      activations: [],
      answeredDecks: [],
      medianAnswerMs: null,
      assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: null }],
    };
    const included = masteryByDeck(makeData({ rows, over: { plan } }), NOON);
    expect(included.get(EXTRAS)).toBeCloseTo(0.9, 6);
    expect(included.get(ASSESSMENT)).toBeCloseTo(0.9, 6);
  });

  it('a deck with nothing seen has no value, not a division by zero', () => {
    const m = masteryByDeck(makeData({ cards: [n3o0] }), NOON);
    expect(m.has(UNIT1)).toBe(false);
  });

  it('uses the preset’s own FSRS parameters: another decay remembers another share after as many days', () => {
    const sharp = Array.from({ length: 21 }, (_, i) => (i === 20 ? 0.9 : 1));
    const row = atNinety(n3o0, { lastDaysAgo: 20 });
    const of = (config: Record<string, unknown>) =>
      masteryByDeck(
        makeData({
          cards: [n3o0],
          rows: [row],
          over: { authorPresets: [{ name: 'Default', config }] },
        }),
        NOON,
      ).get(UNIT2)!;
    expect(of({ fsrsParams6: sharp })).toBeCloseTo(
      retrievability(sharp, { stability: 10, difficulty: 5 }, 20),
      10,
    );
    expect(of({ fsrsParams6: sharp })).not.toBeCloseTo(of({}), 2);
  });
});

describe('masteryPercent', () => {
  it('rounds to a whole percent', () => {
    expect(masteryPercent(0.624)).toBe(62);
    expect(masteryPercent(1)).toBe(100);
  });

  it('says 1 % for a little, since 0 would say nothing happened, and 0 for nothing', () => {
    expect(masteryPercent(0.001)).toBe(1);
    expect(masteryPercent(0)).toBe(0);
    expect(masteryPercent(-0.2)).toBe(0);
  });
});

describe('masteryByDeck at the edges of the tree', () => {
  it('studying one unit measures it and what is below it, not the decks above', () => {
    const data = makeData({ rootId: UNIT1, rows: [atNinety(n1o0)] });
    const m = masteryByDeck(data, NOON);
    expect([...m.keys()]).toEqual([UNIT1]);
    expect(m.get(UNIT1)).toBeCloseTo(0.9, 6);
  });

  it('a card of a deck missing from the list is measured with the default parameters, and no deck of the tree counts it', () => {
    const lost = summary('lost', 0, 'gone');
    const base = makeData({ rows: [atNinety(lost)] });
    const data = { ...base, deck: { ...base.deck, cards: [lost] } };
    const m = masteryByDeck(data, NOON);
    expect(m.size).toBe(0);
    expect(seenByDeck(data).get(ROOT)).toEqual({ seen: 0, total: 0 });
  });

  it('an Extras deck whose assessment is not in the list counts as left out', () => {
    const data = makeData({ rows: [atNinety(n4o0)] });
    const decks = data.decks.filter((d) => d.id !== ASSESSMENT);
    expect(masteryByDeck({ ...data, decks }, NOON).has(EXTRAS)).toBe(false);
  });
});

describe('seenByDeck', () => {
  it('counts the cards answered at least once over all of them, up the tree; a forgotten one is new again', () => {
    const forgotten = rowFor(n1o1, { stability: 10, difficulty: 5 });
    const seen = seenByDeck(
      makeData({ rows: [atNinety(n1o0), forgotten, atNinety(n3o0, { suspended: true })] }),
    );
    expect(seen.get(UNIT1)).toEqual({ seen: 1, total: 3 });
    expect(seen.get(UNIT2)).toEqual({ seen: 1, total: 1 });
    expect(seen.get(ASSESSMENT)).toEqual({ seen: 2, total: 4 });
  });

  it('leaves out the Extras of an assessment that does not include them', () => {
    const seen = seenByDeck(makeData({ rows: [atNinety(n4o0)] }));
    expect(seen.get(EXTRAS)).toEqual({ seen: 0, total: 0 });
    expect(seen.get(ROOT)).toEqual({ seen: 0, total: 4 });
  });
});
