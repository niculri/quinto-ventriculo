// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// FSRS formulas and constants from fsrs-rs (BSD-3-Clause) and ts-fsrs (MIT), © Open Spaced Repetition.
/**
 * FSRS as Anki calls it (fsrs-rs 5.1, `FSRS::next_states`): the memory state after each of the four answers
 * and the raw interval (in days, not rounded) that gives the desired retention. The formulas are ts-fsrs's
 * FSRS-6 ones; the parameters are filled like fsrs-rs (`check_and_fill_parameters`, without clipping), and the
 * same-day formula («short-term») always applies to a review on the same day, as in fsrs-rs.
 */
import { FSRS6Algorithm, FSRS6_DEFAULT_WEIGHTS, FSRS6_MODEL_BOUNDS } from 'ts-fsrs/models/fsrs-6';

export interface MemoryState {
  stability: number;
  difficulty: number;
}

export interface ItemState {
  memory: MemoryState;
  /** Days, not rounded. */
  interval: number;
}

export interface NextStates {
  again: ItemState;
  hard: ItemState;
  good: ItemState;
  easy: ItemState;
}

const FSRS5_DEFAULT_DECAY = 0.5;

/** The 21 parameters fsrs-rs uses for a preset's (empty = the defaults; 17 or 19 = older versions). */
export function fillParameters(params: readonly number[]): number[] {
  switch (params.length) {
    case 0:
      return [...FSRS6_DEFAULT_WEIGHTS];
    case 17: {
      const p = [...params];
      p[4] = p[5]! * 2 + p[4]!;
      p[5] = Math.log(p[5]! * 3 + 1) / 3;
      p[6] = p[6]! + 0.5;
      return [...p, 0, 0, 0, FSRS5_DEFAULT_DECAY];
    }
    case 19:
      return [...params, 0, FSRS5_DEFAULT_DECAY];
    case 21:
      return [...params];
    default:
      throw new Error(`Parámetros FSRS inválidos (${params.length})`);
  }
}

export const DEFAULT_PARAMETERS: readonly number[] = FSRS6_DEFAULT_WEIGHTS;

/**
 * ts-fsrs 6.0 with fsrs-rs's same-day formula. ts-fsrs keeps the «Hard» answer of a same-day review from
 * lowering the stability (it clamps its factor to ≥ 1 from Hard up); fsrs-rs 5.1, which Anki uses, only does
 * that for Good and Easy (`rating.greater_equal_elem(3)` in model.rs).
 */
class AnkiFsrs extends FSRS6Algorithm {
  private readonly w: readonly number[];

  constructor(weights: number[]) {
    super(weights, true, FSRS6_MODEL_BOUNDS);
    this.w = weights;
  }

  override next_short_term_stability(s: number, g: Grade): number {
    const w = this.w;
    const sinc = Math.pow(s, -w[19]!) * Math.exp(w[17]! * (g - 3 + w[18]!));
    const masked = g >= 3 ? Math.max(sinc, 1) : sinc;
    const { sMin, sMax } = FSRS6_MODEL_BOUNDS;
    return Math.min(Math.max(s * masked, sMin), sMax);
  }
}

type Grade = Parameters<FSRS6Algorithm['next_short_term_stability']>[1];

const algorithms = new Map<string, FSRS6Algorithm>();

function algorithmFor(params: readonly number[]): FSRS6Algorithm {
  const key = params.join(',');
  let a = algorithms.get(key);
  if (!a) {
    a = new AnkiFsrs(fillParameters(params));
    algorithms.set(key, a);
  }
  return a;
}

/** fsrs-rs `next_interval`: stability / factor · (r^(1/decay) − 1), without rounding. */
export function nextInterval(
  params: readonly number[],
  stability: number,
  desiredRetention: number,
): number {
  const w = fillParameters(params);
  const decay = -w[20]!;
  const factor = Math.exp(Math.log(0.9) / decay) - 1;
  return (stability / factor) * (Math.pow(desiredRetention, 1 / decay) - 1);
}

/** Retrievability after `days` days (the forgetting curve). */
export function retrievability(params: readonly number[], memory: MemoryState, days: number) {
  const w = fillParameters(params);
  const decay = -w[20]!;
  const factor = Math.exp(Math.log(0.9) / decay) - 1;
  return Math.pow((days / memory.stability) * factor + 1, decay);
}

/** The four next states, as fsrs-rs `next_states(memory, desired_retention, days_elapsed)`. */
export function fsrsNextStates(
  params: readonly number[],
  memory: MemoryState | null,
  desiredRetention: number,
  daysElapsed: number,
): NextStates {
  const algorithm = algorithmFor(params);
  const step = (rating: 1 | 2 | 3 | 4): ItemState => {
    const next = algorithm.next_state(memory, daysElapsed, rating);
    if (!Number.isFinite(next.stability) || !Number.isFinite(next.difficulty)) {
      throw new Error('Estado de memoria inválido');
    }
    return { memory: next, interval: nextInterval(params, next.stability, desiredRetention) };
  };
  return { again: step(1), hard: step(2), good: step(3), easy: step(4) };
}

/** Anki lets FSRS schedule under a day only if the parameters have w17 and w18 above 0. */
export function allowShortTerm(params: readonly number[]): boolean {
  return params.length >= 19 && params[17]! > 0 && params[18]! > 0;
}
