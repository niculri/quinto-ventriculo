// What is left today in each deck of a tree, as Anki's deck list counts it, and when those counts change next.

import type { Counts, QueueCard } from '@qv/srs';
import { buildQueue, configsFor, deckIds, queueCards, studiedToday } from './scheduler';
import type { StudyData } from './scheduler';

// As Anki's deck list counts (compared in packages/srs/test/queue-tree.test.ts): the queue's limits through the tree
// without burying siblings; in simple mode, as the queue, so «62 para hoy» is what comes out.
export function deckCounts(data: StudyData, nowMs = Date.now()): Map<string, Counts> {
  const configs = configsFor(data, nowMs);
  const studied = studiedToday(data.answers, data.decks);
  const cards = queueCards(data, nowMs);
  const ids = deckIds(data.deck);
  const wanted = new Set(ids);
  // Each subtree's cards gathered child by child: filtering every card for every deck took seconds with many decks.
  const own = new Map<string, QueueCard[]>();
  for (const c of cards) {
    const list = own.get(c.deckId);
    if (list) list.push(c);
    else own.set(c.deckId, [c]);
  }
  const children = new Map<string, string[]>();
  for (const d of data.decks) {
    if (d.parentId === null || !wanted.has(d.id)) continue;
    const list = children.get(d.parentId);
    if (list) list.push(d.id);
    else children.set(d.parentId, [d.id]);
  }
  const inside = new Map<string, QueueCard[]>();
  const gather = (id: string): QueueCard[] => {
    const done = inside.get(id);
    if (done) return done;
    const parts = [own.get(id) ?? [], ...(children.get(id) ?? []).map(gather)];
    const list = parts.length === 1 ? parts[0]! : parts.flat().sort((a, b) => a.index - b.index);
    inside.set(id, list);
    return list;
  };
  const out = new Map<string, Counts>();
  const known = new Set(data.decks.map((d) => d.id));
  for (const id of ids) {
    if (!known.has(id)) continue;
    out.set(id, buildQueue(data, id, nowMs, configs, studied, gather(id)).counts());
  }
  return out;
}

// A learning step entering the learn-ahead limit or a burial that ends; null: not before the day changes.
export function nextCountChange(data: StudyData, nowMs = Date.now()): number | null {
  const ahead = data.prefs.learnAheadMinutes * 60_000;
  let next: number | null = null;
  const consider = (at: number) => {
    if (at > nowMs && (next === null || at < next)) next = at;
  };
  for (const r of data.rows.values()) {
    if (r.phase !== 'new' && !r.interday && r.due !== null) consider(Date.parse(r.due) - ahead);
    if (r.buriedUntil !== null) consider(Date.parse(r.buriedUntil));
  }
  return next;
}
