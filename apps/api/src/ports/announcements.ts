// How the API reads and writes the announcements of the material, in the content database.
import type { Announcement, AnnouncementRow, SaveAnnouncementRequest } from '@qv/schema';

export interface AnnouncementRepository {
  /** What the students may read at `at` (ISO), newest first: out of their wait, not withdrawn, its release published. */
  feed(at: string, limit: number): Promise<Announcement[]>;
  /** Every one, also waiting or withdrawn, newest first. */
  list(): Promise<AnnouncementRow[]>;
  /** `release` when its release does not exist or was undone. */
  save(input: SaveAnnouncementRequest & { by: string }): Promise<AnnouncementRow | 'release'>;
  withdraw(id: number, by: string): Promise<AnnouncementRow | 'missing'>;
}

const notConfigured = () => Promise.reject(new Error('The announcements are not configured'));

/** No announcements to read; the panel's routes answer «no existe» before reaching the rest. */
export const NO_ANNOUNCEMENTS: AnnouncementRepository = {
  feed: () => Promise.resolve([]),
  list: notConfigured,
  save: notConfigured,
  withdraw: notConfigured,
};
