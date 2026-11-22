// The content database: a function created after the default-privileges migration is not executable by anon,
// authenticated or public, the existing ones keep their grants, and a rebuilt draft has the same grants as before.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../pglite';

const MIGRATION = '20261125000000_default_privileges.sql';

let before: PGlite;
let db: PGlite;

/** Who can execute each function of a schema; a function without its own list has the default one (acldefault). */
const grants = async (d: PGlite, schema: 'public' | 'draft') =>
  (
    await d.query<{ fn: string; grantee: string }>(
      `select p.oid::regprocedure::text as fn,
              case a.grantee when 0 then 'public' else a.grantee::regrole::text end as grantee
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace and n.nspname = $1
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.privilege_type = 'EXECUTE'
        order by 1, 2`,
      [schema],
    )
  ).rows;

/** The grants of the functions that `was` already had, and those of the functions the later migrations made. */
function split<T extends { fn: string; grantee: string }>(was: T[], is: T[]) {
  const existing = new Set(was.map((g) => g.fn));
  return {
    existing: is.filter((g) => existing.has(g.fn)),
    later: is.filter((g) => !existing.has(g.fn)),
  };
}

beforeAll(async () => {
  before = await createDatabase('content', [], MIGRATION);
  db = await createDatabase('content');
});

afterAll(async () => {
  await before.close();
});

describe('default privileges of new functions in the content database', () => {
  it('the functions that already existed keep the grants they had, in public and in draft', async () => {
    for (const schema of ['public', 'draft'] as const) {
      const was = await grants(before, schema);
      const { existing, later } = split(was, await grants(db, schema));
      expect(was.length).toBeGreaterThan(10);
      expect(existing).toEqual(was);
      // The functions the later migrations made are the new default's: only postgres and service_role.
      expect(later.filter((g) => !['postgres', 'service_role'].includes(g.grantee))).toEqual([]);
    }
  });

  it('a draft rebuilt after the migration has the same grants as one rebuilt before it', async () => {
    await before.query('select public.rebuild_draft()');
    await db.query('select public.rebuild_draft()');
    const was = await grants(before, 'draft');
    expect(split(was, await grants(db, 'draft')).existing).toEqual(was);
  });

  it('a function created afterwards is executable only by postgres and service_role', async () => {
    await db.exec(`
      create function public.created_later() returns integer language sql stable set search_path = '' as 'select 1';`);
    expect((await grants(db, 'public')).filter((g) => g.fn === 'created_later()')).toEqual([
      { fn: 'created_later()', grantee: 'postgres' },
      { fn: 'created_later()', grantee: 'service_role' },
    ]);
  });

  it('before the migration the same function was open to anon, authenticated and public', async () => {
    await before.exec(`
      create function public.created_without() returns integer language sql stable set search_path = '' as 'select 1';`);
    expect((await grants(before, 'public')).filter((g) => g.fn === 'created_without()')).toEqual([
      { fn: 'created_without()', grantee: 'anon' },
      { fn: 'created_without()', grantee: 'authenticated' },
      { fn: 'created_without()', grantee: 'postgres' },
      { fn: 'created_without()', grantee: 'public' },
      { fn: 'created_without()', grantee: 'service_role' },
    ]);
  });
});
