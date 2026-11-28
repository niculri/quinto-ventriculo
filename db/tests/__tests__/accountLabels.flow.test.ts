// admin_account_labels(): the email and the name of the accounts an error of «Errores» happened to, only for an
// administrator with an open session; an account that is no longer there does not come back.
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, asUser, closeAfterEachTest, createDatabase } from '../pglite';
import { signIn } from '../helpers/users';
import type { Claims } from '../helpers/users';

closeAfterEachTest();

let db: PGlite;
const OWNER = { sub: '00000000-0000-4000-8000-0000000000e1', email: OWNER_EMAIL };
const ANA = { sub: '00000000-0000-4000-8000-0000000000e2', email: 'ana.prueba@ug.uchile.cl' };
const LUIS = { sub: '00000000-0000-4000-8000-0000000000e3', email: 'luis.prueba@ug.uchile.cl' };
const GONE = '00000000-0000-4000-8000-0000000000e9';

const labels = (claims: Claims | null, ids: string[]) =>
  asUser(
    db,
    claims,
    async (tx) =>
      (
        await tx.query<{ id: string; email: string; name: string | null }>(
          'select * from public.admin_account_labels($1::uuid[])',
          [ids],
        )
      ).rows,
  );

beforeEach(async () => {
  db = await createDatabase('users');
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [OWNER.sub, OWNER.email]);
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"full_name":"Ana Prueba"}')`,
    [ANA.sub, ANA.email],
  );
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"name":"  "}')`,
    [LUIS.sub, LUIS.email],
  );
});

describe('admin_account_labels', () => {
  it('gives each account asked for that exists, with its name when it has one', async () => {
    const owner = await signIn(db, OWNER);
    expect(await labels(owner, [LUIS.sub, ANA.sub, GONE])).toEqual([
      { id: ANA.sub, email: ANA.email, name: 'Ana Prueba' },
      { id: LUIS.sub, email: LUIS.email, name: null },
    ]);
  });

  it('a student, an anonymous visitor or a closed session get nothing', async () => {
    const ana = await signIn(db, ANA);
    await expect(labels(ana, [ANA.sub])).rejects.toThrow(/admin_only/);
    await expect(labels(null, [ANA.sub])).rejects.toThrow(/permission denied/);
    await expect(labels(OWNER, [ANA.sub])).rejects.toThrow(/session_closed/);
  });

  it('gives only the ids asked for: an empty list, or one of nulls, lists nobody', async () => {
    const owner = await signIn(db, OWNER);
    expect(await labels(owner, [])).toEqual([]);
    const nulls = await asUser(
      db,
      owner,
      async (tx) =>
        (await tx.query('select * from public.admin_account_labels(array[null]::uuid[])')).rows,
    );
    expect(nulls).toEqual([]);
    await expect(
      asUser(db, owner, (tx) => tx.query('select * from public.admin_account_labels(null)')),
    ).rejects.toThrow(/at most 500/);
  });

  it('at most 500 at a time', async () => {
    const owner = await signIn(db, OWNER);
    const many = Array.from(
      { length: 501 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    await expect(labels(owner, many)).rejects.toThrow(/at most 500/);
  });
});
