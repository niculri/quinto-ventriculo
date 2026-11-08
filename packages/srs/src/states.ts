// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Card states and what each answer button leads to, ported from rslib/src/scheduler/states/ (learning.rs,
 * review.rs, relearning.rs, normal.rs) with FSRS on. The SM-2 branches are left out: the web always schedules
 * with FSRS.
 */
import type { MemoryState, NextStates } from './fsrs';
import { withReviewFuzz } from './fuzz';
import type { LearningSteps } from './steps';

export interface NewState {
  kind: 'new';
  position: number;
}

export interface LearnState {
  kind: 'learning';
  remainingSteps: number;
  scheduledSecs: number;
  elapsedSecs: number;
  memory: MemoryState | null;
}

export interface ReviewState {
  kind: 'review';
  scheduledDays: number;
  elapsedDays: number;
  lapses: number;
  leeched: boolean;
  memory: MemoryState | null;
}

export interface RelearnState {
  kind: 'relearning';
  learning: Omit<LearnState, 'kind'>;
  review: Omit<ReviewState, 'kind'>;
}

export type CardState = NewState | LearnState | ReviewState | RelearnState;

export interface SchedulingStates {
  current: CardState;
  again: CardState;
  hard: CardState;
  good: CardState;
  easy: CardState;
}

export interface StateContext {
  /** In [0, 1): picks the interval inside the fuzz range. Null = no fuzz. */
  fuzzFactor: number | null;
  fsrs: NextStates;
  /** Anki's global «FSRS short-term with steps» (off by default). */
  shortTermWithSteps: boolean;
  /** w17 and w18 above 0. */
  allowShortTerm: boolean;
  steps: LearningSteps;
  relearnSteps: LearningSteps;
  maximumReviewInterval: number;
  leechThreshold: number;
}

/** [minimum, maximum] review interval: the maximum is at least 1, the minimum between 1 and the maximum. */
function minAndMax(ctx: StateContext, minimum: number): [number, number] {
  const maximum = Math.max(ctx.maximumReviewInterval, 1);
  return [Math.min(Math.max(minimum, 1), maximum), maximum];
}

const fuzz = (ctx: StateContext, interval: number, min: number, max: number) =>
  withReviewFuzz(ctx.fuzzFactor, interval, min, max);

const roundMin1 = (x: number) => Math.max(Math.round(x), 1);

function shortTerm(ctx: StateContext, steps: LearningSteps, interval: number): boolean {
  return ctx.allowShortTerm && (ctx.shortTermWithSteps || steps.isEmpty()) && interval < 0.5;
}

function reviewState(scheduledDays: number, memory: MemoryState): ReviewState {
  return { kind: 'review', scheduledDays, elapsedDays: 0, lapses: 0, leeched: false, memory };
}

// Learning (learning.rs) ---------------------------------------------------------------------------

function learnNextStates(state: LearnState, ctx: StateContext): SchedulingStates {
  return {
    current: state,
    again: learnAgain(ctx),
    hard: learnHard(state, ctx),
    good: learnGood(state, ctx),
    easy: learnEasy(ctx),
  };
}

function learnAgain(ctx: StateContext): CardState {
  const memory = ctx.fsrs.again.memory;
  const delay = ctx.steps.againDelaySecsLearn();
  if (delay !== null) {
    return {
      kind: 'learning',
      remainingSteps: ctx.steps.remainingForFailed(),
      scheduledSecs: delay,
      elapsedSecs: 0,
      memory,
    };
  }
  const [min, max] = minAndMax(ctx, 1);
  const interval = ctx.fsrs.again.interval;
  if (shortTerm(ctx, ctx.steps, interval)) {
    return {
      kind: 'learning',
      remainingSteps: ctx.steps.remainingForFailed(),
      scheduledSecs: Math.trunc(interval * 86_400),
      elapsedSecs: 0,
      memory,
    };
  }
  return reviewState(fuzz(ctx, roundMin1(interval), min, max), memory);
}

function learnHard(state: LearnState, ctx: StateContext): CardState {
  const memory = ctx.fsrs.hard.memory;
  const delay = ctx.steps.hardDelaySecs(state.remainingSteps);
  if (delay !== null) return { ...state, scheduledSecs: delay, elapsedSecs: 0, memory };
  const [min, max] = minAndMax(ctx, 1);
  const interval = ctx.fsrs.hard.interval;
  if (shortTerm(ctx, ctx.steps, interval)) {
    return { ...state, scheduledSecs: Math.trunc(interval * 86_400), elapsedSecs: 0, memory };
  }
  return reviewState(fuzz(ctx, roundMin1(interval), min, max), memory);
}

function learnGood(state: LearnState, ctx: StateContext): CardState {
  const memory = ctx.fsrs.good.memory;
  const delay = ctx.steps.goodDelaySecs(state.remainingSteps);
  if (delay !== null) {
    return {
      kind: 'learning',
      remainingSteps: ctx.steps.remainingForGood(state.remainingSteps),
      scheduledSecs: delay,
      elapsedSecs: 0,
      memory,
    };
  }
  const [min, max] = minAndMax(ctx, 1);
  const interval = ctx.fsrs.good.interval;
  if (shortTerm(ctx, ctx.steps, interval)) {
    return { ...state, scheduledSecs: Math.trunc(interval * 86_400), elapsedSecs: 0, memory };
  }
  return reviewState(fuzz(ctx, roundMin1(interval), min, max), memory);
}

