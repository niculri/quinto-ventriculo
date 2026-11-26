// The announcements in memory, for the demo and the tests, with the database's rules: the 30 minutes of wait, one per
// release, and gone once their release is undone.
import { NEWS_WAIT_MINUTES } from '@qv/schema';
import type { AnnouncementRow } from '@qv/schema';
import type { AnnouncementRepository } from '../../ports/announcements';
import { resolved } from './resolved';

export interface MemoryAnnouncementsOptions {
  /** The state of a release, as its log says (null: there is none). */
  releaseStatus?: (id: number) => Promise<'published' | 'reverted' | null>;
  /** Milliseconds. */
  now?: () => number;
  /** Announcements already saved (the demo's), with their times. */
  start?: AnnouncementRow[];
}

const newestFirst = (a: AnnouncementRow, b: AnnouncementRow) =>
  b.publishAt.localeCompare(a.publishAt) || b.id - a.id;

export function memoryAnnouncements(
  options: MemoryAnnouncementsOptions = {},
): AnnouncementRepository {
  const now = options.now ?? Date.now;
  const releaseStatus = options.releaseStatus ?? (() => Promise.resolve(null));
  let rows: AnnouncementRow[] = [...(options.start ?? [])];
  let next = Math.max(0, ...rows.map((r) => r.id)) + 1;
  const withRelease = async (r: AnnouncementRow): Promise<AnnouncementRow> =>
    r.releaseId === null ? r : { ...r, releaseStatus: await releaseStatus(r.releaseId) };

  return {
    async feed(at, limit) {
      const all = await Promise.all(rows.map(withRelease));
      return all
        .filter(
          (r) => r.publishAt <= at && r.withdrawnAt === null && r.releaseStatus !== 'reverted',
        )
        .sort(newestFirst)
        .slice(0, limit)
        .map(({ id, kind, title, body, items, publishAt }) => ({
          id,
          kind,
          title,
          body,
          items,
          publishedAt: publishAt,
        }));
    },
    async list() {
      const all = await Promise.all(rows.map(withRelease));
      return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
    },
    async save({ releaseId, by, ...text }) {
      const status = releaseId === null ? null : await releaseStatus(releaseId);
      if (releaseId !== null && status !== 'published') return 'release';
      const old = releaseId === null ? undefined : rows.find((r) => r.releaseId === releaseId);
      const t = new Date(now()).toISOString();
      const saved: AnnouncementRow = old
        ? { ...old, ...text, withdrawnAt: null, withdrawnBy: null, releaseStatus: status }
        : {
            id: next++,
            releaseId,
            releaseTitle: null,
            releaseStatus: status,
            ...text,
            createdAt: t,
            createdBy: by,
            publishAt: new Date(now() + NEWS_WAIT_MINUTES * 60_000).toISOString(),
            withdrawnAt: null,
            withdrawnBy: null,
          };
      rows = [...rows.filter((r) => r.id !== saved.id), saved];
      return saved;
    },
    withdraw: (id, by) =>
      resolved(() => {
        const old = rows.find((r) => r.id === id);
        if (!old) return 'missing';
        const saved = old.withdrawnAt
          ? old
          : { ...old, withdrawnAt: new Date(now()).toISOString(), withdrawnBy: by };
        rows = rows.map((r) => (r.id === id ? saved : r));
        return saved;
      }),
  };
}
