// How a study session saves the reducer's commands: one write after another, with each card's concurrency mark filled
// in as the write runs, an answer retried twice if the connection fails and nothing written after a failure.
import { cardKey, touchedBy } from '@qv/study';
import type { Command, SaveFailure } from '@qv/study';
import type { QueueEntry } from '@qv/srs';
import { CardChangedError } from '../../progress/api/repository';
import type { CardRef, ReviewInput, StudyRepository } from '../../progress/api/repository';

export class SaveQueue {
  failure: SaveFailure | null = null;
  pending = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  /** The marks of the cards a command changed, as they were when it was received: an undo puts them back. */
  private readonly before = new Map<number, Map<string, string | null>>();
  private readonly stamps: Map<string, string | null>;

  constructor(
    private readonly repository: StudyRepository,
    marks: ReadonlyMap<string, string | null>,
    private readonly retryDelaysMs: readonly number[],
    private readonly onFailure: (failure: SaveFailure) => void,
    private readonly onPrefetch: (entries: readonly QueueEntry[]) => void,
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
        this.remember(command);
        this.enqueue(async () => {
          await saveAnswer(
            repository,
            stamps,
            this.retryDelaysMs,
            { ...command.review, expectedUpdatedAt: stamps.get(key) ?? null },
            key,
          );
          if (command.review.bury.length)
            await refreshStamps(repository, stamps, deckIdsOf(command.review.bury));
        });
        return;
      }
      case 'bury':
        this.remember(command);
        this.enqueue(async () => {
          await repository.bury([...command.cards], new Date(command.untilMs), command.note);
          await refreshStamps(repository, stamps, deckIdsOf(command.cards));
        });
        return;
      case 'suspend':
        this.remember(command);
        this.enqueue(async () => {
          await repository.suspend([...command.cards], command.note);
          await refreshStamps(repository, stamps, deckIdsOf(command.cards));
        });
        return;
      case 'setFlag':
        this.remember(command);
        this.enqueue(async () => {
          await repository.setFlag(command.card, command.flag);
          await refreshStamps(repository, stamps, [command.card.deckId]);
        });
        return;
      case 'undo':
        for (const [k, stamp] of this.before.get(command.undoes) ?? []) stamps.set(k, stamp);
        this.before.delete(command.undoes);
        this.enqueue(async () => {
          const undone = await repository.undo();
          // The database undoes the user's last action: if it was not this one (another tab or device did
          // something after it), what is shown here is no longer what is saved.
          if (
            undone?.action !== command.action ||
            undone.noteGuid !== command.card.noteGuid ||
            undone.ord !== command.card.ord
          ) {
            throw new CardChangedError();
          }
        });
    }
  }

  private remember(command: Command) {
    const kept = new Map<string, string | null>();
    for (const r of touchedBy(command)) kept.set(cardKey(r), this.stamps.get(cardKey(r)) ?? null);
    this.before.set(command.seq, kept);
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
// changed by this very answer counts as saved.
async function saveAnswer(
  repository: StudyRepository,
  stamps: Map<string, string | null>,
  retryDelaysMs: readonly number[],
  input: ReviewInput,
  key: string,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      const saved = await repository.recordReview(input);
      stamps.set(key, saved.updatedAt);
      return;
    } catch (e) {
      if (attempt > 0 && e instanceof CardChangedError) {
        const rows = await repository.cards([input.card.deckId]);
        const row = rows.find((r) => cardKey(r) === key);
        if (row && row.lastReview === input.state.lastReview && row.reps === input.state.reps) {
          stamps.set(key, row.updatedAt);
          return;
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
