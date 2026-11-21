// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * The study queue of a deck and its subdecks, as Anki's v3 scheduler builds and walks it (rslib/src/scheduler/queue/),
 * as an immutable value: every function returns a new queue and leaves its argument alone.
 */
import type { CardKey, CardRecord } from '../card';
import type { SchedTiming } from '../timing';
import { DEFAULT_GLOBAL_SETTINGS } from './base';
import type { Counts, EntryKind, QueueEntry, QueueInput } from './base';
import { gatherDue, gatherIntradayLearning, gatherNew, noteRanks } from './gather';
import type { Gathering } from './gather';
import { mix } from './intersperse';
import { activeLimits } from './limits';
import { reviewOrder, sortNew } from './sort';

const keyOf = (c: CardKey) => `${c.noteGuid}\u001f${c.ord}`;

export type LearningEntry = Readonly<QueueEntry> & { readonly due: number };

export interface QueueState {
  readonly main: readonly Readonly<QueueEntry>[];
  /** Cards in (re)learning today, ordered by due time (not strictly, after `moveToFrontIn`). */
  readonly learning: readonly LearningEntry[];
  readonly counts: Readonly<Counts>;
  readonly cutoff: number;
  readonly learnAheadSecs: number;
  readonly today: number;
}

/** What `answeredIn` took out of the queue and put back in, and what `undoIn` needs to reverse it. */
export interface QueueUpdate {
  readonly removed: Readonly<QueueEntry> | null;
  readonly fromLearning: LearningEntry | null;
  readonly requeued: LearningEntry | null;
  readonly snapshot: { readonly cutoff: number; readonly learningCount: number };
}

/** QueueBuilder::new + gather_cards + build: gathering, burying, sorting and mixing, in Anki's order. */
export function buildQueue(input: QueueInput): QueueState {
  const settings = input.settings ?? DEFAULT_GLOBAL_SETTINGS;
  const { timing } = input;
  const byId = new Map(input.decks.map((d) => [d.id, d]));
  const root = byId.get(input.rootDeckId);
  if (!root) throw new Error(`Mazo ${input.rootDeckId} no encontrado`);

  const { active, limits } = activeLimits(input.decks, root, input.studiedToday, settings);
  const options = root.config;
  const activeIds = new Set(active.map((d) => d.id));
  const deckRank = new Map(active.map((d, i) => [d.id, i]));
  const cards = input.cards.filter((c) => activeIds.has(c.deckId) && !c.hidden);
  const g: Gathering = { cards, limits, timing, byId, deckList: input.deckList, seen: new Map() };

  const learning = gatherIntradayLearning(g);
  const noteRank = noteRanks(input.cards);
  const reviewKey = reviewOrder(options, timing, deckRank, noteRank);
  const dayLearning: QueueEntry[] = [];
  const reviews: QueueEntry[] = [];
  gatherDue(g, 'dayLearn', dayLearning, 'learning', reviewKey);
  gatherDue(g, 'review', reviews, 'review', reviewKey);
  const news = gatherNew(g, options.newCardGatherPriority, active, noteRank);
  sortNew(news, options.newCardSortOrder, timing.today);

  const newEntries: QueueEntry[] = news.map(({ noteGuid, ord, deckId }) => ({
    noteGuid,
    ord,
    deckId,
    kind: 'new',
  }));
  const withDayLearning = mix(reviews, dayLearning, options.interdayLearningMix);
  const main = mix(withDayLearning, newEntries, options.newMix);
  const cutoff = timing.now + settings.learnAheadSecs;
  return {
    main,
    learning,
    counts: {
      new: newEntries.length,
      review: reviews.length,
      learning: learning.filter((e) => e.due <= cutoff).length + dayLearning.length,
    },
    cutoff: timing.now,
    learnAheadSecs: settings.learnAheadSecs,
    today: timing.today,
  };
}

const aheadCutoff = (q: QueueState) => q.cutoff + q.learnAheadSecs;

const plain = ({ noteGuid, ord, deckId, kind }: QueueEntry): QueueEntry => ({
  noteGuid,
  ord,
  deckId,
  kind,
});

/** The queue in order: learning due now, then the main queue, then learning within the learn-ahead limit. */
export function entriesOf(q: QueueState): QueueEntry[] {
  const ahead = aheadCutoff(q);
  const now = q.learning.filter((e) => e.due <= q.cutoff);
  const later = q.learning.filter((e) => e.due > q.cutoff && e.due <= ahead);
  return [...now, ...q.main, ...later].map(plain);
}

/** The first of `entriesOf`, without building the whole list. */
export function nextOf(q: QueueState): QueueEntry | null {
  const due = q.learning.find((e) => e.due <= q.cutoff);
  if (due) return plain(due);
  const first = q.main[0];
  if (first) return plain(first);
  const ahead = aheadCutoff(q);
  const later = q.learning.find((e) => e.due > q.cutoff && e.due <= ahead);
  return later ? plain(later) : null;
}

export function upcomingOf(q: QueueState, n: number): QueueEntry[] {
  return entriesOf(q).slice(0, n);
}

export function countsOf(q: QueueState): Counts {
  return { ...q.counts };
}

/** Moves the cutoff forward (never back) and counts the learning cards the new learn-ahead window reaches. */
export function withCutoff(q: QueueState, now: number): QueueState {
  const lastAhead = aheadCutoff(q);
  const cutoff = Math.max(q.cutoff, now);
  const nextAhead = cutoff + q.learnAheadSecs;
  const reached = q.learning.filter((e) => e.due > lastAhead && e.due <= nextAhead).length;
  if (cutoff === q.cutoff && reached === 0) return q;
  return {
    ...q,
    cutoff,
    counts: { ...q.counts, learning: q.counts.learning + reached },
  };
}

