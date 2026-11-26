// The announcements in the content database, read and written with the service key; times go out as ISO.
import { Announcement, AnnouncementRow } from '@qv/schema';
import { CONTENT_RPC } from '@qv/schema/content';
import { databaseError } from '@qv/schema/database';
import type { DbErrorLike } from '@qv/schema/database';
import type { AnnouncementRepository } from '../../ports/announcements';
import { contentClient } from './client';
import type { ContentClient } from './client';
import { fromDatabase } from './json';

const iso = (t: string) => new Date(t).toISOString();
const isoOrNull = (t: string | null) => (t === null ? null : iso(t));

const row = (r: AnnouncementRow): AnnouncementRow =>
  AnnouncementRow.parse({
    ...r,
    createdAt: iso(r.createdAt),
    publishAt: iso(r.publishAt),
    withdrawnAt: isoOrNull(r.withdrawnAt),
  });

/** A database without the migration of the announcements: the feed is empty instead of failing every page. */
const missing = (error: DbErrorLike) => databaseError(error).hasCode('PGRST202');

const failure = (fn: string, error: DbErrorLike) =>
  new Error(`Content database (${fn}): ${databaseError(error).message}`);

export function supabaseAnnouncementRepository(
  url: string,
  serviceKey: string,
  client: ContentClient = contentClient(url, serviceKey),
): AnnouncementRepository {
  const db = client;
  return {
    async feed(at, limit) {
      const r = await db.rpc('announcements_feed', { at, max_rows: limit });
      if (r.error) {
        if (missing(r.error)) return [];
        throw failure('announcements_feed', r.error);
      }
      return fromDatabase('announcements_feed', CONTENT_RPC.announcements_feed.returns, r.data).map(
        (a) => Announcement.parse({ ...a, publishedAt: iso(a.publishedAt) }),
      );
    },
    async list() {
      const r = await db.rpc('admin_announcements', { max_rows: 100 });
      if (r.error) throw failure('admin_announcements', r.error);
      return fromDatabase(
        'admin_announcements',
        CONTENT_RPC.admin_announcements.returns,
        r.data,
      ).map(row);
    },
    async save({ by, ...input }) {
      const r = await db.rpc('save_announcement', { p: { ...input, by } });
      if (r.error) {
        if (databaseError(r.error).hasCode('P0422')) return 'release';
        throw failure('save_announcement', r.error);
      }
      return row(fromDatabase('save_announcement', CONTENT_RPC.save_announcement.returns, r.data));
    },
    async withdraw(id, by) {
      const r = await db.rpc('withdraw_announcement', { p: { id, by } });
      if (r.error) {
        if (databaseError(r.error).hasCode('P0422')) return 'missing';
        throw failure('withdraw_announcement', r.error);
      }
      return row(
        fromDatabase('withdraw_announcement', CONTENT_RPC.withdraw_announcement.returns, r.data),
      );
    },
  };
}
