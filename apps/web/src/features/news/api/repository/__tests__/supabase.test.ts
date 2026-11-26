// Tests for what was read of the announcements in the users database: the row as ISO, a database without the
// migration and the other failures.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { describe, expect, it, vi } from 'vitest';
import { supabaseNewsRepository } from '../supabase';

type Answer = { data: unknown; error: { message: string; code?: string } | null };

const clientWith = (read: Answer, rpc: Answer) => {
  const rpcFn = vi.fn(async () => rpc);
  const client = {
    from: () => ({ select: () => ({ maybeSingle: async () => read }) }),
    rpc: rpcFn,
  } as unknown as SupabaseClient<Database>;
  return { repo: supabaseNewsRepository(client), rpc: rpcFn };
};

describe('supabaseNewsRepository', () => {
  it('reads the row and moves it forward, as ISO', async () => {
    const { repo, rpc } = clientWith(
      { data: { seen_until: '2026-11-20T12:00:00+00:00' }, error: null },
      { data: '2026-11-25T12:00:00+00:00', error: null },
    );
    expect(await repo.seenUntil()).toBe('2026-11-20T12:00:00.000Z');
    expect(await repo.markSeen('2026-11-25T12:00:00.000Z')).toBe('2026-11-25T12:00:00.000Z');
    expect(rpc).toHaveBeenCalledWith('mark_news_seen', { until: '2026-11-25T12:00:00.000Z' });
  });

  it('no row is nothing seen; a database without the migration reads and keeps nothing', async () => {
    const none = clientWith({ data: null, error: null }, { data: null, error: null });
    expect(await none.repo.seenUntil()).toBeNull();
    const before = clientWith(
      { data: null, error: { message: 'Could not find the table', code: 'PGRST205' } },
      { data: null, error: { message: 'Could not find the function', code: 'PGRST202' } },
    );
    expect(await before.repo.seenUntil()).toBeNull();
    expect(await before.repo.markSeen('2026-11-25T12:00:00.000Z')).toBeNull();
  });

  it('another failure is an error', async () => {
    const { repo } = clientWith(
      { data: null, error: { message: 'caído' } },
      { data: null, error: { message: 'caído' } },
    );
    await expect(repo.seenUntil()).rejects.toThrow('caído');
    await expect(repo.markSeen('2026-11-25T12:00:00.000Z')).rejects.toThrow('caído');
  });
});
