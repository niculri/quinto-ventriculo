// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * The study queue of a deck and its subdecks, as Anki's v3 scheduler builds and walks it
 * (rslib/src/scheduler/queue/: builder/gathering.rs, burying.rs, sorting.rs, intersperser.rs, learning.rs,
 * main.rs; rslib/src/decks/limits.rs for the daily limits, which add up through the deck tree).
 */
import type { CardKey, CardRecord, Queue } from './card';
import type { DeckConfig, ReviewMix } from './config';
import { fillParameters, retrievability } from './fsrs';
import { cardSeed, fnv1a64, fnvInts, sqlFnvHash } from './random';
import type { SchedTiming } from './timing';

export interface QueueDeck {
  id: string;
  /** Full name with «::» (its depth and the alphabetical order of the decks come from it). */
  name: string;
  config: DeckConfig;
}

export interface QueueCard extends CardKey {
  deckId: string;
  /** Order of the card among the deck's when it was added (Anki's card id order). */
  index: number;
  /** null = never answered (new). */
  record: CardRecord | null;
  /** Hidden from the queue: suspended or buried (until the next day). */
  hidden: boolean;
  /**
   * What Anki's «random» orders hash: the card and note ids and the card's modification time. Without them,
   * hashes of the guid and ord and the time of the last answer (the comparison with Anki gives Anki's).
   */
  ids?: { card: bigint; note: bigint; mtime: bigint };
}

const idsOf = (c: QueueCard) =>
  c.ids ?? {
    card: cardSeed(c.noteGuid, c.ord),
    note: fnv1a64(c.noteGuid),
    mtime: BigInt(c.record?.lastReview ?? 0),
  };

/**
 * A sort key computed once per card within one sort (hashing a guid costs much more than a comparison, and
 * a sort compares each card many times).
 */
function cachedKey<T>(key: (c: QueueCard) => T): (c: QueueCard) => T {
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

/** What the user studied today in each deck (Anki's per-deck counters). */
export interface StudiedToday {
  newCount: number;
  reviewCount: number;
}

/**
 * Anki's per-deck counters from today's answers (decks/stats.rs `update_deck_stats`): an answer counts in
 * the deck of the card and in every deck above it, so a parent's limits count what was studied in its
 * subdecks. `queue` is the card's queue before the answer: a new card counts as new; a review or an interday
 * learning card, as a review; an intraday learning card, nothing.
 */
export function countStudiedToday(
  answers: Iterable<{ deckId: string; queue: Queue }>,
  decks: readonly { id: string; name: string }[],
): Map<string, StudiedToday> {
  const idOf = new Map(decks.map((d) => [d.name, d.id]));
  const nameOf = new Map(decks.map((d) => [d.id, d.name]));
  const out = new Map<string, StudiedToday>();
  for (const { deckId, queue } of answers) {
    const isNew = queue === 'new';
    if (!isNew && queue !== 'review' && queue !== 'dayLearn') continue;
    const name = nameOf.get(deckId);
    const parts = name?.split('::') ?? [];
    const ids = name
      ? parts.flatMap((_, i) => idOf.get(parts.slice(0, i + 1).join('::')) ?? [])
      : [deckId];
    for (const id of ids) {
      const s = out.get(id) ?? { newCount: 0, reviewCount: 0 };
      if (isNew) s.newCount++;
      else s.reviewCount++;
      out.set(id, s);
    }
  }
  return out;
}

export interface GlobalSettings {
  /** Anki's «learn ahead limit», in seconds (20 minutes by default). */
  learnAheadSecs: number;
  /** «Las tarjetas nuevas ignoran el límite de revisión» (off by default). */
  newCardsIgnoreReviewLimit: boolean;
  /** «Límites empiezan desde arriba» (off by default): the limits of the decks above also apply. */
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
  /**
   * The counts of Anki's deck list rather than the study queue: the same limits through the tree, but
   * without burying siblings while gathering (decks/tree.rs counts the cards; compared with Anki in
   * test/queue-tree.test.ts).
   */
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

const keyOf = (c: CardKey) => `${c.noteGuid}\u001f${c.ord}`;
const levelOf = (name: string) => name.split('::').length;

/**
 * What Anki sorts decks by: its stored name, where «::» is \x1f (decks/name.rs) and so goes before any
 * character of a name, with case folded (the `unicase` collation of the decks table). So a deck is followed
 * by its subdecks, and only then by a deck named the same plus a suffix.
 */
const deckSortKey = (name: string) => name.replaceAll('::', '\x1f').toUpperCase().toLowerCase();

/** By code points, as Rust compares strings (`<` in JavaScript puts emoji before «\uff21»). */
function cmpCodePoints(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) return a.codePointAt(i)! - b.codePointAt(i)!;
  }
  return a.length - b.length;
}

