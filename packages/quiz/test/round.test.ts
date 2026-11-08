import { describe, expect, it } from 'vitest';
import {
  LETTERS,
  answerAt,
  answerChoice,
  back,
  canGoBack,
  currentQuestionId,
  displayOrder,
  finish,
  isAnswered,
  isResumable,
  letterOf,
  next,
  progress,
  repeatAll,
  repeatWrong,
  restart,
  resultTitle,
  resume,
  resumeLine,
  score,
  seededRandom,
  selfAssess,
  shuffled,
  startRound,
  toCover,
  wrongAnswers,
} from '../src';
import type { QuestionInfo, Round } from '../src';

const Q: QuestionInfo[] = [
  { id: 'a', options: 5, correct: 0 },
  { id: 'b', options: 4, correct: 3 },
  { id: 'c', options: 3, correct: 1, fixedOrder: true },
  { id: 'd' }, // short answer
  { id: 'e', options: 2, correct: 1 },
];
const BY_ID = new Map(Q.map((q) => [q.id, q]));
const q = (id: string) => BY_ID.get(id)!;
const T0 = new Date('2026-11-01T12:00:00Z');

const start = (shuffle = false, shuffleOptions = false, seed = 1) =>
  startRound(Q, { shuffle, shuffleOptions, random: seededRandom(seed), id: 'r1', now: T0 });

/** Answers the question on screen (choice: correct or not; short: knew it or not) and goes on. */
function play(round: Round, right: boolean): Round {
  const info = q(currentQuestionId(round));
  const answered = info.options
    ? answerChoice(round, info, right ? info.correct! : (info.correct! + 1) % info.options, T0)
    : selfAssess(round, info, right, T0);
  return next(answered);
}

describe('random helpers', () => {
  it('a seeded generator repeats itself and stays in [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs).size).toBeGreaterThan(990);
  });

  it('shuffling keeps every item, does not touch the original and moves things around', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const out = shuffled(items, seededRandom(3));
    expect([...out].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(out).not.toEqual(items);
  });

  it('Fisher–Yates is uniform: every permutation of 3 shows up about as often', () => {
    const r = seededRandom(9);
    const counts = new Map<string, number>();
    for (let i = 0; i < 60_000; i++) {
      const k = shuffled([0, 1, 2], r).join('');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });
});

describe('starting a round', () => {
  it('in the original order, on the first question, without answers', () => {
    const r = start();
    expect(r.queue).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r).toMatchObject({
      origin: 'cover',
      index: 0,
      top: 0,
      screen: 'question',
      finished: false,
      answers: [],
    });
    expect(r.startedAt).toBe(T0.toISOString());
    expect(r.orders.every((o) => o === null)).toBe(true);
    expect(currentQuestionId(r)).toBe('a');
    expect(progress(r)).toBe(0);
  });

  it('shuffled questions keep every one; a different seed gives another order', () => {
    const r = start(true, false, 5);
    expect([...r.queue].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    const orders = new Set(
      Array.from({ length: 30 }, (_, s) => start(true, false, s).queue.join('')),
    );
    expect(orders.size).toBeGreaterThan(5);
  });

  it('shuffled alternatives: a permutation per choice question, none for fixed ones or short answers', () => {
    const r = start(false, true, 11);
    expect(r.orders[0]).toHaveLength(5);
    expect([...r.orders[0]!].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(r.orders[2]).toBeNull(); // «fijas»
    expect(r.orders[3]).toBeNull(); // short answer
    expect(displayOrder(r, q('c'), 2)).toEqual([0, 1, 2]);
    expect(displayOrder(r, q('d'), 3)).toEqual([]);
  });

  it('needs at least one question', () => {
    expect(() => startRound([], { shuffle: false, shuffleOptions: false })).toThrow();
  });

  it('gives each round its own id', () => {
    const a = startRound(Q, { shuffle: false, shuffleOptions: false });
    const b = startRound(Q, { shuffle: false, shuffleOptions: false });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.id).not.toBe(b.id);
  });
});

