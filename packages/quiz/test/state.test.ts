import { describe, expect, it } from 'vitest';
import {
  answerChoice,
  back,
  currentQuestionId,
  finish,
  next,
  restorePreferences,
  restoreRound,
  seededRandom,
  selectQuestions,
  skip,
  selfAssess,
  startRound,
  summarize,
  toCover,
} from '../src';
import type { QuestionInfo, Round } from '../src';

const Q: QuestionInfo[] = [
  { id: 'a', options: 4, correct: 0 },
  { id: 'b', options: 4, correct: 2 },
  { id: 'c' },
  { id: 'd', options: 3, correct: 1, fixedOrder: true },
];
const BY_ID = new Map(Q.map((q) => [q.id, q]));
const T0 = new Date('2026-11-01T12:00:00Z');

function halfway(): Round {
  let r = startRound(Q, {
    shuffle: true,
    shuffleOptions: true,
    random: seededRandom(7),
    id: 'r',
    now: T0,
  });
  for (let i = 0; i < 2; i++) {
    const q = BY_ID.get(currentQuestionId(r))!;
    r = next(
      q.options
        ? answerChoice(r, q, (q.correct! + i) % q.options, T0)
        : selfAssess(r, q, i === 0, T0),
    );
  }
  return r;
}

/** Through JSON, as it is stored. */
const roundTrip = (r: unknown) => JSON.parse(JSON.stringify(r)) as unknown;

describe('preferences of the cover', () => {
  it('defaults: every group, nothing shuffled', () => {
    expect(restorePreferences(null, ['01', '02'])).toEqual({
      groups: ['01', '02'],
      shuffle: false,
      shuffleOptions: false,
    });
  });

  it('keeps the saved ones; groups that no longer exist go, and none left means all', () => {
    expect(
      restorePreferences({ groups: ['02', 'x'], shuffle: true, shuffleOptions: true }, [
        '01',
        '02',
      ]),
    ).toEqual({ groups: ['02'], shuffle: true, shuffleOptions: true });
    expect(restorePreferences({ groups: ['x'] }, ['01', '02']).groups).toEqual(['01', '02']);
    expect(restorePreferences({ groups: 'nope', shuffle: 'yes' }, ['01']).shuffle).toBe(false);
  });

  it('keeps the order of the groups, not the order they were chosen in', () => {
    expect(restorePreferences({ groups: ['03', '01'] }, ['01', '02', '03']).groups).toEqual([
      '01',
      '03',
    ]);
  });

  it('selects the questions of the chosen groups, in the order of the groups', () => {
    const groups = [
      { id: '01', questions: [1, 2] },
      { id: '02', questions: [3] },
      { id: '03', questions: [4, 5] },
    ];
    expect(selectQuestions(groups, ['03', '01'])).toEqual([1, 2, 4, 5]);
    expect(selectQuestions(groups, [])).toEqual([]);
  });
});

