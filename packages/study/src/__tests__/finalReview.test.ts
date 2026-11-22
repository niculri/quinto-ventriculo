// The final review: which cards it gathers and in what order, which ones it calls hard, and how a round moves.
import { describe, expect, it } from 'vitest';
import {
  answerRound,
  apartSiblings,
  dropCurrent,
  isHard,
  revealCard,
  reviewPools,
  startRound,
} from '../finalReview';
import { cardKey } from '../scheduler';
import { ASSESSMENT, CARDS, NOON, UNIT1, makeData, reviewRow, rowFor, summary } from './studyData';

const [n1o0, n1o1, n2o0, n3o0, n4o0] = CARDS as [
  ReturnType<typeof summary>,
  ReturnType<typeof summary>,
  ReturnType<typeof summary>,
  ReturnType<typeof summary>,
  ReturnType<typeof summary>,
];
const keys = (refs: { noteGuid: string; ord: number }[]) =>
  refs.map((r) => `${r.noteGuid}/${r.ord}`);

describe('isHard', () => {
  const row = (over = {}) => rowFor(n1o0, over);

  it('a leech is hard, and so is a card that failed twice', () => {
    expect(isHard(row({ leech: true }))).toBe(true);
    expect(isHard(row({ lapses: 2 }))).toBe(true);
    expect(isHard(row({ lapses: 1 }))).toBe(false);
  });

  it('difficulty 8 is the line, and a card without difficulty is not hard', () => {
    expect(isHard(row({ difficulty: 8 }))).toBe(true);
    expect(isHard(row({ difficulty: 7.9 }))).toBe(false);
    expect(isHard(row({ difficulty: null }))).toBe(false);
  });
});

describe('reviewPools', () => {
  it('gathers only cards already seen and takes out the suspended ones', () => {
    const data = makeData({
      rows: [reviewRow(n1o0), reviewRow(n1o1, { suspended: true }), rowFor(n2o0)],
    });
    expect(keys(reviewPools(data, new Map(), NOON).all)).toEqual(['n1/0']);
  });

  it('puts the most forgotten first and keeps the cards of one note apart', () => {
    const data = makeData({
      rows: [
        reviewRow(n1o0, { lastDaysAgo: 60 }),
        reviewRow(n1o1, { lastDaysAgo: 40 }),
        reviewRow(n2o0, { lastDaysAgo: 20 }),
        reviewRow(n3o0, { lastDaysAgo: 1 }),
      ],
    });
    expect(keys(reviewPools(data, new Map(), NOON).all)).toEqual(['n1/0', 'n2/0', 'n1/1', 'n3/0']);
  });

  it('a card with no memory state is the first to come, as if it were forgotten', () => {
    const learning = rowFor(n3o0, {
      phase: 'learning',
      due: new Date(NOON).toISOString(),
      lastReview: new Date(NOON).toISOString(),
    });
    const data = makeData({ rows: [reviewRow(n1o0, { lastDaysAgo: 100 }), learning] });
    expect(keys(reviewPools(data, new Map(), NOON).all)).toEqual(['n3/0', 'n1/0']);
  });

  it('cards of a unit turned off still come, since what was seen of it is still material', () => {
    const data = makeData({ rows: [reviewRow(n3o0)], active: [UNIT1] });
    expect(keys(reviewPools(data, new Map(), NOON).all)).toEqual(['n3/0']);
  });

  it('Extras come only when the assessment includes them', () => {
    const rows = [reviewRow(n4o0)];
    expect(reviewPools(makeData({ rows }), new Map(), NOON).all).toEqual([]);
    const plan = {
      activations: [],
      answeredDecks: [],
      medianAnswerMs: null,
      assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: null }],
    };
    expect(keys(reviewPools(makeData({ rows, over: { plan } }), new Map(), NOON).all)).toEqual([
      'n4/0',
    ]);
  });

  it('the hard ones are the flagged, the leeches, the lapsed and the difficult', () => {
    const data = makeData({
      rows: [
        reviewRow(n1o0, { flag: 3 }),
        reviewRow(n1o1, { leech: true }),
        reviewRow(n2o0, { lapses: 2 }),
        reviewRow(n3o0, { difficulty: 8.5 }),
        reviewRow(n4o0),
      ],
      over: {
        plan: {
          activations: [],
          answeredDecks: [],
          medianAnswerMs: null,
          assessments: [{ deckId: ASSESSMENT, includeExtras: true, newPerDay: null }],
        },
      },
    });
    const { all, hard } = reviewPools(data, new Map(), NOON);
    expect(all).toHaveLength(5);
    expect(new Set(keys(hard))).toEqual(new Set(['n1/0', 'n1/1', 'n2/0', 'n3/0']));
  });

  it('a mark made in this session beats the flag the card had: unflagged leaves it out, flagged brings it in', () => {
    const data = makeData({ rows: [reviewRow(n1o0, { flag: 2 }), reviewRow(n2o0)] });
    const marks = new Map([
      [cardKey(n1o0), 0],
      [cardKey(n2o0), 5],
    ]);
    expect(keys(reviewPools(data, marks, NOON).hard)).toEqual(['n2/0']);
  });

  it('a mark does not make a hard card easy', () => {
    const data = makeData({ rows: [reviewRow(n1o0, { leech: true })] });
    expect(keys(reviewPools(data, new Map([[cardKey(n1o0), 0]]), NOON).hard)).toEqual(['n1/0']);
  });
});

