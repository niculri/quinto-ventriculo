// Runs the reducer and the old mutable session side by side, with the same data and clock, and demands they agree.
import { entriesOf, nextLearningDue } from '@qv/srs';
import type { QueueEntry } from '@qv/srs';
import { expect, vi } from 'vitest';
import { cardKey, siblingsOf } from '../../scheduler';
import type { StudyData } from '../../scheduler';
import { actionLabel } from '../../session';
import type { CommandId } from '../commands';
import { createStudyState, studyReducer } from '../reducer';
import { answeredToday, canUndo, commandsNotIn, congrats, countsOf, hasSeen } from '../selectors';
import type { SaveFailure, StudyAction, StudyState, Toast } from '../state';
import { CommandSaver } from './command-saver';
import { FakeRepository } from './fake-repository';
import type { Failures } from './fake-repository';
import { deepFreeze } from './freeze';
import { ASSESSMENT, L1, L2 } from './fixtures';
import type { Scenario } from './fixtures';
import { chooseStep } from './steps';
import type { Step } from './steps';
import { ReferenceStudySession } from './reference-session';
import { studyStrings } from './reference-save';

export interface Stats {
  steps: number;
  answers: number;
  hides: number;
  flags: number;
  undos: number;
  undoneAnswers: number;
  skipped: number;
  dayChanges: number;
  buried: number;
  leechesInSimple: number;
  /** Burying a note while one of its other cards is suspended. */
  buriedNoteWithSuspendedSibling: number;
  /** An undo right after another undo that took something back. */
  undoStreaks: number;
  /** Undoing an answer whose count of the day is gone because the day turned over. */
  undoneAfterDayChange: number;
  /** The day turned over inside something that rebuilds the queue first (burying, suspending, undoing, skipping). */
  dayRebuiltAside: number;
  failures: number;
  prefetches: number;
  toasts: Map<string, number>;
  calls: Map<string, number>;
}

export const emptyStats = (): Stats => ({
  steps: 0,
  answers: 0,
  hides: 0,
  flags: 0,
  undos: 0,
  undoneAnswers: 0,
  skipped: 0,
  dayChanges: 0,
  buried: 0,
  leechesInSimple: 0,
  buriedNoteWithSuspendedSibling: 0,
  undoStreaks: 0,
  undoneAfterDayChange: 0,
  dayRebuiltAside: 0,
  failures: 0,
  prefetches: 0,
  toasts: new Map(),
  calls: new Map(),
});

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sortedRows = (rows: ReadonlyMap<string, unknown>) =>
  [...rows].sort(([a], [b]) => (a < b ? -1 : 1));

function failureText(f: SaveFailure | null): string | null {
  if (!f) return null;
  if (f.kind === 'changedElsewhere') return studyStrings.session.changedElsewhere;
  return f.kind === 'notSaved' ? studyStrings.session.notSaved : f.message;
}

function toastText(t: Toast | null, full: boolean): string | null {
  if (!t) return null;
  const s = studyStrings.session;
  switch (t.kind) {
    case 'leech':
      return s.leech;
    case 'leechSuspended':
      return s.leechSuspended;
    case 'hidden':
      return s.hidden[t.action];
    case 'skipped':
      return s.skipped;
    case 'neverAgain':
      return s.neverAgain;
    case 'undone':
      return s.undone(actionLabel(t.action, full));
    case 'nothingToUndo':
      return s.nothingToUndo;
  }
}

const rowsOf = (d: StudyData) => [...d.rows.values()];
const internal = (target: object, key: string): unknown => Reflect.get(target, key);

/** The two sessions, the repository each saves to, and what is needed to move both the same way. */
class Pair {
  readonly old: ReferenceStudySession;
  state: StudyState;
  readonly saver: CommandSaver;
  private readonly repos: [FakeRepository, FakeRepository];
  private readonly prefetches: [QueueEntry[][], QueueEntry[][]] = [[], []];
  private readonly full: boolean;
  private readonly taken = new Set<CommandId>();
  private lastToast = 0;
  private undoStreak = 0;

