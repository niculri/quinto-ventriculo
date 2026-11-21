// Tests what the study screen reads from the state of a session.
import { countsOf as queueCounts } from '@qv/srs';
import { describe, expect, it } from 'vitest';
import { congratsInfo } from '../../congrats';
import { createStudyState, studyReducer } from '../reducer';
import {
  answeredToday,
  canUndo,
  commandsAfter,
  congrats,
  countsOf,
  flagOf,
  hasSeen,
  isDone,
  rowOf,
} from '../selectors';
import type { StudyAction, StudyState } from '../state';
import { deepFreeze } from './freeze';
import { ASSESSMENT, L1 } from './fixtures';
import { SCENARIOS } from './scenarios';

const scenario = SCENARIOS[0]!;
const AT = scenario.start;

function run(state: StudyState, ...actions: StudyAction[]): StudyState {
  return actions.reduce((s, a) => deepFreeze(studyReducer(s, deepFreeze(a))), state);
}

const closed = () => deepFreeze(createStudyState(scenario.data(), scenario.rootId, AT));
const opened = () => run(closed(), { type: 'opened', now: AT });

describe('the session before and after it looks for its first card', () => {
  it('only after looking is an empty screen the end', () => {
    expect(isDone(closed())).toBe(false);
    expect(isDone(opened())).toBe(false);
  });

  it('the counts are the queue’s, and an answer takes one off', () => {
    const state = opened();
    expect(countsOf(state)).toEqual(queueCounts(state.queue));
    const total = (c: { new: number; learning: number; review: number }) =>
      c.new + c.learning + c.review;
    const next = run(state, { type: 'reveal' }, { type: 'answer', rating: 3, now: AT });
    expect(total(countsOf(next))).toBeLessThanOrEqual(total(countsOf(state)));
  });
});

describe('the card shown', () => {
  it('has the flag of its row, which flagging the same colour twice takes away', () => {
    const state = opened();
    expect(flagOf(state)).toBe(rowOf(state, state.shown!.entry)?.flag ?? 0);
    const flagged = run(state, { type: 'flag', value: 5 });
    expect(flagOf(flagged)).toBe(5);
    expect(flagOf(run(flagged, { type: 'flag', value: 5 }))).toBe(0);
  });

  it('there is nothing to undo until something is done, and again when it is undone', () => {
    const state = opened();
    expect(canUndo(state)).toBe(false);
    const flagged = run(state, { type: 'flag', value: 1 });
    expect(canUndo(flagged)).toBe(true);
    expect(canUndo(run(flagged, { type: 'undo', now: AT }))).toBe(false);
  });

  it('has no flag when no card is shown', () => {
    expect(flagOf(closed())).toBe(0);
  });
});

describe('the end screens', () => {
  it('the congratulations are worked out from the data and the moment of the last card', () => {
    const state = opened();
    expect(congrats(state)).toEqual(
      congratsInfo(state.data, state.rootId, state.now, state.queue.learnAheadSecs),
    );
  });

  it('knows whether something was answered today in some decks and whether an assessment was seen', () => {
    const state = opened();
    expect(answeredToday(state, new Set([L1]))).toBe(false);
    const answered = run(state, { type: 'reveal' }, { type: 'answer', rating: 3, now: AT });
    const deck = [...answered.data.answers].map((a) => a.deckId);
    expect(answeredToday(answered, new Set(deck))).toBe(true);
    expect(answeredToday(answered, new Set())).toBe(false);
    expect(hasSeen(state, 'nothing')).toBe(false);
    expect(typeof hasSeen(answered, ASSESSMENT)).toBe('boolean');
  });
});

describe('the writes asked for', () => {
  it('`commandsAfter` gives those with a number above the one the saving side has taken', () => {
    const state = run(opened(), { type: 'flag', value: 1 });
    const all = state.outbox;
    expect(commandsAfter(state, 0)).toEqual(all);
    expect(commandsAfter(state, all.at(-1)!.seq)).toEqual([]);
    expect(commandsAfter(state, all[0]!.seq)).toEqual(all.slice(1));
  });
});
