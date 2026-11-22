// Tests what each action of a test's section commits: a step of the round with what it saves, or nothing when it does
// not apply (no round, no question, an answer already given, no questions or no wrong ones).
import { describe, expect, it, vi } from 'vitest';
import type { Preferences, Round } from '@qv/quiz';
import { QUIZ_SECTIONS } from '../../../../test/fixtures/quiz';
import { questionIndex } from '../entries';
import { roundActions } from '../roundActions';
import type { Commit } from '../roundActions';

const section = QUIZ_SECTIONS.pautas!;
const index = questionIndex(section);
const infos = new Map([...index].map(([id, e]) => [id, e.info]));
const all: Preferences = { groups: ['01', '02'], shuffle: false, shuffleOptions: false };

function actions(
  round: Round | null,
  current = round ? index.get(round.queue[round.index]!) : null,
) {
  const commit = vi.fn<Commit>();
  const retry = vi.fn();
  const a = roundActions({
    commit,
    choose: () => undefined,
    current,
    infos,
    shuffle: false,
    round,
    saver: { retry },
    groups: section.groups,
  });
  return { a, commit, retry };
}

/** A round started from the cover with every group, in order. */
function started(): Round {
  const { a, commit } = actions(null);
  a.start(all);
  return commit.mock.calls[0]![0]!;
}

describe('roundActions', () => {
  it('starting takes the chosen groups’ questions, in order, and saves the choice', () => {
    const { a, commit } = actions(null);
    a.start({ ...all, groups: ['02'] });
    const [round, extra] = commit.mock.calls[0]!;
    expect(round?.queue).toEqual(['A-p04-36']);
    expect(extra).toEqual({ preferences: { ...all, groups: ['02'] } });
    expect(started().queue).toEqual(['D-p01-03', 'D-p02-04', 'A-p04-36']);
  });

  it('starting with no group chosen does nothing', () => {
    const { a, commit } = actions(null);
    a.start({ ...all, groups: [] });
    expect(commit).not.toHaveBeenCalled();
  });

  it('without a round, nothing but «Descartar» and «Reintentar» does anything', () => {
    const { a, commit, retry } = actions(null, index.get('D-p01-03'));
    a.resume();
    a.answer(0);
    a.selfAssess(true);
    a.next();
    a.skip();
    a.finishNow();
    a.home();
    a.restart();
    a.repeatAll();
    a.repeatWrong();
    expect(commit).not.toHaveBeenCalled();
    a.discard();
    expect(commit).toHaveBeenCalledExactlyOnceWith(null);
    a.retrySaving();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('an answer saves the round with it; a second answer to the same question, or none shown, does nothing', () => {
    const round = started();
    const { a, commit } = actions(round);
    a.answer(1);
    const [answered, extra] = commit.mock.calls[0]!;
    expect(extra?.answer).toMatchObject({
      roundId: round.id,
      questionId: 'D-p01-03',
      position: 0,
      chosen: 1,
      correct: false,
    });
    const again = actions(answered);
    again.a.answer(0);
    again.a.selfAssess(true);
    expect(again.commit).not.toHaveBeenCalled();
    const none = actions(round, null);
    none.a.answer(0);
    none.a.selfAssess(false);
    expect(none.commit).not.toHaveBeenCalled();
  });

  it('a short answer is judged by the student, and saved', () => {
    const nuevas = QUIZ_SECTIONS.nuevas!;
    const shortIndex = questionIndex(nuevas);
    const commit = vi.fn<Commit>();
    const base = {
      commit,
      choose: () => undefined,
      infos: new Map([...shortIndex].map(([id, e]) => [id, e.info])),
      shuffle: false,
      saver: { retry: () => undefined },
      groups: nuevas.groups,
    };
    roundActions({ ...base, current: null, round: null }).start({ ...all, groups: ['01'] });
    const round = commit.mock.calls[0]![0]!;
    roundActions({ ...base, current: shortIndex.get('N01-01'), round }).selfAssess(true);
    expect(commit.mock.calls[1]![1]?.answer).toMatchObject({ questionId: 'N01-01', correct: true });
  });

  it('«Repetir las malas» with none wrong does nothing; with one, a round of it', () => {
    const round = started();
    const right = actions(round);
    right.a.answer(0);
    const finished = {
      ...right.commit.mock.calls[0]![0]!,
      screen: 'results' as const,
      finished: true,
    };
    const none = actions(finished);
    none.a.repeatWrong();
    expect(none.commit).not.toHaveBeenCalled();
    const wrong = actions(round);
    wrong.a.answer(2);
    const after = actions({ ...wrong.commit.mock.calls[0]![0]!, finished: true });
    after.a.repeatWrong();
    expect(after.commit.mock.calls[0]![0]).toMatchObject({
      queue: ['D-p01-03'],
      origin: 'repeat_wrong',
    });
  });

  it('the moves of a round commit the round each one gives', () => {
    const round = started();
    const { a, commit } = actions(round);
    a.skip();
    a.finishNow();
    a.home();
    a.resume();
    a.restart();
    a.repeatAll();
    a.next();
    expect(commit.mock.calls.map(([r]) => [r?.screen, r?.origin, r?.queue[0]])).toEqual([
      ['question', 'cover', 'D-p02-04'],
      ['results', 'cover', 'D-p01-03'],
      ['cover', 'cover', 'D-p01-03'],
      ['question', 'cover', 'D-p01-03'],
      ['question', 'restart', 'D-p01-03'],
      ['question', 'repeat_all', 'D-p01-03'],
      ['question', 'cover', 'D-p01-03'],
    ]);
  });
});
