// The order of the due cards by each review order of a preset, and of the new cards by each sort order.
import { describe, expect, it } from 'vitest';
import { newCard } from '../../card';
import type { CardRecord } from '../../card';
import { defaultConfig } from '../../config';
import type { ReviewCardOrder } from '../../config';
import { fnvInts, sqlFnvHash } from '../../random';
import type { QueueCard } from '../base';
import { reviewOrder, sortNew } from '../sort';

const NOW = 1_800_000_000;
const DAY = 86_400;
const timing = { now: NOW, today: 20_000, nextDayAt: NOW + 30_000 };

const reviewRecord = (over: Partial<CardRecord>): CardRecord => ({
  ...newCard(0),
  phase: 'review',
  queue: 'review',
  due: timing.today,
  interval: 10,
  stability: 10,
  difficulty: 5,
  lastReview: NOW - 10 * DAY,
  reps: 3,
  ...over,
});

let counter = 0;
const due = (name: string, over: Partial<CardRecord> = {}, deckId = '1', ord = 0): QueueCard => ({
  noteGuid: name,
  ord,
  deckId,
  index: counter++,
  record: reviewRecord(over),
  hidden: false,
});

const sorted = (order: ReviewCardOrder, cards: QueueCard[], ranks = new Map<string, number>()) => {
  const config = { ...defaultConfig(), reviewOrder: order, desiredRetention: 0.9 };
  const deckRank = new Map([
    ['1', 0],
    ['2', 1],
  ]);
  return [...cards].sort(reviewOrder(config, timing, deckRank, ranks)).map((c) => c.noteGuid);
};

