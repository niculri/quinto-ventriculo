// SPDX-License-Identifier: AGPL-3.0-or-later

// The queue functions leave their argument as it was, and the pure values read like the old mutable queue
// (reference-queue.ts) in random sessions.
import { describe, expect, it } from 'vitest';
import { answerCard, newCard } from '../../card';
import type { CardKey, CardRecord, Rating } from '../../card';
import { defaultConfig } from '../../config';
import type { DeckConfig } from '../../config';
import type { SchedTiming } from '../../timing';
import type { QueueCard, QueueDeck, QueueEntry, QueueInput } from '../base';
import {
  answeredIn,
  buildQueue,
  countsOf,
  entriesOf,
  kindOf,
  moveToFrontIn,
  nextLearningDue,
  nextOf,
  undoIn,
  upcomingOf,
  withCutoff,
} from '../queue';
import type { QueueState, QueueUpdate } from '../queue';
import { ReferenceStudyQueue } from './referenceQueue';

const NOW = 1_800_000_000;
const timing: SchedTiming = { now: NOW, today: 20_000, nextDayAt: NOW + 30_000 };
const config = { ...defaultConfig(), newPerDay: 9999, reviewsPerDay: 9999 };
const deck: QueueDeck = { id: '1', name: 'A', config };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

const record = (over: Partial<CardRecord>): CardRecord => ({ ...newCard(0), ...over });
const learning = (due: number): CardRecord =>
  record({ phase: 'learning', queue: 'learn', due, remainingSteps: 2002, reps: 1 });
const review = (): CardRecord =>
  record({ phase: 'review', queue: 'review', due: timing.today - 1, interval: 10, reps: 3 });
const dayLearning = (): CardRecord =>
  record({ phase: 'relearning', queue: 'dayLearn', due: timing.today, reps: 3 });

const card = (guid: string, rec: CardRecord | null, index: number): QueueCard => ({
  noteGuid: guid,
  ord: 0,
  deckId: '1',
  index,
  record: rec,
  hidden: false,
});

const input = (cards: QueueCard[]) => ({
  rootDeckId: '1',
  decks: [deck],
  cards,
  studiedToday: new Map(),
  timing,
});

/** Two new cards, a review, a card in learning now, one a few minutes ahead and one beyond the learn-ahead limit. */
const sample = (): QueueState =>
  buildQueue(
    input([
      card('n1', null, 0),
      card('n2', null, 1),
      card('r1', review(), 2),
      card('l-now', learning(NOW - 60), 3),
      card('l-ahead', learning(NOW + 600), 4),
      card('l-late', learning(NOW + 5000), 5),
    ]),
  );

const keyOfEntry = (e: QueueEntry) => `${e.noteGuid}/${e.ord}`;
const order = (q: QueueState) => entriesOf(q).map(keyOfEntry);
const key = (guid: string): CardKey => ({ noteGuid: guid, ord: 0 });

describe('buildQueue and the reads', () => {
  it('puts learning due now first, the main queue next and learning within the learn-ahead limit last', () => {
    const q = sample();
    expect(order(q).slice(0, 1)).toEqual(['l-now/0']);
    expect(order(q).at(-1)).toBe('l-ahead/0');
    expect(order(q)).not.toContain('l-late/0');
    expect(countsOf(q)).toEqual({ new: 2, review: 1, learning: 2 });
  });

  it('nextOf is the first entry and upcomingOf the first few, without the due time', () => {
    const q = sample();
    expect(nextOf(q)).toEqual(entriesOf(q)[0]);
    expect(nextOf(q)).not.toHaveProperty('due');
    expect(upcomingOf(q, 2)).toEqual(entriesOf(q).slice(0, 2));
  });

  it('nextOf falls back to learning within the learn-ahead limit, and is null with nothing left', () => {
    const onlyAhead = buildQueue(input([card('l-ahead', learning(NOW + 600), 0)]));
    expect(nextOf(onlyAhead)?.noteGuid).toBe('l-ahead');
    const none = buildQueue(input([card('l-late', learning(NOW + 5000), 0)]));
    expect(nextOf(none)).toBeNull();
  });

  it('countsOf hands out a copy', () => {
    const q = sample();
    const counts = countsOf(q);
    counts.new = 99;
    expect(countsOf(q).new).toBe(2);
  });

  it('kindOf and nextLearningDue read where a card is', () => {
    const q = sample();
    expect(kindOf(q, key('n1'))).toBe('new');
    expect(kindOf(q, key('r1'))).toBe('review');
    expect(kindOf(q, key('l-late'))).toBe('learning');
    expect(kindOf(q, key('nobody'))).toBeNull();
    expect(nextLearningDue(q)).toBe(NOW - 60);
    expect(nextLearningDue(buildQueue(input([card('n1', null, 0)])))).toBeNull();
  });

  it('the day and the learn-ahead limit come from the build', () => {
    const q = sample();
    expect([q.today, q.learnAheadSecs, q.cutoff]).toEqual([timing.today, 1200, NOW]);
  });
});

