// The site's settings in the content database, read and written with the service key.
import type { Json } from '@qv/db-types/content';
import { SiteSettings } from '@qv/schema';
import { CONTENT_RPC } from '@qv/schema/content';
import type { SiteSettingsRepository } from '../../repository';
import { contentClient } from './client';
import type { ContentClient } from './client';
import { fromDatabase } from './json';

/** In `public`: the draft does not have the settings. */
export function supabaseSiteSettingsRepository(
  url: string,
  serviceKey: string,
  client: ContentClient = contentClient(url, serviceKey),
): SiteSettingsRepository {
  const db = client;
  const parse = (fn: string, data: Json) => {
    const d = fromDatabase(fn, CONTENT_RPC.site_settings.returns, data);
    return SiteSettings.parse({
      ...d,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
    });
  };
  return {
    async get() {
      const r = await db.rpc('site_settings');
      if (r.error) throw new Error(`Content database (site_settings): ${r.error.message}`);
      return parse('site_settings', r.data);
    },
    async set(change) {
      const r = await db.rpc('set_site_settings', { p: change });
      if (r.error) throw new Error(`Content database (set_site_settings): ${r.error.message}`);
      return parse('set_site_settings', r.data);
    },
  };
}
