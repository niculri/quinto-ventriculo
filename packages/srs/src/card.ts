// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * A user's card as the scheduler keeps it (Anki's card: type, queue, due, interval, remaining steps, FSRS
 * memory, reps and lapses) and the two operations of answering it: the four next states
 * (rslib/src/scheduler/answering/mod.rs, current.rs) and applying one (learning.rs, review.rs,
 * relearning.rs of answering/).
 */
import type { DeckConfig } from './config';
import { allowShortTerm, fsrsNextStates } from './fsrs';
import type { MemoryState } from './fsrs';
import { fuzzSeed, unitFromSeed } from './random';
import {
  asRevlogInterval,
  intervalKind,
  leeched as isLeeched,
  maybeAsDays,
  nextStates,
} from './states';
import type { CardState, SchedulingStates } from './states';
import { LearningSteps } from './steps';
import type { SchedTiming } from './timing';

/** Anki's card type. */
export type Phase = 'new' | 'learning' | 'review' | 'relearning';
/** Anki's queue (without the buried and suspended ones, which the web keeps apart). */
export type Queue = 'new' | 'learn' | 'dayLearn' | 'review';
export type Rating = 1 | 2 | 3 | 4;

export interface CardRecord {
  phase: Phase;
  queue: Queue;
  /** learn: Unix time (seconds); dayLearn and review: day number; new: position. */
  due: number;
  /** Days (Anki's `ivl`). */
  interval: number;
  /** Learning or relearning steps left (Anki's `left`). */
  remainingSteps: number;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  /** Unix time (seconds) of the last answer. */
  lastReview: number | null;
}

export interface CardKey {
  noteGuid: string;
  ord: number;
}

/** A card that was never answered (Anki: type and queue new, `due` = its position). */
export function newCard(position: number): CardRecord {
  return {
    phase: 'new',
    queue: 'new',
    due: position,
    interval: 0,
    remainingSteps: 0,
    stability: null,
    difficulty: null,
    reps: 0,
    lapses: 0,
    lastReview: null,
  };
}

export function memoryOf(card: CardRecord): MemoryState | null {
  return card.stability !== null && card.difficulty !== null
    ? { stability: card.stability, difficulty: card.difficulty }
    : null;
}

/** The card's current state (current.rs `normal_study_state`). */
export function currentState(card: CardRecord, config: DeckConfig, timing: SchedTiming): CardState {
  const memory = memoryOf(card);
  // Outside a filtered deck a review is never due «before today».
  const due = card.phase === 'review' ? Math.min(card.due, timing.today) : card.due;
  const elapsedSecs = card.lastReview === null ? 0 : Math.max(0, timing.now - card.lastReview);
  switch (card.phase) {
    case 'new':
      return { kind: 'new', position: Math.max(0, due) };
    case 'learning':
      return {
        kind: 'learning',
        remainingSteps: card.remainingSteps,
        scheduledSecs: new LearningSteps(config.learnSteps).currentDelaySecs(card.remainingSteps),
        elapsedSecs,
        memory,
      };
    case 'review':
      return {
        kind: 'review',
        scheduledDays: card.interval,
        elapsedDays: Math.max(0, card.interval - (due - timing.today)),
        lapses: card.lapses,
        leeched: false,
        memory,
      };
    case 'relearning':
      return {
        kind: 'relearning',
        learning: {
          remainingSteps: card.remainingSteps,
          scheduledSecs: new LearningSteps(config.relearnSteps).currentDelaySecs(
            card.remainingSteps,
          ),
          elapsedSecs,
          memory,
        },
        review: {
          scheduledDays: card.interval,
          elapsedDays: card.interval,
          lapses: card.lapses,
          leeched: false,
          memory,
        },
      };
  }
}

/** Days since the last answer, as Anki gives them to FSRS: counted from the next rollover. */
export function daysElapsed(card: CardRecord, timing: SchedTiming): number {
  if (card.lastReview === null) return 0;
  return Math.floor(Math.max(0, timing.nextDayAt - card.lastReview) / 86_400);
}

export interface AnswerOptions {
  /** Interval fuzz and learning-step fuzz (off in the comparisons with Anki in test mode). */
  fuzz?: boolean;
  /** Anki's global «FSRS short-term with steps» option. */
  shortTermWithSteps?: boolean;
  /** A given fuzz factor in [0, 1) instead of the card's (tests). */
  fuzzFactor?: number;
}

