// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * The scheduler against real Anki 25.9 (FSRS on): scripts/anki_trace.py answered the same cards in Anki and
 * recorded, for every answer, the card before and after, the four next states and the button texts. Here the
 * same answers go through @qv/srs, carrying its own state (never Anki's) from one answer to the next.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  answerCard,
  configFromAnki,
  constrainedFuzzBounds,
  describeNextStates,
  newCard,
  schedulingStates,
  withReviewFuzz,
} from '../src';
import type { CardRecord, CardState, Rating, SchedTiming } from '../src';

interface AnkiCard {
  type: number;
  queue: number;
  due: number;
  ivl: number;
  left: number;
  reps: number;
  lapses: number;
  s: number | null;
  d: number | null;
  lrt: number | null;
}

type AnkiMemory = { s: number; d: number } | null;
type AnkiState =
  | { kind: 'new'; position: number }
  | { kind: 'learning'; remainingSteps: number; scheduledSecs: number; memory: AnkiMemory }
  | {
      kind: 'review';
      scheduledDays: number;
      elapsedDays: number;
      lapses: number;
      leeched: boolean;
      memory: AnkiMemory;
    }
  | {
      kind: 'relearning';
      learning: { remainingSteps: number; scheduledSecs: number; memory: AnkiMemory };
      review: {
        scheduledDays: number;
        elapsedDays: number;
        lapses: number;
        leeched: boolean;
        memory: AnkiMemory;
      };
    };

interface Step {
  advance: number;
  rating: Rating;
  timing: SchedTiming;
  answeredAt: number;
  before: AnkiCard;
  states: Record<'current' | 'again' | 'hard' | 'good' | 'easy', AnkiState>;
  labels: string[];
  after: AnkiCard;
  leechTagged: boolean;
}

interface Trace {
  testMode: boolean;
  scenarios: { name: string; config: Record<string, unknown>; steps: Step[] }[];
}

const load = (file: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'golden', file), 'utf8')) as Trace;

const PHASES = ['new', 'learning', 'review', 'relearning'] as const;

/** Anki's card as ours (Anki's suspended queue −1 keeps the queue it had: we keep «suspended» apart). */
function fromAnki(c: AnkiCard): CardRecord {
  const phase = PHASES[c.type]!;
  const queue =
    phase === 'new'
      ? 'new'
      : phase === 'review'
        ? 'review'
        : c.due > 1_000_000_000
          ? 'learn'
          : 'dayLearn';
  return {
    phase,
    queue,
    due: c.due,
    interval: c.ivl,
    remainingSteps: c.left,
    stability: c.s,
    difficulty: c.d,
    reps: c.reps,
    lapses: c.lapses,
    lastReview: c.lrt,
  };
}

/** What scripts/anki_trace.py does to Anki's card when time goes by. */
function age(card: CardRecord, secs: number): CardRecord {
  if (!secs) return card;
  const out = { ...card };
  if (out.lastReview !== null) out.lastReview -= secs;
  if (out.queue === 'learn') out.due -= secs;
  else if (out.queue === 'review' || out.queue === 'dayLearn') out.due -= Math.floor(secs / 86_400);
  return out;
}

/** Same card, with the FSRS memory compared within what Anki's f32 can tell apart. */
function expectSameCard(ours: CardRecord, anki: CardRecord, where: string, dueTolerance = 0) {
  const { stability, difficulty, due, ...rest } = ours;
  const { stability: s, difficulty: d, due: ankiDue, ...ankiRest } = anki;
  expect(rest, where).toEqual(ankiRest);
  expect(Math.abs(due - ankiDue), `${where}: due ${due} vs ${ankiDue}`).toBeLessThanOrEqual(
    dueTolerance,
  );
  expectClose(stability, s, 1e-4, `${where}: stability`);
  expectClose(difficulty, d, 1e-3, `${where}: difficulty`);
}

function expectClose(a: number | null, b: number | null, places: number, where: string) {
  if (a === null || b === null) {
    expect(a, where).toBe(b);
    return;
  }
  // One unit of the last stored decimal (Anki rounds an f32; we, a double), plus what f32 arithmetic
  // drifts through the formulas (about 10⁻⁵ relative).
  expect(Math.abs(a - b), `${where}: ${a} vs ${b}`).toBeLessThanOrEqual(
    places * 1.01 + Math.abs(b) * 1e-5,
  );
}

