// Tests the study reducer against the mutable session it replaces, on random sequences of what a student does, and
// the guarantees the web will lean on: it changes nothing it is given, reads no clock and numbers what it asks to save.
import { describe, expect, it } from 'vitest';
import { CardChangedError } from './reference-save';
import { createStudyState, studyReducer } from '../reducer';
import { commandsAfter, isDone } from '../selectors';
import type { StudyAction, StudyState } from '../state';
import { deepFreeze } from './freeze';
import { emptyStats, runDifferential } from './harness';
import type { Stats } from './harness';
import { SCENARIOS } from './fixtures';
import type { Failures } from './fake-repository';

const SEEDS = 36;
const STEPS = 100;
const LONG = 120_000;

describe('the reducer and the old session, step by step', () => {
  const stats: Stats = emptyStats();
  for (const scenario of SCENARIOS) {
    it(
      `${scenario.name}: ${SEEDS} random sequences give the same figures, rows, queue, saves and calls`,
      async () => {
        for (let seed = 1; seed <= SEEDS; seed++) {
          await runDifferential({ scenario, seed, steps: STEPS, stats });
        }
      },
      LONG,
    );
  }

  it('the sequences went through every kind of step they are meant to compare', () => {
    const n = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
    expect(stats.steps).toBe(SCENARIOS.length * SEEDS * STEPS);
    expect(stats.answers).toBeGreaterThan(3000);
    expect(stats.hides).toBeGreaterThan(1000);
    expect(stats.flags).toBeGreaterThan(500);
    expect(stats.undos).toBeGreaterThan(1500);
    expect(stats.undoneAnswers).toBeGreaterThan(300);
    expect(stats.skipped).toBeGreaterThan(20);
    expect(stats.dayChanges).toBeGreaterThan(100);
    expect(stats.buried).toBeGreaterThan(100);
    expect(stats.leechesInSimple).toBeGreaterThan(0);
    for (const toast of [
      'leech',
      'leechSuspended',
      'hidden',
      'skipped',
      'neverAgain',
      'undone',
      'nothingToUndo',
    ]) {
      expect(n(stats.toasts, toast), toast).toBeGreaterThan(5);
    }
    for (const call of ['recordReview', 'bury', 'suspend', 'setFlag', 'undo', 'cards']) {
      expect(n(stats.calls, call), call).toBeGreaterThan(100);
    }
    expect(stats.prefetches).toBeGreaterThan(5000);
  });
});

const NETWORK = () => new Error('No se pudo guardar tu respuesta: TypeError: Failed to fetch');
const OTHER = () => new Error('boom');
const CHANGED = () => new CardChangedError();

describe('the reducer and the old session when saving fails', () => {
  const stats: Stats = emptyStats();
  for (const [name, error] of [
    ['a message of the repository', NETWORK],
    ['any other error', OTHER],
    ['a card changed elsewhere', CHANGED],
  ] as const) {
    it(
      `${name}: the session stops at the same step, and what was waiting is not written`,
      async () => {
        for (const scenario of SCENARIOS) {
          for (let seed = 1; seed <= 8; seed++) {
            const failures: Failures = new Map([[1 + (seed % 7), error]]);
            await runDifferential({ scenario, seed, steps: 60, failures, settleOften: 0.5, stats });
          }
        }
      },
      LONG,
    );
  }

  it('the failures stopped sessions in the middle of the sequences', () => {
    expect(stats.failures).toBeGreaterThan(100);
  });
});

const START = SCENARIOS[0]!;
const AT = START.start;

function opened(scenario = START) {
  const initial = deepFreeze(scenario.data());
  return deepFreeze(
    studyReducer(createStudyState(initial, scenario.rootId, scenario.start), {
      type: 'opened',
      now: scenario.start,
    }),
  );
}

function run(state: StudyState, ...actions: StudyAction[]): StudyState {
  return actions.reduce((s, a) => deepFreeze(studyReducer(s, deepFreeze(a))), state);
}

const reveal = { type: 'reveal' } as const;
const answer = (rating: 1 | 2 | 3 | 4, now = AT): StudyAction => ({ type: 'answer', rating, now });

