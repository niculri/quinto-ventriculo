// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// A study session as a reducer (Anki's reviewer); the writes it asks for are listed in `outbox`. It never reads the
// clock: every action brings its `now` (ms).
import {
  answerCard,
  answeredIn,
  buildQueue as buildQueueState,
  describeNextStates,
  moveToFrontIn,
  nextOf,
  retrievability,
  schedulingStates,
  undoIn,
  upcomingOf,
  withCutoff,
} from '@qv/srs';
import type { Rating } from '@qv/srs';
import type { AnswerToday, CardRef, StoredCard } from '@qv/schema/user';
import { rollProgress } from '../rollProgress';
import {
  QUEUE_NAMES,
  cardKey,
  configsFor,
  queueInput,
  siblingsOf,
  siblingsToBury,
  timingFor,
  toRecord,
  toStateFields,
} from '../scheduler';
import type { StudyData } from '../scheduler';
import { asNew, blankRow } from '../session';
import type { HideAction } from '../session';
import { commandId } from './commands';
import type { Command, CommandId } from './commands';
import { restoreRows, snapshotRows, withRows } from './history';
import type { StudyAction, StudyState, ToastKind } from './state';

type NewCommand = Command extends infer C ? (C extends Command ? Omit<C, 'id'> : never) : never;

/** The session of a deck as it opens, before it looks for its first card (`opened`). */
export function createStudyState(initial: StudyData, rootId: string, now: number): StudyState {
  const data: StudyData = {
    ...initial,
    rows: new Map(initial.rows),
    answers: [...initial.answers],
  };
  return {
    rootId,
    data,
    ...queueOf(data, rootId, now),
    shown: null,
    revealed: false,
    started: false,
    now,
    toast: null,
    history: [],
    answeredInSession: 0,
    failure: null,
    outbox: [],
    turn: { dispatch: 0, emitted: 0 },
    nextToastId: 1,
  };
}

export function studyReducer(state: StudyState, action: StudyAction): StudyState {
  const turned: StudyState = {
    ...state,
    turn: { dispatch: action.dispatch ?? state.turn.dispatch + 1, emitted: 0 },
  };
  const next = reduce(turned, action);
  return next === turned ? state : next;
}

function reduce(state: StudyState, action: StudyAction): StudyState {
  switch (action.type) {
    case 'opened':
    case 'showNext':
      return showNext(state, action.now);
    case 'tick':
      return state.shown ? state : showNext(state, action.now);
    case 'reveal':
      return !state.shown || state.revealed ? state : { ...state, revealed: true };
    case 'answer':
      return answer(state, action.rating, action.now);
    case 'hide':
      return hide(state, action.action, action.now);
    case 'flag':
      return flag(state, action.value);
    case 'undo':
      return undo(state, action.now);
    case 'skipMissing':
      return skipMissing(state, action.card, action.now);
    case 'toastExpired':
      return state.toast?.id === action.id ? { ...state, toast: null } : state;
    case 'saveFailed':
      return state.failure ? state : { ...state, failure: action.failure };
  }
}

function queueOf(data: StudyData, rootId: string, now: number) {
  const configs = configsFor(data, now);
  return { configs, queue: buildQueueState(queueInput(data, rootId, now, configs)) };
}

// The id the next command will have.
const nextId = (state: StudyState): CommandId => commandId(state.turn.dispatch, state.turn.emitted);

function emit(state: StudyState, command: NewCommand): StudyState {
  const full = { ...command, id: nextId(state) } as Command;
  const { dispatch, emitted } = state.turn;
  return {
    ...state,
    outbox: [...state.outbox, full],
    turn: { dispatch, emitted: emitted + 1 },
  };
}

function withToast(state: StudyState, toast: ToastKind): StudyState {
  return {
    ...state,
    toast: { ...toast, id: state.nextToastId },
    nextToastId: state.nextToastId + 1,
  };
}

// A new day: yesterday's answers no longer count against the limits (`carried`, an answer given just now, is today's)
// and buried cards come back. Whatever rebuilds the queue goes through here, or it would hide the change from
// `showNext`, which would then count yesterday's answers against today's limits.
function withData(
  state: StudyState,
  data: StudyData,
  now: number,
  carried?: AnswerToday,
): StudyState {
  let rolled = data;
  if (timingFor(data.prefs, now).today !== state.queue.today) {
    const { progress, ...rest } = data;
    rolled = {
      ...rest,
      ...(progress ? { progress: rollProgress(progress, data.answers) } : {}),
      answers: carried ? [carried] : [],
    };
  }
  return { ...state, data: rolled, ...queueOf(rolled, state.rootId, now) };
}