describe('withCutoff', () => {
  it('moves the cutoff forward and counts the learning cards the learn-ahead window reaches', () => {
    const q = sample();
    const later = withCutoff(q, NOW + 4000);
    expect(later.cutoff).toBe(NOW + 4000);
    expect(countsOf(later).learning).toBe(3);
    expect(q.cutoff).toBe(NOW);
  });

  it('never moves it back, and gives the same value when nothing changes', () => {
    const q = sample();
    expect(withCutoff(q, NOW - 500)).toBe(q);
    expect(withCutoff(q, NOW)).toBe(q);
  });
});

describe('answeredIn and undoIn', () => {
  it('answering the first card takes it out of the main queue, and undoing puts the same queue back', () => {
    const q = buildQueue(input([card('n1', null, 0), card('n2', null, 1)]));
    deepFreeze(q);
    const first = nextOf(q)!;
    const result = answerCard(first, newCard(0), 3, config, timing, { fuzz: false });
    const { queue, update } = answeredIn(q, first, result.card, timing);
    expect(order(queue)).toEqual(['n2/0', 'n1/0']);
    expect(countsOf(queue)).toEqual({ new: 1, review: 0, learning: 1 });
    expect(update.requeued?.noteGuid).toBe('n1');
    expect(undoIn(queue, update)).toEqual(q);
  });

  it('a learning card answered again is requeued by due time; undo takes it out of the learning list', () => {
    const q = sample();
    deepFreeze(q);
    const first = nextOf(q)!;
    const again = answerCard(first, learning(NOW - 60), 1, config, timing, { fuzz: false });
    const { queue, update } = answeredIn(q, first, again.card, timing);
    expect(update.fromLearning?.noteGuid).toBe('l-now');
    expect(queue.learning.map((e) => e.noteGuid)).toContain('l-now');
    expect(undoIn(queue, update)).toEqual(q);
  });

  it('answering a card that is not the first one fails and leaves the queue as it was', () => {
    const q = sample();
    deepFreeze(q);
    const third = entriesOf(q)[2]!;
    expect(() => answeredIn(q, third, newCard(0), timing)).toThrow(
      'La tarjeta no está al principio de la cola',
    );
  });

  it('the update records the cutoff and learning count from before the cutoff moves', () => {
    const q = buildQueue(input([card('n1', null, 0), card('l-late', learning(NOW + 1300), 1)]));
    const first = nextOf(q)!;
    const result = answerCard(first, newCard(0), 4, config, timing, { fuzz: false });
    const { queue, update } = answeredIn(q, first, result.card, { ...timing, now: NOW + 600 });
    expect(update.snapshot).toEqual({ cutoff: NOW, learningCount: 0 });
    expect(queue.cutoff).toBe(NOW + 600);
    expect(countsOf(queue).learning).toBe(1);
    expect(undoIn(queue, update)).toEqual(q);
  });
});

describe('moveToFrontIn', () => {
  it('moves a card of the main queue to the front, the rest in the same order', () => {
    const q = sample();
    deepFreeze(q);
    const moved = moveToFrontIn(q, key('r1'))!;
    expect(order(moved)).toEqual(['l-now/0', 'r1/0', 'n1/0', 'n2/0', 'l-ahead/0']);
  });

  it('makes a learning card due now so that it is shown first', () => {
    const q = sample();
    deepFreeze(q);
    const moved = moveToFrontIn(q, key('l-ahead'))!;
    expect(nextOf(moved)?.noteGuid).toBe('l-ahead');
    expect(nextLearningDue(moved)).toBe(NOW);
  });

  it('is null for a card that is not in the queue', () => {
    expect(moveToFrontIn(sample(), key('nobody'))).toBeNull();
  });
});

