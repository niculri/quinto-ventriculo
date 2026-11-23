// The content version in the content database: the last publication (and whether it was undone) and how many pieces
// were taken off the site, through the two functions the Worker may call that say it, one row each.
import { CONTENT_RPC } from '@qv/schema/content';
import type { ContentVersionSource } from '../../ports/contentVersion';
import type { ContentClient } from './client';
import { fromDatabase } from './json';
import { unwrap } from './unwrap';

/** With the Worker's one client of the content database (the service key, which cannot read those tables). */
export function supabaseContentVersion(client: ContentClient): ContentVersionSource {
  return {
    async current() {
      // Only the last publication can be undone, and an undone one is not published again: its id and status say
      // everything publishing did. Taking a piece off writes the published tables without a publication, and logs it.
      const [release, removals] = await Promise.all([
        client.rpc('release_log', { max_rows: 1 }),
        client.rpc('unpublish_log_entries', { max_entries: 1 }),
      ]);
      const log = fromDatabase(
        'release_log',
        CONTENT_RPC.release_log.returns,
        unwrap(release, 'release_log'),
      );
      const taken = fromDatabase(
        'unpublish_log_entries',
        CONTENT_RPC.unpublish_log_entries.returns,
        unwrap(removals, 'unpublish_log_entries'),
      );
      const last = log.releases[0];
      const undone = last?.status === 'reverted' ? 'x' : '';
      return `r${String(last?.id ?? 0)}${undone}.u${String(taken.total)}`;
    },
  };
}
