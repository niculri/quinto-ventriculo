import { describe, expect, it } from 'vitest';
import { createDatabase } from './pglite';

/**
 * Supabase runs every statement of its API (PostgREST, as the authenticator role) with the pg-safeupdate extension:
 * an UPDATE or a DELETE without WHERE fails («DELETE requires a WHERE clause»), also inside a function. PGlite does
 * not have it, so a function that empties a table passed every test and failed in production (step 1.7, the first
 * publication: `delete from public.release_changes`). This reads every function of both databases as safeupdate
 * would: each UPDATE … SET and DELETE FROM, up to its «;», needs a WHERE.
 * An «on conflict … do update» is part of an INSERT and does not count; «where true» is the way to empty on purpose.
 */
function withoutWhere(source: string): string[] {
  const code = source.replace(/--[^\n]*/g, '');
  const found: string[] = [];
  for (const m of code.matchAll(/\b(delete\s+from|update)\s+(?!set\b)([\w."%$]+)/gi)) {
    const start = m.index;
    if (/\bdo\s*$/i.test(code.slice(Math.max(0, start - 20), start))) continue;
    const rest = code.slice(start);
    // The statement ends at its «;» (a dynamic one, at the «;» of its EXECUTE: its WHERE is inside the string).
    const end = rest.indexOf(';');
    const statement = end < 0 ? rest : rest.slice(0, end);
    if (/^update\b/i.test(statement) && !/\bset\b/i.test(statement)) continue;
    if (/\bwhere\b/i.test(statement) || /\bcurrent\s+of\b/i.test(statement)) continue;
    found.push(statement.replace(/\s+/g, ' ').slice(0, 120));
  }
  return found;
}

describe('every UPDATE and DELETE has a WHERE (pg-safeupdate in Supabase)', () => {
  it('the check finds one without WHERE and lets the right ones pass', () => {
    expect(withoutWhere('begin delete from public.release_changes; end')).toEqual([
      'delete from public.release_changes',
    ]);
    expect(withoutWhere("execute format('update public.%I p set x = 1', t);")).toEqual([
      "update public.%I p set x = 1', t)",
    ]);
    expect(
      withoutWhere(
        [
          'delete from public.release_changes where true;',
          'update public.notes n set x = 1 where n.id = 2;',
          'insert into t values (1) on conflict (id) do update set x = excluded.x;',
          "execute format('delete from public.%I p using x where %s', t, k);",
          '-- delete from public.everything;',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  for (const name of ['content', 'users'] as const) {
    it(`no function of the ${name} database empties a table without WHERE`, async () => {
      const db = await createDatabase(name);
      const { rows } = await db.query<{ fn: string; src: string }>(
        `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
                p.prosrc as src
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           join pg_language l on l.oid = p.prolang
          where n.nspname in ('public', 'draft') and l.lanname in ('plpgsql', 'sql')`,
      );
      const problems = rows.flatMap((r) => withoutWhere(r.src).map((s) => `${r.fn}: ${s}`));
      expect(problems).toEqual([]);
    });
  }
});
