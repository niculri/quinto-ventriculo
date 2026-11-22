// The release of the draft (summary, items, marks, publish and revert) in the content database, with the service key.
import type { Database } from '@qv/db-types/content';
import { PublishResult, ReleaseLog, ReleaseMark, RevertResult } from '@qv/schema';
import { CONTENT_RPC } from '@qv/schema/content';
import { databaseError } from '@qv/schema/database';
import type { DbErrorLike } from '@qv/schema/database';
import type { Refused, ReleaseRepository } from '../../ports/releases';
import { contentClient } from './client';
import type { ContentClient } from './client';
import { fromDatabase } from './json';
import { rawRpcOf } from './raw-rpc';

type Functions = Database['public']['Functions'];

/** In `public`: the `release_*` functions read the draft themselves. */
export function supabaseReleaseRepository(
  url: string,
  serviceKey: string,
  client: ContentClient = contentClient(url, serviceKey),
): ReleaseRepository {
  const db = client;
  const rawRpc = rawRpcOf(url, serviceKey);
  return {
    summaryJson: () => rawRpc('release_summary', {}),
    browseIndexesJson: () => rawRpc('release_browse_index_changes', {}),
    itemsJson: (assessment, kind, after) =>
      rawRpc('release_items', { assessment, kind, after_key: after, max_rows: 200 }),
    textsJson: (after) => rawRpc('release_texts', { after_key: after, max_rows: 500 }),
    async media(after, limit) {
      // `after_key` is null on the first page: SQL takes it, the generated types leave null out of every argument.
      const args = { after_key: after, max_rows: limit } as Functions['release_media']['Args'];
      const r = await db.rpc('release_media', args);
      if (r.error) throw new Error(`Content database (release_media): ${r.error.message}`);
      const data = fromDatabase('release_media', CONTENT_RPC.release_media.returns, r.data);
      return { keys: data.keys, next: data.next };
    },
    async setMark(fingerprint, mark, checked, by) {
      const r = await db.rpc('set_release_mark', { fingerprint, mark, checked, checked_by: by });
      if (r.error) {
        if (databaseError(r.error).hasCode('P0409')) return 'stale';
        throw new Error(`Content database (set_release_mark): ${r.error.message}`);
      }
      return fromDatabase('set_release_mark', CONTENT_RPC.set_release_mark.returns, r.data).map(
        (m) => ReleaseMark.parse(m),
      );
    },
    async publish(input) {
      const r = await db.rpc('publish_release', { p: input });
      if (r.error) return refusedOr('publish_release', r.error);
      return { ok: true, result: PublishResult.parse(r.data) };
    },
    async revert(id, by) {
      const r = await db.rpc('revert_release', { p: { id, by } });
      if (r.error) return refusedOr('revert_release', r.error);
      return { ok: true, result: RevertResult.parse(r.data) };
    },
    async log() {
      const r = await db.rpc('release_log', { max_rows: 50 });
      if (r.error) throw new Error(`Content database (release_log): ${r.error.message}`);
      return ReleaseLog.parse(r.data);
    },
  };
}

/** «publish_release: marks» with SQLSTATE P0409 or P0422 is a refusal; anything else is a database error. */
function refusedOr(fn: string, raw: DbErrorLike): Refused {
  const error = databaseError(raw);
  const reason = error.refusal(fn);
  if (!reason || !error.hasCode('P0409', 'P0422')) {
    throw new Error(`Content database (${fn}): ${error.message}`);
  }
  return { ok: false, reason, detail: error.details };
}
