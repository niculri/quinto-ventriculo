// What the web's saving side has to do with the reducer's commands (the test writes it independently of the copy of
// the old saving): in order, one write after another, with each card's mark filled in and put back on an undo.
import type { CardRef } from '@qv/schema/user';
import { cardKey } from '../../scheduler';
import { touchedBy } from '../commands';
import type { Command } from '../commands';
import type { SaveFailure } from '../state';
import { CardChangedError, refreshStamps, saveAnswer } from './reference-save';
import type { SessionRepository } from './reference-save';

export class CommandSaver {
  readonly stamps: Map<string, string | null>;
  pending = 0;
  failure: SaveFailure | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly before = new Map<number, Map<string, string | null>>();

  constructor(
    private readonly repository: SessionRepository,
    marks: ReadonlyMap<string, string | null>,
    private readonly retryDelaysMs: readonly number[],
    private readonly onFailure: (failure: SaveFailure) => void,
    private readonly onPrefetch: (entries: readonly unknown[]) => void,
  ) {
    this.stamps = new Map(marks);
  }

  handle(command: Command) {
    const { repository, stamps } = this;
    switch (command.kind) {
      case 'prefetch':
        this.onPrefetch(command.entries);
        return;
      case 'saveAnswer': {
        this.remember(command);
        const key = cardKey(command.review.card);
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
      case 'undo': {
        for (const [k, stamp] of this.before.get(command.undoes) ?? []) stamps.set(k, stamp);
        this.before.delete(command.undoes);
        this.enqueue(async () => {
          const undone = await repository.undo();
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
  }

  private remember(command: Command) {
    const kept = new Map<string, string | null>();
    for (const r of touchedBy(command)) kept.set(cardKey(r), this.stamps.get(cardKey(r)) ?? null);
    this.before.set(command.seq, kept);
  }

  private enqueue(write: () => Promise<unknown>) {
    this.pending++;
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
        this.pending--;
      });
  }
}

const deckIdsOf = (cards: readonly CardRef[]) => cards.map((c) => c.deckId);