const currentRef = (state: StudyState): CardRef | null => {
  if (!state.shown) return null;
  const { noteGuid, ord, deckId } = state.shown.entry;
  return { noteGuid, ord, deckId };
};

function showNext(state: StudyState, now: number, carried?: AnswerToday): StudyState {
  const timing = timingFor(state.data.prefs, now);
  const s = timing.today !== state.queue.today ? withData(state, state.data, now, carried) : state;
  const queue = withCutoff(s.queue, timing.now);
  const entry = nextOf(queue);
  if (!entry) return { ...s, queue, now, revealed: false, started: true, shown: null };
  const row = s.data.rows.get(cardKey(entry));
  const record = toRecord(row, s.data.prefs) ?? asNew(row);
  const states = schedulingStates(entry, record, s.configs.get(entry.deckId)!, timing);
  const labels = describeNextStates(states, timing.nextDayAt - timing.now, queue.learnAheadSecs);
  return emit(
    {
      ...s,
      queue,
      now,
      revealed: false,
      started: true,
      shown: { entry, states, labels, shownAt: now },
    },
    { kind: 'prefetch', entries: upcomingOf(queue, 4).slice(1) },
  );
}

function answer(state: StudyState, rating: Rating, now: number): StudyState {
  const ref = currentRef(state);
  if (!ref || !state.revealed || state.failure) return state;
  const { data, configs } = state;
  const { states, shownAt } = state.shown!;
  const key = cardKey(ref);
  const timing = timingFor(data.prefs, now);
  const config = configs.get(ref.deckId)!;
  const prev = data.rows.get(key);
  const record = toRecord(prev, data.prefs) ?? asNew(prev);
  // FSRS's predicted recall just before the answer, saved for calibrating it later (null for a new card).
  const rBefore =
    record.stability !== null && record.difficulty !== null && record.lastReview !== null
      ? retrievability(
          config.fsrsParams,
          { stability: record.stability, difficulty: record.difficulty },
          Math.max(0, now / 1000 - record.lastReview) / 86_400,
        )
      : null;
  const cardVersion =
    data.deck.cards.find((c) => c.noteGuid === ref.noteGuid && c.ord === ref.ord)?.version ?? null;
  const result = answerCard(ref, record, rating, config, timing, {}, states);
  const bury = siblingsToBury(data, ref, record.queue, config, now);
  const buriedUntil = new Date(timing.nextDayAt * 1000).toISOString();
  const before = snapshotRows(data.rows, [ref, ...bury]);

  const fields = toStateFields(result.card, data.prefs, {
    suspended: (prev?.suspended ?? false) || result.suspend,
    leech: (prev?.leech ?? false) || result.leech,
  });
  const changed: StoredCard[] = [{ ...(prev ?? blankRow(ref)), ...fields, deckId: ref.deckId }];
  for (const b of bury) {
    changed.push({ ...(data.rows.get(cardKey(b)) ?? blankRow(b)), buriedUntil });
  }
  const answered: AnswerToday = { deckId: ref.deckId, queueBefore: QUEUE_NAMES[record.queue] };
  // The first answer after the day turned over is today's: `showNext` adds it once it has rolled the day.
  const newDay = timing.today !== state.queue.today;
  // A card the answer suspends (a leech) does not come back today.
  const { queue, update } = answeredIn(
    state.queue,
    ref,
    result.suspend ? { ...result.card, queue: 'review' } : result.card,
    timing,
  );
  const id = nextId(state);
  // Anki caps the time on a card to the preset's maximum.
  const durationMs = Math.round(Math.min(now - shownAt, config.capAnswerTimeToSecs * 1000));
  let next = emit(
    {
      ...state,
      data: {
        ...data,
        rows: withRows(data.rows, changed),
        answers: newDay ? data.answers : [...data.answers, answered],
      },
      queue,
      history: [
        ...state.history,
        { kind: 'answer', id, card: ref, before, update, answer: answered },
      ],
      answeredInSession: state.answeredInSession + 1,
    },
    {
      kind: 'saveAnswer',
      review: {
        card: ref,
        rating,
        queueBefore: answered.queueBefore,
        interval: result.log.interval,
        lastInterval: result.log.lastInterval,
        durationMs,
        rBefore:
          rBefore !== null && Number.isFinite(rBefore) ? Math.round(rBefore * 1e4) / 1e4 : null,
        cardVersion,
        state: fields,
        bury,
        buriedUntil: bury.length ? buriedUntil : null,
      },
    },
  );
  // In simple mode a leech is only noted down: nothing is suspended by itself, and nothing to explain.
  if (result.leech && data.prefs.fullAnki) {
    next = withToast(next, { kind: result.suspend ? 'leechSuspended' : 'leech' });
  }
  return showNext(next, now, newDay ? answered : undefined);
}

