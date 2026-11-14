// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * The order of the queue's cards: due cards by the preset's review order (storage/card/mod.rs) and the gathered new
 * cards by its new card sort order (rslib/src/scheduler/queue/builder/sorting.rs).
 */
import type { DeckConfig, NewCardSortOrder } from '../config';
import { fillParameters, retrievability } from '../fsrs';
import { fnvInts, sqlFnvHash } from '../random';
import type { SchedTiming } from '../timing';
import { cachedKey, cmpBig, idsOf } from './base';
import type { NewEntry, QueueCard } from './base';

/** Comparator of due cards by the preset's review order, then «random» (storage/card/mod.rs). */
export function reviewOrder(
  config: DeckConfig,
  timing: SchedTiming,
  deckRank: ReadonlyMap<string, number>,
  noteRank: ReadonlyMap<string, number>,
): (a: QueueCard, b: QueueCard) => number {
  const due = (c: QueueCard) => c.record!.due;
  const ivl = (c: QueueCard) => c.record!.interval;
  const diff = (c: QueueCard) => c.record!.difficulty ?? 0;
  const deck = (c: QueueCard) => deckRank.get(c.deckId) ?? 0;
  const randomKey = cachedKey((c) => sqlFnvHash(idsOf(c).card, idsOf(c).mtime));
  const random = (a: QueueCard, b: QueueCard) => cmpBig(randomKey(a), randomKey(b));
  // «nid asc, ord asc» and «nid desc, ord asc»: the cards of a note stay together, in template order.
  const note = (c: QueueCard) => noteRank.get(c.noteGuid) ?? c.index;
  const added = (a: QueueCard, b: QueueCard) => note(a) - note(b) || a.ord - b.ord;
  const reverseAdded = (a: QueueCard, b: QueueCard) => note(b) - note(a) || a.ord - b.ord;
  // Anki's extract_fsrs_relative_retrievability: the most forgotten, relative to the desired retention, first.
  const decay = -fillParameters(config.fsrsParams)[20]!;
  const desired = Math.max(config.desiredRetention, 0.0001);
  const relR = (c: QueueCard) => {
    const r = c.record!;
    if (r.stability === null || r.difficulty === null || r.lastReview === null) return 0;
    const memory = { stability: r.stability, difficulty: r.difficulty };
    const current = Math.max(
      retrievability(config.fsrsParams, memory, Math.max(0, timing.now - r.lastReview) / 86_400),
      0.0001,
    );
    return -(Math.pow(current, -1 / decay) - 1) / (Math.pow(desired, -1 / decay) - 1);
  };
  const by =
    (...parts: ((a: QueueCard, b: QueueCard) => number)[]) =>
    (a: QueueCard, b: QueueCard) => {
      for (const p of parts) {
        const r = p(a, b);
        if (r) return r;
      }
      return random(a, b);
    };
  switch (config.reviewOrder) {
    case 'day':
      return by((a, b) => due(a) - due(b));
    case 'dayThenDeck':
      return by(
        (a, b) => due(a) - due(b),
        (a, b) => deck(a) - deck(b),
      );
    case 'deckThenDay':
      return by(
        (a, b) => deck(a) - deck(b),
        (a, b) => due(a) - due(b),
      );
    case 'intervalsAscending':
      return by((a, b) => ivl(a) - ivl(b));
    case 'intervalsDescending':
      return by((a, b) => ivl(b) - ivl(a));
    case 'easeAscending':
      // With FSRS: the hardest cards first.
      return by((a, b) => diff(b) - diff(a));
    case 'easeDescending':
      return by((a, b) => diff(a) - diff(b));
    case 'retrievabilityAscending':
      return by((a, b) => relR(a) - relR(b));
    case 'retrievabilityDescending':
      return by((a, b) => relR(b) - relR(a));
    case 'random':
      return by();
    case 'added':
      return by(added);
    case 'reverseAdded':
      return by(reverseAdded);
  }
}

/** Sorting the gathered new cards in place (sorting.rs); the «random» orders hash the note or the card and the day. */
export function sortNew(news: NewEntry[], order: NewCardSortOrder, today: number): void {
  const sortHash = (n: NewEntry, byNote: boolean) =>
    fnvInts(byNote ? n.ids.note : n.ids.card, BigInt(today));
  switch (order) {
    case 'noSort':
      break;
    case 'template':
      news.sort((a, b) => a.template - b.template);
      break;
    case 'templateThenRandom':
      news.sort(
        (a, b) => a.template - b.template || cmpBig(sortHash(a, false), sortHash(b, false)),
      );
      break;
    case 'randomNoteThenTemplate':
      news.sort((a, b) => cmpBig(sortHash(a, true), sortHash(b, true)) || a.template - b.template);
      break;
    case 'randomCard':
      news.sort((a, b) => cmpBig(sortHash(a, false), sortHash(b, false)));
      break;
  }
}
