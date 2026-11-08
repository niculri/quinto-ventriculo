import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000000b', email: 'beto@ug.uchile.cl' };
const INTRUDER = { sub: '00000000-0000-4000-8000-00000000000c', email: 'colado@gmail.com' };

beforeAll(async () => {
  db = await createDatabase('users');
  // These tests are about the domain rule: open the site to the whole domain (the invite list is tested in
  // invites.test.ts).
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO, INTRUDER]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      u.sub,
      u.email,
      { full_name: u.email.split('@')[0], avatar_url: 'https://x/y.png' },
    ]);
  }
  await db.query(
    `insert into public.readings (user_id, note_id, progress) values ($1, 'AP-BC-C2-11', 0.5)`,
    [BETO.sub],
  );
});

describe('is_allowed_email', () => {
  it.each([
    ['ana@ug.uchile.cl', true],
    ['ANA@UG.UCHILE.CL', true],
    ['ana@uchile.cl', false],
    ['ana@x.ug.uchile.cl', false],
    ['ana@ug.uchile.cl.com', false],
    ['a@b@ug.uchile.cl', false],
    ['@ug.uchile.cl', false],
    [null, false],
  ])('%s → %s', async (email, expected) => {
    const r = await db.query<{ ok: boolean }>('select public.is_allowed_email($1) as ok', [email]);
    expect(r.rows[0]!.ok).toBe(expected);
  });
});

describe('hook before user created', () => {
  it('lets @ug.uchile.cl through', async () => {
    const r = await db.query<{ r: object }>('select public.hook_before_user_created($1) as r', [
      { user: { email: 'nuevo@ug.uchile.cl' } },
    ]);
    expect(r.rows[0]!.r).toEqual({});
  });

  it('rejects other domains with 403', async () => {
    const r = await db.query<{ r: { error: { http_code: number } } }>(
      'select public.hook_before_user_created($1) as r',
      [{ user: { email: 'nuevo@gmail.com' } }],
    );
    expect(r.rows[0]!.r.error.http_code).toBe(403);
  });

  it('cannot be called by anon or authenticated', async () => {
    await expect(
      asUser(db, ANA, (tx) => tx.query(`select public.hook_before_user_created('{}'::jsonb)`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('profiles', () => {
  it('is created on sign-up, with the Google data', async () => {
    const r = await db.query<{ name: string; email: string }>(
      'select name, email from public.profiles where id = $1',
      [ANA.sub],
    );
    expect(r.rows[0]).toEqual({ name: 'ana', email: 'ana@ug.uchile.cl' });
  });

  it('each user sees only their own', async () => {
    const r = await asUser(db, ANA, (tx) => tx.query('select id from public.profiles'));
    expect(r.rows).toEqual([{ id: ANA.sub }]);
  });

  it('the name can be changed but not the email', async () => {
    await asUser(db, ANA, (tx) =>
      tx.query(`update public.profiles set name = 'Ana M.' where id = $1`, [ANA.sub]),
    );
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`update public.profiles set email = 'x@ug.uchile.cl' where id = $1`, [ANA.sub]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('readings', () => {
  it('anon sees nothing', async () => {
    await expect(
      asUser(db, null, (tx) => tx.query('select * from public.readings')),
    ).rejects.toThrow(/permission denied/);
  });

  it('a user writes and reads only their own', async () => {
    const r = await asUser(db, ANA, async (tx) => {
      await tx.query(
        `insert into public.readings (note_id, anchor, progress) values ('AP-BC-C2-10', 'poros', 0.25)`,
      );
      return tx.query<{ note_id: string }>('select note_id from public.readings');
    });
    expect(r.rows).toEqual([{ note_id: 'AP-BC-C2-10' }]);
  });

  it('cannot write on behalf of someone else', async () => {
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`insert into public.readings (user_id, note_id) values ($1, 'AP-BC-C2-12')`, [
          BETO.sub,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot change or delete someone else's", async () => {
    const r = await asUser(db, ANA, async (tx) => {
      const u = await tx.query(`update public.readings set progress = 1 where user_id = $1`, [
        BETO.sub,
      ]);
      const d = await tx.query(`delete from public.readings where user_id = $1`, [BETO.sub]);
      return [u.affectedRows, d.affectedRows];
    });
    expect(r).toEqual([0, 0]);
  });

  it('an account from another domain sees and writes nothing even with a session', async () => {
    await expect(
      asUser(db, INTRUDER, (tx) =>
        tx.query(`insert into public.readings (note_id) values ('AP-BC-C2-11')`),
      ),
    ).rejects.toThrow(/row-level security/);
    const r = await asUser(db, INTRUDER, (tx) => tx.query('select * from public.profiles'));
    expect(r.rows).toEqual([]);
  });

  it('saved progress never decreases (another device with stale data)', async () => {
    const progress = await asUser(db, ANA, async (tx) => {
      await tx.query(
        `insert into public.readings (note_id, anchor, progress) values ('AP-BC-C2-14', 'a', 0.8)`,
      );
      await tx.query(
        `insert into public.readings (note_id, anchor, progress) values ('AP-BC-C2-14', 'b', 0.3)
         on conflict (user_id, note_id) do update
           set anchor = excluded.anchor, progress = excluded.progress`,
      );
      return tx.query<{ anchor: string; progress: number }>(
        `select anchor, progress from public.readings where note_id = 'AP-BC-C2-14'`,
      );
    });
    expect(progress.rows[0]!.anchor).toBe('b');
    expect(progress.rows[0]!.progress).toBeCloseTo(0.8);
  });

  it('nobody with a session can truncate tables or create or delete profiles', async () => {
    for (const sql of [
      'truncate public.readings',
      'truncate public.profiles cascade',
      `insert into public.profiles (id, email) values ('${ANA.sub}', 'x@ug.uchile.cl')`,
      `delete from public.profiles where id = '${ANA.sub}'`,
    ]) {
      await expect(asUser(db, ANA, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
    const r = await db.query('select count(*)::int as n from public.readings');
    expect(r.rows[0]).toEqual({ n: 3 });
  });

  it('validates the note code and the progress', async () => {
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`insert into public.readings (note_id) values ('cualquier cosa')`),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`insert into public.readings (note_id, progress) values ('AP-BC-C2-13', 2)`),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
