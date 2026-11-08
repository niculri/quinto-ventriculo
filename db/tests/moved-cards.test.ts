// Plan step 1.3 (users): cards the author moves to another deck or takes out (20261106020000_moved_cards.sql).
// The users' database does not know where a card is today; the web brings the content's changes when the student
// enters and reconcile_cards() applies them to that student's rows only.
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000000b', email: 'beto@ug.uchile.cl' };
const OLD = '2059400110';
const NEW = '2059400111';

const call = (fn: string, args: unknown[]) =>
  `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`;

/** An answer as the web sends it (a new card answered «Bien»: to its 10-minute step). */
function answer(noteGuid: string, deckId: string, extra: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    noteGuid,
    ord: 0,
    deckId,
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: 'new',
    interval: -600,
    lastInterval: 0,
    durationMs: 4200,
    state: {
      phase: 'learning',
      interday: false,
      remainingSteps: 1,
      due: new Date(now.getTime() + 600_000).toISOString(),
      interval: 0,
      stability: 2.3065,
      difficulty: 2.118,
      reps: 1,
      lapses: 0,
      lastReview: now.toISOString(),
      suspended: false,
      leech: false,
    },
    bury: [],
    buriedUntil: null,
    ...extra,
  };
}

type Who = typeof ANA;
type Change = { noteGuid: string; ord: number; deckId: string | null };

const reconcile = (db: PGlite, who: Who, since: number, upTo: number, changes: Change[]) =>
  asUser(
    db,
    who,
    async (tx) =>
      (
        await tx.query<{ r: { applied: boolean; syncedTo: number; changed: number } }>(
          call('reconcile_cards', [0]),
          [{ since, upTo, changes }],
        )
      ).rows[0]!.r,
  );

const row = (db: PGlite, who: Who, guid: string) =>
  asUser(
    db,
    who,
    async (tx) =>
      (
        await tx.query<{
          deck_id: string;
          reps: number;
          phase: string;
          updated_at: string;
          retired_at: string | null;
        }>(
          `select deck_id, reps, phase, updated_at, retired_at from public.card_states where note_guid = $1`,
          [guid],
        )
      ).rows[0],
  );

/** What the web reads to study a deck: the rows of that deck (`cards()` in study/repository.ts). */
const rowsOfDeck = (db: PGlite, who: Who, deckId: string) =>
  asUser(db, who, async (tx) =>
    (
      await tx.query<{ note_guid: string }>(
        'select note_guid from public.card_states where deck_id = $1 order by note_guid',
        [deckId],
      )
    ).rows.map((r) => r.note_guid),
  );

const progress = (db: PGlite, who: Who) =>
  asUser(db, who, async (tx) =>
    (
      await tx.query<{ deck_id: string; seen: number }>(
        'select deck_id, seen from public.deck_progress($1) order by deck_id',
        [new Date(Date.now() - 3_600_000).toISOString()],
      )
    ).rows.map((r) => [r.deck_id, r.seen]),
  );

let db: PGlite;
beforeEach(async () => {
  db = await createDatabase('users');
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  // Ana saw three cards of the old deck; Beto, the same first one.
  for (const g of ['a', 'b', 'c']) {
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer(g, OLD)]));
  }
  await asUser(db, BETO, (tx) => tx.query(call('record_review', [0]), [answer('a', OLD)]));
});

describe('a card that moved to another deck', () => {
  it('without reconciling (as before 1.3): the new deck does not have it, and answering it stops the session', async () => {
    expect(await rowsOfDeck(db, ANA, NEW)).toEqual([]);
    // The web saw no row, so it sends the card as new; the row is there: card_changed.
    await expect(
      asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('a', NEW)])),
    ).rejects.toThrow(/card_changed/);
  });

  it('after entering, the new deck has it: answering it does not stop the session, and keeps its progress', async () => {
    const before = await row(db, ANA, 'a');
    expect(await reconcile(db, ANA, 0, 7, [{ noteGuid: 'a', ord: 0, deckId: NEW }])).toEqual({
      applied: true,
      syncedTo: 7,
      changed: 1,
    });
    expect(await rowsOfDeck(db, ANA, NEW)).toEqual(['a']);
    const after = await row(db, ANA, 'a');
    // Same progress, same stamp (an open session in another tab is not stopped by it).
    expect(after).toEqual({ ...before, deck_id: NEW });
    // Studying the new deck: the web read the row, so it sends its stamp.
    const second = answer('a', NEW, {
      expectedUpdatedAt: after!.updated_at,
      queueBefore: 'learn',
      state: { ...answer('a', NEW).state, reps: 2 },
    });
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [second]));
    expect(await row(db, ANA, 'a')).toMatchObject({ deck_id: NEW, reps: 2 });
    expect(await progress(db, ANA)).toEqual([
      [OLD, 2],
      [NEW, 1],
    ]);
  });

  it('only the caller’s rows: Beto’s card stays where it was until he enters', async () => {
    await reconcile(db, ANA, 0, 7, [{ noteGuid: 'a', ord: 0, deckId: NEW }]);
    expect(await row(db, BETO, 'a')).toMatchObject({ deck_id: OLD });
    expect(await rowsOfDeck(db, BETO, NEW)).toEqual([]);
  });

  it('an answer from a page opened before the move does not take the card back to the old deck', async () => {
    await reconcile(db, ANA, 0, 7, [{ noteGuid: 'b', ord: 0, deckId: NEW }]);
    const stamp = (await row(db, ANA, 'b'))!.updated_at;
    await asUser(db, ANA, (tx) =>
      tx.query(call('record_review', [0]), [
        answer('b', OLD, { expectedUpdatedAt: stamp, queueBefore: 'learn' }),
      ]),
    );
    expect(await row(db, ANA, 'b')).toMatchObject({ deck_id: NEW });
    // Undoing that answer neither.
    await asUser(db, ANA, (tx) => tx.query(call('undo_last_review', [])));
    expect(await row(db, ANA, 'b')).toMatchObject({ deck_id: NEW, reps: 1 });
  });
});