function learnEasy(ctx: StateContext): ReviewState {
  const [min, max] = minAndMax(ctx, 1);
  // The easy interval is always above the good one (with its fuzz).
  const good = fuzz(ctx, ctx.fsrs.good.interval, min, max);
  const interval = roundMin1(ctx.fsrs.easy.interval);
  return reviewState(fuzz(ctx, interval, good + 1, max), ctx.fsrs.easy.memory);
}

// Review (review.rs) -------------------------------------------------------------------------------

/** Lapses at the threshold, and every half threshold after that (rounding up). */
export function leechThresholdMet(lapses: number, threshold: number): boolean {
  if (threshold <= 0) return false;
  const half = Math.max(Math.ceil(threshold / 2), 1);
  return lapses >= threshold && (lapses - threshold) % half === 0;
}

function constrainPassing(ctx: StateContext, interval: number, minimum: number): number {
  const [min, max] = minAndMax(ctx, minimum);
  return fuzz(ctx, interval, min, max);
}

function reviewNextStates(state: ReviewState, ctx: StateContext): SchedulingStates {
  // If the interval is larger than last time, the fuzz may not go backwards.
  const greaterThanLast = (interval: number) =>
    interval > state.scheduledDays ? state.scheduledDays + 1 : 0;
  const { hard: h, good: g, easy: e } = ctx.fsrs;
  const hard = constrainPassing(
    ctx,
    h.interval,
    Math.max(greaterThanLast(Math.round(h.interval)), 1),
  );
  const good = constrainPassing(
    ctx,
    g.interval,
    Math.max(greaterThanLast(Math.round(g.interval)), hard + 1),
  );
  const easy = constrainPassing(
    ctx,
    e.interval,
    Math.max(greaterThanLast(Math.round(e.interval)), good + 1),
  );
  const passed = (scheduledDays: number, memory: MemoryState): ReviewState => ({
    ...state,
    scheduledDays,
    elapsedDays: 0,
    memory,
  });
  return {
    current: state,
    again: reviewAgain(state, ctx),
    hard: passed(hard, h.memory),
    good: passed(good, g.memory),
    easy: passed(easy, e.memory),
  };
}

function reviewAgain(state: ReviewState, ctx: StateContext): CardState {
  const lapses = state.lapses + 1;
  const leeched = leechThresholdMet(lapses, ctx.leechThreshold);
  // With FSRS the fuzz applies when the card leaves relearning.
  const scheduledDays = ctx.fsrs.again.interval;
  const memory = ctx.fsrs.again.memory;
  const review: Omit<ReviewState, 'kind'> = {
    scheduledDays: roundMin1(scheduledDays),
    elapsedDays: 0,
    lapses,
    leeched,
    memory,
  };
  const delay = ctx.relearnSteps.againDelaySecsLearn();
  if (delay !== null) {
    return {
      kind: 'relearning',
      learning: {
        remainingSteps: ctx.relearnSteps.remainingForFailed(),
        scheduledSecs: delay,
        elapsedSecs: 0,
        memory,
      },
      review,
    };
  }
  if (shortTerm(ctx, ctx.relearnSteps, scheduledDays)) {
    return {
      kind: 'relearning',
      learning: {
        remainingSteps: ctx.relearnSteps.remainingForFailed(),
        scheduledSecs: Math.trunc(scheduledDays * 86_400),
        elapsedSecs: 0,
        memory,
      },
      review,
    };
  }
  return { kind: 'review', ...review };
}

// Relearning (relearning.rs) -----------------------------------------------------------------------

function relearnNextStates(state: RelearnState, ctx: StateContext): SchedulingStates {
  return {
    current: state,
    again: relearnAgain(state, ctx),
    hard: relearnHard(state, ctx),
    good: relearnGood(state, ctx),
    easy: relearnEasy(state, ctx),
  };
}

function relearnAgain(state: RelearnState, ctx: StateContext): CardState {
  const scheduledDays = ctx.fsrs.again.interval;
  const memory = ctx.fsrs.again.memory;
  const delay = ctx.relearnSteps.againDelaySecsLearn();
  if (delay !== null) {
    return {
      kind: 'relearning',
      learning: {
        remainingSteps: ctx.relearnSteps.remainingForFailed(),
        scheduledSecs: delay,
        elapsedSecs: 0,
        memory,
      },
      review: { ...state.review, scheduledDays: roundMin1(scheduledDays), elapsedDays: 0, memory },
    };
  }
  const [min, max] = minAndMax(ctx, 1);
  const review = {
    ...state.review,
    scheduledDays: fuzz(ctx, roundMin1(scheduledDays), min, max),
    memory,
  };
  if (shortTerm(ctx, ctx.relearnSteps, scheduledDays)) {
    return {
      kind: 'relearning',
      learning: {
        remainingSteps: ctx.relearnSteps.remainingForFailed(),
        scheduledSecs: Math.trunc(scheduledDays * 86_400),
        elapsedSecs: 0,
        memory,
      },
      review,
    };
  }
  return { kind: 'review', ...review };
}

