// How a study session saves the reducer's commands: one write after another, a request that got no answer made again
// until it gets one, nothing written after a refusal, and an undo that says which action it takes back.
import { cardKey, touchedBy } from '@qv/study';
import type { Command, CommandId, SaveFailure } from '@qv/study';
import type { QueueEntry } from '@qv/srs';
import { CardChangedError, ConnectionError, UndoRefusedError } from '../../progress/api/repository';
import type {
  CardRef,
  ReviewInput,
  StoredCard,
  StudyRepository,
  UndoExpected,
} from '../../progress/api/repository';

/** With this many changes waiting for the connection, no other is taken: what a closed tab would lose stays small. */
const UNSAVED_MAX = 30;

const unsettled = new Set<SaveQueue>();

/**
 * Settles once every study session of this tab has written what it had to (or was refused); null when none has
 * anything left. A session left without a connection goes on saving: a new one must not read the cards before.
 */
export function earlierSaves(): Promise<unknown> | null {
  return unsettled.size ? Promise.all([...unsettled].map((queue) => queue.saved())) : null;
}

export class SaveQueue {
  failure: SaveFailure | null = null;
  pending = 0;
  /** Whether the write in turn got no answer and waits to be made again. */
  waiting = false;
  private wake: (() => void) | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  /** The marks of the cards a command changed, as they were when its write began: an undo puts them back. */
  private readonly before = new Map<CommandId, Map<string, string | null>>();
  /** The database's id of each answer saved, so an undo can say which one it takes back. */
  private readonly actionIds = new Map<CommandId, string>();
  private readonly stamps: Map<string, string | null>;

  constructor(
    private readonly repository: StudyRepository,
    marks: ReadonlyMap<string, string | null>,
    private readonly retryDelaysMs: readonly number[],
    private readonly onFailure: (failure: SaveFailure) => void,
    private readonly onPrefetch: (entries: readonly QueueEntry[]) => void,
    private readonly onUndoRefused: () => void,
  ) {
    this.stamps = new Map(marks);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  saved(): Promise<unknown> {
    return this.chain;
  }

  /** How many changes wait for the connection to come back: 0 while it works. */
  get unsaved(): number {
    return this.waiting ? this.pending : 0;
  }

  get full(): boolean {
    return this.unsaved >= UNSAVED_MAX;
  }

  /** The connection may be back: the write that waits is made now. */
  retryNow = () => {
    this.wake?.();
  };

  handle(command: Command) {
    const { repository, stamps } = this;
    switch (command.kind) {
      case 'prefetch':
        this.onPrefetch(command.entries);
        return;
      case 'saveAnswer': {
        const key = cardKey(command.review.card);
        this.enqueue(async () => {
          this.remember(command);
          const input = { ...command.review, expectedUpdatedAt: stamps.get(key) ?? null };
          const actionId = await this.reach((again) =>
            saveAnswer(repository, stamps, input, key, again),
          );
          if (actionId !== undefined) this.actionIds.set(command.id, actionId);
          if (command.review.bury.length) await this.refresh(command.review.bury);
        });
        return;
      }
      case 'bury':
        this.enqueue(async () => {
          this.remember(command);
          await this.change(
            command.cards,
            () => repository.bury([...command.cards], new Date(command.untilMs), command.note),
            (row) => row.buriedUntil !== null,
          );
        });
        return;
      case 'suspend':
        this.enqueue(async () => {
          this.remember(command);
          await this.change(
            command.cards,
            () => repository.suspend([...command.cards], command.note),
            (row) => row.suspended,
          );
        });
        return;
      case 'setFlag':
        this.enqueue(async () => {
          this.remember(command);
          await this.change(
            [command.card],
            () => repository.setFlag(command.card, command.flag),
            (row) => row.flag === command.flag,
          );
        });
        return;
      case 'undo':
        this.enqueue(async () => {
          const actionId = this.actionIds.get(command.undoes);
          const marks = this.before.get(command.undoes);
          this.before.delete(command.undoes);
          this.actionIds.delete(command.undoes);
          const expected = {
            ...command.card,
            action: command.action,
            ...(actionId === undefined ? {} : { actionId }),
          };
          const before = marks?.get(cardKey(command.card));
          try {
            await this.reach((again) => undo(repository, expected, before, again));
          } catch (e) {
            // Another tab or device acted after it: nothing was undone, so the marks stay as they are.
            if (!(e instanceof UndoRefusedError)) throw e;
            this.onUndoRefused();
            return;
          }
          // The database gives the card back its old mark: put it back here only now, or the end of the write
          // being undone would overwrite it.
          for (const [k, stamp] of marks ?? []) stamps.set(k, stamp);
        });
    }
  }

  private remember(command: Command) {
    const kept = new Map<string, string | null>();
    for (const r of touchedBy(command)) kept.set(cardKey(r), this.stamps.get(cardKey(r)) ?? null);
    this.before.set(command.id, kept);
  }

  private refresh(cards: readonly CardRef[]) {
    return this.reach(() => refreshStamps(this.repository, this.stamps, deckIdsOf(cards)));
  }

  // A change to some cards, and their marks read again. Asked again it is not made twice (it would be two actions to
  // undo): it reached the database if one of the cards left the mark it had and shows the change (`done`).
  private async change(
    cards: readonly CardRef[],
    write: () => Promise<void>,
    done: (row: StoredCard) => boolean,
  ) {
    await this.reach(async (again) => {
      if (again) {
        const rows = await this.repository.cards(deckIdsOf(cards));
        const keys = new Set(cards.map(cardKey));
        const moved = (row: StoredCard) =>
          keys.has(cardKey(row)) && row.updatedAt !== (this.stamps.get(cardKey(row)) ?? null);
        if (rows.some((row) => moved(row) && done(row))) return;
      }
      await write();
    });
    await this.refresh(cards);
  }

  // A request that got no answer is made again for as long as it takes, each time after a longer wait, and nothing
  // after it is written meanwhile. `again` tells the request it may already have been done.
  private async reach<T>(request: (again: boolean) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await request(attempt > 0);
        this.setWaiting(false);
        return result;
      } catch (e) {
        if (!(e instanceof ConnectionError)) {
          this.setWaiting(false);
          throw e;
        }
        this.setWaiting(true);
        await this.pause(attempt);
      }
    }
  }

  private pause(attempt: number): Promise<void> {
    const delay = this.retryDelaysMs[Math.min(attempt, this.retryDelaysMs.length - 1)];
    return new Promise((resolve) => {
      const go = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
      const timer = setTimeout(go, delay);
      this.wake = go;
    });
  }

  private setWaiting(waiting: boolean) {
    if (this.waiting !== waiting) this.changed(() => (this.waiting = waiting));
  }

  private enqueue(write: () => Promise<unknown>) {
    unsettled.add(this);
    this.changed(() => this.pending++);
    this.chain = this.chain
      .then(() => (this.failure ? undefined : write()))
      .catch((e: unknown) => {
        this.failure =
          e instanceof CardChangedError
            ? { kind: 'changedElsewhere' }
            : e instanceof Error && e.message.startsWith('No se pudo')
              ? { kind: 'message', message: e.message }
              : { kind: 'notSaved' };
        this.onFailure(this.failure);
      })
      .finally(() => {
        this.changed(() => this.pending--);
        if (this.pending === 0) unsettled.delete(this);
      });
  }

  private changed(update: () => void) {
    update();
    this.listeners.forEach((l) => l());
  }
}