describe('review orders', () => {
  it('«day» puts the longest overdue first', () => {
    const cards = [due('c', { due: 20_000 }), due('a', { due: 19_990 }), due('b', { due: 19_995 })];
    expect(sorted('day', cards)).toEqual(['a', 'b', 'c']);
  });

  it('«dayThenDeck» orders by day and, within a day, by the deck’s place in the list', () => {
    const cards = [
      due('late-1', { due: 20_000 }, '1'),
      due('early-2', { due: 19_999 }, '2'),
      due('late-2', { due: 20_000 }, '2'),
      due('early-1', { due: 19_999 }, '1'),
    ];
    expect(sorted('dayThenDeck', cards)).toEqual(['early-1', 'early-2', 'late-1', 'late-2']);
  });

  it('«deckThenDay» finishes a deck before the next, whatever the day', () => {
    const cards = [
      due('late-1', { due: 20_000 }, '1'),
      due('early-2', { due: 19_999 }, '2'),
      due('early-1', { due: 19_999 }, '1'),
    ];
    expect(sorted('deckThenDay', cards)).toEqual(['early-1', 'late-1', 'early-2']);
  });

  it('a deck outside the ranking counts as the first one', () => {
    const cards = [due('known', {}, '2'), due('unknown', {}, 'elsewhere')];
    expect(sorted('deckThenDay', cards)).toEqual(['unknown', 'known']);
  });

  it('interval orders go from the shortest or from the longest', () => {
    const cards = [
      due('b', { interval: 20 }),
      due('a', { interval: 3 }),
      due('c', { interval: 90 }),
    ];
    expect(sorted('intervalsAscending', cards)).toEqual(['a', 'b', 'c']);
    expect(sorted('intervalsDescending', cards)).toEqual(['c', 'b', 'a']);
  });

  it('with FSRS, «ease ascending» starts with the hardest cards and «descending» with the easiest', () => {
    const cards = [
      due('mid', { difficulty: 5 }),
      due('hard', { difficulty: 9 }),
      due('easy', { difficulty: 2 }),
    ];
    expect(sorted('easeAscending', cards)).toEqual(['hard', 'mid', 'easy']);
    expect(sorted('easeDescending', cards)).toEqual(['easy', 'mid', 'hard']);
  });

  it('a card without a memory state counts as difficulty zero', () => {
    const cards = [due('none', { difficulty: null }), due('some', { difficulty: 4 })];
    expect(sorted('easeDescending', cards)).toEqual(['none', 'some']);
  });

  it('retrievability orders weigh how forgotten a card is against how much was wanted', () => {
    const cards = [
      due('fresh', { stability: 10, lastReview: NOW - DAY }),
      due('forgotten', { stability: 10, lastReview: NOW - 60 * DAY }),
      due('due-today', { stability: 10, lastReview: NOW - 10 * DAY }),
    ];
    expect(sorted('retrievabilityAscending', cards)).toEqual(['forgotten', 'due-today', 'fresh']);
    expect(sorted('retrievabilityDescending', cards)).toEqual(['fresh', 'due-today', 'forgotten']);
  });

  it('a stable card that is only a bit late is less urgent than a fragile one that is as late', () => {
    const cards = [
      due('stable', { stability: 200, lastReview: NOW - 30 * DAY }),
      due('fragile', { stability: 5, lastReview: NOW - 30 * DAY }),
    ];
    expect(sorted('retrievabilityAscending', cards)).toEqual(['fragile', 'stable']);
  });

  it('a card with no memory state or no last review has nothing to weigh and goes with the remembered ones', () => {
    const cards = [
      due('no-memory', { stability: null, difficulty: null }),
      due('never', { lastReview: null }),
      due('forgotten', { stability: 10, lastReview: NOW - 60 * DAY }),
    ];
    expect(sorted('retrievabilityAscending', cards)[0]).toBe('forgotten');
  });

  it('a card reviewed «in the future» counts as just reviewed, not as a negative time', () => {
    const cards = [
      due('future', { lastReview: NOW + 5 * DAY }),
      due('forgotten', { lastReview: NOW - 60 * DAY }),
    ];
    expect(sorted('retrievabilityDescending', cards)).toEqual(['future', 'forgotten']);
  });

  it('«added» keeps the notes in the order they were added and a note’s cards in template order', () => {
    const cards = [
      due('b', {}, '1', 1),
      due('a', {}, '1', 1),
      due('b', {}, '1', 0),
      due('a', {}, '1', 0),
    ];
    const ranks = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const names = (order: ReviewCardOrder) =>
      [...cards]
        .sort(reviewOrder({ ...defaultConfig(), reviewOrder: order }, timing, new Map(), ranks))
        .map((c) => `${c.noteGuid}${c.ord}`);
    expect(names('added')).toEqual(['a0', 'a1', 'b0', 'b1']);
    expect(names('reverseAdded')).toEqual(['b0', 'b1', 'a0', 'a1']);
  });

  it('a note with no place in the ranking is ranked by the card’s own order', () => {
    const cards = [due('later'), due('earlier')];
    cards[0]!.index = 9;
    cards[1]!.index = 2;
    expect(sorted('added', cards)).toEqual(['earlier', 'later']);
    expect(sorted('reverseAdded', cards)).toEqual(['later', 'earlier']);
  });
});

describe('ties between cards that the order does not tell apart', () => {
  const ids = (card: bigint, mtime: bigint) => ({ card, note: 0n, mtime });

  it('are broken at random, the same way every time, by hashing the card id and its modification time', () => {
    const a = due('a');
    const b = due('b');
    a.ids = ids(11n, 5n);
    b.ids = ids(12n, 5n);
    const expected = sqlFnvHash(11n, 5n) < sqlFnvHash(12n, 5n) ? -1 : 1;
    for (const order of ['day', 'intervalsAscending', 'random'] as const) {
      const cmp = reviewOrder(
        { ...defaultConfig(), reviewOrder: order },
        timing,
        new Map(),
        new Map(),
      );
      expect(Math.sign(cmp(a, b))).toBe(expected);
      expect(Math.sign(cmp(b, a))).toBe(-expected);
    }
  });

  it('does not depend on the position in the list: a card is the same random value wherever it stands', () => {
    const cards = Array.from({ length: 12 }, (_, i) => due(`n${i}`));
    const cmp = reviewOrder(
      { ...defaultConfig(), reviewOrder: 'random' },
      timing,
      new Map(),
      new Map(),
    );
    const forward = [...cards].sort(cmp).map((c) => c.noteGuid);
    const backward = [...cards]
      .reverse()
      .sort(cmp)
      .map((c) => c.noteGuid);
    expect(backward).toEqual(forward);
    expect(forward).not.toEqual(cards.map((c) => c.noteGuid));
  });

  it('a card with no stored ids is hashed by its note and ord, so two cards of one note still differ', () => {
    const first = due('same', {}, '1', 0);
    const second = due('same', {}, '1', 1);
    const cmp = reviewOrder(
      { ...defaultConfig(), reviewOrder: 'random' },
      timing,
      new Map(),
      new Map(),
    );
    expect(cmp(first, second)).not.toBe(0);
  });
});

