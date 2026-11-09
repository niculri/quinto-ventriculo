import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

/**
 * Step 2.5: health() (…_health.sql) is what `/api/health/deep` asks the users' database with the public key. Anybody
 * can call it, it gives only `true`, and it reads nothing of a student.
 */
let db: PGlite;

beforeAll(async () => {
  db = await createDatabase('users');
});

describe('health()', () => {
  it('answers true without a session (anon) and with one', async () => {
    const anon = await asUser(db, null, (tx) =>
      tx.query<{ ok: boolean }>('select public.health() as ok'),
    );
    expect(anon.rows).toEqual([{ ok: true }]);
    const signedIn = await asUser(
      db,
      { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' },
      (tx) => tx.query<{ ok: boolean }>('select public.health() as ok'),
    );
    expect(signedIn.rows).toEqual([{ ok: true }]);
  });

  it('is a plain function that runs as the caller and reads no table', async () => {
    const { rows } = await db.query<{
      definer: boolean;
      volatility: string;
      body: string;
      config: string[] | null;
      anon_execute: boolean;
    }>(`
      select p.prosecdef as definer, p.provolatile as volatility, p.prosrc as body, p.proconfig as config,
             has_function_privilege('anon', p.oid, 'execute') as anon_execute
      from pg_proc p where p.oid = 'public.health()'::regprocedure`);
    expect(rows[0]).toMatchObject({
      definer: false,
      volatility: 's',
      config: ['search_path=""'],
      anon_execute: true,
    });
    expect(rows[0]!.body.trim()).toBe('select true');
  });
});
