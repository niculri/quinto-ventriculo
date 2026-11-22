// What each answer leads to when there are no learning steps, when FSRS schedules under a day, and how seconds and
// days convert at the day’s rollover.
import { describe, expect, it } from 'vitest';
import { LearningSteps } from '../LearningSteps';
import type { NextStates } from '../fsrs';
import {
  asRevlogInterval,
  asSeconds,
  intervalKind,
  leeched,
  maybeAsDays,
  nextStates,
} from '../states';
import type { CardState, StateContext } from '../states';

const mem = (stability: number) => ({ stability, difficulty: 5 });
const DAY = 86_400;

function fsrsWith(again: number, hard: number, good: number, easy: number): NextStates {
  return {
    again: { memory: mem(again), interval: again },
    hard: { memory: mem(hard), interval: hard },
    good: { memory: mem(good), interval: good },
    easy: { memory: mem(easy), interval: easy },
  };
}

function context(over: Partial<StateContext> = {}): StateContext {
  return {
    fuzzFactor: null,
    fsrs: fsrsWith(0.2, 0.3, 4, 9),
    shortTermWithSteps: false,
    allowShortTerm: true,
    steps: new LearningSteps([]),
    relearnSteps: new LearningSteps([]),
    maximumReviewInterval: 36_500,
    leechThreshold: 8,
    ...over,
  };
}

const review = (scheduledDays: number, lapses = 0): Extract<CardState, { kind: 'review' }> => ({
  kind: 'review',
  scheduledDays,
  elapsedDays: scheduledDays,
  lapses,
  leeched: false,
  memory: mem(scheduledDays),
});

const relearning = (): CardState => ({
  kind: 'relearning',
  learning: { remainingSteps: 0, scheduledSecs: 600, elapsedSecs: 0, memory: mem(2) },
  review: {
    scheduledDays: 6,
    elapsedDays: 6,
    lapses: 3,
    leeched: false,
    memory: mem(6),
  },
});

describe('a new card with no learning steps', () => {
  const state: CardState = { kind: 'new', position: 0 };

  it('stays «current» as a new card and answers like a failed learning card', () => {
    const next = nextStates(state, context());
    expect(next.current).toBe(state);
    expect(next.again.kind).toBe('learning');
  });

  it('with FSRS under a day allowed, Again and Hard wait the fraction of a day FSRS asks for, in whole seconds', () => {
    const next = nextStates(state, context());
    expect(next.again).toMatchObject({ kind: 'learning', scheduledSecs: Math.trunc(0.2 * DAY) });
    expect(next.hard).toMatchObject({ kind: 'learning', scheduledSecs: Math.trunc(0.3 * DAY) });
  });

  it('when FSRS asks for half a day or more, the card goes to review with at least one day', () => {
    const next = nextStates(state, context({ fsrs: fsrsWith(0.5, 0.2, 0.4, 3) }));
    expect(next.again).toMatchObject({ kind: 'review', scheduledDays: 1 });
    expect(next.hard).toMatchObject({ kind: 'learning', scheduledSecs: Math.trunc(0.2 * DAY) });
    expect(next.good).toMatchObject({ kind: 'learning', scheduledSecs: Math.trunc(0.4 * DAY) });
  });

  it('without the preset allowing it, nothing is scheduled under a day: each interval is rounded up to one day at least', () => {
    const next = nextStates(state, context({ allowShortTerm: false }));
    expect(next.again).toMatchObject({ kind: 'review', scheduledDays: 1 });
    expect(next.hard).toMatchObject({ kind: 'review', scheduledDays: 1 });
    expect(next.good).toMatchObject({ kind: 'review', scheduledDays: 4 });
  });

  it('Easy beats Good by at least a day even when FSRS gives it less', () => {
    const next = nextStates(state, context({ fsrs: fsrsWith(0.2, 0.3, 4.4, 4.2) }));
    expect(next.good).toMatchObject({ kind: 'review', scheduledDays: 4 });
    expect(next.easy).toMatchObject({ kind: 'review', scheduledDays: 5 });
  });
});

