// What the study batteries share: answers to give both repositories, and what of their results only matches in shape.
import type { CardRef, CardStateFields, ReviewInput } from '../features/progress/api/repository';

export const DECK = '1001';
export const OTHER_DECK = '1002';
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const iso = (ms: number) => new Date(ms).toISOString();

export const card = (noteGuid: string, deckId = DECK, ord = 0): CardRef => ({
  noteGuid,
  ord,
  deckId,
});

export function state(at: number, over: Partial<CardStateFields> = {}): CardStateFields {
  return {
    phase: 'review',
    interday: true,
    remainingSteps: 0,
    due: iso(at + 2 * DAY),
    interval: 2,
    stability: 2.5,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    lastReview: iso(at),
    suspended: false,
    leech: false,
    ...over,
  };
}

export function answer(
  target: CardRef,
  expectedUpdatedAt: string | null,
  at: number,
  over: Partial<ReviewInput> = {},
): ReviewInput {
  return {
    card: target,
    expectedUpdatedAt,
    rating: 3,
    queueBefore: 'new',
    interval: 2,
    lastInterval: 0,
    durationMs: 4000,
    rBefore: null,
    cardVersion: 1,
    state: state(at),
    bury: [],
    buriedUntil: null,
    ...over,
  };
}

/**
 * What only matches in shape: a card's `updatedAt` is the database's own stamp, sent back to check nobody changed the
 * card (its value is the server's clock, and its format the database's); the numbers with decimals, which the
 * database keeps as `real` (about 7 significant digits) and computes in its own floating point; and the recall.
 */
export function inShape(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isInteger(value)) return Number(value.toPrecision(6));
  if (Array.isArray(value)) return value.map(inShape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, field(k, v)]));
  }
  return value;
}

function field(key: string, value: unknown) {
  if (key === 'updatedAt' && typeof value === 'string') return '<stamp>';
  // The recall falls with the time since the review, and each side reads its clock at another moment: the batteries
  // compare it apart, within a margin.
  if (key === 'recall' && typeof value === 'number') return '<recall>';
  return inShape(value);
}

/** Sorted by card, for the lists whose order is not part of what they promise. */
export const byCard = <T extends { noteGuid: string; ord: number }>(list: T[]) =>
  [...list].sort((a, b) =>
    a.noteGuid < b.noteGuid ? -1 : a.noteGuid > b.noteGuid ? 1 : a.ord - b.ord,
  );
