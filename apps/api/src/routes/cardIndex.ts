// The card browser's index of an assessment, and the signature of its thumbnails.
import { Hono } from 'hono';
import { THUMB_PREFIX, cardIndexKey } from '@qv/schema';
import type { ThumbSignature } from '@qv/schema';
import { API_ROUTES as R, AcceptsGzip, CardIndexParams } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { MEDIA_MAX_AGE, apiError } from '../http';
import { cardIndexResponse } from '../services/cardIndex';

export function cardIndexRoutes({ deps, mw }: AppContext) {
  const routes = new Hono<AppEnv>();

  routes.get(R.cardIndex.pattern, mw.session, mw.visibleContent, async (c) => {
    const params = CardIndexParams.safeParse(c.req.param());
    if (!params.success) return c.json(apiError('invalid_index', 'Ese índice no existe.'), 400);
    const { course, assessment, hash } = params.data;
    const object = c.get('hidden').has(course)
      ? null
      : await deps.media.get(cardIndexKey(`${course}/${assessment}`, hash));
    if (!object) {
      return c.json(
        apiError('not_found', 'Las tarjetas de este certamen cambiaron: recarga la página.'),
        404,
      );
    }
    return cardIndexResponse(object, {
      preview: c.get('preview'),
      acceptsGzip: AcceptsGzip.safeParse(c.req.header('Accept-Encoding') ?? '').success,
    });
  });

  routes.get(R.thumbs.pattern, mw.session, async (c) => {
    const { expires, query } = await deps.signer.prefixQuery(THUMB_PREFIX, deps.now());
    c.header('Cache-Control', `private, max-age=${MEDIA_MAX_AGE}`);
    return c.json({ prefix: THUMB_PREFIX, expires, query } satisfies ThumbSignature);
  });

  return routes;
}
