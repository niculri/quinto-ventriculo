// `GET /api/notes/:slug` (a note with its images signed) and `GET /api/search`.
import { Hono } from 'hono';
import { Slug } from '@qv/schema';
import type { Note, SearchResponse } from '@qv/schema';
import { API_ROUTES as R, SearchQuery } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { apiError } from '../http';

export function notesRoutes({ deps, mw }: AppContext) {
  const routes = new Hono<AppEnv>();

  routes.get(R.note.pattern, mw.session, mw.visibleContent, mw.revalidate, async (c) => {
    const slug = Slug.safeParse(c.req.param('slug'));
    if (!slug.success) return c.json(apiError('invalid_slug', 'Ese apunte no existe.'), 400);
    const note = await c.get('repository').note(slug.data);
    if (!note) return c.json(apiError('not_found', 'Ese apunte no existe.'), 404);
    const html = await deps.signer.signHtml(note.html, deps.now());
    return c.json({ ...note, html } satisfies Note);
  });

  routes.get(R.search.pattern, mw.session, mw.visibleContent, mw.revalidate, async (c) => {
    const { q: query, limit } = SearchQuery.parse({
      q: c.req.query('q'),
      limit: c.req.query('limit'),
    });
    const results = query.length < 2 ? [] : await c.get('repository').search(query, limit);
    return c.json({ query, results } satisfies SearchResponse);
  });

  return routes;
}
