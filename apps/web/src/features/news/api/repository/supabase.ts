// What the student read of the announcements in the users database: their own row, read under RLS, and moved forward
// only through mark_news_seen(). A database without them reads as nothing seen and keeps nothing.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { databaseError } from '@qv/schema/database';
import type { NewsRepository } from './port';

const iso = (t: string | null) => (t === null ? null : new Date(t).toISOString());

export function supabaseNewsRepository(client: SupabaseClient<Database>): NewsRepository {
  return {
    async seenUntil() {
      const { data, error } = await client.from('news_reads').select('seen_until').maybeSingle();
      if (error) {
        if (databaseError(error).hasCode('PGRST205')) return null;
        throw new Error(`No se pudo leer qué novedades viste: ${error.message}`);
      }
      return iso(data?.seen_until ?? null);
    },
    async markSeen(until) {
      const { data, error } = await client.rpc('mark_news_seen', { until });
      if (error) {
        if (databaseError(error).hasCode('PGRST202')) return null;
        throw new Error(`No se pudo guardar qué novedades viste: ${error.message}`);
      }
      return iso(data);
    },
  };
}