export function answeredIn(
  q: QueueState,
  key: CardKey,
  card: CardRecord,
  timing: SchedTiming,
): { queue: QueueState; update: QueueUpdate } {
  const k = keyOf(key);
  let main = q.main;
  let learning = q.learning;
  let counts = q.counts;
  let removed: Readonly<QueueEntry> | null = null;
  let fromLearning: LearningEntry | null = null;
  const firstLearning = learning[0];
  const firstMain = main[0];
  if (firstLearning && keyOf(firstLearning) === k) {
    fromLearning = firstLearning;
    learning = learning.slice(1);
    counts = { ...counts, learning: Math.max(0, counts.learning - 1) };
  } else if (firstMain && keyOf(firstMain) === k) {
    removed = firstMain;
    main = main.slice(1);
    if (removed.kind === 'new') counts = { ...counts, new: counts.new - 1 };
    else if (removed.kind === 'review') counts = { ...counts, review: counts.review - 1 };
    else counts = { ...counts, learning: Math.max(0, counts.learning - 1) };
  } else {
    throw new Error('La tarjeta no está al principio de la cola');
  }
  let requeued: LearningEntry | null = null;
  if (card.queue === 'learn' && card.due < timing.nextDayAt) {
    const deckId = (removed ?? fromLearning)!.deckId;
    const placed = requeueLearning(
      { ...q, main, learning, counts },
      { ...key, deckId, kind: 'learning', due: card.due },
    );
    ({ learning, counts, entry: requeued } = placed);
  }
  const snapshot = { cutoff: q.cutoff, learningCount: counts.learning };
  const queue = withCutoff({ ...q, main, learning, counts }, timing.now);
  return { queue, update: { removed, fromLearning, requeued, snapshot } };
}

/** learning.rs `requeue_learning_entry`: with only learning left, the card waits not to show twice in a row. */
function requeueLearning(
  q: QueueState,
  wanted: LearningEntry,
): { learning: readonly LearningEntry[]; counts: Readonly<Counts>; entry: LearningEntry } {
  let entry = wanted;
  const cutoff = aheadCutoff(q);
  if (entry.due <= cutoff && q.main.length === 0) {
    const next = q.learning[0];
    if (next && next.due >= entry.due && next.due + 1 < cutoff)
      entry = { ...entry, due: next.due + 1 };
  }
  const at = insertionIndex(q.learning, entry.due);
  return {
    learning: [...q.learning.slice(0, at), entry, ...q.learning.slice(at)],
    counts: entry.due <= cutoff ? { ...q.counts, learning: q.counts.learning + 1 } : q.counts,
    entry,
  };
}

/** queue/undo.rs. */
export function undoIn(q: QueueState, update: QueueUpdate): QueueState {
  let learning = q.learning;
  let main = q.main;
  let counts: Counts = { ...q.counts, learning: update.snapshot.learningCount };
  if (update.requeued) {
    const k = keyOf(update.requeued);
    const i = learning.findIndex((e) => keyOf(e) === k);
    if (i >= 0) {
      const e = learning[i]!;
      learning = [...learning.slice(0, i), ...learning.slice(i + 1)];
      if (e.due <= update.snapshot.cutoff + q.learnAheadSecs) {
        counts = { ...counts, learning: Math.max(0, counts.learning - 1) };
      }
    }
  }
  if (update.fromLearning) {
    learning = [update.fromLearning, ...learning];
    counts = { ...counts, learning: counts.learning + 1 };
  } else if (update.removed) {
    main = [update.removed, ...main];
    const kind = update.removed.kind;
    if (kind === 'new') counts = { ...counts, new: counts.new + 1 };
    else if (kind === 'review') counts = { ...counts, review: counts.review + 1 };
    else counts = { ...counts, learning: counts.learning + 1 };
  }
  return { ...q, main, learning, counts, cutoff: update.snapshot.cutoff };
}

/** Puts a card at the front of the queue; `null` if it is not in it. */
export function moveToFrontIn(q: QueueState, key: CardKey): QueueState | null {
  const k = keyOf(key);
  const i = q.main.findIndex((e) => keyOf(e) === k);
  if (i >= 0) {
    return { ...q, main: [q.main[i]!, ...q.main.slice(0, i), ...q.main.slice(i + 1)] };
  }
  const j = q.learning.findIndex((e) => keyOf(e) === k);
  if (j >= 0) {
    const e = q.learning[j]!;
    // The first entry of the learning list is shown first only if it is due: make it due now.
    const first = { ...e, due: Math.min(e.due, q.cutoff) };
    return { ...q, learning: [first, ...q.learning.slice(0, j), ...q.learning.slice(j + 1)] };
  }
  return null;
}

export function kindOf(q: QueueState, key: CardKey): EntryKind | null {
  const k = keyOf(key);
  return (
    q.main.find((e) => keyOf(e) === k)?.kind ??
    (q.learning.some((e) => keyOf(e) === k) ? 'learning' : null)
  );
}

export function nextLearningDue(q: QueueState): number | null {
  return q.learning[0]?.due ?? null;
}

/** Rust's `binary_search_by` on the due time, as Anki inserts a learning card: the first equal one it probes. */
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
