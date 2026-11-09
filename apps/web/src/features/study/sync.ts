import type { CardChanges } from '@qv/schema';
import type { StudyRepository } from './repository';

/**
 * Cards the author moved to another deck or took out (plan step 1.3). The user's rows keep the deck a card was in
 * when it was answered, and they are read by deck; the content knows where each card is now. When the student
 * enters, the content's changes that are new for them go to their rows (`reconcile_cards()`), before anything of
 * their progress is read. Publishing never writes in anybody's progress.
 */

/** Where the changes come from: the API (`GET /api/anki/card-changes`). */
export interface CardChangeSource {
  cardChanges(since: number): Promise<CardChanges>;
}

/** At most this many pages a time (2,000 changes each); the rest, the next time. */
const MAX_PAGES = 50;

/** Brings the user's cards up to the content's changes. Returns how many rows changed. */
export async function syncCards(source: CardChangeSource, study: StudyRepository): Promise<number> {
  let stored = await study.cardsSyncedTo();
  let changed = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    let page = await source.cardChanges(stored);
    // The content started again (a newer number than any it has): everything, from the beginning.
    if (stored > page.latest) page = await source.cardChanges(0);
    if (!page.changes.length && page.next === stored) return changed;
    const r = await study.reconcileCards({
      since: stored,
      upTo: page.next,
      changes: page.changes,
    });
    changed += r.changed;
    stored = r.syncedTo;
    // Another tab was ahead: from where it left it.
    if (r.applied && !page.more) return changed;
  }
  return changed;
}

/**
 * The repository, with the user's cards brought up to the content's changes once per visit (and per user) before
 * the reads that go by deck: the cards of a deck, every card, the progress of each deck and the decks answered.
 * A failure is not remembered: the next read tries again (and shows the error, with «Reintentar»).
 */
export function withCardSync(
  study: StudyRepository,
  source: CardChangeSource,
  userId: () => Promise<string | null>,
): StudyRepository {
  let done: { user: string | null; promise: Promise<unknown> } | null = null;
  const ready = async () => {
    const user = await userId();
    if (!done || done.user !== user) {
      const promise = syncCards(source, study);
      const mine = { user, promise };
      done = mine;
      promise.catch(() => {
        if (done === mine) done = null;
      });
    }
    await done.promise;
  };
  const after =
    <A extends unknown[], R>(read: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await ready();
      return read(...args);
    };
  return {
    ...study,
    cards: after(study.cards),
    allCards: after(study.allCards),
    deckProgress: after(study.deckProgress),
    answeredDecks: after(study.answeredDecks),
    // What is due goes by the cards' decks too.
    heatmap: after(study.heatmap),
  };
}
