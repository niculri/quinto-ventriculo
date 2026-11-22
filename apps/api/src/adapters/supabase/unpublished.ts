// The log of what was unpublished, in the content database, read with the service key.
import { UnpublishedLog } from '@qv/schema';
import { CONTENT_RPC } from '@qv/schema/content';
import type { UnpublishedRepository } from '../../ports/unpublished';
import { contentClient } from './client';
import type { ContentClient } from './client';
import { fromDatabase } from './json';

export function supabaseUnpublishedRepository(
  url: string,
  serviceKey: string,
  client: ContentClient = contentClient(url, serviceKey),
): UnpublishedRepository {
  const db = client;
  return {
    async log() {
      const r = await db.rpc('unpublish_log_entries', { max_entries: 200 });
      if (r.error) throw new Error(`Content database (unpublish_log_entries): ${r.error.message}`);
      const data = fromDatabase(
        'unpublish_log_entries',
        CONTENT_RPC.unpublish_log_entries.returns,
        r.data,
      );
      return UnpublishedLog.parse({
        ...data,
        entries: data.entries.map((e) => ({ ...e, doneAt: new Date(e.doneAt).toISOString() })),
      });
    },
  };
}
