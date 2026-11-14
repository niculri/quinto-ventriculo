// The release of the draft (summary, items, marks, publish and revert) in the content database, with the service key.
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PublishResult, ReleaseLog, ReleaseMark, RevertResult } from '@qv/schema';
import type { Refused, ReleaseRepository } from '../../repository';
import { rawRpcOf } from './raw-rpc';

/** In `public`: the `release_*` functions read the draft themselves. */
export function supabaseReleaseRepository(url: string, serviceKey: string): ReleaseRepository {
  const db: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const rawRpc = rawRpcOf(url, serviceKey);
  return {
    summaryJson: () => rawRpc('release_summary', {}),
    browseIndexesJson: () => rawRpc('release_browse_index_changes', {}),
    itemsJson: (assessment, kind, after) =>
      rawRpc('release_items', { assessment, kind, after_key: after, max_rows: 200 }),
    textsJson: (after) => rawRpc('release_texts', { after_key: after, max_rows: 500 }),
    async media(after, limit) {
      const r = await db.rpc('release_media', { after_key: after, max_rows: limit });
      if (r.error) throw new Error(`Content database (release_media): ${r.error.message}`);
      const data = r.data as { keys: string[]; next: string | null };
      return { keys: data.keys, next: data.next };
    },
    async setMark(fingerprint, mark, checked, by) {
      const r = await db.rpc('set_release_mark', { fingerprint, mark, checked, checked_by: by });
      if (r.error) {
        if (r.error.code === 'P0409') return 'stale';
        throw new Error(`Content database (set_release_mark): ${r.error.message}`);
      }
      return (r.data as unknown[]).map((m) => ReleaseMark.parse(m));
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
function refusedOr(
  fn: string,
  error: { code?: string; message: string; details?: string | null },
): Refused {
  const reason = new RegExp(`^${fn}: ([a-z_]+)$`).exec(error.message)?.[1];
  if (!reason || (error.code !== 'P0409' && error.code !== 'P0422')) {
    throw new Error(`Content database (${fn}): ${error.message}`);
  }
  return { ok: false, reason, detail: error.details ?? null };
}