  constructor(
    scenario: Scenario,
    failures: Failures | undefined,
    private readonly stats: Stats,
  ) {
    const a = scenario.data();
    const b = scenario.data();
    this.full = a.prefs.fullAnki;
    this.repos = [new FakeRepository(rowsOf(a), failures), new FakeRepository(rowsOf(b), failures)];
    this.old = new ReferenceStudySession(
      a,
      scenario.rootId,
      this.repos[0],
      (e) => this.prefetches[0].push(clone(e)),
      [0, 0],
    );
    this.state = deepFreeze(createStudyState(b, scenario.rootId, Date.now()));
    this.saver = new CommandSaver(
      this.repos[1],
      new Map(rowsOf(b).map((r) => [cardKey(r), r.updatedAt])),
      [0, 0],
      (failure) => this.dispatch({ type: 'saveFailed', failure }),
      (entries) => this.prefetches[1].push(clone(entries as QueueEntry[])),
    );
  }

  dispatch(action: StudyAction) {
    deepFreeze(action);
    const before = this.state;
    const clockWas = Date.now();
    // Whatever the clock says, the reducer gives the same: it only reads the `now` of the action.
    vi.setSystemTime(1);
    const next = studyReducer(before, action);
    vi.setSystemTime(clockWas);
    this.state = deepFreeze(next);
    this.count(before);
    for (const c of commandsNotIn(this.state, this.taken)) {
      this.countCommand(c);
      this.saver.handle(c);
      this.taken.add(c.id);
    }
    const toast = this.state.toast;
    if (toast && toast.id > this.lastToast) {
      this.lastToast = toast.id;
      bump(this.stats.toasts, toast.kind);
      setTimeout(() => this.dispatch({ type: 'toastExpired', id: toast.id }), 3000);
    }
  }

  private count(before: StudyState) {
    const { state, stats } = this;
    if (state.queue.today !== before.queue.today) stats.dayChanges++;
    if (state.data.deck.cards.length < before.data.deck.cards.length) stats.skipped++;
  }

  private countCommand(c: StudyState['outbox'][number]) {
    const { stats } = this;
    if (c.kind === 'saveAnswer' && c.review.bury.length > 0) stats.buried++;
    if (c.kind === 'saveAnswer' && c.review.state.leech && !this.full) stats.leechesInSimple++;
    if (c.kind === 'undo' && c.action === 'answer') stats.undoneAnswers++;
  }

  /** One step of a student, on both sessions. */
  do(step: Step) {
    const before = this.state;
    this.perform(step);
    this.observe(step, before);
  }

  private observe(step: Step, before: StudyState) {
    const { state, stats } = this;
    const shown = before.shown?.entry;
    const rows = before.data.rows;
    if (
      step.kind === 'hide' &&
      step.action === 'bury_note' &&
      shown &&
      siblingsOf(before.data.deck, shown).some((s) => rows.get(cardKey(s))?.suspended)
    ) {
      stats.buriedNoteWithSuspendedSibling++;
    }
    const top = before.history.at(-1);
    if (step.kind === 'undo') {
      if (top && this.undoStreak > 0) stats.undoStreaks++;
      if (top?.kind === 'answer' && !before.data.answers.includes(top.answer)) {
        stats.undoneAfterDayChange++;
      }
      this.undoStreak = top ? this.undoStreak + 1 : 0;
    } else {
      this.undoStreak = 0;
    }
    const aside = step.kind === 'hide' || step.kind === 'skipMissing' || step.kind === 'undo';
    if (aside && before.data.answers.length > 0 && state.queue.today !== before.queue.today) {
      stats.dayRebuiltAside++;
    }
  }

  private perform(step: Step) {
    const now = Date.now();
    const { old, stats } = this;
    switch (step.kind) {
      case 'advance':
        vi.advanceTimersByTime(step.ms);
        return;
      case 'showNext':
        old.showNext();
        {
          this.dispatch({ type: 'showNext', now });
          return;
        }
      case 'tick':
        old.tick();
        {
          this.dispatch({ type: 'tick', now });
          return;
        }
      case 'reveal':
        old.reveal();
        {
          this.dispatch({ type: 'reveal' });
          return;
        }
      case 'answer':
        stats.answers++;
        old.answer(step.rating);
        {
          this.dispatch({ type: 'answer', rating: step.rating, now });
          return;
        }
      case 'hide':
        stats.hides++;
        old.hide(step.action);
        {
          this.dispatch({ type: 'hide', action: step.action, now });
          return;
        }
      case 'flag':
        stats.flags++;
        old.flag(step.value);
        {
          this.dispatch({ type: 'flag', value: step.value });
          return;
        }
      case 'undo':
        stats.undos++;
        old.undo();
        {
          this.dispatch({ type: 'undo', now });
          return;
        }
      case 'skipMissing': {
        const card = step.missing
          ? { noteGuid: 'nothing', ord: 0 }
          : (old.shown?.entry ?? { noteGuid: 'nothing', ord: 0 });
        old.skipMissing(card);
        this.dispatch({ type: 'skipMissing', card, now });
        return;
      }
    }
  }