describe('apartSiblings', () => {
  const refs = (...ids: string[]) =>
    ids.map((id) => ({ ref: { noteGuid: id[0]!, ord: Number(id[1]), deckId: 'd' } }));
  const order = (...ids: string[]) =>
    apartSiblings(refs(...ids)).map((c) => `${c.ref.noteGuid}${c.ref.ord}`);

  it('lets another note’s card go between two of a note', () => {
    expect(order('a0', 'a1', 'b0')).toEqual(['a0', 'b0', 'a1']);
  });

  it('brings the waiting cards back one by one, as the others make room', () => {
    expect(order('a0', 'a1', 'a2', 'b0', 'b1')).toEqual(['a0', 'b0', 'a1', 'b1', 'a2']);
  });

  it('with only one note it has nothing better to do and keeps the order', () => {
    expect(order('a0', 'a1', 'a2')).toEqual(['a0', 'a1', 'a2']);
  });

  it('leaves alone what is already apart, and an empty list', () => {
    expect(order('a0', 'b0', 'a1')).toEqual(['a0', 'b0', 'a1']);
    expect(order()).toEqual([]);
  });
});

describe('a round', () => {
  const cards = ['a', 'b', 'c'].map((noteGuid) => ({ noteGuid, ord: 0, deckId: 'd' }));

  it('starts with every card to do, nothing done and the first one hidden', () => {
    expect(startRound(cards)).toEqual({
      queue: cards,
      total: 3,
      done: 0,
      again: 0,
      revealed: false,
    });
  });

  it('does not take an answer before the card is revealed', () => {
    const round = startRound(cards);
    expect(answerRound(round, 'good')).toBe(round);
  });

  it('a good answer finishes the card and hides the next one', () => {
    const next = answerRound(revealCard(startRound(cards)), 'good');
    expect(next).toMatchObject({ done: 1, again: 0, revealed: false });
    expect(next.queue.map((c) => c.noteGuid)).toEqual(['b', 'c']);
  });

  it('«otra vez» sends the card to the end, counts it and does not finish it', () => {
    const next = answerRound(revealCard(startRound(cards)), 'again');
    expect(next).toMatchObject({ done: 0, again: 1, total: 3, revealed: false });
    expect(next.queue.map((c) => c.noteGuid)).toEqual(['b', 'c', 'a']);
  });

  it('an empty round takes no answer', () => {
    const empty = revealCard(startRound([]));
    expect(answerRound(empty, 'again')).toBe(empty);
  });

  it('dropping the current card takes it out of the total and hides the next, never below zero', () => {
    const dropped = dropCurrent(revealCard(startRound(cards)));
    expect(dropped).toMatchObject({ total: 2, revealed: false });
    expect(dropped.queue).toHaveLength(2);
    expect(dropCurrent(startRound([])).total).toBe(0);
  });

  it('is done when every card was answered good', () => {
    let round = startRound(cards.slice(0, 2));
    round = answerRound(revealCard(round), 'again');
    round = answerRound(revealCard(round), 'good');
    round = answerRound(revealCard(round), 'good');
    expect(round).toMatchObject({ done: 2, again: 1, queue: [] });
  });
});

describe('reviewPools with what the tree does not say', () => {
  it('a card of a deck missing from the tree still comes, as ordinary material', () => {
    const lost = summary('lost', 0, 'gone');
    const base = makeData({ rows: [reviewRow(lost), reviewRow(n1o0)] });
    const data = { ...base, deck: { ...base.deck, cards: [lost, n1o0] } };
    expect(new Set(keys(reviewPools(data, new Map(), NOON).all))).toEqual(
      new Set(['lost/0', 'n1/0']),
    );
  });

  it('a card without difficulty is ordered as one of medium difficulty', () => {
    const noDifficulty = makeData({ cards: [n3o0], rows: [reviewRow(n3o0, { difficulty: null })] });
    const medium = makeData({ cards: [n3o0], rows: [reviewRow(n3o0, { difficulty: 5 })] });
    expect(keys(reviewPools(noDifficulty, new Map(), NOON).all)).toEqual(
      keys(reviewPools(medium, new Map(), NOON).all),
    );
    const a = makeData({
      cards: [n3o0, n2o0],
      rows: [reviewRow(n3o0, { difficulty: null }), reviewRow(n2o0, { difficulty: 5 })],
    });
    expect(reviewPools(a, new Map(), NOON).all).toHaveLength(2);
  });
});
