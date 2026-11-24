// A writing-mode round: start, answer, correct at once or at the end, turn a verdict around, score, repeat the wrong
// ones and come back to a saved round.
import { describe, expect, it } from 'vitest';
import {
  answer,
  currentResult,
  currentStation,
  next,
  restoreRound,
  score,
  shuffled,
  startRound,
  toggle,
  wrongStations,
} from '../round';
import type { CaRound } from '../round';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const first = () => 0.999;

const start = (over: Partial<Parameters<typeof startRound>[0]> = {}) =>
  startRound({
    id: 'r1',
    now: NOW,
    stations: ['a', 'b', 'c'],
    count: 0,
    seconds: 0,
    correction: 'instant',
    origin: 'cover',
    random: first,
    ...over,
  });

const reply = (round: CaRound, correct: boolean, text = 'x') =>
  answer(round, { text, score: correct ? 1 : 0, correct, timedOut: false, now: NOW });

describe('shuffled', () => {
  it('is a Fisher–Yates shuffle with the given random numbers', () => {
    expect(shuffled(['a', 'b', 'c'], () => 0)).toEqual(['b', 'c', 'a']);
    expect(shuffled(['a', 'b', 'c'], first)).toEqual(['a', 'b', 'c']);
  });
});

describe('a round', () => {
  it('starts with the stations in order of the shuffle, all or only some', () => {
    const r = start();
    expect(r).toMatchObject({
      version: 1,
      stations: ['a', 'b', 'c'],
      results: [null, null, null],
      index: 0,
      startedAt: NOW.toISOString(),
      finished: false,
    });
    expect(start({ count: 2 }).stations).toEqual(['a', 'b']);
    expect(currentStation(r)).toBe('a');
    expect(currentResult(r)).toBeNull();
  });

  it('corrected at once, keeps the station until «Siguiente»', () => {
    let r = reply(start(), true, 'recto');
    expect(currentStation(r)).toBe('a');
    expect(currentResult(r)).toMatchObject({ text: 'recto', correct: true, manual: false });
    expect(reply(r, false)).toBe(r);
    r = next(next(r));
    r = next(reply(r, false));
    expect(r.finished).toBe(true);
    expect(currentStation(r)).toBeNull();
    expect(reply(r, true)).toBe(r);
    expect(score(r)).toEqual({ right: 1, answered: 2, total: 3 });
    expect(wrongStations(r)).toEqual(['b', 'c']);
  });

  it('corrected at the end, goes on to the next one at once', () => {
    let r = reply(start({ correction: 'end' }), true);
    expect(currentStation(r)).toBe('b');
    r = reply(reply(r, true), true);
    expect(r).toMatchObject({ finished: true, index: 3 });
  });

  it('turns a verdict around, and only one that was given', () => {
    const r = reply(start(), false);
    expect(toggle(r, 0).results[0]).toMatchObject({ correct: true, manual: true });
    expect(toggle(toggle(r, 0), 0).results[0]).toMatchObject({ correct: false, manual: true });
    expect(toggle(r, 1)).toBe(r);
  });
});

describe('restoreRound', () => {
  const known = new Set(['a', 'b', 'c']);

  it('gives back a saved round as it was', () => {
    const r = reply(start({ origin: 'repeat_wrong', seconds: 30, correction: 'end' }), true);
    expect(restoreRound(JSON.parse(JSON.stringify(r)), known)).toEqual(r);
  });

  it('turns down what is not a round', () => {
    const r = start();
    for (const bad of [
      null,
      [],
      { ...r, version: 2 },
      { ...r, id: 1 },
      { ...r, stations: 'a' },
      { ...r, stations: ['a', 2, 'c'] },
      { ...r, results: [] },
      { ...r, results: 'x' },
      { ...r, index: '0' },
      { ...r, seconds: null },
      { ...r, finished: 'no' },
    ]) {
      expect(restoreRound(bad, known)).toBeNull();
    }
  });

  it('reads bad results as unanswered and odd values within bounds', () => {
    const r = start();
    const at = NOW.toISOString();
    const good = { text: 'a', score: 1, correct: true, timedOut: false, at };
    const results = [good, { text: 'b', score: 1, correct: 'yes', timedOut: false, at }, 'x'];
    const back = restoreRound(
      { ...r, results, index: 9.5, seconds: -3, origin: 'other', correction: 'later' },
      known,
    )!;
    expect(back.results).toEqual([{ ...good, manual: false }, null, null]);
    expect(back).toMatchObject({
      index: 3,
      finished: true,
      seconds: 0,
      origin: 'cover',
      correction: 'instant',
    });
    expect(
      restoreRound({ ...r, results: [{ text: 1 }, null, null] }, known)!.results[0],
    ).toBeNull();
  });

  it('leaves out the stations the gymkana no longer has, keeping the one on screen or the next', () => {
    const r = next(reply(start(), true));
    expect(restoreRound(r, new Set(['a', 'c']))).toMatchObject({
      stations: ['a', 'c'],
      index: 1,
      finished: false,
    });
    expect(restoreRound(r, new Set(['a']))).toMatchObject({
      stations: ['a'],
      index: 1,
      finished: true,
    });
    expect(restoreRound(r, new Set())).toBeNull();
  });
});