function memoryOf(state: CardState) {
  if (state.kind === 'new') return null;
  if (state.kind === 'relearning') return state.learning.memory;
  return state.memory;
}

/** Our state in Anki's shape (without the elapsed times, which Anki computes from other data). */
function shape(state: CardState): unknown {
  switch (state.kind) {
    case 'new':
      return { kind: 'new' };
    case 'learning':
      return {
        kind: 'learning',
        remainingSteps: state.remainingSteps,
        scheduledSecs: state.scheduledSecs,
      };
    case 'review':
      return {
        kind: 'review',
        scheduledDays: state.scheduledDays,
        lapses: state.lapses,
        leeched: state.leeched,
      };
    case 'relearning':
      return {
        kind: 'relearning',
        learning: {
          remainingSteps: state.learning.remainingSteps,
          scheduledSecs: state.learning.scheduledSecs,
        },
        review: {
          scheduledDays: state.review.scheduledDays,
          lapses: state.review.lapses,
          leeched: state.review.leeched,
        },
      };
  }
}

function ankiShape(state: AnkiState): unknown {
  switch (state.kind) {
    case 'new':
      return { kind: 'new' };
    case 'learning':
      return {
        kind: 'learning',
        remainingSteps: state.remainingSteps,
        scheduledSecs: state.scheduledSecs,
      };
    case 'review':
      return {
        kind: 'review',
        scheduledDays: state.scheduledDays,
        lapses: state.lapses,
        leeched: state.leeched,
      };
    case 'relearning':
      return {
        kind: 'relearning',
        learning: {
          remainingSteps: state.learning.remainingSteps,
          scheduledSecs: state.learning.scheduledSecs,
        },
        review: {
          scheduledDays: state.review.scheduledDays,
          lapses: state.review.lapses,
          leeched: state.review.leeched,
        },
      };
  }
}

function ankiMemory(state: AnkiState): AnkiMemory {
  if (state.kind === 'new') return null;
  if (state.kind === 'relearning') return state.learning.memory;
  return state.memory;
}

const BUTTONS = ['again', 'hard', 'good', 'easy'] as const;
const stripIsolation = (s: string) => s.replace(/[⁨⁩]/g, '');

describe('against Anki without fuzz (ANKI_TEST_MODE)', () => {
  const trace = load('transitions.json');
  it('the trace is the one without fuzz', () => expect(trace.testMode).toBe(true));

  for (const scenario of trace.scenarios) {
    it(scenario.name, () => {
      const config = configFromAnki(scenario.config);
      const key = { noteGuid: scenario.name, ord: 0 };
      let card = newCard(scenario.steps[0]!.before.due);
      scenario.steps.forEach((step, n) => {
        const where = `${scenario.name}, answer ${n + 1}`;
        card = age(card, step.advance);
        expectSameCard(card, fromAnki(step.before), `${where} (before)`);

        const states = schedulingStates(key, card, config, step.timing, { fuzz: false });
        for (const button of ['current', ...BUTTONS] as const) {
          const ours = states[button];
          const anki = step.states[button];
          expect(shape(ours), `${where}: ${button}`).toEqual(ankiShape(anki));
          const m = memoryOf(ours);
          const am = ankiMemory(anki);
          if (button === 'current') continue;
          expectClose(m?.stability ?? null, am?.s ?? null, 1e-4, `${where}: ${button} S`);
          expectClose(m?.difficulty ?? null, am?.d ?? null, 1e-4, `${where}: ${button} D`);
        }
        expect(
          describeNextStates(states, step.timing.nextDayAt - step.timing.now, 1200),
          `${where}: buttons`,
        ).toEqual(step.labels.map(stripIsolation));

        const result = answerCard(
          key,
          card,
          step.rating,
          config,
          { ...step.timing, now: step.answeredAt },
          { fuzz: false },
          states,
        );
        // Anki takes the time of a learning step a moment after the answer's time: up to a second later.
        expectSameCard(result.card, fromAnki(step.after), `${where} (after)`, 1);
        expect(result.suspend, `${where}: suspended`).toBe(step.after.queue === -1);
        if (result.leech) expect(step.leechTagged, `${where}: leech`).toBe(true);
        card = { ...result.card, due: fromAnki(step.after).due };
      });
    });
  }
});