describe('learning cards at the edge of the learn-ahead window', () => {
  const answerFirst = (q: QueueState, steps: number[], at = timing.now) => {
    const first = nextOf(q)!;
    const t = { ...timing, now: at };
    const stepped = { ...config, learnSteps: steps };
    const { card: after } = answerCard(first, newCard(0), 1, stepped, t, { fuzz: false });
    return { first, after, answered: answeredIn(q, first, after, t), t };
  };
  const withLearningAhead = () =>
    deepFreeze(buildQueue(input([card('n1', null, 0), card('l-ahead', learning(NOW + 600), 1)])));

  it('a card requeued beyond the window is not counted, and undoing it does not uncount anything', () => {
    const q = withLearningAhead();
    const { after, answered } = answerFirst(q, [30]);
    expect(after.due).toBe(NOW + 1800);
    expect(countsOf(answered.queue)).toEqual({ new: 0, review: 0, learning: 1 });
    expect(undoIn(answered.queue, answered.update)).toEqual(q);
  });

  it('a card requeued exactly at the edge of the window is counted', () => {
    const q = withLearningAhead();
    const { after, answered } = answerFirst(q, [20]);
    expect(after.due).toBe(NOW + 1200);
    expect(countsOf(answered.queue).learning).toBe(2);
    expect(undoIn(answered.queue, answered.update)).toEqual(q);
  });

  it('undoing judges the card by the window of the answer, not by the cutoff the answer moved', () => {
    const q = withLearningAhead();
    // The answer comes ten minutes later: a quarter of an hour ahead is out of the old window and inside the new one.
    const { after, answered } = answerFirst(q, [15], NOW + 600);
    expect(after.due).toBe(NOW + 1500);
    expect(countsOf(answered.queue).learning).toBe(2);
    expect(undoIn(answered.queue, answered.update)).toEqual(q);
  });

  it('a card that would be shown twice in a row waits behind the next one, unless that one is at the edge of the window', () => {
    const learningOrderAfterAgain = (nextDue: number) => {
      const q = deepFreeze(
        buildQueue(input([card('x', learning(NOW - 60), 0), card('l', learning(nextDue), 1)])),
      );
      const first = nextOf(q)!;
      const again = answerCard(first, learning(NOW - 60), 1, config, timing, { fuzz: false });
      return answeredIn(q, first, again.card, timing).queue.learning.map((e) => e.noteGuid);
    };
    expect(learningOrderAfterAgain(NOW + 1000)).toEqual(['l', 'x']);
    expect(learningOrderAfterAgain(NOW + 1198)).toEqual(['l', 'x']);
    expect(learningOrderAfterAgain(NOW + 1199)).toEqual(['x', 'l']);
  });

  it('a learning card moved to the front from beyond the window never takes the count below zero', () => {
    const q = deepFreeze(buildQueue(input([card('l-late', learning(NOW + 5000), 0)])));
    expect(countsOf(q).learning).toBe(0);
    const moved = moveToFrontIn(q, key('l-late'))!;
    const first = nextOf(moved)!;
    const again = answerCard(first, learning(NOW + 5000), 1, config, timing, { fuzz: false });
    const { queue } = answeredIn(moved, first, again.card, timing);
    expect(countsOf(queue).learning).toBe(1);
  });
});

describe('the pure functions leave their arguments alone', () => {
  it('buildQueue does not touch the cards, the decks or the settings it is given', () => {
    const frozen = deepFreeze(
      input([card('n1', null, 0), card('r1', review(), 1), card('l-now', learning(NOW - 60), 2)]),
    );
    expect(() => buildQueue(frozen)).not.toThrow();
  });

  it('is read-only down to its entries, and to what an answer takes out of it', () => {
    const q = deepFreeze(buildQueue(input([card('n1', null, 0), card('n2', null, 1)])));
    const first = nextOf(q)!;
    const { update } = answeredIn(
      q,
      first,
      answerCard(first, newCard(0), 1, config, timing).card,
      timing,
    );
    expect(() => {
      // @ts-expect-error the entries of a queue cannot be assigned to
      q.main[0]!.kind = 'review';
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error nor the entry an answer took out
      update.removed!.kind = 'review';
    }).toThrow(TypeError);
  });

  it('what the reads hand out is a copy: changing it does not change the queue', () => {
    const q = sample();
    for (const e of [nextOf(q)!, ...entriesOf(q), ...upcomingOf(q, 3)]) e.noteGuid = 'changed';
    expect(order(q)).toEqual(order(sample()));
  });
});