describe('graduating from the last learning step', () => {
  const steps = new LearningSteps([10]);
  const lastStep: CardState = {
    kind: 'learning',
    remainingSteps: 1,
    scheduledSecs: 600,
    elapsedSecs: 0,
    memory: mem(0.3),
  };

  it('Good on the last step leaves learning for a review of at least a day', () => {
    const next = nextStates(lastStep, context({ steps, fsrs: fsrsWith(0.1, 0.2, 3.4, 8) }));
    expect(next.good).toMatchObject({ kind: 'review', scheduledDays: 3 });
  });

  it('a short FSRS interval keeps the card learning after the steps only if the preset says so', () => {
    const shortGood = fsrsWith(0.1, 0.2, 0.3, 8);
    const off = nextStates(lastStep, context({ steps, fsrs: shortGood }));
    expect(off.good).toMatchObject({ kind: 'review', scheduledDays: 1 });
    const on = nextStates(lastStep, context({ steps, fsrs: shortGood, shortTermWithSteps: true }));
    expect(on.good).toMatchObject({ kind: 'learning', scheduledSecs: Math.trunc(0.3 * DAY) });
  });

  it('Hard repeats the current step; with the steps gone, it follows FSRS', () => {
    const hard = nextStates(lastStep, context({ steps })).hard;
    expect(hard).toMatchObject({ kind: 'learning', scheduledSecs: 900 });
    const noSteps = nextStates(lastStep, context({ fsrs: fsrsWith(0.1, 2.4, 3, 8) })).hard;
    expect(noSteps).toMatchObject({ kind: 'review', scheduledDays: 2 });
  });
});

describe('a review card that fails, with no relearning steps', () => {
  it('goes to a short relearning when FSRS puts the interval under half a day', () => {
    const again = nextStates(review(20, 1), context({ fsrs: fsrsWith(0.25, 5, 30, 50) })).again;
    expect(again).toMatchObject({
      kind: 'relearning',
      learning: { remainingSteps: 0, scheduledSecs: Math.trunc(0.25 * DAY) },
      review: { scheduledDays: 1, lapses: 2 },
    });
  });

  it('goes back to review at once when the interval is longer, with the lapse counted', () => {
    const again = nextStates(review(20, 1), context({ fsrs: fsrsWith(3.4, 5, 30, 50) })).again;
    expect(again).toMatchObject({ kind: 'review', scheduledDays: 3, lapses: 2 });
  });

  it('is a leech at the threshold, and the flag travels with the new state', () => {
    const at = (lapses: number) => leeched(nextStates(review(20, lapses), context()).again);
    expect(at(6)).toBe(false);
    expect(at(7)).toBe(true);
    expect(at(8)).toBe(false);
  });
});

describe('a review card that passes', () => {
  const fsrs = fsrsWith(1, 10.6, 11.2, 14);

  it('never goes backwards: if FSRS gives more than last time, every pass is at least one day longer, fuzz or not', () => {
    for (const fuzzFactor of [null, 0, 0.5, 0.99]) {
      const next = nextStates(review(10), context({ fsrs, fuzzFactor }));
      if (next.good.kind !== 'review' || next.hard.kind !== 'review') throw new Error('review');
      expect(next.hard.scheduledDays).toBeGreaterThanOrEqual(11);
      expect(next.good.scheduledDays).toBeGreaterThan(next.hard.scheduledDays);
    }
  });

  it('each better answer waits strictly longer than the one before', () => {
    for (const fuzzFactor of [null, 0, 0.3, 0.99]) {
      const next = nextStates(
        review(10),
        context({ fsrs: fsrsWith(1, 10.1, 10.2, 10.3), fuzzFactor }),
      );
      const days = [next.hard, next.good, next.easy].map((s) =>
        s.kind === 'review' ? s.scheduledDays : -1,
      );
      expect(days[0]).toBeLessThan(days[1]!);
      expect(days[1]).toBeLessThan(days[2]!);
    }
  });

  it('keeps the maximum interval, even for Easy', () => {
    const next = nextStates(
      review(10),
      context({ fsrs: fsrsWith(1, 50, 100, 400), maximumReviewInterval: 30 }),
    );
    for (const s of [next.hard, next.good, next.easy]) {
      expect(s).toMatchObject({ kind: 'review', scheduledDays: 30 });
    }
  });
});

