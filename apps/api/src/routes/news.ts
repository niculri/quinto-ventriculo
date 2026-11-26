// `GET /api/news`: the announcements a student may read, newest first, without what is about material they cannot see.
import { Hono } from 'hono';
import type { NewsFeed } from '@qv/schema';
import { API_ROUTES as R, visibleNews } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { catalogFor } from '../services/catalog';

/** «Novedades» shows all of them; more than this many would be years of publications. */
const NEWS_LIMIT = 100;

export function newsRoutes({ deps, mw }: AppContext) {
  return new Hono<AppEnv>().get(R.news.pattern, mw.session, mw.visibleContent, async (c) => {
    // Whether one came out depends on the time: nothing keeps an old answer.
    c.header('Cache-Control', 'no-store');
    const at = new Date(deps.now() * 1000).toISOString();
    const [list, catalog] = await Promise.all([
      deps.announcements.feed(at, NEWS_LIMIT),
      catalogFor({
        repository: c.get('repository'),
        published: deps.repository,
        preview: c.get('preview'),
        asksPublished: false,
        settings: c.get('settings'),
      }),
    ]);
    return c.json({ announcements: visibleNews(list, catalog) } satisfies NewsFeed);
  });
}