describe('answering, undoing and moving a card', () => {
  it('give back the queue as it was, and tell a card that is not in it', () => {
    let queue = buildQueue(input([card('n1', null, 0), card('n2', null, 1)]));
    const first = nextOf(queue)!;
    const result = answerCard(first, newCard(0), 3, config, timing, { fuzz: false });
    const answered = answeredIn(queue, first, result.card, timing);
    queue = answered.queue;
    expect(nextOf(queue)?.noteGuid).toBe('n2');
    expect(countsOf(queue)).toEqual({ new: 1, review: 0, learning: 1 });
    queue = undoIn(queue, answered.update);
    expect(nextOf(queue)?.noteGuid).toBe('n1');
    expect(moveToFrontIn(queue, key('nobody'))).toBeNull();
    queue = moveToFrontIn(queue, key('n2'))!;
    expect(nextOf(queue)?.noteGuid).toBe('n2');
    expect([queue.today, queue.learnAheadSecs]).toEqual([timing.today, 1200]);
  });
});

/** Mulberry32: a small seeded generator, so that a failing session can be replayed. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCards(rand: () => number): QueueCard[] {
  const count = 12 + Math.floor(rand() * 30);
  return Array.from({ length: count }, (_, i) => {
    const roll = rand();
    const rec =
      roll < 0.45
        ? null
        : roll < 0.65
          ? review()
          : roll < 0.8
            ? dayLearning()
            : learning(NOW + Math.floor((rand() - 0.4) * 3000));
    return { ...card(`c${i}`, rec, i), ord: i % 2, hidden: rand() < 0.05 };
  });
}

const snapshot = (read: {
  entries: QueueEntry[];
  next: QueueEntry | null;
  counts: unknown;
  learningDue: number | null;
  kinds: unknown[];
}) => read;

/** What the old class holds, private fields included: the strictest thing to compare the new values against. */
const heldBy = (queue: ReferenceStudyQueue) => ({
  main: Reflect.get(queue, 'main') as QueueEntry[],
  learning: Reflect.get(queue, 'learning') as QueueEntry[],
  counts: Reflect.get(queue, 'counts_') as unknown,
  cutoff: Reflect.get(queue, 'cutoff') as number,
});

interface World {
  label: string;
  config: DeckConfig;
  timing: SchedTiming;
  learnAheadSecs: number;
}

const worldOf = (
  label: string,
  over: Partial<DeckConfig>,
  learnAheadSecs: number,
  dayEnds: number,
): World => ({
  label,
  config: { ...config, ...over },
  timing: { ...timing, nextDayAt: NOW + dayEnds },
  learnAheadSecs,
});

const DEFAULT_WORLD = worldOf('the default steps', {}, 1200, 30_000);
const OTHER_WORLDS = [
  worldOf(
    'steps around the learn-ahead limit',
    { learnSteps: [1, 15, 20], relearnSteps: [20] },
    1200,
    30_000,
  ),
  worldOf(
    'steps beyond the learn-ahead limit',
    { learnSteps: [5, 25, 45], relearnSteps: [30] },
    1200,
    30_000,
  ),
  worldOf(
    'the day ending during the session',
    { learnSteps: [1, 10, 25], relearnSteps: [30] },
    1200,
    2500,
  ),
  worldOf('no learn-ahead', {}, 0, 30_000),
];