/** The decks in the order of Anki's deck list: each one before its subdecks (`order by name`). */
export function sortDecksByName<T extends { name: string }>(decks: readonly T[]): T[] {
  return decks
    .map((deck) => ({ deck, key: deckSortKey(deck.name) }))
    .sort((a, b) => cmpCodePoints(a.key, b.key))
    .map(({ deck }) => deck);
}

// Limits (decks/limits.rs) -------------------------------------------------------------------------

interface Limits {
  review: number;
  new: number;
  capNewToReview: boolean;
}

interface LimitNode {
  limits: Limits;
  parent: LimitNode | null;
  children: LimitNode[];
}

function remainingLimits(
  config: DeckConfig,
  studied: StudiedToday | undefined,
  newIgnoresReviewLimit: boolean,
): Limits {
  let review = config.reviewsPerDay - (studied?.reviewCount ?? 0);
  let nw = config.newPerDay - (studied?.newCount ?? 0);
  if (!newIgnoresReviewLimit) {
    review -= studied?.newCount ?? 0;
    nw = Math.min(nw, review);
  }
  return {
    review: Math.max(0, review),
    new: Math.max(0, nw),
    capNewToReview: !newIgnoresReviewLimit,
  };
}

class LimitTree {
  private readonly map = new Map<string, LimitNode>();
  readonly root: LimitNode;

  /** `decks` as sortDecksByName leaves them, the topmost first (Anki: LimitTreeMap::build). */
  constructor(
    decks: QueueDeck[],
    studied: ReadonlyMap<string, StudiedToday>,
    newIgnoresReviewLimit: boolean,
  ) {
    const make = (d: QueueDeck, parent: LimitNode | null): LimitNode => {
      const limits = remainingLimits(d.config, studied.get(d.id), newIgnoresReviewLimit);
      if (parent) {
        limits.review = Math.min(limits.review, parent.limits.review);
        limits.new = Math.min(limits.new, parent.limits.new);
      }
      const node: LimitNode = { limits, parent, children: [] };
      parent?.children.push(node);
      this.map.set(d.id, node);
      return node;
    };
    const [first, ...rest] = decks;
    this.root = make(first!, null);
    // Each deck hangs from the last deck one level up (decks come sorted, so that is its parent).
    const stack: { level: number; node: LimitNode }[] = [
      { level: levelOf(first!.name), node: this.root },
    ];
    for (const d of rest) {
      const level = levelOf(d.name);
      while (stack.length > 1 && stack[stack.length - 1]!.level >= level) stack.pop();
      const top = stack[stack.length - 1]!;
      if (level !== top.level + 1) continue; // a gap in the tree: Anki skips it too
      stack.push({ level, node: make(d, top.node) });
    }
  }

  rootReached(kind: 'review' | 'new'): boolean {
    return this.root.limits[kind] === 0;
  }

  reached(deckId: string, kind: 'review' | 'new'): boolean {
    const node = this.map.get(deckId);
    return !node || node.limits[kind] === 0;
  }

  has(deckId: string): boolean {
    return this.map.has(deckId);
  }

  decrement(deckId: string, kind: 'review' | 'new'): void {
    for (let node = this.map.get(deckId) ?? null; node; node = node.parent) {
      const before = { ...node.limits };
      if (kind === 'review') {
        node.limits.review = Math.max(0, node.limits.review - 1);
        if (node.limits.capNewToReview)
          node.limits.new = Math.min(node.limits.new, node.limits.review);
      } else {
        node.limits.new = Math.max(0, node.limits.new - 1);
      }
      const reachedZero =
        (before.review > 0 && node.limits.review === 0) ||
        (before.new > 0 && node.limits.new === 0);
      if (reachedZero) capDescendants(node, node.limits);
    }
  }
}

function capDescendants(node: LimitNode, limits: Limits) {
  node.limits.review = Math.min(node.limits.review, limits.review);
  node.limits.new = Math.min(node.limits.new, limits.new);
  for (const child of node.children) capDescendants(child, limits);
}

