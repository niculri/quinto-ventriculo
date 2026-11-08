// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Deck options (a «preset»), as Anki's DeckConfig.Config (proto/anki/deck_config.proto), with the same
 * defaults and the same valid ranges (rslib/src/deckconfig/mod.rs). Only what the scheduler with FSRS uses:
 * the SM-2 options (starting ease, easy bonus…) are kept so a preset round-trips, but FSRS ignores them.
 */

export type NewCardGatherPriority =
  | 'deck'
  | 'deckThenRandomNotes'
  | 'lowestPosition'
  | 'highestPosition'
  | 'randomNotes'
  | 'randomCards';
export type NewCardSortOrder =
  'template' | 'noSort' | 'templateThenRandom' | 'randomNoteThenTemplate' | 'randomCard';
export type ReviewCardOrder =
  | 'day'
  | 'dayThenDeck'
  | 'deckThenDay'
  | 'intervalsAscending'
  | 'intervalsDescending'
  | 'easeAscending'
  | 'easeDescending'
  | 'retrievabilityAscending'
  | 'retrievabilityDescending'
  | 'random'
  | 'added'
  | 'reverseAdded';
export type ReviewMix = 'mixWithReviews' | 'afterReviews' | 'beforeReviews';
export type LeechAction = 'suspend' | 'tagOnly';

export interface DeckConfig {
  /** Learning steps, in minutes. */
  learnSteps: number[];
  /** Relearning steps, in minutes. */
  relearnSteps: number[];
  newPerDay: number;
  reviewsPerDay: number;
  initialEase: number;
  easyMultiplier: number;
  hardMultiplier: number;
  lapseMultiplier: number;
  intervalMultiplier: number;
  maximumReviewInterval: number;
  minimumLapseInterval: number;
  graduatingIntervalGood: number;
  graduatingIntervalEasy: number;
  newCardGatherPriority: NewCardGatherPriority;
  newCardSortOrder: NewCardSortOrder;
  reviewOrder: ReviewCardOrder;
  newMix: ReviewMix;
  interdayLearningMix: ReviewMix;
  leechAction: LeechAction;
  leechThreshold: number;
  capAnswerTimeToSecs: number;
  buryNew: boolean;
  buryReviews: boolean;
  buryInterdayLearning: boolean;
  /**
   * Not Anki's: new cards a limit still has room for do not stay buried. Siblings are kept apart while there are enough
   * other notes; when there are not, they come out anyway, each note one at a time, so a day gives all of its number.
   */
  fillNewWithSiblings: boolean;
  /** FSRS parameters (21 of FSRS-6, or 19/17 of older versions); empty = FSRS's defaults. */
  fsrsParams: number[];
  desiredRetention: number;
  historicalRetention: number;
}

/** Anki's defaults (DeckConfig::default()). */
export const DEFAULT_CONFIG: Readonly<DeckConfig> = Object.freeze({
  learnSteps: [1, 10],
  relearnSteps: [10],
  newPerDay: 20,
  reviewsPerDay: 200,
  initialEase: 2.5,
  easyMultiplier: 1.3,
  hardMultiplier: 1.2,
  lapseMultiplier: 0,
  intervalMultiplier: 1,
  maximumReviewInterval: 36_500,
  minimumLapseInterval: 1,
  graduatingIntervalGood: 1,
  graduatingIntervalEasy: 4,
  newCardGatherPriority: 'deck',
  newCardSortOrder: 'template',
  reviewOrder: 'day',
  newMix: 'mixWithReviews',
  interdayLearningMix: 'mixWithReviews',
  leechAction: 'tagOnly',
  leechThreshold: 8,
  capAnswerTimeToSecs: 60,
  buryNew: false,
  buryReviews: false,
  buryInterdayLearning: false,
  fillNewWithSiblings: false,
  fsrsParams: [],
  desiredRetention: 0.9,
  historicalRetention: 0.9,
});

