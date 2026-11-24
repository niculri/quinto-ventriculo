// A round of the writing mode: the stations in a shuffled order, what was written at each one and its verdict, which
// the student can turn around. The round is plain JSON and each change returns a new one, so it is saved as it is.
import type { Correction } from './stations';

export type Random = () => number;

export type CaOrigin = 'cover' | 'repeat_wrong';

export interface CaResult {
  text: string;
  score: number;
  correct: boolean;
  timedOut: boolean;
  /** The student turned the verdict around. */
  manual: boolean;
  at: string;
}

export interface CaRound {
  version: 1;
  id: string;
  origin: CaOrigin;
  startedAt: string;
  stations: string[];
  results: (CaResult | null)[];
  index: number;
  seconds: number;
  correction: Correction;
  finished: boolean;
}

export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function startRound(options: {
  id: string;
  now: Date;
  stations: readonly string[];
  /** 0: all of them. */
  count: number;
  seconds: number;
  correction: Correction;
  origin: CaOrigin;
  random: Random;
}): CaRound {
  const all = shuffled(options.stations, options.random);
  const stations = options.count ? all.slice(0, options.count) : all;
  return {
    version: 1,
    id: options.id,
    origin: options.origin,
    startedAt: options.now.toISOString(),
    stations,
    results: stations.map(() => null),
    index: 0,
    seconds: options.seconds,
    correction: options.correction,
    finished: false,
  };
}

/** A finished round's index is past its last station. */
export const currentStation = (round: CaRound): string | null =>
  round.stations[round.index] ?? null;

export const currentResult = (round: CaRound): CaResult | null =>
  round.results[round.index] ?? null;

export function next(round: CaRound): CaRound {
  const index = round.index + 1;
  return index >= round.stations.length
    ? { ...round, index: round.stations.length, finished: true }
    : { ...round, index };
}

/** The verdict of the station on screen; corrected at the end, the next one comes at once. */
export function answer(
  round: CaRound,
  given: { text: string; score: number; correct: boolean; timedOut: boolean; now: Date },
): CaRound {
  if (round.finished || currentResult(round)) return round;
  const results = [...round.results];
  results[round.index] = {
    text: given.text,
    score: given.score,
    correct: given.correct,
    timedOut: given.timedOut,
    manual: false,
    at: given.now.toISOString(),
  };
  const answered = { ...round, results };
  return round.correction === 'end' ? next(answered) : answered;
}

export function toggle(round: CaRound, index: number): CaRound {
  const result = round.results[index];
  if (!result) return round;
  const results = [...round.results];
  results[index] = { ...result, correct: !result.correct, manual: true };
  return { ...round, results };
}

export function score(round: CaRound) {
  const done = round.results.filter((r): r is CaResult => r !== null);
  return {
    right: done.filter((r) => r.correct).length,
    answered: done.length,
    total: round.stations.length,
  };
}

/** The stations to repeat: the wrong ones and the ones left without an answer. */
export const wrongStations = (round: CaRound): string[] =>
  round.stations.filter((_, i) => !round.results[i]?.correct);

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function readResult(raw: unknown): CaResult | null {
  if (!isRecord(raw)) return null;
  const { text, score: s, correct, timedOut, manual, at } = raw;
  if (typeof text !== 'string' || typeof s !== 'number' || typeof at !== 'string') return null;
  if (typeof correct !== 'boolean' || typeof timedOut !== 'boolean') return null;
  return { text, score: s, correct, timedOut, manual: manual === true, at };
}

function shapeOf(raw: unknown): CaRound | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const { id, origin, startedAt, stations, results, index, seconds, correction, finished } = raw;
  if (typeof id !== 'string' || typeof startedAt !== 'string') return null;
  const keys = Array.isArray(stations)
    ? stations.filter((s): s is string => typeof s === 'string')
    : [];
  if (!Array.isArray(stations) || keys.length !== stations.length) return null;
  if (!Array.isArray(results) || results.length !== keys.length) return null;
  if (typeof index !== 'number' || typeof seconds !== 'number' || typeof finished !== 'boolean')
    return null;
  return {
    version: 1,
    id,
    origin: origin === 'repeat_wrong' ? 'repeat_wrong' : 'cover',
    startedAt,
    stations: keys,
    results: results.map(readResult),
    index: Math.max(0, Math.min(Math.trunc(index), keys.length)),
    seconds: Math.max(0, seconds),
    correction: correction === 'end' ? 'end' : 'instant',
    finished,
  };
}

/**
 * A saved round, without the stations the gymkana no longer has: the one on screen, if it went, gives its place to
 * the next. Null when it is not a round or none of its stations is left.
 */
export function restoreRound(raw: unknown, known: ReadonlySet<string>): CaRound | null {
  const round = shapeOf(raw);
  if (!round) return null;
  const keep = round.stations.map((s) => known.has(s));
  const stations = round.stations.filter((_, i) => keep[i]);
  if (!stations.length) return null;
  const index = keep.slice(0, round.index).filter(Boolean).length;
  const results = round.results.filter((_, i) => keep[i]);
  const finished = round.finished || index >= stations.length;
  return { ...round, stations, results, index: finished ? stations.length : index, finished };
}
