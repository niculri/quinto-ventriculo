// The site's settings in the content database, read and written with the service key.
import type { Json } from '@qv/db-types/content';
import { SiteSettings } from '@qv/schema';
import type { SiteSettingsRepository } from '../../repository';
import { contentClient } from './client';
import type { ContentClient } from './client';
import { fromJson } from './json';

/** In `public`: the draft does not have the settings. */
export function supabaseSiteSettingsRepository(
  url: string,
  serviceKey: string,
  client: ContentClient = contentClient(url, serviceKey),
): SiteSettingsRepository {
  const db = client;
  const parse = (data: Json) => {
    const d = fromJson<{
      hideEmptySemesters: boolean;
      updatedAt: string | null;
      updatedBy: string | null;
    }>(data);
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
