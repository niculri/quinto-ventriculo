// Which cards a queue gathers when a deck’s daily limits are smaller than its cards: gather priorities, burying
// siblings and the fill with siblings.
import { describe, expect, it } from 'vitest';
import { newCard } from '../../card';
import type { CardRecord } from '../../card';
import { defaultConfig } from '../../config';
import type { DeckConfig, NewCardGatherPriority } from '../../config';
import type { QueueCard, QueueDeck } from '../base';
import { gatherIntradayLearning, gatherNew, noteRanks } from '../gather';
import type { Gathering } from '../gather';
import { DEFAULT_GLOBAL_SETTINGS } from '../base';
import { activeLimits } from '../limits';
import { fnv1a64, sqlFnvHash } from '../../random';
import { buildQueue, entriesOf } from '../queue';

const NOW = 1_800_000_000;
const timing = { now: NOW, today: 20_000, nextDayAt: NOW + 30_000 };

const deckOf = (over: Partial<DeckConfig>, id = '1', name = 'A'): QueueDeck => ({
  id,
  name,
  config: { ...defaultConfig(), newPerDay: 9999, reviewsPerDay: 9999, ...over },
});

let index = 0;
const fresh = (note: string, ord: number, position: number, deckId = '1'): QueueCard => ({
  noteGuid: note,
  ord,
  deckId,
  index: index++,
  record: newCard(position),
  hidden: false,
});

const queueOf = (decks: QueueDeck[], cards: QueueCard[], today = timing.today) =>
  entriesOf(
    buildQueue({
      rootDeckId: decks[0]!.id,
      decks,
      cards,
      studiedToday: new Map(),
      timing: { ...timing, today },
    }),
  ).map((e) => `${e.noteGuid}/${e.ord}`);

const twelveNotes = (deckId = '1') =>
  Array.from({ length: 12 }, (_, i) => [
    fresh(`n${i}`, 0, i * 2, deckId),
    fresh(`n${i}`, 1, i * 2 + 1, deckId),
  ]).flat();

describe('the gather priority of new cards decides which ones fit in the day', () => {
  const taken = (priority: NewCardGatherPriority, newPerDay: number, today = timing.today) =>
    queueOf([deckOf({ newCardGatherPriority: priority, newPerDay })], twelveNotes(), today);

  it('«lowest position» takes the oldest and «highest position» the newest', () => {
    // Gathered by position (n0/0, n0/1, n1/0), then shown in template order.
    expect(taken('lowestPosition', 3)).toEqual(['n0/0', 'n1/0', 'n0/1']);
    expect(taken('highestPosition', 3)).toEqual(['n11/0', 'n11/1', 'n10/1']);
  });

  it('«random notes» takes whole notes at random and the day changes the draw', () => {
    const two = taken('randomNotes', 2);
    expect(two[0]!.split('/')[0]).toBe(two[1]!.split('/')[0]);
    expect(two.map((c) => c.split('/')[1])).toEqual(['0', '1']);
    const notesOverDays = new Set(
      [20_000, 20_001, 20_002, 20_003, 20_004, 20_005].map((d) => taken('randomNotes', 2, d)[0]),
    );
    expect(notesOverDays.size).toBeGreaterThan(1);
  });

  it('«random cards» does not keep the cards of a note together and is repeatable within a day', () => {
    const cards = taken('randomCards', 6);
    expect(cards).toEqual(taken('randomCards', 6));
    expect(cards).not.toEqual(taken('lowestPosition', 6));
    expect(new Set(cards.map((c) => c.split('/')[0])).size).toBeGreaterThan(3);
  });

  it('«random notes» orders the notes by the hash of the note with the day’s salt: the day times Knuth’s constant, modulo 2³²', () => {
    const today = 20_123;
    const salt = (BigInt(today) * 2654435761n) & 0xffffffffn;
    const order = [...new Set(taken('randomNotes', 24, today).map((c) => c.split('/')[0]!))];
    const hashed = (note: string) => sqlFnvHash(fnv1a64(note), salt);
    expect(order).toHaveLength(12);
    for (let i = 1; i < order.length; i++) {
      expect(hashed(order[i - 1]!)).toBeLessThan(hashed(order[i]!));
    }
  });

  it('«deck, then random notes» fills the first deck before touching the next, choosing its notes at random', () => {
    const decks = [
      deckOf({ newCardGatherPriority: 'deckThenRandomNotes', newPerDay: 3 }),
      deckOf({ newPerDay: 9999 }, '2', 'A::B'),
    ];
    const cards = [
      ...twelveNotes('1').slice(0, 4),
      ...twelveNotes('2').map((c) => ({ ...c, noteGuid: `b-${c.noteGuid}` })),
    ];
    const out = queueOf(decks, cards);
    expect(out).toHaveLength(3);
    expect(out.every((c) => !c.startsWith('b-'))).toBe(true);
  });

  it('«deck» takes the root deck first and then its subdecks while the limits allow', () => {
    const decks = [
      deckOf({ newCardGatherPriority: 'deck', newPerDay: 3 }),
      deckOf({ newPerDay: 9999 }, '2', 'A::B'),
    ];
    const root = [fresh('r0', 0, 5), fresh('r1', 0, 6)];
    const sub = [fresh('s0', 0, 0, '2'), fresh('s1', 0, 1, '2')];
    expect(queueOf(decks, [...sub, ...root])).toEqual(['r0/0', 'r1/0', 's0/0']);
  });

  it('a deck whose own limit is reached does not hold up the others', () => {
    const decks = [
      deckOf({ newCardGatherPriority: 'deck', newPerDay: 9999 }),
      deckOf({ newPerDay: 0 }, '2', 'A::B'),
      deckOf({ newPerDay: 9999 }, '3', 'A::C'),
    ];
    const cards = [fresh('b', 0, 0, '2'), fresh('c', 0, 1, '3')];
    expect(queueOf(decks, cards)).toEqual(['c/0']);
  });
});

