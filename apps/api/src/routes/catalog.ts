// `GET /api/catalog`: semesters, courses, assessments, notes, tests and the Anki deck tree.
import { Hono } from 'hono';
import type { Catalog } from '@qv/schema';
import { API_ROUTES as R } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { asksPublished } from '../middleware/preview';
import { catalogFor } from '../services/catalog';

export function catalogRoutes({ deps, mw }: AppContext) {
  return new Hono<AppEnv>().get(R.catalog.pattern, mw.session, mw.visibleContent, async (c) => {
    const catalog = await catalogFor({
      repository: c.get('repository'),
      published: deps.repository,
      preview: c.get('preview'),
      asksPublished: asksPublished(c),
      settings: c.get('settings'),
    });
    return c.json(catalog satisfies Catalog);
  });
}