interface Entry {
  noteGuid: string;
  ord: number;
  deckId: string;
  kind: 'new';
  template: number;
  ids: { card: bigint; note: bigint; mtime: bigint };
}

const fresh = (note: number, template: number): Entry => ({
  noteGuid: `n${note}`,
  ord: template,
  deckId: '1',
  kind: 'new',
  template,
  ids: { card: BigInt(note * 10 + template + 1), note: BigInt(note + 1), mtime: 0n },
});

const grid = () => [2, 0, 1, 3].flatMap((note) => [1, 0].map((template) => fresh(note, template)));
const labels = (entries: Entry[]) => entries.map((e) => `${e.noteGuid}/${e.template}`);

describe('new card sort orders', () => {
  it('«noSort» leaves the gathered order alone', () => {
    const entries = grid();
    const before = labels(entries);
    sortNew(entries, 'noSort', 20_000);
    expect(labels(entries)).toEqual(before);
  });

  it('«template» puts every first card before every second, keeping the gathered order inside each', () => {
    const entries = grid();
    sortNew(entries, 'template', 20_000);
    expect(labels(entries)).toEqual([
      'n2/0',
      'n0/0',
      'n1/0',
      'n3/0',
      'n2/1',
      'n0/1',
      'n1/1',
      'n3/1',
    ]);
  });

  it('«template then random» also orders each template by the card’s hash with the day', () => {
    const today = 20_000;
    const entries = grid();
    sortNew(entries, 'templateThenRandom', today);
    expect(entries.map((e) => e.template)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    const hashes = (template: number) =>
      entries.filter((e) => e.template === template).map((e) => fnvInts(e.ids.card, BigInt(today)));
    for (const template of [0, 1]) {
      const h = hashes(template);
      expect(h).toEqual([...h].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    }
  });

  it('«random note then template» keeps the cards of a note together and in template order', () => {
    const entries = grid();
    sortNew(entries, 'randomNoteThenTemplate', 20_000);
    const seen = labels(entries);
    for (let i = 0; i < seen.length; i += 2) {
      const [a, b] = [entries[i]!, entries[i + 1]!];
      expect(a.noteGuid).toBe(b.noteGuid);
      expect([a.template, b.template]).toEqual([0, 1]);
    }
  });

  it('«random card» mixes the cards of a note and gives a different order each day, the same within a day', () => {
    const order = (today: number) => {
      const entries = grid();
      sortNew(entries, 'randomCard', today);
      return labels(entries);
    };
    expect(order(20_000)).toEqual(order(20_000));
    expect(order(20_000)).not.toEqual(order(20_001));
  });

  it('the day changes which note comes first in the random-note order', () => {
    const firstNote = (today: number) => {
      const entries = Array.from({ length: 30 }, (_, i) => fresh(i, 0));
      sortNew(entries, 'randomNoteThenTemplate', today);
      return entries[0]!.noteGuid;
    };
    expect(new Set([20_000, 20_001, 20_002, 20_003, 20_004].map(firstNote)).size).toBeGreaterThan(
      1,
    );
  });
});
