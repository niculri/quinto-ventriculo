// The site's settings in the content database, read and written with the service key.
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SiteSettings } from '@qv/schema';
import type { SiteSettingsRepository } from '../../repository';

/** In `public`: the draft does not have the settings. */
export function supabaseSiteSettingsRepository(
  url: string,
  serviceKey: string,
): SiteSettingsRepository {
  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const parse = (data: unknown) => {
    const d = data as {
      hideEmptySemesters: boolean;
      updatedAt: string | null;
      updatedBy: string | null;
    };
    return SiteSettings.parse({
      ...d,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
    });
  };
  return {
    async get() {
      const r = await db.rpc('site_settings');
      if (r.error) throw new Error(`Content database (site_settings): ${r.error.message}`);
      return parse(r.data);
    },
    async set({ hideEmptySemesters, by }) {
      const r = await db.rpc('set_site_settings', { p: { hideEmptySemesters, by } });
      if (r.error) throw new Error(`Content database (set_site_settings): ${r.error.message}`);
      return parse(r.data);
    },
  };
}
