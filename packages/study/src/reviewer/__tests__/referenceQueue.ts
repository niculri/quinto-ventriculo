// The study queue as an object with methods, as the old session held it: the reference session works on one of these
// while the reducer works on the pure values it wraps.
import {
  answeredIn,
  buildQueue,
  countsOf,
  entriesOf,
  kindOf,
  moveToFrontIn,
  nextLearningDue,
  nextOf,
  undoIn,
  upcomingOf,
  withCutoff,
} from '@qv/srs';
import type {
  CardRecord,
  Counts,
  QueueEntry,
  QueueInput,
  QueueState,
  QueueUpdate,
  SchedTiming,
} from '@qv/srs';

type CardKey = { noteGuid: string; ord: number };
type EntryKind = QueueEntry['kind'];

export class ReferenceQueue {
  private state: QueueState;

  constructor(input: QueueInput) {
    this.state = buildQueue(input);
  }

  get learnAheadSecs(): number {
    return this.state.learnAheadSecs;
  }

  get today(): number {
    return this.state.today;
  }

  entries(): QueueEntry[] {
    return entriesOf(this.state);
  }

  next(): QueueEntry | null {
    return nextOf(this.state);
  }

  upcoming(n: number): QueueEntry[] {
    return upcomingOf(this.state, n);
  }

  counts(): Counts {
    return countsOf(this.state);
  }

  updateCutoff(now: number): void {
    this.state = withCutoff(this.state, now);
  }

  answered(key: CardKey, card: CardRecord, timing: SchedTiming): QueueUpdate {
    const { queue, update } = answeredIn(this.state, key, card, timing);
    this.state = queue;
    return update;
  }

  undo(update: QueueUpdate): void {
    this.state = undoIn(this.state, update);
  }

  moveToFront(key: CardKey): boolean {
    const moved = moveToFrontIn(this.state, key);
    if (!moved) return false;
    this.state = moved;
    return true;
  }

  kindOf(key: CardKey): EntryKind | null {
    return kindOf(this.state, key);
  }

  nextLearningDue(): number | null {
    return nextLearningDue(this.state);
  }
}