describe('what the web leans on', () => {
  it('opening looks for the first card, and until then an empty screen is not the end', () => {
    const closed = createStudyState(START.data(), START.rootId, AT);
    expect(closed.shown).toBeNull();
    expect(closed.started).toBe(false);
    const open = opened();
    expect(open.shown).not.toBeNull();
    expect(open.started).toBe(true);
    expect(open.revealed).toBe(false);
  });

  it('what it asks to save is numbered 1, 2, 3… in the order it was asked, and `commandsAfter` gives the rest', () => {
    const first = opened();
    const state = run(
      first,
      reveal,
      answer(3),
      { type: 'flag', value: 2 },
      { type: 'undo', now: AT },
    );
    expect(state.outbox.map((c) => c.seq)).toEqual(state.outbox.map((_, i) => i + 1));
    expect(state.outbox.map((c) => c.kind)).toEqual([
      'prefetch',
      'saveAnswer',
      'prefetch',
      'setFlag',
      'undo',
    ]);
    expect(commandsAfter(state, 2).map((c) => c.seq)).toEqual([3, 4, 5]);
    expect(commandsAfter(state, 5)).toEqual([]);
  });

  it('an answer carries everything the repository takes but the mark of the card', () => {
    const state = run(opened(), reveal, answer(4));
    const saved = state.outbox.find((c) => c.kind === 'saveAnswer');
    if (saved?.kind !== 'saveAnswer') throw new Error('no answer was asked to be saved');
    const { review } = saved;
    expect(Object.keys(review).sort()).toEqual(
      [
        'bury',
        'buriedUntil',
        'card',
        'cardVersion',
        'durationMs',
        'interval',
        'lastInterval',
        'queueBefore',
        'rBefore',
        'rating',
        'state',
      ].sort(),
    );
    expect(review.rating).toBe(4);
    expect(review.card).toEqual({ ...state.history[0]?.card });
    expect(review.durationMs).toBe(0);
    expect(review.state.reps).toBeGreaterThan(0);
  });

  it('the time of an answer is the `now` of its action, up to the preset’s cap', () => {
    const seconds = 90;
    const slow = run(opened(), reveal, answer(3, AT + seconds * 1000));
    const fast = run(opened(), reveal, answer(3, AT + 2000));
    const duration = (s: StudyState) =>
      s.outbox.flatMap((c) => (c.kind === 'saveAnswer' ? [c.review.durationMs] : []))[0];
    expect(duration(fast)).toBe(2000);
    expect(duration(slow)).toBeLessThanOrEqual(60_000);
    expect(duration(slow)).toBeGreaterThan(2000);
  });

  it('running an action twice on the same state gives equal states, and changes the first one’s outbox not at all', () => {
    const first = run(opened(), reveal);
    const action = deepFreeze(answer(2));
    expect(studyReducer(first, action)).toEqual(studyReducer(first, action));
    expect(first.outbox).toHaveLength(1);
  });

  it('what changes nothing gives back the very same state, so the screen does not draw again', () => {
    const state = opened();
    expect(studyReducer(state, { type: 'tick', now: AT })).toBe(state);
    expect(studyReducer(state, answer(3))).toBe(state);
    const shown = run(state, reveal);
    expect(studyReducer(shown, reveal)).toBe(shown);
    expect(studyReducer(shown, { type: 'toastExpired', id: 99 })).toBe(shown);
    expect(
      studyReducer(shown, { type: 'skipMissing', card: { noteGuid: 'x', ord: 0 }, now: AT }),
    ).toBe(shown);
  });

  it('a toast goes away only when its own number expires, not an older one’s', () => {
    const one = run(opened(), { type: 'undo', now: AT });
    expect(one.toast).toMatchObject({ kind: 'nothingToUndo' });
    const two = run(one, { type: 'undo', now: AT });
    expect(two.toast!.id).toBeGreaterThan(one.toast!.id);
    expect(run(two, { type: 'toastExpired', id: one.toast!.id }).toast).toEqual(two.toast);
    expect(run(two, { type: 'toastExpired', id: two.toast!.id }).toast).toBeNull();
  });

  it('after a failed save the session stops answering, hiding, flagging and undoing, but still shows', () => {
    const answered = run(opened(), reveal, answer(3));
    const stopped = run(answered, { type: 'saveFailed', failure: { kind: 'notSaved' } });
    expect(stopped.failure).toEqual({ kind: 'notSaved' });
    const revealed = run(stopped, reveal);
    expect(run(revealed, answer(3))).toBe(revealed);
    expect(run(revealed, { type: 'hide', action: 'bury_card', now: AT })).toBe(revealed);
    expect(run(revealed, { type: 'flag', value: 1 })).toBe(revealed);
    expect(run(revealed, { type: 'undo', now: AT })).toBe(revealed);
    expect(run(revealed, { type: 'showNext', now: AT }).shown).not.toBeNull();
    const other = run(stopped, { type: 'saveFailed', failure: { kind: 'changedElsewhere' } });
    expect(other.failure).toEqual({ kind: 'notSaved' });
  });

  it('undoing takes back the answer’s row, its place in the queue and the day’s count', () => {
    const first = opened();
    const shown = first.shown!.entry;
    const answered = run(first, reveal, answer(3));
    expect(answered.data.answers).toHaveLength(first.data.answers.length + 1);
    expect(answered.history).toHaveLength(1);
    const back = run(answered, { type: 'undo', now: AT });
    expect(back.history).toHaveLength(0);
    expect(back.data.answers).toEqual(first.data.answers);
    expect(back.data.rows).toEqual(first.data.rows);
    expect(back.shown?.entry).toEqual(shown);
    expect(back.toast).toMatchObject({ kind: 'undone', action: 'answer' });
  });

  it('an undo says which command it takes back', () => {
    const state = run(opened(), { type: 'flag', value: 3 }, { type: 'undo', now: AT });
    const [flagged, undone] = state.outbox.filter((c) => c.kind !== 'prefetch');
    expect(undone).toMatchObject({ kind: 'undo', undoes: flagged!.seq, action: 'flag' });
  });

  it('crossing the hour the day turns over empties the answers of the day and brings the buried back', () => {
    const scenario = SCENARIOS[3]!;
    const state = opened(scenario);
    expect(state.data.answers.length).toBeGreaterThan(0);
    const next = run(state, { type: 'hide', action: 'bury_card', now: scenario.start });
    const morning = run(next, { type: 'showNext', now: scenario.start + 20 * 60_000 });
    expect(morning.data.answers).toEqual([]);
    expect(morning.queue.today).toBe(state.queue.today + 1);
    expect(morning.data.progress!.every((p) => p.newToday === 0)).toBe(true);
  });

  it('with no card left it is the end, and a later look finds the card that comes back', () => {
    const scenario = SCENARIOS[5]!;
    let state = opened(scenario);
    let guard = 0;
    while (state.shown && guard++ < 200) {
      state = run(state, { type: 'hide', action: 'suspend_card', now: scenario.start });
    }
    expect(isDone(state)).toBe(true);
    expect(run(state, { type: 'tick', now: scenario.start }).shown).toBeNull();
    const undone = run(state, { type: 'undo', now: scenario.start });
    expect(undone.shown).not.toBeNull();
    expect(isDone(undone)).toBe(false);
  });
});