describe('a page that was behind', () => {
  /** A write as the web sends it: its cursor in the header x-card-sync (PostgREST gives it as request.headers). */
  const answerFrom = (seen: number, guid: string, deckId: string) =>
    asUser(db, ANA, async (tx) => {
      await tx.query(`select set_config('request.headers', $1, true)`, [
        JSON.stringify({ 'x-card-sync': String(seen) }),
      ]);
      await tx.query(call('record_review', [0]), [answer(guid, deckId)]);
    });
  const sync = () =>
    asUser(
      db,
      ANA,
      async (tx) =>
        (
          await tx.query<{ synced_to: number; repair_from: number | null }>(
            'select synced_to, repair_from from public.card_sync',
          )
        ).rows[0],
    );

  it('a new card it answers stays in the old deck, and entering again moves it', async () => {
    // A tab opened at change 7. Another tab entered after «d» moved to the new deck (change 9).
    await reconcile(db, ANA, 0, 7, []);
    await reconcile(db, ANA, 7, 9, [{ noteGuid: 'd', ord: 0, deckId: NEW }]);
    // The first tab answers «d», new for Ana, with the deck it knows.
    await answerFrom(7, 'd', OLD);
    expect(await row(db, ANA, 'd')).toMatchObject({ deck_id: OLD });
    expect(await sync()).toEqual({ synced_to: 9, repair_from: 7 });
    // Entering again: the changes from 7 come again; «d» goes to its deck and the cursor is where it was.
    expect(await reconcile(db, ANA, 9, 9, [])).toEqual({ applied: false, syncedTo: 7, changed: 0 });
    expect(await reconcile(db, ANA, 7, 9, [{ noteGuid: 'd', ord: 0, deckId: NEW }])).toEqual({
      applied: true,
      syncedTo: 9,
      changed: 1,
    });
    expect(await rowsOfDeck(db, ANA, NEW)).toEqual(['d']);
    expect(await sync()).toEqual({ synced_to: 9, repair_from: null });
  });

  it('in pages: until it reaches where it was, the cursor stays behind', async () => {
    await reconcile(db, ANA, 0, 20, [{ noteGuid: 'd', ord: 0, deckId: NEW }]);
    await answerFrom(4, 'd', OLD);
    expect(await reconcile(db, ANA, 4, 12, [])).toMatchObject({ applied: true, syncedTo: 12 });
    expect(await sync()).toEqual({ synced_to: 20, repair_from: 12 });
    // Another page that was behind marks from further back: from the lowest.
    await answerFrom(2, 'e', OLD);
    expect(await sync()).toEqual({ synced_to: 20, repair_from: 2 });
    await reconcile(db, ANA, 2, 25, [{ noteGuid: 'd', ord: 0, deckId: NEW }]);
    expect(await sync()).toEqual({ synced_to: 25, repair_from: null });
    expect(await row(db, ANA, 'd')).toMatchObject({ deck_id: NEW });
  });

  it('a page up to date, a row that existed, or no header: nothing to repair', async () => {
    await reconcile(db, ANA, 0, 9, []);
    await answerFrom(9, 'd', OLD);
    await answerFrom(12, 'e', OLD);
    await asUser(db, ANA, (tx) => tx.query(call('record_review', [0]), [answer('f', OLD)]));
    expect(await sync()).toEqual({ synced_to: 9, repair_from: null });
    // «a» was answered before: its row is not created again (its deck is reconciling's).
    const stamp = (await row(db, ANA, 'a'))!.updated_at;
    await asUser(db, ANA, async (tx) => {
      await tx.query(`select set_config('request.headers', $1, true)`, [
        JSON.stringify({ 'x-card-sync': '1' }),
      ]);
      await tx.query(call('record_review', [0]), [
        answer('a', OLD, { expectedUpdatedAt: stamp, queueBefore: 'learn' }),
      ]);
    });
    expect(await sync()).toEqual({ synced_to: 9, repair_from: null });
  });

  it('a header that is not a number is left out', async () => {
    await reconcile(db, ANA, 0, 9, []);
    await asUser(db, ANA, async (tx) => {
      await tx.query(`select set_config('request.headers', $1, true)`, [
        JSON.stringify({ 'x-card-sync': '-1; drop' }),
      ]);
      await tx.query(call('record_review', [0]), [answer('d', OLD)]);
    });
    expect(await sync()).toEqual({ synced_to: 9, repair_from: null });
  });

  it('the student cannot write repair_from by hand', async () => {
    await reconcile(db, ANA, 0, 9, []);
    await expect(
      asUser(db, ANA, (tx) => tx.query('update public.card_sync set repair_from = 0')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('a card taken out', () => {
  it('its progress stays, hidden and out of the counts; if it comes back, it goes on where it was', async () => {
    const before = await row(db, ANA, 'c');
    await reconcile(db, ANA, 0, 3, [{ noteGuid: 'c', ord: 0, deckId: null }]);
    const hidden = await row(db, ANA, 'c');
    expect(hidden).toMatchObject({ deck_id: OLD, reps: 1, phase: 'learning' });
    expect(hidden!.retired_at).not.toBeNull();
    expect(await progress(db, ANA)).toEqual([[OLD, 2]]);
    const answered = await asUser(
      db,
      ANA,
      async (tx) =>
        (await tx.query<{ deck_id: string }>('select deck_id from public.answered_decks()')).rows,
    );
    expect(answered).toEqual([{ deck_id: OLD }]);

    await reconcile(db, ANA, 3, 9, [{ noteGuid: 'c', ord: 0, deckId: NEW }]);
    expect(await row(db, ANA, 'c')).toEqual({ ...before, deck_id: NEW });
    expect(await progress(db, ANA)).toEqual([
      [OLD, 2],
      [NEW, 1],
    ]);
  });
});

describe('the cursor', () => {
  it('each student keeps theirs, and reads only their own', async () => {
    const synced = (who: Who) =>
      asUser(db, who, async (tx) =>
        (await tx.query<{ synced_to: string }>('select synced_to from public.card_sync')).rows.map(
          (r) => Number(r.synced_to),
        ),
      );
    expect(await synced(ANA)).toEqual([]);
    await reconcile(db, ANA, 0, 12, []);
    expect(await synced(ANA)).toEqual([12]);
    expect(await synced(BETO)).toEqual([]);
  });

  it('two tabs at once: the one that read before the other wrote does not apply anything old', async () => {
    await reconcile(db, ANA, 0, 12, [{ noteGuid: 'a', ord: 0, deckId: NEW }]);
    // The other tab read from 0, when «a» was still in the old deck (it moved again later).
    expect(await reconcile(db, ANA, 0, 5, [{ noteGuid: 'a', ord: 0, deckId: OLD }])).toEqual({
      applied: false,
      syncedTo: 12,
      changed: 0,
    });
    expect(await row(db, ANA, 'a')).toMatchObject({ deck_id: NEW });
  });

  it('it can go back (the content started again): what comes is applied as it is', async () => {
    await reconcile(db, ANA, 0, 12, []);
    expect(await reconcile(db, ANA, 12, 0, [])).toMatchObject({ applied: true, syncedTo: 0 });
  });
});

describe('limits', () => {
  it('writing the cursor by hand is not allowed; nor is it for someone not allowed', async () => {
    await expect(
      asUser(db, ANA, (tx) => tx.query('insert into public.card_sync (synced_to) values (5)')),
    ).rejects.toThrow(/permission denied/);
    await db.query('update public.access_settings set open_to_domain = false');
    await expect(reconcile(db, ANA, 0, 1, [])).rejects.toThrow(/not_allowed/);
  });

  it('at most 2,000 changes a call, and each one has to say its deck (or null)', async () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({
      noteGuid: `x${i}`,
      ord: 0,
      deckId: NEW,
    }));
    await expect(reconcile(db, ANA, 0, 1, many)).rejects.toThrow(/too_large/);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(call('reconcile_cards', [0]), [
          { since: 0, upTo: 1, changes: [{ noteGuid: 'a', ord: 0 }] },
        ]),
      ),
    ).rejects.toThrow(/invalid_changes/);
    await expect(
      asUser(db, ANA, (tx) => tx.query(call('reconcile_cards', [0]), [{ since: 0, changes: [] }])),
    ).rejects.toThrow(/invalid_changes/);
  });

  it('what it changes counts in the changes of the day (1.2), one more for the call', async () => {
    const day = async () =>
      (
        await db.query<{ c: number }>(
          'select changes_today as c from public.user_quotas where user_id = $1',
          [ANA.sub],
        )
      ).rows[0]!.c;
    const start = await day();
    await reconcile(db, ANA, 0, 3, [
      { noteGuid: 'a', ord: 0, deckId: NEW },
      { noteGuid: 'b', ord: 0, deckId: null },
      { noteGuid: 'zz', ord: 0, deckId: NEW },
    ]);
    expect(await day()).toBe(start + 3);
    await db.query('update public.user_quotas set changes_today = 50000 where user_id = $1', [
      ANA.sub,
    ]);
    await expect(
      reconcile(db, ANA, 3, 4, [{ noteGuid: 'c', ord: 0, deckId: NEW }]),
    ).rejects.toThrow(/quota_exceeded/);
  });
});
