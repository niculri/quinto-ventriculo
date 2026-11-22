// card_states_of_decks(): a student's progress in the decks of one assessment, in one call, without the rest of their
// rows; and nobody else's.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from '../pglite';

const ANA = { sub: '00000000-0000-4000-8000-00000000005a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000005b', email: 'beto@ug.uchile.cl' };
const OUTSIDER = { sub: '00000000-0000-4000-8000-00000000005c', email: 'otro@gmail.com' };
const MINE = ['3000000001', '3000000002', '3000000003'];
const OTHERS = Array.from({ length: 197 }, (_, i) => String(4_000_000_000 + i));

let db: PGlite;
type Row = Record<string, unknown> & { note_guid: string; ord: number; deck_id: string };
const read = (user: typeof ANA | null, decks: string[]) =>
  asUser(db, user, async (tx) => {
    const r = await tx.query<{ r: Row[] }>('select public.card_states_of_decks($1) as r', [decks]);
    return r.rows[0]!.r;
  });

beforeAll(async () => {
  db = await createDatabase('users');
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO, OUTSIDER]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  await db.query(
    `insert into public.card_states (user_id, note_guid, ord, deck_id, phase, interday, due, last_review, interval,
       stability, difficulty, reps)
     select $1, 'n' || lpad(i::text, 5, '0'), 0, d, 'review', true, now() + interval '2 days', now() - interval '3 days',
            5, 5.5, 5, 3
       from generate_series(1, 20000) i,
            lateral (select case when i <= 300 then $2::text[] else $3::text[] end as decks) k,
            lateral (select k.decks[1 + (i % cardinality(k.decks))] as d) x`,
    [ANA.sub, MINE, OTHERS],
  );
  await db.query(
    `insert into public.card_states (user_id, note_guid, ord, deck_id, flag, leech)
     select $1, 'b' || i, 0, $2, 2, i = 1 from generate_series(1, 50) i`,
    [BETO.sub, MINE[0]],
  );
  await db.query('analyze public.card_states');
  // Seeding 20,000 rows takes ~4 s here and more than the default 10 s on a CI runner.
}, 60_000);

describe('card_states_of_decks', () => {
  it('the rows of those decks only, in one value, as the table has them (without user_id), by note and card', async () => {
    const rows = await read(ANA, MINE);
    expect(rows).toHaveLength(300);
    expect(new Set(rows.map((r) => r.deck_id))).toEqual(new Set(MINE));
    expect(rows.every((r) => !('user_id' in r))).toBe(true);
    const keys = rows.map((r) => `${r.note_guid}/${r.ord}`);
    expect(keys).toEqual([...keys].sort());
    expect(Object.keys(rows[0]!).sort()).toEqual(
      (
        await db.query<{ c: string }>(
          `select column_name as c from information_schema.columns
            where table_schema = 'public' and table_name = 'card_states' and column_name <> 'user_id'`,
        )
      ).rows
        .map((r) => r.c)
        .sort(),
    );
    const table = await asUser(db, ANA, async (tx) =>
      tx.query<Row>(
        `select note_guid, ord, deck_id from public.card_states where deck_id = any ($1) order by note_guid, ord`,
        [MINE],
      ),
    );
    expect(rows.map((r) => [r.note_guid, r.ord, r.deck_id])).toEqual(
      table.rows.map((r) => [r.note_guid, r.ord, r.deck_id]),
    );
  });

  it('only the caller’s rows (RLS): Beto does not see Ana’s, nor Ana Beto’s', async () => {
    const beto = await read(BETO, MINE);
    expect(beto).toHaveLength(50);
    expect(beto.every((r) => String(r.note_guid).startsWith('b'))).toBe(true);
    expect((await read(ANA, MINE)).some((r) => String(r.note_guid).startsWith('b'))).toBe(false);
  });

  it('nobody outside: without a session it cannot be called; a student not invited reads nothing', async () => {
    await expect(read(null, MINE)).rejects.toThrow(/permission denied/);
    await db.query(
      `insert into public.card_states (user_id, note_guid, ord, deck_id)
       select $1, 'o' || i, 0, $2 from generate_series(1, 5) i`,
      [OUTSIDER.sub, MINE[0]],
    );
    expect(await read(OUTSIDER, MINE)).toEqual([]);
    await db.query('update public.access_settings set open_to_domain = false');
    try {
      expect(await read(ANA, MINE)).toEqual([]);
    } finally {
      await db.query('update public.access_settings set open_to_domain = true');
    }
    expect(await read(ANA, MINE)).toHaveLength(300);
  });

  it('a list too long or missing is refused; an empty one is nothing', async () => {
    await expect(
      read(
        ANA,
        Array.from({ length: 5001 }, (_, i) => String(i)),
      ),
    ).rejects.toThrow(/too_large/);
    await expect(
      asUser(db, ANA, (tx) => tx.query('select public.card_states_of_decks(null)')),
    ).rejects.toThrow(/too_large/);
    expect(await read(ANA, [])).toEqual([]);
  });

  it('uses the index by student and deck (it does not walk the student’s 20,000 rows)', async () => {
    const plan = await asUser(db, ANA, async (tx) =>
      tx.query<{ 'QUERY PLAN': string }>(
        `explain select * from public.card_states c
          where c.user_id = (select auth.uid()) and c.deck_id = any ($1)`,
        [MINE],
      ),
    );
    expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toMatch(/card_states_deck/);
  });
});
