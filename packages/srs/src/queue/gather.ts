// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Gathering a deck tree's cards for its queue while the limits allow (rslib/src/scheduler/queue/builder/
 * gathering.rs), burying the later siblings of a note already gathered (burying.rs).
 */
import type { Queue } from '../card';
import type { NewCardGatherPriority } from '../config';
import { sqlFnvHash } from '../random';
import type { SchedTiming } from '../timing';
import { cachedKey, cmpBig, idsOf } from './base';
import type { EntryKind, NewEntry, QueueCard, QueueDeck, QueueEntry } from './base';
import type { LimitTree } from './limits';
import { takeSiblingsInRounds, waitsAsSibling } from './siblings';

interface BuryMode {
  buryNew: boolean;
  buryReviews: boolean;
  buryInterdayLearning: boolean;
}

/** What gathering reads and changes: the limits it spends and the notes it has seen, which bury their siblings. */
export interface Gathering {
  /** The active decks' cards that are not hidden. */
  cards: QueueCard[];
  limits: LimitTree;
  timing: SchedTiming;
  byId: ReadonlyMap<string, QueueDeck>;
  deckList: boolean | undefined;
  seen: Map<string, BuryMode>;
}

type CardOrder = (a: QueueCard, b: QueueCard) => number;

const entry = (c: QueueCard, kind: EntryKind): QueueEntry => ({
  noteGuid: c.noteGuid,
  ord: c.ord,
  deckId: c.deckId,
  kind,
});

function buryModeOf(g: Gathering, deckId: string): BuryMode {
  const c = g.deckList ? undefined : g.byId.get(deckId)?.config;
  return {
    buryNew: c?.buryNew ?? false,
    buryReviews: c?.buryReviews ?? false,
    buryInterdayLearning: c?.buryInterdayLearning ?? false,
  };
}

/** Burying while gathering (burying.rs): a note seen earlier buries its later siblings. */
function previousMode(g: Gathering, c: QueueCard): BuryMode | undefined {
  const mode = buryModeOf(g, c.deckId);
  const prev = g.seen.get(c.noteGuid);
  if (prev) {
    g.seen.set(c.noteGuid, {
      buryNew: prev.buryNew || mode.buryNew,
      buryReviews: prev.buryReviews || mode.buryReviews,
      buryInterdayLearning: prev.buryInterdayLearning || mode.buryInterdayLearning,
    });
    return { ...prev };
  }
  g.seen.set(c.noteGuid, mode);
  return undefined;
}

/** 1. Intraday learning (always all of them, they do not count against the limits), by due time. */
export function gatherIntradayLearning(g: Gathering): (QueueEntry & { due: number })[] {
  const learning: (QueueEntry & { due: number })[] = [];
  for (const c of g.cards) {
    if (c.record?.queue === 'learn' && c.record.due <= g.timing.nextDayAt) {
      previousMode(g, c);
      learning.push({ ...entry(c, 'learning'), due: c.record.due });
    }
  }
  learning.sort((a, b) => a.due - b.due);
  return learning;
}

/** A note's place among the deck's notes: where its first card is (Anki orders «added» by note id). */
export function noteRanks(cards: readonly QueueCard[]): Map<string, number> {
  const noteRank = new Map<string, number>();
  for (const c of cards) {
    noteRank.set(c.noteGuid, Math.min(c.index, noteRank.get(c.noteGuid) ?? c.index));
  }
  return noteRank;
}

/** 2 and 3. Interday learning or reviews, in the review order, while the limits allow. */
export function gatherDue(
  g: Gathering,
  queueName: Queue,
  out: QueueEntry[],
  kind: EntryKind,
  reviewKey: CardOrder,
): void {
  const { limits, timing } = g;
  if (limits.rootReached('review')) return;
  const due = g.cards
    .filter((c) => c.record?.queue === queueName && c.record.due <= timing.today)
    .sort(reviewKey);
  for (const c of due) {
    if (limits.rootReached('review')) break;
    if (limits.reached(c.deckId, 'review')) continue;
    const prev = previousMode(g, c);
    const bury = queueName === 'review' ? prev?.buryReviews : prev?.buryInterdayLearning;
    if (bury) continue;
    out.push(entry(c, kind));
    limits.decrement(c.deckId, 'review');
  }
}

