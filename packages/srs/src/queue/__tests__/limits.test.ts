// The daily limits through the deck tree, the order of the deck list and the count of what was studied today.
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config';
import type { DeckConfig } from '../../config';
import { DEFAULT_GLOBAL_SETTINGS } from '../base';
import type { QueueDeck } from '../base';
import { LimitTree, activeLimits, countStudiedToday, sortDecksByName } from '../limits';

const deck = (id: string, name: string, over: Partial<DeckConfig> = {}): QueueDeck => ({
  id,
  name,
  config: { ...defaultConfig(), newPerDay: 10, reviewsPerDay: 100, ...over },
});

describe('countStudiedToday', () => {
  const decks = [
    { id: '1', name: 'A' },
    { id: '2', name: 'A::B' },
    { id: '3', name: 'A::B::C' },
  ];

  it('counts an answer in its deck and in every deck above it', () => {
    const counts = countStudiedToday([{ deckId: '3', queue: 'new' }], decks);
    expect([...counts.keys()].sort()).toEqual(['1', '2', '3']);
    expect(counts.get('1')).toEqual({ newCount: 1, reviewCount: 0 });
  });

  it('counts reviews and day-learning answers as reviews, and ignores intraday learning', () => {
    const counts = countStudiedToday(
      [
        { deckId: '2', queue: 'review' },
        { deckId: '2', queue: 'dayLearn' },
        { deckId: '2', queue: 'learn' },
        { deckId: '2', queue: 'new' },
      ],
      decks,
    );
    expect(counts.get('2')).toEqual({ newCount: 1, reviewCount: 2 });
    expect(counts.get('3')).toBeUndefined();
  });

  it('skips the ancestors that are not in the list and falls back to the deck itself when it is unknown', () => {
    const counts = countStudiedToday(
      [
        { deckId: 'x', queue: 'review' },
        { deckId: '3', queue: 'review' },
      ],
      [decks[2]!],
    );
    expect(counts.get('x')).toEqual({ newCount: 0, reviewCount: 1 });
    expect([...counts.keys()].sort()).toEqual(['3', 'x']);
  });
});

describe('sortDecksByName', () => {
  const names = (list: string[]) =>
    sortDecksByName(list.map((name) => ({ name }))).map((d) => d.name);

  it('puts a deck right before its subdecks, ahead of a deck whose name only starts the same', () => {
    expect(names(['A b', 'A::B', 'A', 'AB', 'A::A'])).toEqual(['A', 'A::A', 'A::B', 'A b', 'AB']);
  });

  it('ignores case', () => {
    expect(names(['b', 'A', 'a2', 'B2'])).toEqual(['A', 'a2', 'b', 'B2']);
  });

  it('compares by code point, so an emoji outside the basic plane goes after a fullwidth letter', () => {
    expect(names(['\u{1F600}', 'Ａ'])).toEqual(['Ａ', '\u{1F600}']);
  });

  it('puts a name before its own extensions', () => {
    expect(names(['ab', 'a'])).toEqual(['a', 'ab']);
  });

  it('does not change the list it receives', () => {
    const list = [{ name: 'b' }, { name: 'a' }];
    sortDecksByName(list);
    expect(list.map((d) => d.name)).toEqual(['b', 'a']);
  });
});

