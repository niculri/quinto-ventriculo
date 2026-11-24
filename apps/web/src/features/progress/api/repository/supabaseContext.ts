// What every part of the study adapter shares: the client, how a refusal becomes the error the student reads, the
// paged reads, the writes that carry the card sync and a card state from its row.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { databaseError } from '@qv/schema/database';
import type { DbErrorLike } from '@qv/schema/database';
import type { CardStateRow } from '@qv/schema/user';
import { ConnectionError } from './model';
import type { CardRef, StoredCard } from './model';

type Functions = Database['public']['Functions'];

const PAGE = 1000;

/** A request that takes longer got lost on the way: the slowest write, over tens of thousands of cards, takes seconds. */
const REQUEST_TIMEOUT_MS = 20_000;

/** For the requests a study session makes while it saves: none of them waits forever for its reply. */
export const inTime = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

/**
 * No reply (0, also a request out of time), one that says «later» (also Cloudflare's 520 to 524, for a database it
 * cannot reach), or a 401: the token ran out with no connection to renew it and the request went without a session.
 * None tells anything of what was asked. A session that is really over takes the student to the sign-in page.
 */
const NO_ANSWER: ReadonlySet<number> = new Set([
  0, 401, 408, 429, 502, 503, 504, 520, 521, 522, 523, 524,
]);

export const iso = (t: string | null) => (t === null ? null : new Date(t).toISOString());

/** A bigint as PostgREST carries it: a JSON number, or text when a query casts it with `::text`. */
export const int8 = (value: number | string) => Number(value);

/** A list that comes as `null` (an aggregate with nothing to add) or not at all (a column the database does not have yet). */
export const listOf = <T>(list: T[] | null | undefined): T[] => list ?? [];

export function fromRow(r: CardStateRow): StoredCard {
  return {
    noteGuid: r.note_guid,
    ord: r.ord,
    deckId: r.deck_id,
    phase: r.phase,
    interday: r.interday,
    remainingSteps: r.remaining_steps,
    due: iso(r.due),
    interval: r.interval,
    stability: r.stability,
    difficulty: r.difficulty,
    reps: r.reps,
    lapses: r.lapses,
    lastReview: iso(r.last_review),
    flag: r.flag,
    suspended: r.suspended,
    buriedUntil: iso(r.buried_until),
    leech: r.leech,
    // Kept as the database wrote it: the answer sends it back to check nobody changed the card.
    updatedAt: r.updated_at,
    retiredAt: iso(r.retired_at ?? null),
  };
}

export const refs = (cards: CardRef[]) =>
  cards.map((c) => ({ noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId }));

export const chunks = <T>(list: T[], size = 60) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size),
  );

type Page<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: { message: string } | null; status?: number }>;

export interface StudyContext {
  client: SupabaseClient<Database>;
  /**
   * Typed as a property, so that a call narrows what follows it (TypeScript only does it then). With the reply's
   * `status`, a request that got no answer is a `ConnectionError`.
   */
  fail: (what: string, e: DbErrorLike, status?: number) => never;
  all: <T>(what: string, page: Page<T>) => Promise<T[]>;
  write: ReturnType<typeof writerOf>;
  /** Up to which content change this page has its cards' decks; null until it read it. */
  sync: { seenTo: number | null };
}

// Each write sends up to which content change this page has its cards' decks (x-card-sync): if another tab is ahead,
// the database marks the rows it creates to be reconciled again. None waits forever for its reply.
function writerOf(client: SupabaseClient<Database>, sync: { seenTo: number | null }) {
  return <F extends keyof Functions>(fn: F, args?: Functions[F]['Args']) => {
    const call = client.rpc(fn, args).abortSignal(inTime());
    return sync.seenTo === null ? call : call.setHeader('x-card-sync', String(sync.seenTo));
  };
}

export function studyContext(client: SupabaseClient<Database>): StudyContext {
  const fail: StudyContext['fail'] = (what, e, status) => {
    if (status !== undefined && NO_ANSWER.has(status)) throw new ConnectionError(what);
    const error = databaseError(e);
    if (error.says('quota_exceeded')) {
      throw new Error(
        error.details === 'changes'
          ? `No se pudo ${what}: llegaste al máximo de cambios de un día. Sigue mañana.`
          : `No se pudo ${what}: llegaste al máximo que se puede guardar.`,
      );
    }
    throw new Error(`No se pudo ${what}: ${e.message}`);
  };
  const sync: StudyContext['sync'] = { seenTo: null };
  async function all<T>(what: string, page: Page<T>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error, status } = await page(from, from + PAGE - 1);
      if (error) fail(what, error, status);
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }
  return { client, fail, all, write: writerOf(client, sync), sync };
}
