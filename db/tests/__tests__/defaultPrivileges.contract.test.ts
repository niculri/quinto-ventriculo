// A function created after the default-privileges migration is not executable by anon, authenticated or public, the
// functions that already existed keep exactly the grants they had, and the later migrations grant only on purpose.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../pglite';

const MIGRATION = '20261124000000_default_privileges.sql';
/** The first migration after it: stopping there gives the database that migration left. */
const NEXT = readdirSync(join(import.meta.dirname, '../../users/supabase/migrations'))
  .sort()
  .find((f) => f > MIGRATION);
/** The functions the later migrations made that a signed-in student calls: each granted on purpose. */
const GRANTED_LATER = [
  'admin_move_invites(jsonb)',
  'my_card_stats(text[])',
  'save_study_preferences(jsonb)',
  'storage_health()',
  'study_heatmap(text[],text[])',
  'undo_last_review(jsonb)',
];
/** Answers only yes or no, for the health check, which calls it without a session like `health()`. */
const GRANTED_TO_ANON_LATER = ['storage_health()'];

type Grant = { fn: string; grantee: string };

/** Who can execute each function of `public`; a function without its own list has the default one (acldefault). */
const grants = async (d: PGlite) =>
  (
    await d.query<Grant>(`
      select p.oid::regprocedure::text as fn,
             case a.grantee when 0 then 'public' else a.grantee::regrole::text end as grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where a.privilege_type = 'EXECUTE'
       order by 1, 2`)
  ).rows;

let before: Grant[];
let justAfter: Grant[];
/** Every migration: what the later ones did is checked here too (`all`, before the tests add their functions). */
let db: PGlite;
let all: Grant[];

beforeAll(async () => {
  const [b, a] = await Promise.all([
    createDatabase('users', [], MIGRATION),
    createDatabase('users', [], NEXT),
  ]);
  [before, justAfter] = [await grants(b), await grants(a)];
  await Promise.all([b.close(), a.close()]);
  db = await createDatabase('users');
  all = await grants(db);
});

describe('default privileges of new functions in public', () => {
  it('the functions that already existed keep the grants they had', () => {
    expect(before.length).toBeGreaterThan(10);
    expect(justAfter).toEqual(before);
  });

  it('the later migrations give no function to public, and to anon and authenticated only on purpose', () => {
    const existing = new Set(before.map((g) => g.fn));
    const later = all.filter((g) => !existing.has(g.fn));
    expect(later.filter((g) => g.grantee === 'public')).toEqual([]);
    expect([...new Set(later.filter((g) => g.grantee === 'anon').map((g) => g.fn))]).toEqual(
      GRANTED_TO_ANON_LATER,
    );
    expect([
      ...new Set(later.filter((g) => g.grantee === 'authenticated').map((g) => g.fn)),
    ]).toEqual(GRANTED_LATER);
    // A function that was already there may lose a grant, never gain one.
    const had = new Set(before.map((g) => `${g.fn} ${g.grantee}`));
    expect(all.filter((g) => existing.has(g.fn) && !had.has(`${g.fn} ${g.grantee}`))).toEqual([]);
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