describe('the limits of a tree of decks', () => {
  const tree = [
    deck('1', 'A', { newPerDay: 5, reviewsPerDay: 50 }),
    deck('2', 'A::B', { newPerDay: 9, reviewsPerDay: 20 }),
    deck('3', 'A::C', { newPerDay: 3, reviewsPerDay: 80 }),
  ];

  it('a subdeck never gets more than the deck above it has left', () => {
    const limits = new LimitTree(tree, new Map(), true);
    expect(limits.root.limits).toMatchObject({ new: 5, review: 50 });
    let taken = 0;
    while (!limits.reached('2', 'new')) {
      limits.decrement('2', 'new');
      taken++;
    }
    expect(taken).toBe(5);
    expect(limits.rootReached('new')).toBe(true);
  });

  it('what was studied today counts against the deck and the ones above', () => {
    const studied = new Map([['1', { newCount: 4, reviewCount: 0 }]]);
    const limits = new LimitTree(tree, studied, true);
    expect(limits.root.limits.new).toBe(1);
    expect(limits.reached('3', 'new')).toBe(false);
    limits.decrement('3', 'new');
    expect(limits.reached('2', 'new')).toBe(true);
  });

  it('when a deck above runs out, the decks below it stop too, even before their own limit', () => {
    const limits = new LimitTree(tree, new Map(), true);
    for (let i = 0; i < 3; i++) limits.decrement('3', 'new');
    expect(limits.reached('3', 'new')).toBe(true);
    expect(limits.reached('2', 'new')).toBe(false);
    limits.decrement('2', 'new');
    limits.decrement('2', 'new');
    expect(limits.rootReached('new')).toBe(true);
    expect(limits.reached('2', 'new')).toBe(true);
  });

  it('unless new cards ignore the review limit, they are also limited by the reviews left', () => {
    const decks = [deck('1', 'A', { newPerDay: 20, reviewsPerDay: 5 })];
    const capped = new LimitTree(decks, new Map(), false);
    expect(capped.root.limits).toMatchObject({ new: 5, review: 5, capNewToReview: true });
    const free = new LimitTree(decks, new Map(), true);
    expect(free.root.limits).toMatchObject({ new: 20, review: 5, capNewToReview: false });
  });

  it('with the cap, studying new cards uses up the review allowance too', () => {
    const decks = [deck('1', 'A', { newPerDay: 20, reviewsPerDay: 8 })];
    const studied = new Map([['1', { newCount: 3, reviewCount: 2 }]]);
    const capped = new LimitTree(decks, studied, false);
    expect(capped.root.limits).toMatchObject({ review: 3, new: 3 });
    expect(new LimitTree(decks, studied, true).root.limits).toMatchObject({ review: 6, new: 17 });
  });

  it('a review that takes the last review allowance also closes the new cards when they are capped', () => {
    const decks = [deck('1', 'A', { newPerDay: 20, reviewsPerDay: 2 })];
    const limits = new LimitTree(decks, new Map(), false);
    limits.decrement('1', 'review');
    expect(limits.reached('1', 'new')).toBe(false);
    limits.decrement('1', 'review');
    expect(limits.reached('1', 'review')).toBe(true);
    expect(limits.reached('1', 'new')).toBe(true);
    const free = new LimitTree(decks, new Map(), true);
    free.decrement('1', 'review');
    free.decrement('1', 'review');
    expect(free.reached('1', 'new')).toBe(false);
  });

  it('never goes below zero', () => {
    const limits = new LimitTree([deck('1', 'A', { newPerDay: 1 })], new Map(), true);
    limits.decrement('1', 'new');
    limits.decrement('1', 'new');
    expect(limits.root.limits.new).toBe(0);
  });

  it('a deck that skips a level is not part of the tree, as in Anki, and counts as reached', () => {
    const decks = [deck('1', 'A'), deck('3', 'A::B::C'), deck('2', 'A::D')];
    const limits = new LimitTree(decks, new Map(), true);
    expect(limits.reached('3', 'new')).toBe(true);
    expect(limits.reached('2', 'new')).toBe(false);
    limits.decrement('3', 'new');
    expect(limits.root.limits.new).toBe(10);
  });

  it('decrementing an unknown deck changes nothing', () => {
    const limits = new LimitTree(tree, new Map(), true);
    limits.decrement('nope', 'review');
    expect(limits.root.limits.review).toBe(50);
  });
});

describe('activeLimits', () => {
  const decks = [
    deck('1', 'A', { newPerDay: 2 }),
    deck('2', 'A::B'),
    deck('3', 'A::B::C'),
    deck('4', 'AB'),
  ];

  it('studies the chosen deck and its subdecks in the deck list’s order, and nothing else', () => {
    const { active } = activeLimits(decks, decks[1]!, new Map(), DEFAULT_GLOBAL_SETTINGS);
    expect(active.map((d) => d.id)).toEqual(['2', '3']);
  });

  it('a parent deck’s limits apply only if the settings ask for them', () => {
    const own = activeLimits(decks, decks[1]!, new Map(), DEFAULT_GLOBAL_SETTINGS);
    expect(own.limits.rootReached('new')).toBe(false);
    expect(own.limits.root.limits.new).toBe(10);
    const all = activeLimits(decks, decks[1]!, new Map(), {
      ...DEFAULT_GLOBAL_SETTINGS,
      applyAllParentLimits: true,
    });
    expect(all.limits.root.limits.new).toBe(2);
    expect(all.limits.reached('3', 'new')).toBe(false);
  });

  it('a deck named like the chosen one plus a suffix is not its subdeck', () => {
    const { active } = activeLimits(decks, decks[0]!, new Map(), DEFAULT_GLOBAL_SETTINGS);
    expect(active.map((d) => d.id)).not.toContain('4');
  });
});