describe('burying siblings while gathering', () => {
  // The card of template 0 is the one overdue the longest, so the review order does not leave the tie to chance.
  const dueReview = (note: string, ord: number): QueueCard => ({
    noteGuid: note,
    ord,
    deckId: '1',
    index: index++,
    record: {
      ...newCard(0),
      phase: 'review',
      queue: 'review',
      due: timing.today - 1 - (1 - ord),
      interval: 5,
    } satisfies CardRecord,
    hidden: false,
  });

  it('with «bury reviews» a due review hides the note’s other due review, and only that preset’s', () => {
    const cards = [dueReview('a', 0), dueReview('a', 1), dueReview('b', 1)];
    expect(queueOf([deckOf({ buryReviews: true })], cards)).toEqual(['a/0', 'b/1']);
    expect(queueOf([deckOf({ buryReviews: false })], cards)).toHaveLength(3);
  });

  it('a note’s new card is buried by its due review when the preset buries new cards', () => {
    const cards = [dueReview('a', 0), fresh('a', 1, 0), fresh('b', 0, 1)];
    expect(queueOf([deckOf({ buryNew: true })], cards)).toEqual(['a/0', 'b/0']);
    expect(queueOf([deckOf({ buryNew: false })], cards)).toContain('a/1');
  });

  it('a note remembers every deck its cards came from: one that buries new cards, even if it is seen second, buries them for a third card', () => {
    const decks = [deckOf({ buryNew: false }), deckOf({ buryNew: true }, '2', 'A::B')];
    const review = (ord: number, deckId: string): QueueCard => ({
      ...dueReview('n', ord),
      deckId,
    });
    const cards = [review(0, '1'), review(1, '2'), fresh('n', 2, 0, '1'), fresh('m', 0, 1, '1')];
    expect(queueOf(decks, cards).sort()).toEqual(['m/0', 'n/0', 'n/1']);
  });

  it('«interday learning» cards bury their siblings only when that option is on', () => {
    const dayLearning = (note: string, ord: number): QueueCard => ({
      ...dueReview(note, ord),
      record: {
        ...newCard(0),
        phase: 'relearning',
        queue: 'dayLearn',
        due: timing.today - (1 - ord),
        reps: 3,
      },
    });
    const cards = [dayLearning('a', 0), dayLearning('a', 1)];
    expect(queueOf([deckOf({ buryInterdayLearning: true })], cards)).toEqual(['a/0']);
    expect(queueOf([deckOf({})], cards)).toHaveLength(2);
  });

  it('a buried new card comes back at the end of the day’s new cards with «fill with siblings», one card of a note per round', () => {
    const cards = [
      fresh('a', 0, 0),
      fresh('a', 1, 1),
      fresh('a', 2, 2),
      fresh('b', 0, 3),
      fresh('b', 1, 4),
    ];
    const burying = { buryNew: true, newPerDay: 4 };
    expect(queueOf([deckOf({ ...burying, fillNewWithSiblings: false })], cards)).toEqual([
      'a/0',
      'b/0',
    ]);
    expect(queueOf([deckOf({ ...burying, fillNewWithSiblings: true })], cards)).toEqual([
      'a/0',
      'b/0',
      'a/1',
      'b/1',
    ]);
  });

  it('the day’s new limit stops the siblings’ rounds too', () => {
    const cards = [fresh('a', 0, 0), fresh('a', 1, 1), fresh('a', 2, 2)];
    const config = { buryNew: true, fillNewWithSiblings: true, newPerDay: 2 };
    expect(queueOf([deckOf(config)], cards)).toEqual(['a/0', 'a/1']);
  });
});

