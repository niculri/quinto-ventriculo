import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
const OWNER = { sub: '00000000-0000-4000-8000-0000000000a1', email: 'dueno@ug.uchile.cl' };
const OTHER = { sub: '00000000-0000-4000-8000-0000000000a2', email: 'otra.persona@ug.uchile.cl' };

beforeAll(async () => {
  db = await createDatabase('users');
  for (const u of [OWNER, OTHER]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
});

const hook = async (email: string) =>
  (
    await db.query<{ r: { error?: { http_code: number; message: string } } }>(
      'select public.hook_before_user_created($1) as r',
      [{ user: { email } }],
    )
  ).rows[0]!.r;

const setOpen = (open: boolean) =>
  db.query('update public.access_settings set open_to_domain = $1', [open]);

describe('invite list', () => {
  it('lets invited accounts sign up, whatever the case', async () => {
    expect(await hook('dueno@ug.uchile.cl')).toEqual({});
    expect(await hook('Invitado@UG.uchile.cl')).toEqual({});
  });

  it('rejects an uninvited @ug.uchile.cl account with its own message', async () => {
    const r = await hook('otra.persona@ug.uchile.cl');
    expect(r.error?.http_code).toBe(403);
    expect(r.error?.message).toMatch(/solo entran cuentas invitadas/);
  });

  it('still rejects other domains with the domain message, even if listed', async () => {
    expect((await hook('alguien@gmail.com')).error?.message).toMatch(
      /solo para cuentas @ug.uchile.cl/,
    );
    await expect(
      db.query(
        `insert into public.invited_emails (email, list) values ('alguien@gmail.com', 'Equipo')`,
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('opening it to the domain lets in every @ug.uchile.cl account', async () => {
    await setOpen(true);
    expect(await hook('otra.persona@ug.uchile.cl')).toEqual({});
    expect((await hook('alguien@gmail.com')).error?.http_code).toBe(403);
    await setOpen(false);
  });

  it('an account that is not invited cannot read or save progress', async () => {
    await expect(
      asUser(db, OTHER, (tx) =>
        tx.query(`insert into public.readings (note_id) values ('AP-BC-C2-11')`),
      ),
    ).rejects.toThrow(/row-level security/);
    const own = await asUser(db, OWNER, async (tx) => {
      await tx.query(`insert into public.readings (note_id) values ('AP-BC-C2-11')`);
      return tx.query('select note_id from public.readings');
    });
    expect(own.rows).toEqual([{ note_id: 'AP-BC-C2-11' }]);
  });

  it('nobody signed in can read or change the list or the setting', async () => {
    for (const sql of [
      'select * from public.invited_emails',
      `insert into public.invited_emails (email) values ('yo@ug.uchile.cl')`,
      'update public.access_settings set open_to_domain = true',
    ]) {
      await expect(asUser(db, OWNER, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});