// Building (builder/) ------------------------------------------------------------------------------

interface BuryMode {
  buryNew: boolean;
  buryReviews: boolean;
  buryInterdayLearning: boolean;
}

/** Intersperser: spreads the shorter list evenly through the longer one. */
export function intersperse<T>(one: T[], two: T[]): T[] {
  const ratio = (one.length + 1) / (two.length + 1);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < one.length || j < two.length) {
    if (i < one.length && j < two.length) {
      if ((j + 1) * ratio < i + 1) out.push(two[j++]!);
      else out.push(one[i++]!);
    } else if (i < one.length) out.push(one[i++]!);
    else out.push(two[j++]!);
  }
  return out;
}

function mix<T>(reviews: T[], other: T[], mode: ReviewMix): T[] {
  switch (mode) {
    case 'afterReviews':
      return [...reviews, ...other];
    case 'beforeReviews':
      return [...other, ...reviews];
    case 'mixWithReviews':
      return intersperse(reviews, other);
  }
}

/** Anki's knuth_salt: more randomness from a small integer (the day). */
const knuthSalt = (day: number) => Number((BigInt(day) * 2654435761n) & 0xffffffffn);

const cmpBig = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

export class StudyQueue {
  private main: QueueEntry[] = [];
  /** Intraday learning cards, by due time (Unix seconds). */
  private learning: (QueueEntry & { due: number })[] = [];
  private counts_: Counts = { new: 0, learning: 0, review: 0 };
  private cutoff: number;
  readonly learnAheadSecs: number;
  readonly today: number;

  private constructor(timing: SchedTiming, learnAheadSecs: number) {
    this.cutoff = timing.now;
    this.learnAheadSecs = learnAheadSecs;
    this.today = timing.today;
  }