export function defaultConfig(): DeckConfig {
  return {
    ...DEFAULT_CONFIG,
    learnSteps: [...DEFAULT_CONFIG.learnSteps],
    relearnSteps: [...DEFAULT_CONFIG.relearnSteps],
    fsrsParams: [],
  };
}

/** Valid ranges of the numeric options: [min, max] (ensure_deck_config_values_valid and the options screen). */
export const CONFIG_RANGES = {
  newPerDay: [0, 9999],
  reviewsPerDay: [0, 9999],
  initialEase: [1.31, 5],
  easyMultiplier: [1, 5],
  hardMultiplier: [0.5, 1.3],
  lapseMultiplier: [0, 1],
  intervalMultiplier: [0.5, 2],
  maximumReviewInterval: [1, 36_500],
  minimumLapseInterval: [1, 36_500],
  graduatingIntervalGood: [1, 36_500],
  graduatingIntervalEasy: [1, 36_500],
  leechThreshold: [1, 9999],
  // The options screen allows up to 7200; the database repairs up to 9999.
  capAnswerTimeToSecs: [1, 7200],
  desiredRetention: [0.7, 0.99],
  historicalRetention: [0.5, 1],
} as const satisfies Partial<Record<keyof DeckConfig, readonly [number, number]>>;

const GATHER: Record<number, NewCardGatherPriority> = {
  0: 'deck',
  5: 'deckThenRandomNotes',
  1: 'lowestPosition',
  2: 'highestPosition',
  3: 'randomNotes',
  4: 'randomCards',
};
const SORT: Record<number, NewCardSortOrder> = {
  0: 'template',
  1: 'noSort',
  2: 'templateThenRandom',
  3: 'randomNoteThenTemplate',
  4: 'randomCard',
};
const REVIEW_ORDER: Record<number, ReviewCardOrder> = {
  0: 'day',
  1: 'dayThenDeck',
  2: 'deckThenDay',
  3: 'intervalsAscending',
  4: 'intervalsDescending',
  5: 'easeAscending',
  6: 'easeDescending',
  7: 'retrievabilityAscending',
  11: 'retrievabilityDescending',
  8: 'random',
  9: 'added',
  10: 'reverseAdded',
};
const MIX: Record<number, ReviewMix> = {
  0: 'mixWithReviews',
  1: 'afterReviews',
  2: 'beforeReviews',
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const numbers = (v: unknown, fallback: number[]): number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? (v as number[])
    : fallback;

/**
 * A preset as an .apkg brings it (Anki's «schema 11» JSON: `new`, `rev`, `lapse` and the newer options at the
 * top level) → our config, as Anki converts it on import (DeckConfSchema11 → DeckConfig) and then repairs the
 * values out of range (ensure_deck_config_values_valid: a desired retention of 0 becomes 0.9).
 */
export function configFromAnki(raw: Json): DeckConfig {
  const nw = obj(raw['new']);
  const rev = obj(raw['rev']);
  const lapse = obj(raw['lapse']);
  const ints = numbers(nw['ints'], [1, 4]);
  const params = [raw['fsrsParams6'], raw['fsrsParams5'], raw['fsrsWeights']]
    .map((p) => numbers(p, []))
    .find((p) => p.length > 0);
  return repairConfig({
    learnSteps: numbers(nw['delays'], DEFAULT_CONFIG.learnSteps.slice()),
    relearnSteps: numbers(lapse['delays'], DEFAULT_CONFIG.relearnSteps.slice()),
    newPerDay: num(nw['perDay'], 20),
    reviewsPerDay: num(rev['perDay'], 200),
    initialEase: num(nw['initialFactor'], 2500) / 1000,
    easyMultiplier: num(rev['ease4'], 1.3),
    hardMultiplier: num(rev['hardFactor'], 1.2),
    lapseMultiplier: num(lapse['mult'], 0),
    intervalMultiplier: num(rev['ivlFct'], 1),
    maximumReviewInterval: num(rev['maxIvl'], 36_500),
    minimumLapseInterval: num(lapse['minInt'], 1),
    graduatingIntervalGood: ints[0] ?? 1,
    graduatingIntervalEasy: ints[1] ?? 4,
    newCardGatherPriority: GATHER[num(raw['newGatherPriority'], 0)] ?? 'deck',
    newCardSortOrder: SORT[num(raw['newSortOrder'], 0)] ?? 'template',
    reviewOrder: REVIEW_ORDER[num(raw['reviewOrder'], 0)] ?? 'day',
    newMix: MIX[num(raw['newMix'], 0)] ?? 'mixWithReviews',
    interdayLearningMix: MIX[num(raw['interdayLearningMix'], 0)] ?? 'mixWithReviews',
    // Schema 11: 0 = suspend, 1 = tag only.
    leechAction: num(lapse['leechAction'], 1) === 0 ? 'suspend' : 'tagOnly',
    leechThreshold: num(lapse['leechFails'], 8),
    capAnswerTimeToSecs: Math.max(0, num(raw['maxTaken'], 60)),
    fillNewWithSiblings: false,
    buryNew: bool(nw['bury'], false),
    buryReviews: bool(rev['bury'], false),
    buryInterdayLearning: bool(raw['buryInterdayLearning'], false),
    fsrsParams: params ?? [],
    desiredRetention: num(raw['desiredRetention'], 0),
    historicalRetention: num(raw['sm2Retention'], 0),
  });
}

/** Values out of range go back to the default, as Anki does when reading a preset. */
export function repairConfig(config: DeckConfig): DeckConfig {
  const out: DeckConfig = { ...config };
  for (const [key, [min, max]] of Object.entries(CONFIG_RANGES) as [
    keyof typeof CONFIG_RANGES,
    readonly [number, number],
  ][]) {
    const value = out[key];
    if (!Number.isFinite(value) || value < min || value > max) out[key] = DEFAULT_CONFIG[key];
  }
  // The integer options stay integers.
  for (const key of [
    'newPerDay',
    'reviewsPerDay',
    'maximumReviewInterval',
    'minimumLapseInterval',
    'graduatingIntervalGood',
    'graduatingIntervalEasy',
    'leechThreshold',
    'capAnswerTimeToSecs',
  ] as const) {
    out[key] = Math.trunc(out[key]);
  }
  out.learnSteps = out.learnSteps.filter((s) => Number.isFinite(s) && s > 0);
  out.relearnSteps = out.relearnSteps.filter((s) => Number.isFinite(s) && s > 0);
  if (![0, 17, 19, 21].includes(out.fsrsParams.length)) out.fsrsParams = [];
  return out;
}

/**
 * A stored preset (ours or the author's) → a valid config. Unknown keys are ignored and missing ones take the
 * default, so presets saved by an older version of the web keep working.
 */
export function parseConfig(value: unknown): DeckConfig {
  const v = obj(value);
  const d = DEFAULT_CONFIG;
  const pick = <T extends string>(x: unknown, all: readonly T[], fallback: T): T =>
    typeof x === 'string' && (all as readonly string[]).includes(x) ? (x as T) : fallback;
  return repairConfig({
    learnSteps: numbers(v['learnSteps'], d.learnSteps.slice()),
    relearnSteps: numbers(v['relearnSteps'], d.relearnSteps.slice()),
    newPerDay: num(v['newPerDay'], d.newPerDay),
    reviewsPerDay: num(v['reviewsPerDay'], d.reviewsPerDay),
    initialEase: num(v['initialEase'], d.initialEase),
    easyMultiplier: num(v['easyMultiplier'], d.easyMultiplier),
    hardMultiplier: num(v['hardMultiplier'], d.hardMultiplier),
    lapseMultiplier: num(v['lapseMultiplier'], d.lapseMultiplier),
    intervalMultiplier: num(v['intervalMultiplier'], d.intervalMultiplier),
    maximumReviewInterval: num(v['maximumReviewInterval'], d.maximumReviewInterval),
    minimumLapseInterval: num(v['minimumLapseInterval'], d.minimumLapseInterval),
    graduatingIntervalGood: num(v['graduatingIntervalGood'], d.graduatingIntervalGood),
    graduatingIntervalEasy: num(v['graduatingIntervalEasy'], d.graduatingIntervalEasy),
    newCardGatherPriority: pick(
      v['newCardGatherPriority'],
      Object.values(GATHER),
      d.newCardGatherPriority,
    ),
    newCardSortOrder: pick(v['newCardSortOrder'], Object.values(SORT), d.newCardSortOrder),
    reviewOrder: pick(v['reviewOrder'], Object.values(REVIEW_ORDER), d.reviewOrder),
    newMix: pick(v['newMix'], Object.values(MIX), d.newMix),
    interdayLearningMix: pick(v['interdayLearningMix'], Object.values(MIX), d.interdayLearningMix),
    leechAction: pick(v['leechAction'], ['suspend', 'tagOnly'] as const, d.leechAction),
    leechThreshold: num(v['leechThreshold'], d.leechThreshold),
    capAnswerTimeToSecs: num(v['capAnswerTimeToSecs'], d.capAnswerTimeToSecs),
    buryNew: bool(v['buryNew'], d.buryNew),
    buryReviews: bool(v['buryReviews'], d.buryReviews),
    buryInterdayLearning: bool(v['buryInterdayLearning'], d.buryInterdayLearning),
    fillNewWithSiblings: bool(v['fillNewWithSiblings'], d.fillNewWithSiblings),
    fsrsParams: numbers(v['fsrsParams'], []),
    desiredRetention: num(v['desiredRetention'], d.desiredRetention),
    historicalRetention: num(v['historicalRetention'], d.historicalRetention),
  });
}

export const GATHER_PRIORITIES = Object.values(GATHER);
export const SORT_ORDERS = Object.values(SORT);
export const REVIEW_ORDERS = Object.values(REVIEW_ORDER);
export const REVIEW_MIXES = Object.values(MIX);

// Steps as the options screen writes them («1m 10m 1d»): ts/routes/deck-options/steps.ts.

const UNIT_SECS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;
const MONTH = (365 * 86_400) / 12;

function stepToString(minutes: number): string {
  const secs = minutes * 60;
  // naturalWholeUnit: the largest unit that divides the seconds (months and years count as days).
  const natural =
    secs < 60 ? 's' : secs < 3600 ? 'm' : secs < 86_400 ? 'h' : secs < MONTH ? 'd' : 'd';
  const order = ['s', 'm', 'h', 'd'] as const;
  let i = order.indexOf(natural);
  while (i > 0) {
    const unit = order[i]!;
    const amount = Math.round(secs / UNIT_SECS[unit]);
    if (Math.abs(secs - amount * UNIT_SECS[unit]) < Number.EPSILON) break;
    i--;
  }
  const unit = order[i]!;
  return `${Math.round(secs / UNIT_SECS[unit])}${unit}`;
}

export function stepsToString(steps: number[]): string {
  return steps.map(stepToString).join(' ');
}

/** «1m 10m 1d» → [1, 10, 1440]. Without a unit it is minutes; what does not parse is dropped, like Anki. */
export function stringToSteps(text: string): number[] {
  return text
    .split(' ')
    .map((part) => {
      const m = /(\d+)(.*)/.exec(part);
      if (!m) return 0;
      const unit = (['s', 'h', 'd'] as const).find((u) => u === m[2]) ?? 'm';
      const secs = Math.min(UNIT_SECS[unit] * parseInt(m[1]!, 10), 2 ** 31);
      return secs / 60;
    })
    .filter((x) => x);
}
