// The browser copy's reconciling of its cards' decks with the content's changes.
import { settle } from '../../../../shared/lib/settle';
import type { LocalStore } from './localStore';
import { same } from './localStore';
import type { StudyRepository } from './port';

const MAX_CHANGES = 2000;

export function localSync({
  read,
  write,
}: LocalStore): Pick<StudyRepository, 'cardsSyncedTo' | 'reconcileCards'> {
  return {
    cardsSyncedTo: () => settle(() => read().syncedTo ?? 0),
    reconcileCards: ({ since, upTo, changes }) =>
      settle(() => {
        if (changes.length > MAX_CHANGES) {
          throw new Error('No se pudo poner al día tus tarjetas: too_large');
        }
        const d = read();
        if ((d.syncedTo ?? 0) !== since) {
          return { applied: false, syncedTo: d.syncedTo ?? 0, changed: 0 };
        }
        let changed = 0;
        const now = new Date().toISOString();
        for (const c of changes) {
          const i = d.cards.findIndex((x) => same(x, c));
          if (i < 0) continue;
          const row = d.cards[i]!;
          const deckId = c.deckId ?? row.deckId;
          const retiredAt = c.deckId === null ? (row.retiredAt ?? now) : null;
          if (deckId === row.deckId && !!retiredAt === !!row.retiredAt) continue;
          d.cards[i] = { ...row, deckId, retiredAt };
          changed++;
        }
        write({ ...d, syncedTo: upTo });
        return { applied: true, syncedTo: upTo, changed };
      }),
  };
}
