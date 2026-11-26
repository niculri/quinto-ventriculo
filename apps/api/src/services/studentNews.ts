// The news the students get, the same for all of them while the content version and the courses turned off stay: kept a
// minute in each isolate, so that the bell of every open tab does not read the announcements and the catalog again.
import type { Announcement } from '@qv/schema';
import type { Dependencies } from '../dependencies';

const KEPT_SECONDS = 60;

/** `key` null (the admin mode, or no content version to tell a change by): read every time. */
export type StudentNews = (
  key: string | null,
  read: () => Promise<Announcement[]>,
) => Promise<Announcement[]>;

export function studentNews(deps: Dependencies): StudentNews {
  let kept: { key: string; until: number; news: Announcement[] } | null = null;
  return async (key, read) => {
    if (key === null) return read();
    const t = deps.now();
    if (kept?.key === key && kept.until > t) return kept.news;
    const news = await read();
    kept = { key, until: t + KEPT_SECONDS, news };
    return news;
  };
}