  compare() {
    const { state, old, full } = this;
    expect(state.shown).toEqual(old.shown);
    expect(state.revealed).toBe(old.revealed);
    expect(toastText(state.toast, full)).toBe(old.toast);
    expect(countsOf(state)).toEqual(old.counts());
    expect(canUndo(state)).toBe(old.canUndo);
    expect(state.answeredInSession).toBe(old.answeredInSession);
    expect(sortedRows(state.data.rows)).toEqual(sortedRows(old.data.rows));
    expect(state.data.answers).toEqual(old.data.answers);
    expect(state.data.progress).toEqual(old.data.progress);
    expect(state.data.deck.cards).toEqual(old.data.deck.cards);
    expect(state.queue).toEqual(internal(old.queue, 'state'));
    expect(state.configs).toEqual(internal(old, 'configs'));
    expect(entriesOf(state.queue)).toEqual(old.queue.entries());
    expect(nextLearningDue(state.queue)).toBe(old.queue.nextLearningDue());
    expect(state.queue.today).toBe(old.queue.today);
    expect(state.queue.learnAheadSecs).toBe(old.queue.learnAheadSecs);
    expect(failureText(state.failure)).toBe(old.failure);
    this.compareEndScreens();
  }

  private compareEndScreens() {
    const { state, old } = this;
    expect(congrats(state)).toEqual(old.congrats());
    for (const ids of [new Set([L1]), new Set([L1, L2]), new Set<string>()]) {
      expect(answeredToday(state, ids)).toBe(old.answeredToday(ids));
    }
    for (const id of [ASSESSMENT, 'none']) expect(hasSeen(state, id)).toBe(old.hasSeen(id));
  }

  /** Waits until both have saved everything, and then compares what each asked of its repository and the marks. */
  async settle() {
    for (let i = 0; ; i++) {
      await vi.advanceTimersByTimeAsync(0);
      if (this.old.pending === 0 && this.saver.pending === 0) break;
      if (i > 400) throw new Error('the saves did not finish');
    }
    const [a, b] = this.repos;
    expect(b.calls).toEqual(a.calls);
    expect(this.prefetches[1]).toEqual(this.prefetches[0]);
    expect(this.saver.stamps).toEqual(this.old.stamps);
    expect(failureText(this.saver.failure)).toBe(this.old.failure);
  }

  finish() {
    for (const c of this.repos[0].calls) bump(this.stats.calls, c.name);
    this.stats.failures += this.old.failure ? 1 : 0;
    this.stats.prefetches += this.prefetches[0].length;
  }
}

export interface RunOptions {
  scenario: Scenario;
  seed: number;
  steps: number;
  failures?: Failures;
  /** Probability of waiting for the saves after a step. */
  settleOften?: number;
  stats: Stats;
}

export async function runDifferential(o: RunOptions): Promise<void> {
  vi.useFakeTimers({ now: o.scenario.start, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  try {
    const pair = new Pair(o.scenario, o.failures, o.stats);
    const choose = chooseStep(o.seed);
    pair.do({ kind: 'showNext' });
    pair.compare();
    for (let i = 0; i < o.steps; i++) {
      o.stats.steps++;
      pair.do(choose.next(pair.old));
      pair.compare();
      if (choose.roll() < (o.settleOften ?? 0.35)) await pair.settle();
    }
    await pair.settle();
    pair.finish();
  } catch (e) {
    if (e instanceof Error)
      e.message = `scenario «${o.scenario.name}», seed ${o.seed}\n${e.message}`;
    throw e;
  } finally {
    vi.useRealTimers();
  }
}
