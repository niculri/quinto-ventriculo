// `GET /api/media/:key`: a private image, with no session: the signature in the URL authorizes it.
import { Hono } from 'hono';
import { API_ROUTES as R, MediaKey, MediaQuery } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { MEDIA_MAX_AGE, apiError } from '../http';

export function mediaRoutes({ deps }: AppContext) {
  return new Hono<AppEnv>().get(R.media.pattern, async (c) => {
    const parsed = MediaKey.safeParse(c.req.param('key'));
    if (!parsed.success) return c.json(apiError('invalid_key', 'Imagen inválida.'), 400);
    const key = parsed.data;
    const {
      e: expires,
      s: signature,
      p: prefix,
    } = MediaQuery.parse({ e: c.req.query('e'), s: c.req.query('s'), p: c.req.query('p') });
    const now = deps.now();
    const valid = await (prefix === undefined
      ? deps.signer.isValid(key, expires, signature, now)
      : deps.signer.isValidPrefix(key, prefix, expires, signature, now));
    if (!valid) {
      return c.json(
        apiError('link_expired', 'El enlace de la imagen venció: recarga la página.'),
        403,
      );
    }
    const object = await deps.media.get(key);
    if (!object) return c.json(apiError('not_found', 'No existe esa imagen.'), 404);
    const headers = new Headers({
      'Content-Type': object.contentType,
      'Cache-Control': `private, max-age=${Math.max(0, Math.min(MEDIA_MAX_AGE, expires - deps.now()))}, immutable`,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (object.etag) headers.set('ETag', object.etag);
    return new Response(object.body as BodyInit, { headers });
  });
}
