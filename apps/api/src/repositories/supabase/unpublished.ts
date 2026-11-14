// The log of what was unpublished, in the content database, read with the service key.
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UnpublishedLog } from '@qv/schema';
import type { UnpublishedRepository } from '../../repository';

export function supabaseUnpublishedRepository(
  url: string,
  serviceKey: string,
): UnpublishedRepository {
  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async log() {
      const r = await db.rpc('unpublish_log_entries', { max_entries: 200 });
      if (r.error) throw new Error(`Content database (unpublish_log_entries): ${r.error.message}`);
      const data = r.data as { total: number; entries: { doneAt: string }[] };
      return UnpublishedLog.parse({
        ...data,
        entries: data.entries.map((e) => ({ ...e, doneAt: new Date(e.doneAt).toISOString() })),
      });
    },
  };
}
