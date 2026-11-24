// A copy of `apps/web/src/features/study/api/SaveQueue.ts` as it is on `main`, which the session tests compare with.
import type { CardRef, ReviewInput, StoredCard, UndoResult } from '@qv/schema/user';
import { cardKey } from '../../scheduler';

export class CardChangedError extends Error {
  constructor() {
    super('Esta tarjeta cambió en otra pestaña o dispositivo.');
    this.name = 'CardChangedError';
  }
}

/** The texts of the study screens that a session's saving and toasts use. */
export const studyStrings = {
  session: {
    leech: 'Fallaste esta tarjeta muchas veces: quedó marcada como difícil.',
    leechSuspended:
      'Fallaste esta tarjeta muchas veces y quedó suspendida. Puedes quitarle la suspensión en el explorador.',
    hidden: {
      bury_card: 'Tarjeta enterrada.',
      bury_note: 'Nota enterrada.',
      suspend_card: 'Tarjeta suspendida.',
      suspend_note: 'La nota se ha suspendido.',
    },
    skipped: 'Saltada por hoy.',
    neverAgain: 'Esta tarjeta no se mostrará más.',
    undone: (action: string) => `Deshecho: ${action}`,
    nothingToUndo: 'No hay nada que deshacer',
    changedElsewhere:
      'Esta tarjeta cambió en otra pestaña o dispositivo. Vuelve a cargar para seguir estudiando.',
    notSaved: 'No se pudo guardar tu avance. Revisa tu conexión y vuelve a cargar.',
  },
} as const;

/** What a session asks of the repository. */
export interface SessionRepository {
  recordReview(input: ReviewInput): Promise<{ updatedAt: string }>;
  bury(cards: CardRef[], until: Date, note: boolean): Promise<void>;
  suspend(cards: CardRef[], note: boolean): Promise<void>;
  setFlag(card: CardRef, flag: number): Promise<void>;
  undo(): Promise<UndoResult | null>;
  cards(deckIds: string[]): Promise<StoredCard[]>;
}

export class SaveQueue {
  failure: string | null = null;
  pending = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly onFailure: () => void) {}

  saved(): Promise<unknown> {
    return this.chain;
  }

  enqueue(write: () => Promise<unknown>) {
    this.pending++;
    this.chain = this.chain
      .then(() => (this.failure ? undefined : write()))
      .catch((e: unknown) => {
        this.failure =
          e instanceof CardChangedError
            ? studyStrings.session.changedElsewhere
            : e instanceof Error && e.message.startsWith('No se pudo')
              ? e.message
              : studyStrings.session.notSaved;
        this.onFailure();
      })
      .finally(() => {
        this.pending--;
      });
  }
}

// A retry cannot save an answer twice: the database takes it only if the card is as it was shown, and finding it
// changed by this very answer counts as saved.
export async function saveAnswer(
  repository: SessionRepository,
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
        if (row?.lastReview === input.state.lastReview && row.reps === input.state.reps) {
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

export async function refreshStamps(
  repository: SessionRepository,
  stamps: Map<string, string | null>,
  deckIds: string[],
) {
  const fresh = await repository.cards([...new Set(deckIds)]);
  for (const r of fresh) stamps.set(cardKey(r), r.updatedAt);
}
