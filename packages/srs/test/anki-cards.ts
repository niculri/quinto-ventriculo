/** Anki's cards as scripts/anki_queue.py and anki_rebuild.py write them, and their @qv/srs equivalent. */
import { newCard } from '../src';
import type { CardRecord, Queue, QueueCard } from '../src';

export interface AnkiCard {
  id: number;
  nid: number;
  mod: number;
  guid: string;
  ord: number;
  deck: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  left: number;
  reps: number;
  lapses: number;
  s: number | null;
  d: number | null;
  lrt: number | null;
}

const PHASES = ['new', 'learning', 'review', 'relearning'] as const;

/** Anki's queue number → ours (0 new, 1 learn, 2 review, 3 interday learning). */
export const QUEUES: Record<number, Queue> = { 0: 'new', 1: 'learn', 2: 'review', 3: 'dayLearn' };

export function fromAnki(c: AnkiCard): CardRecord {
  const phase = PHASES[c.type]!;
  if (phase === 'new') return newCard(c.due);
  return {
    phase,
    queue: phase === 'review' ? 'review' : c.due > 1_000_000_000 ? 'learn' : 'dayLearn',
    due: c.due,
    interval: c.ivl,
    remainingSteps: c.left,
    stability: c.s,
    difficulty: c.d,
    reps: c.reps,
    lapses: c.lapses,
    lastReview: c.lrt,
  };
}

/** The card for the queue, with Anki's ids (so that its random tie-breaks are Anki's). */
export function queueCard(c: AnkiCard, index: number): QueueCard {
  return {
    noteGuid: c.guid,
    ord: c.ord,
    deckId: String(c.deck),
    index,
    record: fromAnki(c),
    hidden: c.queue < 0,
    ids: { card: BigInt(c.id), note: BigInt(c.nid), mtime: BigInt(c.mod) },
  };
}
