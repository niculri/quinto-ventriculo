// Tests the study reducer against the mutable session it replaces, on random sequences of what a student does, and
// the guarantees the web will lean on: it changes nothing it is given, reads no clock and numbers what it asks to save.
import { describe, expect, it, vi } from 'vitest';
import { entriesOf } from '@qv/srs';
import { rollProgress } from '../../pace';
import { cardKey } from '../../scheduler';
import type { StudyData } from '../../scheduler';
import { CardChangedError } from './referenceSave';
import { createStudyState, studyReducer } from '../reducer';
import type { CommandId } from '../commands';
import { commandsNotIn, countsOf, isDone } from '../selectors';
import type { StudyAction, StudyState } from '../state';
import { CommandSaver } from './commandSaver';
import { deepFreeze } from './freeze';
import { emptyStats, runDifferential } from './harness';
import type { Stats } from './harness';
import { SCENARIOS } from './scenarios';
import { FakeRepository } from './fakeRepository';
import type { Failures } from './fakeRepository';
import { ReferenceStudySession } from './referenceSession';

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
    expect(stats.buriedNoteWithSuspendedSibling).toBeGreaterThan(20);
    expect(stats.undoStreaks).toBeGreaterThan(100);
    expect(stats.undoneAfterDayChange).toBeGreaterThan(30);
    expect(stats.dayRebuiltAside).toBeGreaterThan(30);
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

  it('what it asks to save is identified by the action’s number and its place in it, and `commandsNotIn` gives the rest', () => {
    const first = opened();
    const state = run(
      first,
      reveal,
      answer(3),
      { type: 'flag', value: 2 },
      { type: 'undo', now: AT },
    );
    // Each action is numbered by the reducer when it comes without a number (opened 1, reveal 2, answer 3…).
    expect(state.outbox.map((c) => c.id)).toEqual(['1.0', '3.0', '3.1', '4.0', '5.0']);
    expect(state.outbox.map((c) => c.kind)).toEqual([
      'prefetch',
      'saveAnswer',
      'prefetch',
      'setFlag',
      'undo',
    ]);
    const [a, b, ...rest] = state.outbox;
    expect(commandsNotIn(state, new Set([a!.id, b!.id])).map((c) => c.id)).toEqual(
      rest.map((c) => c.id),
    );
    expect(commandsNotIn(state, new Set(state.outbox.map((c) => c.id)))).toEqual([]);
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
    expect(undone).toMatchObject({
      kind: 'undo',
      undoes: flagged!.id,
      action: 'flag',
    });
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

describe('a deck with nothing to study', () => {
  it('opening it is already the end, not a screen still waiting for its first card', () => {
    const data = START.data();
    const empty = { ...data, deck: { ...data.deck, cards: [] } };
    const state = deepFreeze(
      studyReducer(createStudyState(empty, START.rootId, AT), { type: 'opened', now: AT }),
    );
    expect(state.shown).toBeNull();
    expect(state.started).toBe(true);
    expect(isDone(state)).toBe(true);
  });
});

describe('the day turning over', () => {
  const scenario = SCENARIOS[3]!;
  const AFTER = scenario.start + 20 * 60_000;
  const before = () => opened(scenario);

  function turnedOver(after: StudyState, first: StudyState) {
    expect(after.queue.today).toBe(first.queue.today + 1);
    expect(after.data.progress!.every((p) => p.newToday === 0)).toBe(true);
  }

  it('rolls the day whatever the first thing done after it is: burying', () => {
    const first = before();
    expect(first.data.answers.length).toBeGreaterThan(0);
    const after = run(first, { type: 'hide', action: 'bury_card', now: AFTER });
    turnedOver(after, first);
    expect(after.data.answers).toEqual([]);
  });

  it('suspending a note', () => {
    const first = before();
    const after = run(first, { type: 'hide', action: 'suspend_note', now: AFTER });
    turnedOver(after, first);
    expect(after.data.answers).toEqual([]);
  });

  it('undoing a burying', () => {
    const first = run(before(), { type: 'hide', action: 'bury_card', now: scenario.start });
    expect(first.data.answers.length).toBeGreaterThan(0);
    const after = run(first, { type: 'undo', now: AFTER });
    turnedOver(after, first);
    expect(after.data.answers).toEqual([]);
  });

  it('skipping a card that is no longer on the site', () => {
    const first = before();
    const after = run(first, { type: 'skipMissing', card: first.shown!.entry, now: AFTER });
    turnedOver(after, first);
    expect(after.data.answers).toEqual([]);
  });

  it('the first answer after it counts for the new day, not the one that ended', () => {
    const first = run(before(), reveal);
    const yesterday = first.data.answers;
    const after = run(first, answer(3, AFTER));
    turnedOver(after, first);
    expect(after.data.answers).toEqual([
      { deckId: first.shown!.entry.deckId, queueBefore: expect.any(String) as string },
    ]);
    expect(yesterday.length).toBeGreaterThan(0);
    expect(after.history.at(-1)).toMatchObject({ kind: 'answer', answer: after.data.answers[0] });
    const back = run(after, { type: 'undo', now: AFTER });
    expect(back.data.answers).toEqual([]);
  });

  it('a new card answered just after it counts against the limit of the new day', () => {
    let first = run(before(), reveal);
    for (let i = 0; i < 60 && first.shown?.entry.kind !== 'new'; i++) {
      first = run(first, answer(3, scenario.start), reveal);
    }
    expect(first.shown?.entry.kind).toBe('new');
    const untouched = run(createStudyState({ ...first.data, answers: [] }, first.rootId, AFTER), {
      type: 'opened',
      now: AFTER,
    });
    const after = run(first, answer(3, AFTER));
    expect(countsOf(untouched).new).toBeGreaterThan(1);
    expect(countsOf(after).new).toBe(countsOf(untouched).new - 1);
    // Yesterday's figures hold what was answered before the cut, not this answer.
    expect(after.data.progress).toEqual(rollProgress(first.data.progress!, first.data.answers));
    const again = run(createStudyState(after.data, after.rootId, AFTER), {
      type: 'opened',
      now: AFTER,
    });
    expect(countsOf(after)).toEqual(countsOf(again));
    expect(entriesOf(after.queue)).toEqual(entriesOf(again.queue));
  });

  it('answering before it keeps counting for the day that is not over', () => {
    const first = run(before(), reveal);
    const after = run(first, answer(3, scenario.start));
    expect(after.queue.today).toBe(first.queue.today);
    expect(after.data.answers).toHaveLength(first.data.answers.length + 1);
  });
});

// The marks of concurrency are filled in by the saving side as each write begins, and put back once the database has
// undone it: a write still going when it is undone must not leave the card's old mark behind (the database would then
// refuse the next answer of that card as «changed elsewhere»).
describe('undoing before what was done is saved', () => {
  interface Doing {
    name: string;
    old: (s: ReferenceStudySession) => void;
    actions: StudyAction[];
  }
  const DOINGS: Doing[] = [
    {
      name: 'an answer',
      old: (s) => {
        s.reveal();
        s.answer(3);
      },
      actions: [reveal, answer(3)],
    },
    { name: 'a flag', old: (s) => s.flag(2), actions: [{ type: 'flag', value: 2 }] },
    {
      name: 'burying the card',
      old: (s) => s.hide('bury_card'),
      actions: [{ type: 'hide', action: 'bury_card', now: AT }],
    },
    {
      name: 'suspending the note',
      old: (s) => s.hide('suspend_note'),
      actions: [{ type: 'hide', action: 'suspend_note', now: AT }],
    },
  ];

  const marksOf = (d: StudyData) =>
    new Map([...d.rows.values()].map((r) => [cardKey(r), r.updatedAt]));

  async function settle(pending: () => number) {
    for (let i = 0; pending() > 0; i++) {
      if (i > 100) throw new Error('the saves did not finish');
      await vi.advanceTimersByTimeAsync(0);
    }
  }

  /** What each side says after doing `doing`, undoing it, and answering the card that comes back. */
  async function afterQuickUndo(doing: Doing, waitFirst: boolean) {
    vi.useFakeTimers({ now: AT, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    try {
      const a = START.data();
      const b = START.data();
      const old = new ReferenceStudySession(
        a,
        START.rootId,
        new FakeRepository([...a.rows.values()], undefined, true),
        undefined,
        [0, 0],
      );
      old.showNext();
      const first = old.shown!.entry;

      let state = studyReducer(createStudyState(b, START.rootId, AT), {
        type: 'opened',
        now: AT,
      });
      const taken = new Set<CommandId>();
      const saver = new CommandSaver(
        new FakeRepository([...b.rows.values()], undefined, true),
        marksOf(b),
        [0, 0],
        (failure) => {
          state = studyReducer(state, { type: 'saveFailed', failure });
        },
        () => undefined,
      );
      const send = (...actions: StudyAction[]) => {
        for (const action of actions) {
          state = studyReducer(state, action);
          for (const c of commandsNotIn(state, taken)) {
            saver.handle(c);
            taken.add(c.id);
          }
        }
      };
      const pending = () => old.pending + saver.pending;

      doing.old(old);
      send(...doing.actions);
      if (waitFirst) await settle(pending);
      old.undo();
      send({ type: 'undo', now: AT });
      await settle(pending);
      expect(old.shown?.entry).toEqual(first);
      expect(state.shown?.entry).toEqual(first);
      old.reveal();
      old.answer(3);
      send(reveal, answer(3));
      await settle(pending);
      return { old: old.failure, now: saver.failure };
    } finally {
      vi.useRealTimers();
    }
  }

  for (const doing of DOINGS) {
    it(`${doing.name} undone after it was saved leaves the card answerable`, async () => {
      expect(await afterQuickUndo(doing, true)).toEqual({ old: null, now: null });
    });

    it(`${doing.name} undone before it was saved leaves the card answerable`, async () => {
      expect(await afterQuickUndo(doing, false)).toEqual({ old: null, now: null });
    });
  }
});
