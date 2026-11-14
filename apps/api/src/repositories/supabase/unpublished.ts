// The log of what was unpublished, in the content database, read with the service key.
import { UnpublishedLog } from '@qv/schema';
import type { UnpublishedRepository } from '../../repository';
import { contentClient } from './client';
import type { ContentClient } from './client';
import { fromJson } from './json';

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
      const data = fromJson<{ total: number; entries: { doneAt: string }[] }>(r.data);
      return UnpublishedLog.parse({
        ...data,
        entries: data.entries.map((e) => ({ ...e, doneAt: new Date(e.doneAt).toISOString() })),
      });
    },
  };
}
