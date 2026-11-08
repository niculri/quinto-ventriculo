import { describe, expect, it } from 'vitest';
import { createDatabase } from './pglite';

/**
 * The owner's decision (7-11-2026): publishing, undoing, the panel's summary and emptying the draft get 55 s, the
 * rest of the API keeps PostgREST's 8 s (20261113000000_publish_speed.sql). The setting lives in each function: a
 * later `create or replace` without it would take it away without a word, and this test says so.
 */
describe('the time limit of the publishing functions', () => {
  it('publish_release, revert_release, release_summary and reset_draft have statement_timeout = 55s', async () => {
    const db = await createDatabase('content');
    const { rows } = await db.query<{ fn: string; config: string[] | null }>(
      `select p.oid::regprocedure::text as fn, p.proconfig as config
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('publish_release', 'revert_release', 'release_summary', 'reset_draft')
        order by 1`,
    );
    expect(rows.map((r) => r.fn)).toEqual([
      'publish_release(jsonb)',
      'release_summary()',
      'reset_draft()',
      'revert_release(jsonb)',
    ]);
    for (const r of rows) expect(r.config ?? []).toContain('statement_timeout=55s');
  });
});