  /** Builds the queue of `rootDeckId` with its subdecks (QueueBuilder::new + gather_cards + build). */
  static build(input: QueueInput): StudyQueue {
    const settings = input.settings ?? DEFAULT_GLOBAL_SETTINGS;
    const { timing } = input;
    const byId = new Map(input.decks.map((d) => [d.id, d]));
    const root = byId.get(input.rootDeckId);
    if (!root) throw new Error(`Mazo ${input.rootDeckId} no encontrado`);
    const queue = new StudyQueue(timing, settings.learnAheadSecs);

    const isActive = (d: QueueDeck) => d.name === root.name || d.name.startsWith(`${root.name}::`);
    const active = sortDecksByName(input.decks.filter(isActive));
    const parents = settings.applyAllParentLimits
      ? sortDecksByName(input.decks.filter((d) => root.name.startsWith(`${d.name}::`)))
      : [];
    const limits = new LimitTree(
      [...parents, ...active],
      input.studiedToday,
      settings.newCardsIgnoreReviewLimit,
    );
    const options = root.config;
    const activeIds = new Set(active.map((d) => d.id));
    const deckRank = new Map(active.map((d, i) => [d.id, i]));
    const cards = input.cards.filter((c) => activeIds.has(c.deckId) && !c.hidden);

    // Burying while gathering (burying.rs): a note seen earlier buries its later siblings.
    const seen = new Map<string, BuryMode>();
    const buryModeOf = (deckId: string): BuryMode => {
      const c = input.deckList ? undefined : byId.get(deckId)?.config;
      return {
        buryNew: c?.buryNew ?? false,
        buryReviews: c?.buryReviews ?? false,
        buryInterdayLearning: c?.buryInterdayLearning ?? false,
      };
    };
    const previousMode = (c: QueueCard): BuryMode | undefined => {
      const mode = buryModeOf(c.deckId);
      const prev = seen.get(c.noteGuid);
      if (prev) {
        seen.set(c.noteGuid, {
          buryNew: prev.buryNew || mode.buryNew,
          buryReviews: prev.buryReviews || mode.buryReviews,
          buryInterdayLearning: prev.buryInterdayLearning || mode.buryInterdayLearning,
        });
        return { ...prev };
      }
      seen.set(c.noteGuid, mode);
      return undefined;
    };

    const entry = (c: QueueCard, kind: EntryKind): QueueEntry => ({
      noteGuid: c.noteGuid,
      ord: c.ord,
      deckId: c.deckId,
      kind,
    });

    // 1. Intraday learning (always all of them, they do not count against the limits).
    const learning: (QueueEntry & { due: number })[] = [];
    for (const c of cards) {
      if (c.record?.queue === 'learn' && c.record.due <= timing.nextDayAt) {
        previousMode(c);
        learning.push({ ...entry(c, 'learning'), due: c.record.due });
      }
    }
    learning.sort((a, b) => a.due - b.due);

    // 2 and 3. Interday learning and reviews, in the review order, while the limits allow.
    // A note's place among the deck's notes: where its first card is (Anki orders «added» by note id).
    const noteRank = new Map<string, number>();
    for (const c of input.cards) {
      noteRank.set(c.noteGuid, Math.min(c.index, noteRank.get(c.noteGuid) ?? c.index));
    }
    const reviewKey = reviewOrder(options, timing, deckRank, noteRank);
    const gatherDue = (queueName: Queue, out: QueueEntry[], kind: EntryKind) => {
      if (limits.rootReached('review')) return;
      const due = cards
        .filter((c) => c.record?.queue === queueName && c.record.due <= timing.today)
        .sort(reviewKey);
      for (const c of due) {
        if (limits.rootReached('review')) break;
        if (limits.reached(c.deckId, 'review')) continue;
        const prev = previousMode(c);
        const bury = queueName === 'review' ? prev?.buryReviews : prev?.buryInterdayLearning;
        if (bury) continue;
        out.push(entry(c, kind));
        limits.decrement(c.deckId, 'review');
      }
    };
    const dayLearning: QueueEntry[] = [];
    const reviews: QueueEntry[] = [];
    gatherDue('dayLearn', dayLearning, 'learning');
    gatherDue('review', reviews, 'review');

    // 4. New cards, by the gather priority.
    const fresh = cards.filter((c) => c.record === null || c.record.queue === 'new');
    // A new card's position (Anki's due of a new card): the cards of a note share their note's, so without
    // one (never answered) a card takes its note's place in the deck, and siblings are gathered together.
    const position = (c: QueueCard) => c.record?.due ?? noteRank.get(c.noteGuid) ?? c.index;
    const lowest = (a: QueueCard, b: QueueCard) =>
      position(a) - position(b) || a.ord - b.ord || a.index - b.index;
    const salt = knuthSalt(timing.today);
    const bigSalt = BigInt(salt);
    const noteHash = cachedKey((c) => sqlFnvHash(idsOf(c).note, bigSalt));
    const cardHash = cachedKey((c) => sqlFnvHash(idsOf(c).card, bigSalt));
    const randomNotes = (a: QueueCard, b: QueueCard) =>
      cmpBig(noteHash(a), noteHash(b)) || a.ord - b.ord;
    const randomCards = (a: QueueCard, b: QueueCard) => cmpBig(cardHash(a), cardHash(b));
    const news: (QueueEntry & { template: number; ids: ReturnType<typeof idsOf> })[] = [];
    const takeNew = (c: QueueCard) => {
      news.push({ ...entry(c, 'new'), template: c.ord, ids: idsOf(c) });
      limits.decrement(c.deckId, 'new');
    };
    // The siblings left out, in case the limits still have room at the end (`fillNewWithSiblings`).
    let siblings: QueueCard[] = [];
    const addNew = (c: QueueCard) => {
      if (limits.reached(c.deckId, 'new')) return;
      if (previousMode(c)?.buryNew) {
        if (!input.deckList && byId.get(c.deckId)?.config.fillNewWithSiblings) siblings.push(c);
        return;
      }
      takeNew(c);
    };
    const priority = options.newCardGatherPriority;
    if (priority === 'deck' || priority === 'deckThenRandomNotes') {
      for (const deck of active) {
        if (limits.rootReached('new')) break;
        if (limits.reached(deck.id, 'new')) continue;
        const inDeck = fresh
          .filter((c) => c.deckId === deck.id)
          .sort(priority === 'deck' ? lowest : randomNotes);
        for (const c of inDeck) {
          if (limits.reached(deck.id, 'new')) break;
          addNew(c);
        }
      }
    } else {
      const sorted = [...fresh].sort(
        priority === 'lowestPosition'
          ? lowest
          : priority === 'highestPosition'
            ? (a, b) => position(b) - position(a) || a.ord - b.ord || a.index - b.index
            : priority === 'randomNotes'
              ? randomNotes
              : randomCards,
      );
      for (const c of sorted) {
        if (limits.rootReached('new')) break;
        addNew(c);
      }
    }
    // Round after round, one card of each note: siblings end up as far apart as they can.
    while (siblings.length && !limits.rootReached('new')) {
      const inRound = new Set<string>();
      const later: QueueCard[] = [];
      for (const c of siblings) {
        if (limits.rootReached('new')) break;
        if (limits.reached(c.deckId, 'new')) continue;
        if (inRound.has(c.noteGuid)) {
          later.push(c);
        } else {
          inRound.add(c.noteGuid);
          takeNew(c);
        }
      }
      siblings = later;
    }

    // Sorting the new cards (sorting.rs).
    const sortHash = (n: (typeof news)[number], byNote: boolean) =>
      fnvInts(byNote ? n.ids.note : n.ids.card, BigInt(timing.today));
    switch (options.newCardSortOrder) {
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
        news.sort(
          (a, b) => cmpBig(sortHash(a, true), sortHash(b, true)) || a.template - b.template,
        );
        break;
      case 'randomCard':
        news.sort((a, b) => cmpBig(sortHash(a, false), sortHash(b, false)));
        break;
    }

    const newEntries: QueueEntry[] = news.map(({ noteGuid, ord, deckId }) => ({
      noteGuid,
      ord,
      deckId,
      kind: 'new',
    }));
    const withDayLearning = mix(reviews, dayLearning, options.interdayLearningMix);
    queue.main = mix(withDayLearning, newEntries, options.newMix);
    queue.learning = learning;
    const cutoff = timing.now + queue.learnAheadSecs;
    queue.counts_ = {
      new: newEntries.length,
      review: reviews.length,
      learning: learning.filter((e) => e.due <= cutoff).length + dayLearning.length,
    };
    return queue;
  }

