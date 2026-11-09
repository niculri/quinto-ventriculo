import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
const ADMIN = { sub: '00000000-0000-4000-8000-0000000000a1', email: 'dueno@ug.uchile.cl' };
const STUDENT = { sub: '00000000-0000-4000-8000-0000000000a2', email: 'invitado@ug.uchile.cl' };
beforeAll(async () => {
  db = await createDatabase('users');
  for (const u of [ADMIN, STUDENT]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
});

const isAdmin = (claims: typeof ADMIN | null) =>
  asUser(db, claims, async (tx) => {
    const r = await tx.query<{ v: boolean }>('select public.is_admin() as v');
    return r.rows[0]!.v;
  });

describe('administrators', () => {
  it('only the listed accounts are administrators', async () => {
    expect(await isAdmin(ADMIN)).toBe(true);
    expect(await isAdmin(STUDENT)).toBe(false);
  });

  it('nobody signed in can read or change the list', async () => {
    await expect(
      asUser(db, ADMIN, (tx) => tx.query('select * from public.admin_emails')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, STUDENT, (tx) =>
        tx.query(`insert into public.admin_emails (email) values ('invitado@ug.uchile.cl')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('without a session, is_admin() cannot even be called', async () => {
    await expect(isAdmin(null)).rejects.toThrow(/permission denied/);
  });

  it('an administrator who is no longer invited stops being one', async () => {
    await db.query(`delete from public.invited_emails where email = $1`, [ADMIN.email]);
    expect(await isAdmin(ADMIN)).toBe(false);
    await db.query(`insert into public.invited_emails (email, list) values ($1, 'Equipo')`, [
      ADMIN.email,
    ]);
    expect(await isAdmin(ADMIN)).toBe(true);
  });
});

// The reports (step 2.6, which took card_reports away) are tested in reports.test.ts.
