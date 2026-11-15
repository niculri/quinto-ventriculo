// How a study session saves: one write after another, in order, with an answer retried twice if the connection
// fails; after a failure what was waiting behind is not written (it was computed on top of the failed one).
import { cardKey } from '@qv/study';
import { CardChangedError } from '../../progress/api/repository';
import type { ReviewInput, StudyRepository } from '../../progress/api/repository';

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
            ? 'Esta tarjeta cambió en otra pestaña o dispositivo. Vuelve a cargar para seguir estudiando.'
            : e instanceof Error && e.message.startsWith('No se pudo')
              ? e.message
              : 'No se pudo guardar tu avance. Revisa tu conexión y vuelve a cargar.';
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

export async function refreshStamps(
  repository: StudyRepository,
  stamps: Map<string, string | null>,
  deckIds: string[],
) {
  const fresh = await repository.cards([...new Set(deckIds)]);
  for (const r of fresh) stamps.set(cardKey(r), r.updatedAt);
}
