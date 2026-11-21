// A function created after the default-privileges migration is not executable by anon, authenticated or public, and
// the functions that already existed keep exactly the grants they had.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from './pglite';

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
    expect(is).toEqual(was);
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
});
