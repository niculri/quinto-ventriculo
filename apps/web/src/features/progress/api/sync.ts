// Brings the user's rows up to the cards the author moved or took out (`reconcile_cards()`), once per visit and
// before anything of their progress is read by deck.

import type { CardChanges } from '@qv/schema';
import type { StudyRepository } from './repository';

export interface CardChangeSource {
  cardChanges(since: number): Promise<CardChanges>;
}

const MAX_PAGES = 50;

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

// A failure is not remembered: the next read tries again.
export function withCardSync(
  study: StudyRepository,
  source: CardChangeSource,
  userId: () => Promise<string | null>,
): StudyRepository {
  let done: { user: string | null; promise: Promise<unknown> } | null = null;
  const ready = async () => {
    const user = await userId();
    if (done?.user !== user) {
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
    homeCounts: after(study.homeCounts),
  };
}