/** Anki's knuth_salt: more randomness from a small integer (the day). */
const knuthSalt = (day: number) => Number((BigInt(day) * 2654435761n) & 0xffffffffn);

/** The orders new cards are gathered in, by position or by hashes of the note or the card salted with the day. */
function newCardOrders(timing: SchedTiming, noteRank: ReadonlyMap<string, number>) {
  // Anki's due of a new card: without one, a card takes its note's place, so siblings are gathered together.
  const position = (c: QueueCard) => c.record?.due ?? noteRank.get(c.noteGuid) ?? c.index;
  const lowest: CardOrder = (a, b) =>
    position(a) - position(b) || a.ord - b.ord || a.index - b.index;
  const highest: CardOrder = (a, b) =>
    position(b) - position(a) || a.ord - b.ord || a.index - b.index;
  const salt = knuthSalt(timing.today);
  const bigSalt = BigInt(salt);
  const noteHash = cachedKey((c) => sqlFnvHash(idsOf(c).note, bigSalt));
  const cardHash = cachedKey((c) => sqlFnvHash(idsOf(c).card, bigSalt));
  const randomNotes: CardOrder = (a, b) => cmpBig(noteHash(a), noteHash(b)) || a.ord - b.ord;
  const randomCards: CardOrder = (a, b) => cmpBig(cardHash(a), cardHash(b));
  return { lowest, highest, randomNotes, randomCards };
}

function gatherNewByDeck(
  g: Gathering,
  fresh: readonly QueueCard[],
  active: readonly QueueDeck[],
  order: CardOrder,
  addNew: (c: QueueCard) => void,
): void {
  const { limits } = g;
  for (const deck of active) {
    if (limits.rootReached('new')) break;
    if (limits.reached(deck.id, 'new')) continue;
    const inDeck = fresh.filter((c) => c.deckId === deck.id).sort(order);
    for (const c of inDeck) {
      if (limits.reached(deck.id, 'new')) break;
      addNew(c);
    }
  }
}

function gatherNewInOrder(
  g: Gathering,
  fresh: readonly QueueCard[],
  order: CardOrder,
  addNew: (c: QueueCard) => void,
): void {
  const sorted = [...fresh].sort(order);
  for (const c of sorted) {
    if (g.limits.rootReached('new')) break;
    addNew(c);
  }
}

/** 4. New cards, by the gather priority; with fillNewWithSiblings, the buried siblings last. */
export function gatherNew(
  g: Gathering,
  priority: NewCardGatherPriority,
  active: readonly QueueDeck[],
  noteRank: ReadonlyMap<string, number>,
): NewEntry[] {
  const fresh = g.cards.filter((c) => c.record === null || c.record.queue === 'new');
  const orders = newCardOrders(g.timing, noteRank);
  const news: NewEntry[] = [];
  const takeNew = (c: QueueCard) => {
    news.push({ ...entry(c, 'new'), template: c.ord, ids: idsOf(c) });
    g.limits.decrement(c.deckId, 'new');
  };
  // Not Anki's: buried siblings, for `fillNewWithSiblings` at the end.
  const siblings: QueueCard[] = [];
  const addNew = (c: QueueCard) => {
    if (g.limits.reached(c.deckId, 'new')) return;
    if (previousMode(g, c)?.buryNew) {
      if (waitsAsSibling(g.deckList, g.byId, c.deckId)) siblings.push(c);
      return;
    }
    takeNew(c);
  };
  if (priority === 'deck' || priority === 'deckThenRandomNotes') {
    const order = priority === 'deck' ? orders.lowest : orders.randomNotes;
    gatherNewByDeck(g, fresh, active, order, addNew);
  } else {
    const order =
      priority === 'lowestPosition'
        ? orders.lowest
        : priority === 'highestPosition'
          ? orders.highest
          : priority === 'randomNotes'
            ? orders.randomNotes
            : orders.randomCards;
    gatherNewInOrder(g, fresh, order, addNew);
  }
  takeSiblingsInRounds(g.limits, siblings, takeNew);
  return news;
}