  private aheadCutoff(): number {
    return this.cutoff + this.learnAheadSecs;
  }

  /** The queue in order: learning due now, then the main queue, then learning within the learn-ahead limit. */
  entries(): QueueEntry[] {
    const now = this.learning.filter((e) => e.due <= this.cutoff);
    const ahead = this.learning.filter((e) => e.due > this.cutoff && e.due <= this.aheadCutoff());
    return [...now, ...this.main, ...ahead].map(({ noteGuid, ord, deckId, kind }) => ({
      noteGuid,
      ord,
      deckId,
      kind,
    }));
  }

  /** The card to show, or null if there is nothing left for now. */
  next(): QueueEntry | null {
    return this.entries()[0] ?? null;
  }

  /** The next `n` cards (to fetch them ahead). */
  upcoming(n: number): QueueEntry[] {
    return this.entries().slice(0, n);
  }

  counts(): Counts {
    if (this.counts_.new === 0 && this.counts_.learning === 0 && this.counts_.review === 0) {
      this.updateCutoff(this.cutoff);
    }
    return { ...this.counts_ };
  }

  /** Moves the learning cutoff to `now` and counts the learning cards that came within the limit. */
  updateCutoff(now: number): void {
    const lastAhead = this.aheadCutoff();
    this.cutoff = Math.max(this.cutoff, now);
    const nextAhead = this.aheadCutoff();
    this.counts_.learning += this.learning.filter(
      (e) => e.due > lastAhead && e.due <= nextAhead,
    ).length;
  }

  /** Takes the answered card off the queue and puts it back if it is still learning today. */
  answered(key: CardKey, card: CardRecord, timing: SchedTiming): QueueUpdate {
    const k = keyOf(key);
    let removed: QueueEntry | null = null;
    let fromLearning: (QueueEntry & { due: number }) | null = null;
    const firstLearning = this.learning[0];
    if (firstLearning && keyOf(firstLearning) === k) {
      fromLearning = this.learning.shift()!;
      this.counts_.learning = Math.max(0, this.counts_.learning - 1);
    } else if (this.main[0] && keyOf(this.main[0]) === k) {
      removed = this.main.shift()!;
      if (removed.kind === 'new') this.counts_.new -= 1;
      else if (removed.kind === 'review') this.counts_.review -= 1;
      else this.counts_.learning = Math.max(0, this.counts_.learning - 1);
    } else {
      throw new Error('La tarjeta no está al principio de la cola');
    }
    let requeued: (QueueEntry & { due: number }) | null = null;
    if (card.queue === 'learn' && card.due < timing.nextDayAt) {
      const deckId = (removed ?? fromLearning)!.deckId;
      requeued = this.requeueLearning({ ...key, deckId, kind: 'learning', due: card.due });
    }
    const snapshot = { cutoff: this.cutoff, learningCount: this.counts_.learning };
    this.updateCutoff(timing.now);
    return { removed, fromLearning, requeued, snapshot };
  }

