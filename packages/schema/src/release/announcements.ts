// The announcements of the material: what the students read in «Novedades» and what the panel writes and sees of
// them. The content database keeps them; the Worker leaves out what a student cannot see.
import { z } from 'zod';

/** Minutes between saving an announcement and the students seeing it (fixed in the database too). */
export const NEWS_WAIT_MINUTES = 30;
export const NEWS_TITLE_MAX = 160;
export const NEWS_BODY_MAX = 1000;
export const NEWS_ITEMS_MAX = 30;

/** At most `n` UTF-16 units, as the database's `length` and `.length` count them. */
const upTo = (n: number) => z.string().refine((text) => text.length <= n);

export const AnnouncementKind = z.enum(['new', 'update', 'site']);
export type AnnouncementKind = z.infer<typeof AnnouncementKind>;

/** A course, and the assessment of it the announcement is about (none: the whole course). */
export const AnnouncementItem = z.object({
  courseId: z.string().min(1).max(100),
  assessmentId: z.string().min(1).max(200).nullable(),
});
export type AnnouncementItem = z.infer<typeof AnnouncementItem>;

const id = z.number().int().positive();

export const Announcement = z.object({
  id,
  kind: AnnouncementKind,
  title: z.string(),
  body: z.string(),
  items: z.array(AnnouncementItem),
  publishedAt: z.iso.datetime({ offset: true }),
});
export type Announcement = z.infer<typeof Announcement>;

export const NewsFeed = z.object({ announcements: z.array(Announcement) });
export type NewsFeed = z.infer<typeof NewsFeed>;

/** What the author writes: with a publication it is `new` or `update`, without one `site`. */
export const AnnouncementDraft = z.object({
  kind: AnnouncementKind,
  title: z.string().trim().min(1).pipe(upTo(NEWS_TITLE_MAX)),
  body: z.string().trim().pipe(upTo(NEWS_BODY_MAX)),
  items: z.array(AnnouncementItem).max(NEWS_ITEMS_MAX),
});
export type AnnouncementDraft = z.infer<typeof AnnouncementDraft>;

export const SaveAnnouncementRequest = AnnouncementDraft.extend({
  releaseId: id.nullable(),
}).refine((a) => (a.releaseId === null) === (a.kind === 'site'));
export type SaveAnnouncementRequest = z.infer<typeof SaveAnnouncementRequest>;

export const WithdrawAnnouncementRequest = z.object({ id });

/** `waiting`: saved, not out yet; `out`: the students see it; `withdrawn`: by hand or because its release was undone. */
export const AnnouncementStatus = z.enum(['waiting', 'out', 'withdrawn']);
export type AnnouncementStatus = z.infer<typeof AnnouncementStatus>;

const time = z.iso.datetime({ offset: true });

/** As the panel gets it. */
export const AdminAnnouncement = z.object({
  id,
  releaseId: id.nullable(),
  releaseTitle: z.string().nullable(),
  kind: AnnouncementKind,
  title: z.string(),
  body: z.string(),
  items: z.array(AnnouncementItem),
  createdAt: time,
  createdBy: z.string(),
  publishAt: time,
  withdrawnAt: time.nullable(),
  withdrawnBy: z.string().nullable(),
  status: AnnouncementStatus,
});
export type AdminAnnouncement = z.infer<typeof AdminAnnouncement>;

export const AdminAnnouncements = z.object({ announcements: z.array(AdminAnnouncement) });
export type AdminAnnouncements = z.infer<typeof AdminAnnouncements>;

/** An announcement as `announcement_json()` builds it: the state of its release instead of a status. */
export const AnnouncementRow = AdminAnnouncement.omit({ status: true }).extend({
  releaseStatus: z.enum(['published', 'reverted']).nullable(),
});
export type AnnouncementRow = z.infer<typeof AnnouncementRow>;

/** Whether the students see it at `now` (milliseconds). */
export function announcementStatus(row: AnnouncementRow, now: number): AnnouncementStatus {
  if (row.withdrawnAt !== null || row.releaseStatus === 'reverted') return 'withdrawn';
  return Date.parse(row.publishAt) <= now ? 'out' : 'waiting';
}
