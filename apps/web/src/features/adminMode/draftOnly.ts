// What only the draft has, from the admin mode's catalog and the students' cards: the lookup the guards of the user's
// repositories use.
import { ApiRequestError } from '../../shared/lib/api';
import type { ApiClient } from '../../shared/lib/api';
import { adminKey } from '@qv/schema/http';
import type { AdminKind } from '@qv/schema/http';

export interface DraftOnly {
  /** The thing exists only in the draft (a student does not have it yet: its progress would be of what can change). */
  is(kind: AdminKind, id: string | number): Promise<boolean>;
  /** The card is in a deck only the draft has, or is a card of a deck the students have that only the draft has. */
  card(ref: { noteGuid: string; ord: number; deckId?: string | undefined }): Promise<boolean>;
}

const notFound = (e: unknown) => e instanceof ApiRequestError && e.status === 404;

/**
 * Reads the catalog once (and again after a failure). A card is looked up once: among the students' cards, and only
 * when they do not have it, among the draft's.
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

  const lookUp = async (guid: string, ord: number) => {
    try {
      await api.card(guid, ord, undefined, { published: true });
      return false;
    } catch (e) {
      if (!notFound(e)) throw e;
    }
    // The students do not have it: it is the draft's if the draft does, and nobody's if the content is rid of it.
    try {
      await api.card(guid, ord);
      return true;
    } catch (e) {
      if (notFound(e)) return false;
      throw e;
    }
  };
  return {
    is: async (kind, id) => (await draftKeys()).has(adminKey(kind, id)),
    card: async (ref) => {
      if (ref.deckId !== undefined && (await draftKeys()).has(adminKey('deck', ref.deckId))) {
        return true;
      }
      const id = `${ref.noteGuid}:${ref.ord}`;
      const known = cards.get(id);
      if (known) return known;
      const looked = lookUp(ref.noteGuid, ref.ord);
      cards.set(id, looked);
      looked.catch(() => cards.delete(id));
      return looked;
    },
  };
}