function relearnHard(state: RelearnState, ctx: StateContext): CardState {
  const memory = ctx.fsrs.hard.memory;
  const delay = ctx.relearnSteps.hardDelaySecs(state.learning.remainingSteps);
  if (delay !== null) {
    return {
      kind: 'relearning',
      learning: { ...state.learning, scheduledSecs: delay, memory },
      review: { ...state.review, elapsedDays: 0, memory },
    };
  }
  const [min, max] = minAndMax(ctx, 1);
  const interval = ctx.fsrs.hard.interval;
  const review = {
    ...state.review,
    scheduledDays: fuzz(ctx, roundMin1(interval), min, max),
    memory,
  };
  if (shortTerm(ctx, ctx.relearnSteps, interval)) {
    return {
      kind: 'relearning',
      learning: { ...state.learning, scheduledSecs: Math.trunc(interval * 86_400), memory },
      review,
    };
  }
  return { kind: 'review', ...review };
}

function relearnGood(state: RelearnState, ctx: StateContext): CardState {
  const memory = ctx.fsrs.good.memory;
  const remaining = state.learning.remainingSteps;
  const delay = ctx.relearnSteps.goodDelaySecs(remaining);
  if (delay !== null) {
    return {
      kind: 'relearning',
      learning: {
        scheduledSecs: delay,
        remainingSteps: ctx.relearnSteps.remainingForGood(remaining),
        elapsedSecs: 0,
        memory,
      },
      review: { ...state.review, elapsedDays: 0, memory },
    };
  }
  const [min, max] = minAndMax(ctx, 1);
  const interval = ctx.fsrs.good.interval;
  const review = {
    ...state.review,
    scheduledDays: fuzz(ctx, roundMin1(interval), min, max),
    memory,
  };
  if (shortTerm(ctx, ctx.relearnSteps, interval)) {
    return {
      kind: 'relearning',
      learning: {
        ...state.learning,
        scheduledSecs: Math.trunc(interval * 86_400),
        remainingSteps: ctx.relearnSteps.remainingForGood(remaining),
        memory,
      },
      review,
    };
  }
  return { kind: 'review', ...review };
}

function relearnEasy(state: RelearnState, ctx: StateContext): ReviewState {
  const [min, max] = minAndMax(ctx, 1);
  const good = fuzz(ctx, ctx.fsrs.good.interval, min, max);
  const scheduledDays = fuzz(ctx, roundMin1(ctx.fsrs.easy.interval), good + 1, max);
  return {
    kind: 'review',
    ...state.review,
    scheduledDays,
    elapsedDays: 0,
    memory: ctx.fsrs.easy.memory,
  };
}

// Normal (normal.rs) -------------------------------------------------------------------------------

/** The four next states of a card. A new card acts like a failed learning card, but stays «current». */
export function nextStates(state: CardState, ctx: StateContext): SchedulingStates {
  switch (state.kind) {
    case 'new': {
      const next = learnNextStates(
        {
          kind: 'learning',
          remainingSteps: ctx.steps.remainingForFailed(),
          scheduledSecs: 0,
          elapsedSecs: 0,
          memory: null,
        },
        ctx,
      );
      return { ...next, current: state };
    }
    case 'learning':
      return learnNextStates(state, ctx);
    case 'review':
      return reviewNextStates(state, ctx);
    case 'relearning':
      return relearnNextStates(state, ctx);
  }
}

/** Is the card a leech after this answer? */
export function leeched(state: CardState): boolean {
  if (state.kind === 'review') return state.leeched;
  if (state.kind === 'relearning') return state.review.leeched;
  return false;
}

/** Interval of the state: seconds (new and learning) or days (review). */
export type IntervalKind = { secs: number } | { days: number };

export function intervalKind(state: CardState): IntervalKind {
  switch (state.kind) {
    case 'new':
      return { secs: 0 };
    case 'learning':
      return { secs: state.scheduledSecs };
    case 'review':
      return { days: state.scheduledDays };
    case 'relearning':
      return { secs: state.learning.scheduledSecs };
  }
}

/** Seconds that pass the day's rollover become days (interval_kind.rs `maybe_as_days`). */
export function maybeAsDays(kind: IntervalKind, secsUntilRollover: number): IntervalKind {
  if ('secs' in kind && kind.secs >= secsUntilRollover) {
    return { days: Math.floor((kind.secs - secsUntilRollover) / 86_400) + 1 };
  }
  return kind;
}

export function asSeconds(kind: IntervalKind): number {
  return 'secs' in kind ? kind.secs : kind.days * 86_400;
}

/** The revlog's interval: days (positive) or seconds (negative). */
export function asRevlogInterval(kind: IntervalKind): number {
  return 'secs' in kind ? (kind.secs === 0 ? 0 : -kind.secs) : kind.days;
}
