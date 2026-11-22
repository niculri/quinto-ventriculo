// Dominio: how much of a deck one would remember today, the average of FSRS's retrievability over its cards with the
// ones never seen as 0; it goes up by moving forward and down with time.

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

function cardRetrievability(
  row: StoredCard | undefined,
  fsrsParams: readonly number[],
  nowMs: number,
): number {
  if (!row || row.phase === 'new' || row.stability === null || row.lastReview === null) return 0;
  const days = Math.max(0, nowMs - Date.parse(row.lastReview)) / 86_400_000;
  return retrievability(
    fsrsParams,
    { stability: row.stability, difficulty: row.difficulty ?? 5 },
    days,
  );
}

/** Cards under «No mostrar más» do not count, nor Extras if the assessment does not include them. */
export function masteryByDeck(data: StudyData, nowMs = Date.now()): Map<string, number> {
  const configs = configsFor(data, nowMs);
  const parents = new Map(data.decks.map((d) => [d.id, d.parentId]));
  const leftOut = decksLeftOut(data);
  const wanted = new Set(deckIds(data.deck));
  const sum = new Map<string, number>();
  const count = new Map<string, number>();
  for (const c of data.deck.cards) {
    if (leftOut.get(c.deckId)) continue;
    const row = data.rows.get(cardKey(c));
    if (row?.suspended) continue;
    const r = cardRetrievability(row, configs.get(c.deckId)?.fsrsParams ?? [], nowMs);
    for (let id: string | null | undefined = c.deckId; id; id = parents.get(id)) {
      if (!wanted.has(id)) continue;
      sum.set(id, (sum.get(id) ?? 0) + r);
      count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  const out = new Map<string, number>();
  for (const id of wanted) {
    const n = count.get(id) ?? 0;
    out.set(id, n === 0 ? 0 : sum.get(id)! / n);
  }
  return out;
}

/** «62 %»: a little is not 0, which would say nothing happened. */
export function masteryPercent(value: number): number {
  return value <= 0 ? 0 : Math.max(1, Math.round(value * 100));
}
