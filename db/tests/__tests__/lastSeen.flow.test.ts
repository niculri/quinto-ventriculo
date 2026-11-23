// The last use of each account in the access report: its last sign-in or the last renewal of one of its sessions.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../pglite';

let db: PGlite;
const OWNER = { sub: '00000000-0000-4000-8000-0000000000c1', email: 'dueno@ug.uchile.cl' };
const FRIEND = { sub: '00000000-0000-4000-8000-0000000000c2', email: 'invitado@ug.uchile.cl' };
const STRAY = { sub: '00000000-0000-4000-8000-0000000000c3', email: 'sin.invitacion@ug.uchile.cl' };
const SIGNED_IN = '2026-11-08T12:00:00Z';

interface Seen {
  email: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
}

const report = async () => {
  const { rows } = await db.query<{ r: { invited: Seen[]; accounts_without_invite: Seen[] } }>(
    'select public.access_report() as r',
  );
  const r = rows[0]!.r;
  return [...r.invited, ...r.accounts_without_invite];
};
const seen = async (email: string) => (await report()).find((a) => a.email === email)!;
const instant = (at: string | null) => (at === null ? null : new Date(at).toISOString());

const session = (user: { sub: string }, refreshed: string | null, updated: string | null) =>
  db.query('insert into auth.sessions (user_id, refreshed_at, updated_at) values ($1, $2, $3)', [
    user.sub,
    refreshed,
    updated,
  ]);

beforeAll(async () => {
  db = await createDatabase('users');
  for (const u of [OWNER, FRIEND, STRAY]) {
    await db.query('insert into auth.users (id, email, last_sign_in_at) values ($1, $2, $3)', [
      u.sub,
      u.email,
      SIGNED_IN,
    ]);
  }
  await db.query(
    `select public.invite_emails('{"emails": ["sin.cuenta@ug.uchile.cl"], "list": "Prueba", "by": "dueño"}')`,
  );
});

describe('last_seen_at in access_report', () => {
  it('without sessions, it is the last sign-in', async () => {
    const friend = await seen(FRIEND.email);
    expect(instant(friend.last_seen_at)).toBe(instant(SIGNED_IN));
    expect(instant(friend.last_sign_in_at)).toBe(instant(SIGNED_IN));
  });

  it('a session renewed today makes it today, and the sign-in keeps its date', async () => {
    await session(OWNER, null, null);
    await db.query(
      `update auth.sessions set refreshed_at = now() at time zone 'UTC' where user_id = $1`,
      [OWNER.sub],
    );
    const owner = await seen(OWNER.email);
    const { rows } = await db.query<{ today: string }>(
      `select (now() at time zone 'UTC')::date::text as today`,
    );
    expect(owner.last_seen_at?.slice(0, 10)).toBe(rows[0]!.today);
    expect(instant(owner.last_sign_in_at)).toBe(instant(SIGNED_IN));
  });

  it('takes the latest of its sessions and of their two dates, reading refreshed_at as UTC', async () => {
    await session(FRIEND, '2026-11-20 10:00:00', '2026-11-19T10:00:00Z');
    await session(FRIEND, '2026-11-21 09:00:00', '2026-11-22T15:30:00Z');
    await session(STRAY, '2026-11-23 15:00:00', '2026-11-23T14:00:00Z');
    await db.query(`set timezone = 'America/Santiago'`);
    try {
      expect(instant((await seen(FRIEND.email)).last_seen_at)).toBe('2026-11-22T15:30:00.000Z');
      expect(instant((await seen(STRAY.email)).last_seen_at)).toBe('2026-11-23T15:00:00.000Z');
    } finally {
      await db.query('reset timezone');
    }
  });

  it('a session older than the sign-in leaves the sign-in', async () => {
    await db.query('delete from auth.sessions where user_id = $1', [STRAY.sub]);
    await session(STRAY, '2026-11-01 10:00:00', '2026-11-01T10:00:00Z');
    expect(instant((await seen(STRAY.email)).last_seen_at)).toBe(instant(SIGNED_IN));
  });

  it('signing out deletes the sessions, so it goes back to the last sign-in', async () => {
    await db.query('delete from auth.sessions where user_id = $1', [FRIEND.sub]);
    expect(instant((await seen(FRIEND.email)).last_seen_at)).toBe(instant(SIGNED_IN));
  });

  it('an invitation without an account has neither', async () => {
    const none = await seen('sin.cuenta@ug.uchile.cl');
    expect([none.last_sign_in_at, none.last_seen_at]).toEqual([null, null]);
  });
});
