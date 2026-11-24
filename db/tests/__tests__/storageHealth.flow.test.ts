// storage_health(), what /api/health/deep asks the users' database with the public key: whether the cluster is under
// 60 % of the free plan's 500 MB, as a yes or no that never gives the size away.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from '../pglite';

const LIMIT_BYTES = 300_000_000;

let db: PGlite;

beforeAll(async () => {
  db = await createDatabase('users');
});

describe('storage_health()', () => {
  it('says whether every database of the cluster together is under 300 MB, without a session and with one', async () => {
    const { rows: size } = await db.query<{ bytes: string }>(
      'select sum(pg_database_size(oid))::text as bytes from pg_database',
    );
    const expected = Number(size[0]!.bytes) < LIMIT_BYTES;
    expect(expected).toBe(true);
    const anon = await asUser(db, null, (tx) =>
      tx.query<{ ok: boolean }>('select public.storage_health() as ok'),
    );
    expect(anon.rows).toEqual([{ ok: expected }]);
    const signedIn = await asUser(
      db,
      { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' },
      (tx) => tx.query<{ ok: boolean }>('select public.storage_health() as ok'),
    );
    expect(signedIn.rows).toEqual([{ ok: expected }]);
  });

  it('runs as the caller with an empty search path, and the limit is 60 % of 500 MB', async () => {
    const { rows } = await db.query<{
      definer: boolean;
      body: string;
      config: string[] | null;
      result: string;
      anon_execute: boolean;
      public_execute: boolean;
    }>(`
      select p.prosecdef as definer, p.prosrc as body, p.proconfig as config,
             format_type(p.prorettype, null) as result,
             has_function_privilege('anon', p.oid, 'execute') as anon_execute,
             exists (
               select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where a.grantee = 0 and a.privilege_type = 'EXECUTE'
             ) as public_execute
      from pg_proc p where p.oid = 'public.storage_health()'::regprocedure`);
    expect(rows[0]).toMatchObject({
      definer: false,
      config: ['search_path=""'],
      result: 'boolean',
      anon_execute: true,
      public_execute: false,
    });
    expect(rows[0]!.body).toContain(`< ${LIMIT_BYTES}`);
  });

  it('its body counts every database and answers false for a cluster at the limit or over it', async () => {
    const { rows } = await db.query<{ body: string }>(
      `select prosrc as body from pg_proc where oid = 'public.storage_health()'::regprocedure`,
    );
    const size = 'sum(pg_catalog.pg_database_size(d.oid))';
    expect(rows[0]!.body).toContain(`${size} < ${LIMIT_BYTES} from pg_catalog.pg_database d`);
    for (const extra of [LIMIT_BYTES, LIMIT_BYTES * 2]) {
      const grown = rows[0]!.body.replace(size, `(${size} + ${extra})`);
      const { rows: answer } = await db.query<{ ok: boolean }>(
        `select t.ok from (${grown.trim()}) as t(ok)`,
      );
      expect(answer).toEqual([{ ok: false }]);
    }
  });
});