describe('a maximum interval under one day', () => {
  it('still leaves every pass one day long: an interval is never shorter than that', () => {
    const next = nextStates(
      review(10),
      context({ fsrs: fsrsWith(1, 50, 100, 400), maximumReviewInterval: 0 }),
    );
    for (const s of [next.hard, next.good, next.easy]) {
      expect(s).toMatchObject({ kind: 'review', scheduledDays: 1 });
    }
  });
});

describe('a relearning card with no relearning steps', () => {
  const answers = (fsrs: NextStates, over: Partial<StateContext> = {}) =>
    nextStates(relearning(), context({ fsrs, ...over }));

  it('Again, Hard and Good under half a day stay in relearning for that many seconds', () => {
    const next = answers(fsrsWith(0.1, 0.2, 0.4, 8));
    expect(next.again).toMatchObject({
      kind: 'relearning',
      learning: { scheduledSecs: Math.trunc(0.1 * DAY), remainingSteps: 0 },
    });
    expect(next.hard).toMatchObject({
      kind: 'relearning',
      learning: { scheduledSecs: Math.trunc(0.2 * DAY) },
    });
    expect(next.good).toMatchObject({
      kind: 'relearning',
      learning: { scheduledSecs: Math.trunc(0.4 * DAY), remainingSteps: 0 },
    });
  });

  it('keeps the review part’s lapses and leaves relearning once FSRS asks for a day or more', () => {
    const next = answers(fsrsWith(1.4, 2.4, 3.4, 8));
    expect(next.again).toMatchObject({ kind: 'review', scheduledDays: 1, lapses: 3 });
    expect(next.hard).toMatchObject({ kind: 'review', scheduledDays: 2, lapses: 3 });
    expect(next.good).toMatchObject({ kind: 'review', scheduledDays: 3, lapses: 3 });
  });

  it('Easy leaves relearning for a review at least a day above Good', () => {
    const next = answers(fsrsWith(0.1, 0.2, 5.4, 5.4));
    expect(next.easy).toMatchObject({ kind: 'review', scheduledDays: 6, lapses: 3 });
  });

  it('with relearning steps, Again restarts them and keeps the interval FSRS asked for on the review part', () => {
    const next = answers(fsrsWith(2.4, 3, 4, 8), { relearnSteps: new LearningSteps([10, 60]) });
    expect(next.again).toMatchObject({
      kind: 'relearning',
      learning: { scheduledSecs: 600, remainingSteps: 2 },
      review: { scheduledDays: 2, lapses: 3 },
    });
  });
});

describe('seconds and days at the rollover', () => {
  it('an interval that does not reach the rollover stays in seconds', () => {
    expect(maybeAsDays({ secs: 999 }, 1000)).toEqual({ secs: 999 });
  });

  it('one that reaches it becomes the next day, and every full day after adds one', () => {
    expect(maybeAsDays({ secs: 1000 }, 1000)).toEqual({ days: 1 });
    expect(maybeAsDays({ secs: 1000 + DAY - 1 }, 1000)).toEqual({ days: 1 });
    expect(maybeAsDays({ secs: 1000 + DAY }, 1000)).toEqual({ days: 2 });
  });

  it('a review interval is already days', () => {
    expect(maybeAsDays({ days: 3 }, 0)).toEqual({ days: 3 });
  });

  it('reads the interval of each state and converts it to seconds or to the log’s sign convention', () => {
    expect(intervalKind({ kind: 'new', position: 0 })).toEqual({ secs: 0 });
    expect(intervalKind(relearning())).toEqual({ secs: 600 });
    expect(intervalKind(review(4))).toEqual({ days: 4 });
    expect(asSeconds({ secs: 90 })).toBe(90);
    expect(asSeconds({ days: 2 })).toBe(2 * DAY);
    expect(asRevlogInterval({ secs: 0 })).toBe(0);
    expect(asRevlogInterval({ secs: 600 })).toBe(-600);
    expect(asRevlogInterval({ days: 4 })).toBe(4);
  });

  it('only review and relearning cards can be leeches', () => {
    expect(leeched({ kind: 'new', position: 0 })).toBe(false);
    expect(leeched({ ...review(3), leeched: true })).toBe(true);
    const state = relearning();
    if (state.kind !== 'relearning') throw new Error('relearning');
    expect(leeched({ ...state, review: { ...state.review, leeched: true } })).toBe(true);
    expect(leeched(state)).toBe(false);
  });
});
