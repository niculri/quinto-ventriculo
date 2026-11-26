// Up to when each student read the announcements: only forward, never past now, only their own row, and only through
// mark_news_seen().
import { describe, expect, it } from 'vitest';
import type { PGlite } from '../pglite';
import { asUser, closeAfterEachTest } from '../pglite';
import { callAs, usersDatabaseWith } from '../helpers/users';

closeAfterEachTest();

const ANA = { sub: '11111111-1111-4111-8111-1111111111a1', email: 'ana@ug.uchile.cl' };
const LUIS = { sub: '11111111-1111-4111-8111-1111111111b2', email: 'luis@ug.uchile.cl' };

let db: PGlite;

const mark = (who: typeof ANA, until: string) =>
  callAs<string>(db, who, 'select public.mark_news_seen($1)::text as r', [until]);
const seen = (who: typeof ANA | null) =>
  asUser(
    db,
    who,
    async (tx) =>
      (
        await tx.query<{ user_id: string; seen: string }>(
          'select user_id, seen_until::text as seen from public.news_reads order by user_id',
        )
      ).rows,
  );

describe('mark_news_seen', () => {
  it('keeps the later time, never one after now, and gives it back', async () => {
    db = await usersDatabaseWith([ANA, LUIS]);
    expect(await mark(ANA, '2026-11-20T12:00:00Z')).toBe('2026-11-20 12:00:00+00');
    expect(await mark(ANA, '2026-11-19T12:00:00Z')).toBe('2026-11-20 12:00:00+00');
    expect(await mark(ANA, '2026-11-21T08:30:00Z')).toBe('2026-11-21 08:30:00+00');
    const future = await mark(ANA, '2999-01-01T00:00:00Z');
    expect(Date.parse(future.replace(' ', 'T').replace('+00', 'Z'))).toBeLessThanOrEqual(
      Date.now() + 1000,
    );
  });

  it('each student reads only their own row; anon reads nothing', async () => {
    db = await usersDatabaseWith([ANA, LUIS]);
    await mark(ANA, '2026-11-20T12:00:00Z');
    await mark(LUIS, '2026-11-18T12:00:00Z');
    expect(await seen(ANA)).toEqual([{ user_id: ANA.sub, seen: '2026-11-20 12:00:00+00' }]);
    expect(await seen(LUIS)).toEqual([{ user_id: LUIS.sub, seen: '2026-11-18 12:00:00+00' }]);
    await expect(seen(null)).rejects.toThrow(/permission denied/);
  });

  it('nobody writes the table by hand, not even their own row', async () => {
    db = await usersDatabaseWith([ANA]);
    await mark(ANA, '2026-11-20T12:00:00Z');
    for (const sql of [
      `insert into public.news_reads (user_id, seen_until) values ('${LUIS.sub}', now())`,
      `update public.news_reads set seen_until = '2000-01-01'`,
      `delete from public.news_reads`,
    ]) {
      await expect(asUser(db, ANA, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
    expect(await seen(ANA)).toEqual([{ user_id: ANA.sub, seen: '2026-11-20 12:00:00+00' }]);
  });

  it('anon, a student not invited and a null time cannot', async () => {
    db = await usersDatabaseWith([ANA]);
    await db.query('update public.access_settings set open_to_domain = false');
    await expect(mark(ANA, '2026-11-20T12:00:00Z')).rejects.toThrow(/not_allowed/);
    await db.query('update public.access_settings set open_to_domain = true');
    await expect(
      asUser(db, null, (tx) => tx.query(`select public.mark_news_seen(now())`)),
    ).rejects.toThrow(/permission denied/);
    await expect(callAs(db, ANA, 'select public.mark_news_seen(null) as r')).rejects.toThrow(
      /invalid/,
    );
  });
});
