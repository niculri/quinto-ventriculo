// `GET /api/news`: the announcements a student may read, newest first, without what is about material they cannot see.
import { Hono } from 'hono';
import type { NewsFeed } from '@qv/schema';
import { API_ROUTES as R, visibleNews } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { validatorOf } from '../middleware/revalidate';
import { catalogFor } from '../services/catalog';

/** «Novedades» shows all of them; more than this many would be years of publications. */
const NEWS_LIMIT = 100;

export function newsRoutes({ deps, mw, services }: AppContext) {
  return new Hono<AppEnv>().get(R.news.pattern, mw.session, mw.visibleContent, async (c) => {
    // Whether one came out depends on the time: nothing keeps an old answer.
    c.header('Cache-Control', 'no-store');
    const settings = c.get('settings');
    const read = async () => {
      const list = await deps.announcements.feed(
        new Date(deps.now() * 1000).toISOString(),
        NEWS_LIMIT,
      );
      if (!list.length) return [];
      const catalog = await catalogFor({
        repository: c.get('repository'),
        published: deps.repository,
        preview: c.get('preview'),
        asksPublished: false,
        settings,
      });
      return visibleNews(list, catalog);
    };
    const version = c.get('preview') ? null : await services.contentVersion.read();
    const key =
      version === null
        ? null
        : validatorOf({ version, settings, build: deps.version, nowSec: deps.now() });
    return c.json({ announcements: await services.news(key, read) } satisfies NewsFeed);
  });
}
