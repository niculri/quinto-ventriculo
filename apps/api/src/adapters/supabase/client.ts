// The Worker's one client of the content database, with the service key: the repositories of this folder share it.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/content';

export function contentClient(url: string, serviceKey: string) {
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type ContentClient = ReturnType<typeof contentClient>;

/** The client of one schema of the content database: `public`, or the draft's mirror. */
export type SchemaClient = ReturnType<ContentClient['schema']>;