describe('new cards that tie on position', () => {
  const tied = (priority: NewCardGatherPriority) => {
    const cards = [fresh('late', 0, 7), fresh('early', 0, 7), fresh('second', 1, 7)];
    cards[0]!.index = 9;
    cards[1]!.index = 3;
    cards[2]!.index = 5;
    return queueOf([deckOf({ newCardGatherPriority: priority, newPerDay: 2 })], cards);
  };

  it('are told apart by template first, then by the order they were added in', () => {
    expect(tied('lowestPosition')).toEqual(['early/0', 'late/0']);
    expect(tied('highestPosition')).toEqual(['early/0', 'late/0']);
  });
});

describe('the siblings that wait for the rounds', () => {
  it('a sibling whose deck has no new cards left today is skipped while the other decks’ siblings still come', () => {
    const decks = [
      deckOf({ buryNew: true, fillNewWithSiblings: true, newPerDay: 9999 }),
      deckOf({ buryNew: true, fillNewWithSiblings: true, newPerDay: 1 }, '2', 'A::B'),
    ];
    const cards = [
      fresh('a', 0, 0, '2'),
      fresh('a', 1, 1, '2'),
      fresh('b', 0, 2, '1'),
      fresh('a', 2, 3, '1'),
    ];
    expect(queueOf(decks, cards).sort()).toEqual(['a/0', 'a/2', 'b/0']);
  });
});

describe('new cards that have no position of their own', () => {
  const gathering = (cards: QueueCard[]): { g: Gathering; active: QueueDeck[] } => {
    const decks = [deckOf({})];
    const { active, limits } = activeLimits(decks, decks[0]!, new Map(), DEFAULT_GLOBAL_SETTINGS);
    return {
      g: {
        cards,
        limits,
        timing,
        byId: new Map(decks.map((d) => [d.id, d])),
        deckList: undefined,
        seen: new Map(),
      },
      active,
    };
  };
  const unplaced = (note: string, ord: number, at: number): QueueCard => ({
    noteGuid: note,
    ord,
    deckId: '1',
    index: at,
    record: null,
    hidden: false,
  });
  const cards = () => [unplaced('x', 0, 0), unplaced('y', 0, 1), unplaced('x', 1, 2)];
  const order = (ranks: Map<string, number>) => {
    const { g, active } = gathering(cards());
    return gatherNew(g, 'lowestPosition', active, ranks).map((e) => `${e.noteGuid}/${e.ord}`);
  };

  it('take their note’s place, so the cards of a note are gathered together', () => {
    expect(
      order(
        new Map([
          ['x', 0],
          ['y', 1],
        ]),
      ),
    ).toEqual(['x/0', 'x/1', 'y/0']);
  });

  it('take their own place in the order they were added when the note has none', () => {
    expect(order(new Map())).toEqual(['x/0', 'y/0', 'x/1']);
  });
});

describe('where a note stands among its deck’s notes', () => {
  const card = (note: string, ord: number, at: number): QueueCard => ({
    noteGuid: note,
    ord,
    deckId: '1',
    index: at,
    record: null,
    hidden: false,
  });

  it('is where its first card is, whatever order the cards are listed in', () => {
    const cards = [card('x', 0, 0), card('y', 0, 1), card('x', 1, 2)];
    expect(noteRanks(cards)).toEqual(
      new Map([
        ['x', 0],
        ['y', 1],
      ]),
    );
    expect(noteRanks([...cards].reverse())).toEqual(
      new Map([
        ['x', 0],
        ['y', 1],
      ]),
    );
  });
});

describe('intraday learning cards', () => {
  const learning = (note: string, due: number): QueueCard => ({
    noteGuid: note,
    ord: 0,
    deckId: '1',
    index: index++,
    record: { ...newCard(0), phase: 'learning', queue: 'learn', due, remainingSteps: 1, reps: 1 },
    hidden: false,
  });

  it('all come before the next day starts, the very second it starts included, by the time they are due', () => {
    const decks = [deckOf({})];
    const { limits } = activeLimits(decks, decks[0]!, new Map(), DEFAULT_GLOBAL_SETTINGS);
    const cards = [
      learning('late', timing.nextDayAt + 1),
      learning('last', timing.nextDayAt),
      learning('first', timing.now - 60),
    ];
    const g: Gathering = {
      cards,
      limits,
      timing,
      byId: new Map(decks.map((d) => [d.id, d])),
      deckList: undefined,
      seen: new Map(),
    };
    expect(gatherIntradayLearning(g).map((e) => e.noteGuid)).toEqual(['first', 'last']);
  });
});