  /**
   * If only learning cards are left and the next one is due before this one, this one waits for it
   * (learning.rs `requeue_learning_entry`: the same card is not shown twice in a row when it can be avoided).
   */
  private requeueLearning(entry: QueueEntry & { due: number }): QueueEntry & { due: number } {
    const cutoff = this.aheadCutoff();
    if (entry.due <= cutoff && this.main.length === 0) {
      const next = this.learning[0];
      if (next && next.due >= entry.due && next.due + 1 < cutoff)
        entry = { ...entry, due: next.due + 1 };
    }
    if (entry.due <= cutoff) this.counts_.learning += 1;
    this.learning.splice(insertionIndex(this.learning, entry.due), 0, entry);
    return entry;
  }

  /** Undoes `answered` (queue/undo.rs): the card goes back to the top. */
  undo(update: QueueUpdate): void {
    this.cutoff = update.snapshot.cutoff;
    this.counts_.learning = update.snapshot.learningCount;
    if (update.requeued) {
      const k = keyOf(update.requeued);
      const i = this.learning.findIndex((e) => keyOf(e) === k);
      if (i >= 0) {
        const [e] = this.learning.splice(i, 1);
        if (e!.due <= this.aheadCutoff()) {
          this.counts_.learning = Math.max(0, this.counts_.learning - 1);
        }
      }
    }
    if (update.fromLearning) {
      this.learning.unshift(update.fromLearning);
      this.counts_.learning += 1;
    } else if (update.removed) {
      this.main.unshift(update.removed);
      if (update.removed.kind === 'new') this.counts_.new += 1;
      else if (update.removed.kind === 'review') this.counts_.review += 1;
      else this.counts_.learning += 1;
    }
  }

  /** Puts a card first (after an undo when the queue was rebuilt). */
  moveToFront(key: CardKey): boolean {
    const k = keyOf(key);
    const i = this.main.findIndex((e) => keyOf(e) === k);
    if (i >= 0) {
      this.main.unshift(...this.main.splice(i, 1));
      return true;
    }
    const j = this.learning.findIndex((e) => keyOf(e) === k);
    if (j >= 0) {
      const [e] = this.learning.splice(j, 1);
      // The first entry of the learning list is shown first only if it is due: make it due now.
      this.learning.unshift({ ...e!, due: Math.min(e!.due, this.cutoff) });
      return true;
    }
    return false;
  }

  /** Kind of the entry of a card in the queue (to underline its count, as Anki). */
  kindOf(key: CardKey): EntryKind | null {
    const k = keyOf(key);
    return (
      this.main.find((e) => keyOf(e) === k)?.kind ??
      (this.learning.some((e) => keyOf(e) === k) ? 'learning' : null)
    );
  }

  /** Seconds until the next learning card of today (for the congratulations screen), or null. */
  nextLearningDue(): number | null {
    return this.learning[0]?.due ?? null;
  }
}

/**
 * Where Anki inserts a learning card: Rust's `binary_search_by` on the due time, as built into Anki 25.09
 * (`Ok(mid)` at the first equal time it probes, else `Err(left)`); the card goes just before that one.
 */
function insertionIndex(list: readonly { due: number }[], due: number): number {
  let size = list.length;
  let left = 0;
  let right = size;
  while (left < right) {
    const mid = left + Math.floor(size / 2);
    const at = list[mid]!.due;
    if (at === due) return mid;
    if (at < due) left = mid + 1;
    else right = mid;
    size = right - left;
  }
  return left;
}

export interface QueueUpdate {
  removed: QueueEntry | null;
  fromLearning: (QueueEntry & { due: number }) | null;
  requeued: (QueueEntry & { due: number }) | null;
  snapshot: { cutoff: number; learningCount: number };
}

/** Comparator of due cards by the preset's review order, then «random» (storage/card/mod.rs). */
function reviewOrder(
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
  // Anki's extract_fsrs_relative_retrievability: how far the card is through its interval, in the
  // FSRS curve (the most forgotten, relative to the desired retention, first when ascending).
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
