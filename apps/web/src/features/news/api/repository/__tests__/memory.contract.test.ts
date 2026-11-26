// The in-memory repository of what was read against the users database: the same steps on both, the SQL through the
// Supabase adapter, and the same results.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { createDatabase } from '@qv/db/testing';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_TIMEOUT, onBoth } from '../../../../../test/contract';
import { localNewsRepository } from '../memory';
import type { NewsRepository } from '../port';
import { supabaseNewsRepository } from '../supabase';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;

beforeAll(async () => {
  db = await createDatabase('users');
  await db.query('update public.access_settings set open_to_domain = true');
}, DATABASE_TIMEOUT);

describe('what was read of the news', () => {
  it('nothing at first, then only forward', async () => {
    const me = await signIn(db, 'lectora@ug.uchile.cl');
    const rest = fakeSupabase(db, () => me);
    const sql = supabaseNewsRepository(createClient<Database>(rest.url, rest.key, rest.options));
    const steps: ((r: NewsRepository) => Promise<unknown>)[] = [
      (r) => r.seenUntil(),
      (r) => r.markSeen('2026-11-20T12:00:00.000Z'),
      (r) => r.markSeen('2026-11-18T12:00:00.000Z'),
      (r) => r.seenUntil(),
      (r) => r.markSeen('2026-11-21T08:30:00.000Z'),
      (r) => r.seenUntil(),
    ];
    const got = await onBoth(sql, localNewsRepository(), steps);
    expect(got.memory).toEqual(got.sql);
    expect(got.raw.sql).toEqual([
      null,
      '2026-11-20T12:00:00.000Z',
      '2026-11-20T12:00:00.000Z',
      '2026-11-20T12:00:00.000Z',
      '2026-11-21T08:30:00.000Z',
      '2026-11-21T08:30:00.000Z',
    ]);
  });
});
