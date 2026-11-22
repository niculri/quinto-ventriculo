// Applying an answer to a card: what is written to the card and the log, the fuzz of short steps, rounding of the memory
// state and what an answer never produces.
import { describe, expect, it } from 'vitest';
import { answerCard, newCard, schedulingStates } from '../card';
import type { CardRecord, Rating } from '../card';
import { defaultConfig } from '../config';
import type { SchedulingStates } from '../states';

const NOW = 1_800_000_000;
const timing = { now: NOW, today: 20_000, nextDayAt: NOW + 30_000 };
const key = { noteGuid: 'nota-inventada', ord: 0 };
const config = (over: Partial<ReturnType<typeof defaultConfig>> = {}) => ({
  ...defaultConfig(),
  ...over,
});

describe('the delay of a learning step', () => {
  const delays = (minutes: number, fuzz: boolean) =>
    Array.from({ length: 300 }, (_, i) => {
      const result = answerCard(
        { noteGuid: `nota-${i}`, ord: 0 },
        newCard(0),
        1,
        config({ learnSteps: [minutes] }),
        timing,
        { fuzz },
      );
      return result.card.due - NOW;
    });

  it('is exactly the step without fuzz', () => {
    expect(new Set(delays(10, false))).toEqual(new Set([600]));
  });

  it('grows by up to a quarter of the step with fuzz, so 10 minutes wait between 10 and 12.5, never less', () => {
    const waits = delays(10, true);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(600);
    expect(Math.max(...waits)).toBeLessThan(750);
    expect(new Set(waits).size).toBeGreaterThan(50);
  });

  it('never adds more than five minutes, however long the step', () => {
    const waits = delays(60, true);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(3600);
    expect(Math.max(...waits)).toBeLessThan(3900);
    expect(Math.max(...waits)).toBeGreaterThan(3800);
  });

  it('adds nothing to a step too short for a quarter to reach a whole second', () => {
    expect(new Set(delays(0.05, true))).toEqual(new Set([3]));
  });
});

describe('what an answer writes to the card', () => {
  it('a step that passes the rollover becomes a day-learning card due on the next day', () => {
    const farStep = (timing.nextDayAt - timing.now) / 60 + 1;
    const out = answerCard(key, newCard(0), 1, config({ learnSteps: [farStep] }), timing, {
      fuzz: false,
    }).card;
    expect(out.queue).toBe('dayLearn');
    expect(out.due).toBe(timing.today + 1);
    expect(out.phase).toBe('learning');
  });

  it('rounds the memory state it saves: stability to 4 places and difficulty to 3', () => {
    const out = answerCard(key, newCard(0), 3, config(), timing, { fuzz: false }).card;
    expect(out.stability).toBe(Number(out.stability!.toFixed(4)));
    expect(out.difficulty).toBe(Number(out.difficulty!.toFixed(3)));
    expect(out.reps).toBe(1);
    expect(out.lastReview).toBe(NOW);
  });

  it('counts the lapse and keeps the review’s interval when a review card fails', () => {
    const reviewCard: CardRecord = {
      ...newCard(0),
      phase: 'review',
      queue: 'review',
      due: timing.today,
      interval: 12,
      reps: 5,
      lapses: 1,
      stability: 12,
      difficulty: 5,
      lastReview: NOW - 12 * 86_400,
    };
    const result = answerCard(key, reviewCard, 1, config(), timing, { fuzz: false });
    expect(result.card.phase).toBe('relearning');
    expect(result.card.lapses).toBe(2);
    expect(result.card.reps).toBe(6);
    expect(result.log).toMatchObject({ rating: 1, phaseBefore: 'review', lastInterval: 12 });
    expect(result.queueBefore).toBe('review');
  });

  it('suspends a leech only when the preset says so, and flags it either way', () => {
    const failing = (leechAction: 'suspend' | 'tagOnly') =>
      answerCard(
        key,
        {
          ...newCard(0),
          phase: 'review',
          queue: 'review',
          due: timing.today,
          interval: 9,
          lapses: 7,
          stability: 9,
          difficulty: 5,
          reps: 9,
          lastReview: NOW - 9 * 86_400,
        },
        1,
        config({ leechThreshold: 8, leechAction }),
        timing,
        { fuzz: false },
      );
    expect(failing('suspend')).toMatchObject({ leech: true, suspend: true });
    expect(failing('tagOnly')).toMatchObject({ leech: true, suspend: false });
  });
});

describe('answering with the states the caller passes', () => {
  const noMemory: SchedulingStates = (() => {
    const learning = {
      kind: 'learning' as const,
      remainingSteps: 1,
      scheduledSecs: 60,
      elapsedSecs: 0,
      memory: null,
    };
    const review = {
      kind: 'review' as const,
      scheduledDays: 5,
      elapsedDays: 0,
      lapses: 2,
      leeched: false,
      memory: null,
    };
    return {
      current: { kind: 'new', position: 0 },
      again: learning,
      hard: review,
      good: {
        kind: 'relearning',
        learning: { remainingSteps: 1, scheduledSecs: 60, elapsedSecs: 0, memory: null },
        review,
      },
      easy: review,
    };
  })();

  const answer = (rating: Rating) =>
    answerCard(key, newCard(0), rating, config(), timing, { fuzz: false }, noMemory).card;

  it('a state without a memory leaves the card without stability or difficulty', () => {
    for (const rating of [1, 2, 3, 4] as const) {
      const card = answer(rating);
      expect(card.stability).toBeNull();
      expect(card.difficulty).toBeNull();
    }
  });

  it('writes the phase each state stands for', () => {
    expect(answer(1)).toMatchObject({ phase: 'learning', queue: 'learn', due: NOW + 60 });
    expect(answer(2)).toMatchObject({
      phase: 'review',
      queue: 'review',
      interval: 5,
      due: timing.today + 5,
      lapses: 2,
    });
    expect(answer(3)).toMatchObject({ phase: 'relearning', interval: 5, lapses: 2 });
  });

  it('an answer never leaves a card new', () => {
    const toNew: SchedulingStates = { ...noMemory, again: { kind: 'new', position: 0 } };
    expect(() => answerCard(key, newCard(0), 1, config(), timing, { fuzz: false }, toNew)).toThrow(
      'Una respuesta no deja una tarjeta nueva',
    );
  });
});

describe('schedulingStates', () => {
  it('lets the caller choose the fuzz factor, which then decides the Good interval inside the fuzz range', () => {
    const reviewCard: CardRecord = {
      ...newCard(0),
      phase: 'review',
      queue: 'review',
      due: timing.today,
      interval: 30,
      reps: 4,
      stability: 30,
      difficulty: 5,
      lastReview: NOW - 30 * 86_400,
    };
    const goodDays = (fuzzFactor: number) => {
      const state = schedulingStates(key, reviewCard, config(), timing, { fuzzFactor }).good;
      return state.kind === 'review' ? state.scheduledDays : -1;
    };
    expect(goodDays(0)).toBeLessThan(goodDays(0.999));
    const plain = schedulingStates(key, reviewCard, config(), timing, { fuzz: false }).good;
    if (plain.kind !== 'review') throw new Error('review');
    expect(goodDays(0)).toBeLessThanOrEqual(plain.scheduledDays);
    expect(goodDays(0.999)).toBeGreaterThanOrEqual(plain.scheduledDays);
  });
});
