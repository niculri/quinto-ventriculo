// Dominio: how much of what one already saw of a deck one would remember today, the average of FSRS's retrievability
// over its seen cards; and how many of a deck's cards one has seen.

import type { StoredCard } from '@qv/schema/user';
import { retrievability } from '@qv/srs';
import { cardKey, configsFor, deckIds } from './scheduler';
import type { StudyData } from './scheduler';
import { ASSESSMENT_DEPTH, ancestorName, includesExtras, isExtras } from './simple';

function decksLeftOut(data: StudyData): Map<string, boolean> {
  const idOf = new Map(data.decks.map((d) => [d.name, d.id]));
  const leftOut = new Map<string, boolean>();
  for (const d of data.decks) {
    const assessment = ancestorName(d.name, ASSESSMENT_DEPTH);
    leftOut.set(d.id, isExtras(d.name) && !includesExtras(data.plan, idOf.get(assessment!) ?? ''));
  }
  return leftOut;
}

function cardRetrievability(row: StoredCard, fsrsParams: readonly number[], nowMs: number): number {
  if (row.stability === null || row.lastReview === null) return 0;
  const days = Math.max(0, nowMs - Date.parse(row.lastReview)) / 86_400_000;
  return retrievability(
    fsrsParams,
    { stability: row.stability, difficulty: row.difficulty ?? 5 },
    days,
  );
}

const seenRow = (row: StoredCard | undefined): row is StoredCard => !!row && row.phase !== 'new';

/** Adds each card's value to its deck and the decks above it that were asked for. */
function sumUp(
  data: StudyData,
  valueOf: (row: StoredCard | undefined, deckId: string) => number | null,
) {
  const parents = new Map(data.decks.map((d) => [d.id, d.parentId]));
  const leftOut = decksLeftOut(data);
  const wanted = new Set(deckIds(data.deck));
  const sum = new Map<string, number>();
  const count = new Map<string, number>();
  for (const c of data.deck.cards) {
    if (leftOut.get(c.deckId)) continue;
    const v = valueOf(data.rows.get(cardKey(c)), c.deckId);
    if (v === null) continue;
    for (let id: string | null | undefined = c.deckId; id; id = parents.get(id)) {
      if (!wanted.has(id)) continue;
      sum.set(id, (sum.get(id) ?? 0) + v);
      count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  return { wanted, sum, count };
}

/**
 * Only over the cards already seen, so it does not start at 0: a deck with none seen is left out. Cards under «No
 * mostrar más» do not count, nor Extras if the assessment does not include them.
 */
export function masteryByDeck(data: StudyData, nowMs = Date.now()): Map<string, number> {
  const configs = configsFor(data, nowMs);
  const { sum, count } = sumUp(data, (row, deckId) => {
    if (!seenRow(row) || row.suspended) return null;
    return cardRetrievability(row, configs.get(deckId)?.fsrsParams ?? [], nowMs);
  });
  const out = new Map<string, number>();
  for (const [id, n] of count) out.set(id, sum.get(id)! / n);
  return out;
}

export type SeenCounts = Map<string, { seen: number; total: number }>;

/** «Vistas X de Y»: the cards of each deck answered at least once, over all of them (Extras left out if off). */
export function seenByDeck(data: StudyData): SeenCounts {
  const { wanted, sum, count } = sumUp(data, (row) => (seenRow(row) ? 1 : 0));
  const out = new Map<string, { seen: number; total: number }>();
  for (const id of wanted) out.set(id, { seen: sum.get(id) ?? 0, total: count.get(id) ?? 0 });
  return out;
}

/** «62 %»: a little is not 0, which would say nothing happened. */
export function masteryPercent(value: number): number {
  return value <= 0 ? 0 : Math.max(1, Math.round(value * 100));
}
