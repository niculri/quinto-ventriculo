// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * The study queue of a deck and its subdecks, as Anki's v3 scheduler builds and walks it (rslib/src/scheduler/queue/:
 * builder/mod.rs, learning.rs, main.rs, undo.rs).
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

export class StudyQueue {
  private main: QueueEntry[] = [];
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

  /** QueueBuilder::new + gather_cards + build: gathering, burying, sorting and mixing, in Anki's order. */
  static build(input: QueueInput): StudyQueue {
    const settings = input.settings ?? DEFAULT_GLOBAL_SETTINGS;
    const { timing } = input;
    const byId = new Map(input.decks.map((d) => [d.id, d]));
    const root = byId.get(input.rootDeckId);
    if (!root) throw new Error(`Mazo ${input.rootDeckId} no encontrado`);
    const queue = new StudyQueue(timing, settings.learnAheadSecs);

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

  next(): QueueEntry | null {
    return this.entries()[0] ?? null;
  }

  upcoming(n: number): QueueEntry[] {
    return this.entries().slice(0, n);
  }

  counts(): Counts {
    if (this.counts_.new === 0 && this.counts_.learning === 0 && this.counts_.review === 0) {
      this.updateCutoff(this.cutoff);
    }
    return { ...this.counts_ };
  }

  updateCutoff(now: number): void {
    const lastAhead = this.aheadCutoff();
    this.cutoff = Math.max(this.cutoff, now);
    const nextAhead = this.aheadCutoff();
    this.counts_.learning += this.learning.filter(
      (e) => e.due > lastAhead && e.due <= nextAhead,
    ).length;
  }

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

  /** learning.rs `requeue_learning_entry`: with only learning left, the card waits not to show twice in a row. */
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

  /** queue/undo.rs. */
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

  kindOf(key: CardKey): EntryKind | null {
    const k = keyOf(key);
    return (
      this.main.find((e) => keyOf(e) === k)?.kind ??
      (this.learning.some((e) => keyOf(e) === k) ? 'learning' : null)
    );
  }

  nextLearningDue(): number | null {
    return this.learning[0]?.due ?? null;
  }
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

export interface QueueUpdate {
  removed: QueueEntry | null;
  fromLearning: (QueueEntry & { due: number }) | null;
  requeued: (QueueEntry & { due: number }) | null;
  snapshot: { cutoff: number; learningCount: number };
}