describe('against Anki with its fuzz', () => {
  const trace = load('transitions-fuzz.json');
  it('the trace has fuzz', () => expect(trace.testMode).toBe(false));

  /** The interval Anki chose (with its fuzz) falls inside our fuzz range for that answer. */
  for (const scenario of trace.scenarios) {
    it(scenario.name, () => {
      const config = configFromAnki(scenario.config);
      const key = { noteGuid: scenario.name, ord: 0 };
      scenario.steps.forEach((step, n) => {
        const where = `${scenario.name}, answer ${n + 1}`;
        // From Anki's card each time: fuzz makes the paths diverge.
        const card = fromAnki(step.before);
        const exact = schedulingStates(key, card, config, step.timing, { fuzz: false });
        for (const button of BUTTONS) {
          const ours = exact[button];
          const anki = step.states[button];
          expect(anki.kind, `${where}: ${button}`).toBe(ours.kind);
          if (ours.kind !== 'review' || anki.kind !== 'review') continue;
          // The range of our fuzz with the same bounds: from the lowest to the highest factor.
          const low = schedulingStates(key, card, config, step.timing, { fuzz: true });
          const lo = Math.min(
            ...[0, 0.9999].map((f) => fuzzed(key, card, config, step.timing, button, f)),
          );
          const hi = Math.max(
            ...[0, 0.9999].map((f) => fuzzed(key, card, config, step.timing, button, f)),
          );
          expect(low[button].kind).toBe('review');
          expect(
            anki.scheduledDays,
            `${where}: ${button} in [${lo}, ${hi}]`,
          ).toBeGreaterThanOrEqual(lo);
          expect(anki.scheduledDays, `${where}: ${button} in [${lo}, ${hi}]`).toBeLessThanOrEqual(
            hi,
          );
        }
      });
    });
  }
});

/** Our interval for a button with a given fuzz factor (states.ts with the factor forced). */
function fuzzed(
  key: { noteGuid: string; ord: number },
  card: CardRecord,
  config: ReturnType<typeof configFromAnki>,
  timing: SchedTiming,
  button: (typeof BUTTONS)[number],
  factor: number,
): number {
  const state = schedulingStates(key, card, config, timing, { fuzz: false, fuzzFactor: factor })[
    button
  ];
  return state.kind === 'review' ? state.scheduledDays : NaN;
}

describe('fuzz (the tests of Anki’s fuzz.rs)', () => {
  it.each([
    [1, 1, 1000, 1, 1, 1],
    [2.49, 1, 1000, 2, 2, 2],
    [2.5, 1, 1000, 2, 3, 4],
    [7, 1, 1000, 5, 7, 9],
    [17, 1, 1000, 14, 17, 20],
    [37, 1, 1000, 33, 37, 41],
    [2, 2, 1000, 2, 2, 2],
    [2, 3, 1000, 3, 4, 4],
    [2, 3, 3, 3, 3, 3],
    [6.9, 3, 1000, 5, 7, 9],
    [7, 3, 1000, 5, 7, 9],
    [7.1, 3, 1000, 5, 7, 9],
    [19.9, 3, 1000, 17, 20, 23],
    [20, 3, 1000, 17, 20, 23],
    [20.1, 3, 1000, 17, 20, 23],
    [100, 101, 1000, 101, 105, 108],
    [100, 1, 99, 92, 96, 99],
    [100, 97, 103, 97, 100, 103],
  ])('%s in [%s, %s] → %s, %s, %s', (interval, min, max, lower, middle, upper) => {
    expect(withReviewFuzz(0, interval, min, max)).toBe(lower);
    expect(withReviewFuzz(0.5, interval, min, max)).toBe(middle);
    expect(withReviewFuzz(0.99, interval, min, max)).toBe(upper);
  });

  it('without fuzz it only rounds and keeps the bounds', () => {
    expect(withReviewFuzz(null, 1.5, 1, 100)).toBe(2);
    expect(withReviewFuzz(null, 0.1, 1, 100)).toBe(1);
    expect(withReviewFuzz(null, 101, 1, 100)).toBe(100);
  });

  it('invalid bounds do not break', () => {
    expect(() => constrainedFuzzBounds(1, 3, 2)).not.toThrow();
  });
});