describe('saving and continuing a round', () => {
  it('a round read back is the same round', () => {
    const r = halfway();
    expect(restoreRound(roundTrip(r), BY_ID)).toEqual(r);
    const covered = toCover(back(r));
    expect(restoreRound(roundTrip(covered), BY_ID)).toEqual(covered);
    const done = finish(r);
    expect(restoreRound(roundTrip(done), BY_ID)).toEqual(done);
  });

  it('a round with a skipped question reads back the same (its new order, its answers)', () => {
    const r = skip(halfway());
    expect(r.queue.at(-1)).toBe(halfway().queue[2]);
    const read = restoreRound(roundTrip(r), BY_ID)!;
    expect(read).toEqual(r);
    expect(read.id).toBe(r.id);
    expect(summarize(read, T0)).toEqual(summarize(r, T0));
  });

  it('the same order of the alternatives after reloading', () => {
    const r = halfway();
    const back2 = restoreRound(roundTrip(r), BY_ID)!;
    expect(back2.orders).toEqual(r.orders);
  });

  it('not a round: null', () => {
    for (const raw of [
      null,
      3,
      'x',
      [],
      {},
      { version: 2, queue: ['a'] },
      { version: 1, queue: [] },
    ]) {
      expect(restoreRound(raw, BY_ID)).toBeNull();
    }
    expect(restoreRound({ version: 1, queue: ['a', 4] }, BY_ID)).toBeNull();
  });

  describe('a question of the round is gone (the author took it out)', () => {
    /** a and b answered (b wrong), c on screen and not answered yet. */
    function onC(): Round {
      let r = startRound(Q, { shuffle: false, shuffleOptions: false, id: 'r', now: T0 });
      r = next(answerChoice(r, Q[0]!, 0, T0));
      r = next(answerChoice(r, Q[1]!, 0, T0));
      return r;
    }
    const without = (...ids: string[]) => {
      const m = new Map(BY_ID);
      for (const id of ids) m.delete(id);
      return m;
    };

    it('the round goes on without it and keeps the other answers', () => {
      const r = restoreRound(roundTrip(onC()), without('b'), { id: 'r2' })!;
      expect(r).not.toBeNull();
      expect(r.queue).toEqual(['a', 'c', 'd']);
      expect(r.answers).toEqual([expect.objectContaining({ position: 0, questionId: 'a' })]);
      // Still on c, now the second question.
      expect(currentQuestionId(r)).toBe('c');
      expect([r.index, r.top]).toEqual([1, 1]);
      // A new id: the positions of the history (quiz_answers) are the old ones and must not be taken again.
      expect(r.id).toBe('r2');
      expect(r.startedAt).toBe(T0.toISOString());
    });

    it('the one on screen is gone: the next one comes', () => {
      const r = restoreRound(roundTrip(onC()), without('c'), { id: 'r2' })!;
      expect(r.queue).toEqual(['a', 'b', 'd']);
      expect(r.answers.map((a) => [a.position, a.questionId])).toEqual([
        [0, 'a'],
        [1, 'b'],
      ]);
      expect(currentQuestionId(r)).toBe('d');
      expect([r.index, r.top]).toEqual([2, 2]);
    });

    it('reading back an answered one, and the last one is gone: what is left still fits', () => {
      let r = onC();
      r = next(selfAssess(r, Q[2]!, true, T0));
      r = back(back(r));
      const restored = restoreRound(roundTrip(r), without('d'), { id: 'r2' })!;
      expect(restored.queue).toEqual(['a', 'b', 'c']);
      expect(restored.answers).toHaveLength(3);
      expect([restored.index, restored.top]).toEqual([1, 2]);
      expect(currentQuestionId(restored)).toBe('b');
    });

    it('the orders of the alternatives stay with their questions', () => {
      let r = startRound(Q, {
        shuffle: false,
        shuffleOptions: true,
        random: seededRandom(3),
        id: 'r',
      });
      r = next(answerChoice(r, Q[0]!, 0, T0));
      const restored = restoreRound(roundTrip(r), without('a'))!;
      expect(restored.orders).toEqual(r.orders.slice(1));
      expect(restored.id).not.toBe('r');
    });

    it('a finished round keeps its id: it takes no more answers, and a new id would leave an empty round in the history', () => {
      let r = onC();
      r = finish(next(selfAssess(r, Q[2]!, true, T0)));
      const restored = restoreRound(roundTrip(r), without('b'), { id: 'r2' })!;
      expect(restored).toMatchObject({ id: 'r', finished: true, screen: 'results' });
      expect(restored.queue).toEqual(['a', 'c', 'd']);
      expect(restored.answers.map((a) => [a.position, a.questionId])).toEqual([
        [0, 'a'],
        [1, 'c'],
      ]);
      // A saved finished round on a question (it cannot happen through the round's steps): its results.
      const odd = { ...(roundTrip(r) as Record<string, unknown>), screen: 'question' };
      expect(restoreRound(odd, without('b'))).toMatchObject({ id: 'r', screen: 'results' });
    });

    it('every question of the round is gone: nothing to continue', () => {
      expect(restoreRound(roundTrip(onC()), without('a', 'b', 'c', 'd'))).toBeNull();
    });
  });

  it('a question added to the test does not touch a saved round', () => {
    const r = halfway();
    const more = new Map(BY_ID).set('z', { id: 'z', options: 2, correct: 0 });
    expect(restoreRound(roundTrip(r), more)).toEqual(r);
  });

  it('the key fixed by the author: the saved answer is judged with today’s key', () => {
    let r = startRound(Q, { shuffle: false, shuffleOptions: false, id: 'r', now: T0 });
    r = answerChoice(r, Q[0]!, 1, T0);
    expect(r.answers[0]!.correct).toBe(false);
    const fixed = new Map(BY_ID).set('a', { id: 'a', options: 4, correct: 1 });
    expect(restoreRound(roundTrip(r), fixed)!.answers[0]!.correct).toBe(true);
  });

  it('a question with fewer alternatives now: its order goes back to the original, a chosen one out of range goes', () => {
    let r = startRound(Q, {
      shuffle: false,
      shuffleOptions: true,
      random: seededRandom(1),
      id: 'r',
      now: T0,
    });
    r = answerChoice(r, Q[0]!, 3, T0);
    const fewer = new Map(BY_ID).set('a', { id: 'a', options: 3, correct: 0 });
    const back2 = restoreRound(roundTrip(r), fewer)!;
    expect(back2.orders[0]).toBeNull();
    expect(back2.answers).toEqual([]);
  });

  it('positions out of range are clamped and answers that do not fit are dropped', () => {
    const r = halfway();
    const raw = roundTrip(r) as Record<string, unknown>;
    raw.top = 99;
    raw.index = -4;
    raw.answers = [
      ...(raw.answers as unknown[]),
      { position: 0, questionId: r.queue[0], chosen: 0, correct: true }, // repeated position
      { position: 3, questionId: 'zzz', chosen: 0 }, // another question
      { position: 'x' },
      'nope',
    ];
    raw.orders = 'broken';
    raw.screen = 'nowhere';
    const back2 = restoreRound(raw, BY_ID)!;
    expect(back2.top).toBe(3);
    expect(back2.index).toBe(0);
    expect(back2.answers).toHaveLength(2);
    expect(back2.orders.every((o) => o === null)).toBe(true);
    expect(back2.screen).toBe('cover');
  });

  it('a short answer keeps whether the user knew it; a choice without a valid alternative goes', () => {
    const raw = {
      version: 1,
      id: 'r',
      queue: ['c', 'a'],
      index: 1,
      top: 1,
      answers: [
        { position: 0, questionId: 'c', chosen: null, correct: true, at: T0.toISOString() },
        { position: 1, questionId: 'a', chosen: 'A', correct: true },
      ],
      screen: 'question',
      finished: false,
    };
    const r = restoreRound(raw, BY_ID)!;
    expect(r.answers).toEqual([
      { position: 0, questionId: 'c', chosen: null, correct: true, at: T0.toISOString() },
    ]);
  });

  it('«results» without being finished is a cover; an order that is not a permutation is dropped', () => {
    const r = halfway();
    const raw = roundTrip(r) as Record<string, unknown>;
    raw.screen = 'results';
    raw.finished = false;
    raw.orders = (raw.orders as unknown[]).map((o) => (Array.isArray(o) ? o.map(() => 0) : o));
    const back2 = restoreRound(raw, BY_ID)!;
    expect(back2.screen).toBe('cover');
    expect(back2.orders.every((o) => o === null)).toBe(true);
  });
});

describe('the history of a round', () => {
  it('counts answered, right and wrong; the end only when finished', () => {
    const r = halfway();
    expect(summarize(r, T0)).toEqual({
      id: 'r',
      startedAt: T0.toISOString(),
      finishedAt: null,
      total: 4,
      answered: 2,
      correct: 1,
      wrong: 1,
      finished: false,
    });
    expect(summarize(finish(r), T0)).toMatchObject({
      finishedAt: T0.toISOString(),
      finished: true,
    });
  });
});