describe('answering', () => {
  it('the verdict at once, right or wrong, by the original index', () => {
    let r = start();
    r = answerChoice(r, q('a'), 0, T0);
    expect(answerAt(r)).toEqual({
      position: 0,
      questionId: 'a',
      chosen: 0,
      correct: true,
      at: T0.toISOString(),
    });
    r = next(r);
    r = answerChoice(r, q('b'), 1, T0);
    expect(answerAt(r)?.correct).toBe(false);
    expect(score(r)).toEqual({ total: 5, answered: 2, correct: 1, wrong: 1, percent: 50 });
  });

  it('a question is answered only once: a second click changes nothing', () => {
    const r1 = answerChoice(start(), q('a'), 2, T0);
    const r2 = answerChoice(r1, q('a'), 0, T0);
    expect(r2).toBe(r1);
    expect(r2.answers).toHaveLength(1);
    expect(answerAt(r2)?.chosen).toBe(2);
  });

  it('rejects an alternative that does not exist, another question, or the wrong kind', () => {
    const r = start();
    expect(() => answerChoice(r, q('a'), 5)).toThrow();
    expect(() => answerChoice(r, q('a'), -1)).toThrow();
    expect(() => answerChoice(r, q('a'), 1.5)).toThrow();
    expect(() => answerChoice(r, q('b'), 0)).toThrow(/en pantalla/);
    expect(() => selfAssess(r, q('a'), true)).toThrow();
    expect(() => answerChoice(toCover(r), q('a'), 0)).toThrow();
  });

  it('a short answer: the user says whether they knew it', () => {
    let r = start();
    for (let i = 0; i < 3; i++) r = play(r, true);
    expect(currentQuestionId(r)).toBe('d');
    expect(() => answerChoice(r, q('d'), 0)).toThrow();
    const knew = selfAssess(r, q('d'), false, T0);
    expect(answerAt(knew)).toMatchObject({ chosen: null, correct: false });
    expect(selfAssess(knew, q('d'), true)).toBe(knew);
  });

  it('the input is not changed: every step returns a new round', () => {
    const r = start();
    const frozen = JSON.stringify(r);
    answerChoice(r, q('a'), 0);
    next(answerChoice(r, q('a'), 0));
    expect(JSON.stringify(r)).toBe(frozen);
  });

  it('letters follow the order on screen', () => {
    const r = start(false, true, 11);
    const order = displayOrder(r, q('a'));
    expect(letterOf(r, q('a'), order[2]!)).toBe('C');
    expect(letterOf(r, q('a'), q('a').correct!)).toBe(LETTERS[order.indexOf(0)]);
  });
});

describe('moving around (Siguiente, Volver)', () => {
  it('«Siguiente» only after answering', () => {
    const r = start();
    expect(next(r)).toBe(r);
  });

  it('«Volver» shows the previous one answered; «Siguiente» goes back up to the furthest one', () => {
    let r = start();
    r = play(r, true); // a
    r = play(r, false); // b
    expect(r).toMatchObject({ index: 2, top: 2 });
    expect(canGoBack(r)).toBe(true);
    r = back(r);
    expect(r).toMatchObject({ index: 1, top: 2 });
    expect(isAnswered(r)).toBe(true);
    // It cannot be answered again.
    expect(answerChoice(r, q('b'), 3)).toBe(r);
    r = back(back(r));
    expect(r.index).toBe(0);
    expect(back(r)).toBe(r);
    expect(canGoBack(r)).toBe(false);
    r = next(next(r));
    expect(r).toMatchObject({ index: 2, top: 2 });
    // The one that was next is not answered: «Siguiente» waits.
    expect(next(r)).toBe(r);
  });

  it('the progress bar follows the furthest question, not the one on screen', () => {
    let r = start();
    r = play(play(r, true), true);
    expect(progress(r)).toBeCloseTo(2 / 5);
    expect(progress(back(r))).toBeCloseTo(2 / 5);
  });

  it('after the last one, the results', () => {
    let r = start();
    for (const right of [true, false, true, false, true]) r = play(r, right);
    expect(r).toMatchObject({ screen: 'results', finished: true, index: 4, top: 4 });
    expect(score(r)).toEqual({ total: 5, answered: 5, correct: 3, wrong: 2, percent: 60 });
    expect(progress(r)).toBe(1);
    expect(wrongAnswers(r).map((a) => a.questionId)).toEqual(['b', 'd']);
  });

  it('«Terminar ahora» counts only what was answered', () => {
    let r = start();
    r = play(play(r, true), false);
    r = finish(r);
    expect(r.screen).toBe('results');
    expect(score(r)).toEqual({ total: 5, answered: 2, correct: 1, wrong: 1, percent: 50 });
    expect(score(start()).percent).toBe(0);
  });
});