function hide(state: StudyState, action: HideAction, now: number): StudyState {
  const ref = currentRef(state);
  if (!ref || state.failure) return state;
  const { data } = state;
  const note = action.endsWith('note');
  const bury = action.startsWith('bury');
  const cards = note ? [ref, ...siblingsOf(data.deck, ref)] : [ref];
  // Anki does not bury a suspended card.
  const targets = bury ? cards.filter((c) => !data.rows.get(cardKey(c))?.suspended) : cards;
  const until = new Date(timingFor(data.prefs, now).nextDayAt * 1000);
  const before = snapshotRows(data.rows, targets);
  const changed = targets.map((c): StoredCard => {
    const row = data.rows.get(cardKey(c)) ?? blankRow(c);
    return bury
      ? { ...row, buriedUntil: until.toISOString() }
      : { ...row, suspended: true, buriedUntil: null };
  });
  const id = nextId(state);
  const saved = emit(
    {
      ...state,
      data: { ...data, rows: withRows(data.rows, changed) },
      history: [...state.history, { kind: 'action', id, action, card: ref, before }],
    },
    bury
      ? { kind: 'bury', cards: targets, untilMs: until.getTime(), note }
      : { kind: 'suspend', cards: targets, note },
  );
  const toast: ToastKind = data.prefs.fullAnki
    ? { kind: 'hidden', action }
    : { kind: bury ? 'skipped' : 'neverAgain' };
  const rebuilt = withData(withToast(saved, toast), saved.data, now);
  return showNext(rebuilt, now);
}

function flag(state: StudyState, value: number): StudyState {
  const ref = currentRef(state);
  if (!ref || state.failure) return state;
  const { data } = state;
  const row = data.rows.get(cardKey(ref)) ?? blankRow(ref);
  const next = row.flag === value ? 0 : value;
  const before = snapshotRows(data.rows, [ref]);
  const id = nextId(state);
  return emit(
    {
      ...state,
      data: { ...data, rows: withRows(data.rows, [{ ...row, flag: next }]) },
      history: [...state.history, { kind: 'action', id, action: 'flag', card: ref, before }],
    },
    { kind: 'setFlag', card: ref, flag: next },
  );
}

function undo(state: StudyState, now: number): StudyState {
  if (state.failure) return state;
  const item = state.history.at(-1);
  if (!item) return withToast(state, { kind: 'nothingToUndo' });
  let data: StudyData = {
    ...state.data,
    rows: restoreRows(state.data.rows, item.before),
  };
  let s: StudyState = { ...state, history: state.history.slice(0, -1) };
  if (item.kind === 'answer') {
    const i = data.answers.lastIndexOf(item.answer);
    if (i >= 0)
      data = { ...data, answers: [...data.answers.slice(0, i), ...data.answers.slice(i + 1)] };
    s = { ...s, data, queue: undoIn(s.queue, item.update) };
  } else if (item.action !== 'flag') {
    s = withData(s, data, now);
    s = { ...s, queue: moveToFrontIn(s.queue, item.card) ?? s.queue };
  } else {
    s = { ...s, data };
  }
  const action = item.kind === 'answer' ? 'answer' : item.action;
  s = emit(s, { kind: 'undo', undoes: item.id, action, card: item.card });
  s = withToast(s, { kind: 'undone', action });
  return item.kind === 'action' && item.action === 'flag' ? s : showNext(s, now);
}

// Nothing is written: if the card comes back to the site, its progress goes on from where it was.
function skipMissing(
  state: StudyState,
  card: Pick<CardRef, 'noteGuid' | 'ord'>,
  now: number,
): StudyState {
  const entry = state.shown?.entry;
  if (entry?.noteGuid !== card.noteGuid || entry.ord !== card.ord) return state;
  const { deck } = state.data;
  const cards = deck.cards.filter((c) => c.noteGuid !== card.noteGuid || c.ord !== card.ord);
  return showNext(withData(state, { ...state.data, deck: { ...deck, cards } }, now), now);
}
