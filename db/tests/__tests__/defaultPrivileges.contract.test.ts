// A function created after the default-privileges migration is not executable by anon, authenticated or public, and
// the functions that already existed keep exactly the grants they had.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../pglite';

const MIGRATION = '20261124000000_default_privileges.sql';

let before: PGlite;
let db: PGlite;

/** Who can execute each function of `public`; a function without its own list has the default one (acldefault). */
const grants = async (d: PGlite) =>
  (
    await d.query<{ fn: string; grantee: string }>(`
      select p.oid::regprocedure::text as fn,
             case a.grantee when 0 then 'public' else a.grantee::regrole::text end as grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where a.privilege_type = 'EXECUTE'
       order by 1, 2`)
  ).rows;

beforeAll(async () => {
  before = await createDatabase('users', [], MIGRATION);
  db = await createDatabase('users');
});

afterAll(async () => {
  await before.close();
});

describe('default privileges of new functions in public', () => {
  it('the functions that already existed keep the grants they had', async () => {
    const [was, is] = [await grants(before), await grants(db)];
    expect(was.length).toBeGreaterThan(10);
    // A later migration adds functions with grants of its own: only the ones that were there are compared.
    const existed = new Set(was.map((g) => g.fn));
    expect(is.filter((g) => existed.has(g.fn))).toEqual(was);
  });

  it('a function created afterwards is executable by neither anon, authenticated nor public', async () => {
    await db.exec(`
      create function public.created_later() returns integer language sql stable set search_path = '' as 'select 1';`);
    const { rows } = await db.query<{
      anon: boolean;
      authenticated: boolean;
      service_role: boolean;
    }>(`
      select has_function_privilege('anon', 'public.created_later()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.created_later()', 'execute') as authenticated,
             has_function_privilege('service_role', 'public.created_later()', 'execute') as service_role`);
    expect(rows).toEqual([{ anon: false, authenticated: false, service_role: true }]);
    expect((await grants(db)).filter((g) => g.fn === 'created_later()')).toEqual([
      { fn: 'created_later()', grantee: 'postgres' },
      { fn: 'created_later()', grantee: 'service_role' },
    ]);
  });

  it('calling it as anon or authenticated is refused', async () => {
    for (const role of ['anon', 'authenticated']) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query('select public.created_later()');
        }),
      ).rejects.toThrow(/permission denied for function created_later/);
    }
  });

  it('a migration that grants its function on purpose still works', async () => {
    await db.exec(`
      create function public.granted_on_purpose() returns integer language sql stable set search_path = '' as 'select 2';
      grant execute on function public.granted_on_purpose() to authenticated;`);
    const { rows } = await db.query<{ anon: boolean; authenticated: boolean }>(`
      select has_function_privilege('anon', 'public.granted_on_purpose()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.granted_on_purpose()', 'execute') as authenticated`);
    expect(rows).toEqual([{ anon: false, authenticated: true }]);
  });

  it('before the migration the same function was open to anon, authenticated and public', async () => {
    const old = await createDatabase('users', [], MIGRATION);
    await old.exec(`
      create function public.created_without() returns integer language sql stable set search_path = '' as 'select 1';`);
    expect((await grants(old)).filter((g) => g.fn === 'created_without()')).toEqual([
      { fn: 'created_without()', grantee: 'anon' },
      { fn: 'created_without()', grantee: 'authenticated' },
      { fn: 'created_without()', grantee: 'postgres' },
      { fn: 'created_without()', grantee: 'public' },
      { fn: 'created_without()', grantee: 'service_role' },
    ]);
  });

  it('the revoke from public reaches every schema, not only public', async () => {
    await db.exec(`
      create schema helpers;
      create function helpers.created_later() returns integer language sql stable set search_path = '' as 'select 1';`);
    const { rows } = await db.query<{ acl: string }>(
      `select proacl::text as acl from pg_proc where oid = 'helpers.created_later()'::regprocedure`,
    );
    expect(rows).toEqual([{ acl: '{postgres=X/postgres}' }]);
  });
});

describe('tables of public', () => {
  it('each has row level security on, and anon can do nothing with any', async () => {
    const { rows } = await db.query<{ name: string }>(`
      select c.relname as name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       where c.relkind in ('r', 'p')
         and (not c.relrowsecurity
              or has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger'))`);
    expect(rows).toEqual([]);
  });
});