describe('cover, continuing and restarting', () => {
  it('«Inicio» keeps the round; the cover offers to continue it where it was', () => {
    let r = play(play(start(), true), false);
    r = toCover(r);
    expect(r.screen).toBe('cover');
    expect(isResumable(r)).toBe(true);
    expect(resumeLine(r)).toBe('Vas en la pregunta 3 de 5 · 1 buena y 1 mala');
    r = resume(r);
    expect(r).toMatchObject({ screen: 'question', index: 2 });
  });

  it('a finished round is not offered again, and «Continuar» goes to its results', () => {
    const r = finish(start());
    expect(isResumable(toCover(r))).toBe(false);
    expect(isResumable(null)).toBe(false);
    expect(resume(toCover(r)).screen).toBe('results');
  });

  it('the line of the cover with zero, one and several', () => {
    let r = start();
    expect(resumeLine(r)).toBe('Vas en la pregunta 1 de 5 · 0 buenas y 0 malas');
    r = play(play(play(r, true), true), false);
    expect(resumeLine(r)).toBe('Vas en la pregunta 4 de 5 · 2 buenas y 1 mala');
  });

  it('«Reiniciar»: the same questions from the start, a new round, shuffled again if they were', () => {
    let r = play(play(start(true, true, 4), true), true);
    const again = restart(r, BY_ID, { random: seededRandom(99), id: 'r2', now: T0 });
    expect(again).toMatchObject({
      id: 'r2',
      origin: 'restart',
      index: 0,
      top: 0,
      answers: [],
      shuffled: true,
      shuffleOptions: true,
    });
    expect([...again.queue].sort()).toEqual([...r.queue].sort());
    expect(again.queue).not.toEqual(r.queue);
    r = start(false, false);
    expect(restart(r, BY_ID).queue).toEqual(r.queue);
  });

  it('«Repetir todo» shuffles or not as the cover says now', () => {
    const r = finish(start());
    expect(repeatAll(r, BY_ID, { shuffle: false }).queue).toEqual(r.queue);
    const s = repeatAll(r, BY_ID, { shuffle: true, random: seededRandom(2) });
    expect(s).toMatchObject({ shuffled: true, origin: 'repeat_all' });
    expect([...s.queue].sort()).toEqual([...r.queue].sort());
  });

  it('«Repetir solo las malas»: the wrong ones, in order, not shuffled; none if all were right', () => {
    let r = start(true, true, 8);
    const asked = r.queue.slice();
    for (const right of [false, true, false, true, false]) r = play(r, right);
    const wrong = repeatWrong(r, BY_ID, { id: 'w' })!;
    expect(wrong.queue).toEqual([asked[0], asked[2], asked[4]]);
    expect(wrong).toMatchObject({
      origin: 'repeat_wrong',
      shuffled: false,
      shuffleOptions: true,
      index: 0,
      answers: [],
    });
    let all = start();
    for (let i = 0; i < 5; i++) all = play(all, true);
    expect(repeatWrong(all, BY_ID)).toBeNull();
  });

  it('a question that is gone from the test cannot be repeated', () => {
    const r = finish(play(start(), false));
    expect(() => repeatWrong(r, new Map())).toThrow(/No existe/);
  });
});

describe('result titles', () => {
  it('as the page says them', () => {
    expect(resultTitle(100)).toBe('Muy bien preparado');
    expect(resultTitle(85)).toBe('Muy bien preparado');
    expect(resultTitle(84)).toBe('Vas bien, falta afinar');
    expect(resultTitle(60)).toBe('Vas bien, falta afinar');
    expect(resultTitle(59)).toBe('Hay que repasar');
    expect(resultTitle(0)).toBe('Hay que repasar');
  });
});
