// What only the draft has, from the admin mode's catalog: the lookup the guards of the user's repositories use.
import { ApiRequestError } from '../../shared/lib/api';
import type { ApiClient } from '../../shared/lib/api';
import { adminKey } from '@qv/schema/http';
import type { AdminKind } from '@qv/schema/http';

export interface DraftOnly {
  /** The thing exists only in the draft (a student does not have it yet: its progress would be of what can change). */
  is(kind: AdminKind, id: string | number): Promise<boolean>;
  /** The card is in a deck that exists only in the draft. */
  card(ref: { noteGuid: string; ord: number }): Promise<boolean>;
}

/**
 * Reads the catalog once (and again after a failure). A card is looked up only when some deck is draft-only, and once
 * per card.
 */
export function draftOnly(api: Pick<ApiClient, 'catalog' | 'card'>): DraftOnly {
  let catalog: Promise<ReadonlySet<string>> | null = null;
  const draftKeys = () =>
    (catalog ??= api.catalog().then(
      (c) =>
        new Set(
          Object.entries(c.adminOnly ?? {})
            .filter(([, reasons]) => reasons.includes('draft'))
            .map(([key]) => key),
        ),
      (e: unknown) => {
        catalog = null;
        throw e;
      },
    ));
  const cards = new Map<string, Promise<boolean>>();
  return {
    is: async (kind, id) => (await draftKeys()).has(adminKey(kind, id)),
    card: async (ref) => {
      const keys = await draftKeys();
      if (![...keys].some((k) => k.startsWith('deck:'))) return false;
      const id = `${ref.noteGuid}:${ref.ord}`;
      const known = cards.get(id);
      if (known) return known;
      const looked = api.card(ref.noteGuid, ref.ord).then(
        (c) => keys.has(adminKey('deck', c.deckId)),
        (e: unknown) => {
          // A card the content no longer has is nobody's draft.
          if (e instanceof ApiRequestError && e.status === 404) return false;
          cards.delete(id);
          throw e;
        },
      );
      cards.set(id, looked);
      return looked;
    },
  };
}