const deckIdsOf = (cards: readonly CardRef[]) => cards.map((c) => c.deckId);

// Asking again cannot save an answer twice: the database takes it only if the card is as it was shown, and finding it
// changed by this very answer counts as saved (without the answer's id then). Gives that id.
async function saveAnswer(
  repository: StudyRepository,
  stamps: Map<string, string | null>,
  input: ReviewInput,
  key: string,
  again: boolean,
): Promise<string | undefined> {
  try {
    const saved = await repository.recordReview(input);
    stamps.set(key, saved.updatedAt);
    return saved.actionId;
  } catch (e) {
    if (!again || !(e instanceof CardChangedError)) throw e;
    const rows = await repository.cards([input.card.deckId]);
    const row = rows.find((r) => cardKey(r) === key);
    if (row?.lastReview !== input.state.lastReview || row.reps !== input.state.reps) throw e;
    stamps.set(key, row.updatedAt);
    return undefined;
  }
}

// Asking again cannot undo twice, nor take back the action before it (the same one on the same card looks alike to
// the database): the card back at the mark it had before (`before`; none when this queue did not write it) is undone.
async function undo(
  repository: StudyRepository,
  expected: UndoExpected,
  before: string | null | undefined,
  again: boolean,
): Promise<void> {
  if (again && before !== undefined) {
    const rows = await repository.cards([expected.deckId]);
    const now = rows.find((r) => cardKey(r) === cardKey(expected))?.updatedAt ?? null;
    if (now === before) return;
  }
  await repository.undo(expected);
}

async function refreshStamps(
  repository: StudyRepository,
  stamps: Map<string, string | null>,
  deckIds: string[],
) {
  const fresh = await repository.cards([...new Set(deckIds)]);
  for (const r of fresh) stamps.set(cardKey(r), r.updatedAt);
}
