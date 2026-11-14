// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/** What the study queue is built from and made of, and the card keys its parts share (rslib/src/scheduler/queue/). */
import type { CardKey, CardRecord } from '../card';
import type { DeckConfig } from '../config';
import { cardSeed, fnv1a64 } from '../random';
import type { SchedTiming } from '../timing';

export interface QueueDeck {
  id: string;
  name: string;
  config: DeckConfig;
}

export interface QueueCard extends CardKey {
  deckId: string;
  /** Anki's card id order: the order the card was added in. */
  index: number;
  record: CardRecord | null;
  hidden: boolean;
  /** Anki's card and note ids and mtime, which its «random» orders hash; without them, hashes of guid and ord. */
  ids?: { card: bigint; note: bigint; mtime: bigint };
}

export const idsOf = (c: QueueCard) =>
  c.ids ?? {
    card: cardSeed(c.noteGuid, c.ord),
    note: fnv1a64(c.noteGuid),
    mtime: BigInt(c.record?.lastReview ?? 0),
  };

/** A sort key computed once per card: hashing a guid costs much more than a comparison. */
export function cachedKey<T>(key: (c: QueueCard) => T): (c: QueueCard) => T {
  const cache = new Map<QueueCard, T>();
  return (c) => {
    let v = cache.get(c);
    if (v === undefined) {
      v = key(c);
      cache.set(c, v);
    }
    return v;
  };
}

export interface StudiedToday {
  newCount: number;
  reviewCount: number;
}

export interface GlobalSettings {
  learnAheadSecs: number;
  newCardsIgnoreReviewLimit: boolean;
  applyAllParentLimits: boolean;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  learnAheadSecs: 1200,
  newCardsIgnoreReviewLimit: false,
  applyAllParentLimits: false,
};

export interface QueueInput {
  rootDeckId: string;
  /** The root deck, its subdecks and (only if applyAllParentLimits) its parents. */
  decks: QueueDeck[];
  cards: QueueCard[];
  studiedToday: ReadonlyMap<string, StudiedToday>;
  timing: SchedTiming;
  settings?: GlobalSettings;
  /** The deck list's counts (decks/tree.rs): the same limits, without burying siblings while gathering. */
  deckList?: boolean;
}

export type EntryKind = 'new' | 'learning' | 'review';

export interface QueueEntry extends CardKey {
  deckId: string;
  kind: EntryKind;
}

export interface Counts {
  new: number;
  learning: number;
  review: number;
}

/** A gathered new card, with what sorting it needs: its template and the ids its «random» orders hash. */
export type NewEntry = QueueEntry & { template: number; ids: ReturnType<typeof idsOf> };

export const cmpBig = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
