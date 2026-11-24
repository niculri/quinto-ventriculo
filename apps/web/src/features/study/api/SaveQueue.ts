// How a study session saves the reducer's commands: one write after another, each card's mark filled in as it runs, an
// answer retried twice, nothing written after a failure, and an undo that says which action it takes back.
import { cardKey, touchedBy } from '@qv/study';
import type { Command, CommandId, SaveFailure } from '@qv/study';
import type { QueueEntry } from '@qv/srs';
import { CardChangedError, UndoRefusedError } from '../../progress/api/repository';
import type { CardRef, ReviewInput, StudyRepository } from '../../progress/api/repository';

export class SaveQueue {
  failure: SaveFailure | null = null;
  pending = 0;
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
          const actionId = await saveAnswer(
            repository,
            stamps,
            this.retryDelaysMs,
            { ...command.review, expectedUpdatedAt: stamps.get(key) ?? null },
            key,
          );
          if (actionId !== undefined) this.actionIds.set(command.id, actionId);
          if (command.review.bury.length)
            await refreshStamps(repository, stamps, deckIdsOf(command.review.bury));
        });
        return;
      }
      case 'bury':
        this.enqueue(async () => {
          this.remember(command);
          await repository.bury([...command.cards], new Date(command.untilMs), command.note);
          await refreshStamps(repository, stamps, deckIdsOf(command.cards));
        });
        return;
      case 'suspend':
        this.enqueue(async () => {
          this.remember(command);
          await repository.suspend([...command.cards], command.note);
          await refreshStamps(repository, stamps, deckIdsOf(command.cards));
        });
        return;
      case 'setFlag':
        this.enqueue(async () => {
          this.remember(command);
          await repository.setFlag(command.card, command.flag);
          await refreshStamps(repository, stamps, [command.card.deckId]);
        });
        return;
      case 'undo':
        this.enqueue(async () => {
          const actionId = this.actionIds.get(command.undoes);
          const marks = this.before.get(command.undoes);
          this.before.delete(command.undoes);
          this.actionIds.delete(command.undoes);
          try {
            await repository.undo({
              ...command.card,
              action: command.action,
              ...(actionId === undefined ? {} : { actionId }),
            });
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

  private enqueue(write: () => Promise<unknown>) {
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
      });
  }

  private changed(update: () => void) {
    update();
    this.listeners.forEach((l) => l());
  }
}

const deckIdsOf = (cards: readonly CardRef[]) => cards.map((c) => c.deckId);

// A retry cannot save an answer twice: the database takes it only if the card is as it was shown, and finding it
// changed by this very answer counts as saved (without the answer's id then). Gives that id.
async function saveAnswer(
  repository: StudyRepository,
  stamps: Map<string, string | null>,
  retryDelaysMs: readonly number[],
  input: ReviewInput,
  key: string,
): Promise<string | undefined> {
  for (let attempt = 0; ; attempt++) {
    try {
      const saved = await repository.recordReview(input);
      stamps.set(key, saved.updatedAt);
      return saved.actionId;
    } catch (e) {
      if (attempt > 0 && e instanceof CardChangedError) {
        const rows = await repository.cards([input.card.deckId]);
        const row = rows.find((r) => cardKey(r) === key);
        if (row?.lastReview === input.state.lastReview && row.reps === input.state.reps) {
          stamps.set(key, row.updatedAt);
          return undefined;
        }
      }
      const delay = retryDelaysMs[attempt];
      if (e instanceof CardChangedError || delay === undefined) throw e;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function refreshStamps(
  repository: StudyRepository,
  stamps: Map<string, string | null>,
  deckIds: string[],
) {
  const fresh = await repository.cards([...new Set(deckIds)]);
  for (const r of fresh) stamps.set(cardKey(r), r.updatedAt);
}