/** The four next states of a card (Anki: get_scheduling_states). */
export function schedulingStates(
  key: CardKey,
  card: CardRecord,
  config: DeckConfig,
  timing: SchedTiming,
  options: AnswerOptions = {},
): SchedulingStates {
  const fuzz = options.fuzz ?? true;
  const fsrs = fsrsNextStates(
    config.fsrsParams,
    memoryOf(card),
    config.desiredRetention,
    daysElapsed(card, timing),
  );
  return nextStates(currentState(card, config, timing), {
    fuzzFactor:
      options.fuzzFactor ??
      (fuzz ? unitFromSeed(fuzzSeed(key.noteGuid, key.ord, card.reps)) : null),
    fsrs,
    shortTermWithSteps: options.shortTermWithSteps ?? false,
    allowShortTerm: allowShortTerm(config.fsrsParams),
    steps: new LearningSteps(config.learnSteps),
    relearnSteps: new LearningSteps(config.relearnSteps),
    maximumReviewInterval: config.maximumReviewInterval,
    leechThreshold: config.leechThreshold,
  });
}

/** The next state for a rating. */
export function stateFor(states: SchedulingStates, rating: Rating): CardState {
  return [states.again, states.hard, states.good, states.easy][rating - 1]!;
}

/** What an answer writes to the review log (Anki's revlog). */
export interface AnswerLog {
  rating: Rating;
  /** Days (positive) or seconds (negative), as Anki's revlog `ivl`. */
  interval: number;
  lastInterval: number;
  /** Anki's revlog type: the phase of the card before answering. */
  phaseBefore: Phase;
}

export interface AnswerResult {
  card: CardRecord;
  log: AnswerLog;
  /** Became a leech with this answer (Anki adds the «leech» tag). */
  leech: boolean;
  /** The preset suspends leeches. */
  suspend: boolean;
  /** Queue of the card before answering (for the day's counts). */
  queueBefore: Queue;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Up to 25 % more seconds, at most 5 minutes (learning.rs `learning_ivl_with_fuzz`). */
export function learningIntervalWithFuzz(secs: number, factor: number | null): number {
  if (factor === null) return secs;
  const upperExclusive = secs + Math.floor(Math.min(secs * 0.25, 300));
  return secs >= upperExclusive ? secs : secs + Math.floor(factor * (upperExclusive - secs));
}

/** Applies an answer to the card (Anki: answer_card), at `timing.now`. */
export function answerCard(
  key: CardKey,
  card: CardRecord,
  rating: Rating,
  config: DeckConfig,
  timing: SchedTiming,
  options: AnswerOptions = {},
  states: SchedulingStates = schedulingStates(key, card, config, timing, options),
): AnswerResult {
  const fuzz = options.fuzz ?? true;
  const current = states.current;
  const next = stateFor(states, rating);
  const secsUntilRollover = timing.nextDayAt - timing.now;
  const factor = fuzz ? unitFromSeed(fuzzSeed(key.noteGuid, key.ord, card.reps)) : null;
  const out: CardRecord = { ...card, reps: card.reps + 1, lastReview: timing.now };

  /** Learning and relearning: under the rollover, a time today; over it, a day. */
  const placeLearning = (secs: number) => {
    const kind = maybeAsDays({ secs }, secsUntilRollover);
    if ('secs' in kind) {
      out.queue = 'learn';
      out.due = timing.now + learningIntervalWithFuzz(kind.secs, factor);
    } else {
      out.queue = 'dayLearn';
      out.due = timing.today + kind.days;
    }
  };

  switch (next.kind) {
    case 'new':
      throw new Error('Una respuesta no deja una tarjeta nueva');
    case 'learning':
      out.phase = 'learning';
      out.remainingSteps = next.remainingSteps;
      out.stability = next.memory?.stability ?? null;
      out.difficulty = next.memory?.difficulty ?? null;
      placeLearning(next.scheduledSecs);
      break;
    case 'review':
      out.phase = 'review';
      out.queue = 'review';
      out.interval = next.scheduledDays;
      out.due = timing.today + next.scheduledDays;
      out.lapses = next.lapses;
      out.remainingSteps = 0;
      out.stability = next.memory?.stability ?? null;
      out.difficulty = next.memory?.difficulty ?? null;
      break;
    case 'relearning':
      out.phase = 'relearning';
      out.interval = next.review.scheduledDays;
      out.remainingSteps = next.learning.remainingSteps;
      out.lapses = next.review.lapses;
      out.stability = next.learning.memory?.stability ?? null;
      out.difficulty = next.learning.memory?.difficulty ?? null;
      placeLearning(next.learning.scheduledSecs);
      break;
  }

  // Anki saves the memory state rounded (storage/card/data.rs): stability to 4 places, difficulty to 3.
  if (out.stability !== null) out.stability = roundTo(out.stability, 4);
  if (out.difficulty !== null) out.difficulty = roundTo(out.difficulty, 3);

  const leech = isLeeched(next);
  return {
    card: out,
    log: {
      rating,
      interval: asRevlogInterval(maybeAsDays(intervalKind(next), secsUntilRollover)),
      lastInterval: asRevlogInterval(maybeAsDays(intervalKind(current), secsUntilRollover)),
      phaseBefore: card.phase,
    },
    leech,
    suspend: leech && config.leechAction === 'suspend',
    queueBefore: card.queue,
  };
}