function runSession(seed: number, world: World) {
  const rand = random(seed);
  const cards = randomCards(rand);
  const base: QueueInput = {
    rootDeckId: '1',
    decks: [{ ...deck, config: world.config }],
    cards,
    studiedToday: new Map(),
    timing: world.timing,
    settings: {
      learnAheadSecs: world.learnAheadSecs,
      newCardsIgnoreReviewLimit: false,
      applyAllParentLimits: false,
    },
  };
  const reference = ReferenceStudyQueue.build(base);
  let pure = deepFreeze(buildQueue(base));
  const records = new Map(
    cards.map((c) => [`${c.noteGuid}/${c.ord}`, c.record ?? newCard(c.index)]),
  );
  const undoStack: {
    before: CardRecord;
    key: CardKey;
    ref: ReturnType<ReferenceStudyQueue['answered']>;
    pure: QueueUpdate;
  }[] = [];
  let now = NOW;

  const readAll = (keys: CardKey[]) => ({
    reference: snapshot({
      entries: reference.entries(),
      next: reference.next(),
      counts: reference.counts(),
      learningDue: reference.nextLearningDue(),
      kinds: keys.map((k) => reference.kindOf(k)),
    }),
    pure: snapshot({
      entries: entriesOf(pure),
      next: nextOf(pure),
      counts: countsOf(pure),
      learningDue: nextLearningDue(pure),
      kinds: keys.map((k) => kindOf(pure, k)),
    }),
  });
  const keys = cards.map((c) => ({ noteGuid: c.noteGuid, ord: c.ord }));
  const same = (step: string) => {
    const read = readAll(keys);
    expect(read.pure, step).toEqual(read.reference);
    const held = heldBy(reference);
    expect(
      { main: pure.main, learning: pure.learning, counts: pure.counts, cutoff: pure.cutoff },
      step,
    ).toEqual(held);
  };
  same('built');

  for (let step = 0; step < 60; step++) {
    const roll = rand();
    const label = `step ${step}`;
    if (roll < 0.6) {
      const entry = reference.next();
      if (!entry) break;
      const k = { noteGuid: entry.noteGuid, ord: entry.ord };
      now += Math.floor(rand() * 300);
      const t = { ...world.timing, now };
      const before = records.get(`${k.noteGuid}/${k.ord}`)!;
      const rating = (1 + Math.floor(rand() * 4)) as Rating;
      const result = answerCard(k, before, rating, world.config, t, { fuzz: false });
      records.set(`${k.noteGuid}/${k.ord}`, result.card);
      // With a moved learning card the next card may not be at the front of its list: both refuse it alike.
      let ref: ReturnType<ReferenceStudyQueue['answered']>;
      try {
        ref = reference.answered(k, result.card, t);
      } catch {
        records.set(`${k.noteGuid}/${k.ord}`, before);
        expect(() => answeredIn(pure, k, result.card, t), label).toThrow();
        continue;
      }
      const answered = answeredIn(pure, k, result.card, t);
      pure = deepFreeze(answered.queue);
      expect(answered.update, label).toEqual(ref);
      undoStack.push({ before, key: k, ref, pure: answered.update });
    } else if (roll < 0.75) {
      const undo = undoStack.pop();
      if (!undo) continue;
      records.set(`${undo.key.noteGuid}/${undo.key.ord}`, undo.before);
      reference.undo(undo.ref);
      pure = deepFreeze(undoIn(pure, undo.pure));
      // After an undo the cutoff is the one from before the answer, which the clock has moved past.
      now = heldBy(reference).cutoff;
    } else if (roll < 0.9) {
      const target = keys[Math.floor(rand() * keys.length)]!;
      const expected = reference.moveToFront(target);
      const moved = moveToFrontIn(pure, target);
      expect(moved !== null, label).toBe(expected);
      if (moved) pure = deepFreeze(moved);
    } else {
      now += Math.floor(rand() * 1500);
      reference.updateCutoff(now);
      pure = deepFreeze(withCutoff(pure, now));
    }
    same(label);
  }
}

describe('random sessions', () => {
  // The same answers, undos, moves and clock jumps run on the copy of the mutable queue and on frozen pure values;
  // after every step the two read the same, and the pure values hold what the old class holds.
  for (let seed = 1; seed <= 150; seed++) {
    it(`session ${seed} reads the same in the copy of the old queue and the pure values`, () => {
      runSession(seed, DEFAULT_WORLD);
    });
  }
  for (const world of OTHER_WORLDS) {
    for (let seed = 1; seed <= 50; seed++) {
      it(`session ${seed} with ${world.label} reads the same in the copy of the old queue and the pure values`, () => {
        runSession(seed, world);
      });
    }
  }
});
