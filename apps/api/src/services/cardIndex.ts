// The card browser's index as the store keeps it, gzipped, answered to a browser that takes it and decompressed to one
// that does not.
import { PREVIEW_HEADER, PREVIEW_VALUE } from '@qv/schema/http';
import { MEDIA_MAX_AGE } from '../http';
import type { MediaObject } from '../ports/media';

export function cardIndexResponse(
  object: MediaObject,
  options: { preview: boolean; acceptsGzip: boolean },
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': options.preview ? 'no-store' : `private, max-age=${MEDIA_MAX_AGE}`,
    Vary: `Authorization, ${PREVIEW_HEADER}, Accept-Encoding`,
    'X-Content-Type-Options': 'nosniff',
  });
  if (options.preview) headers.set(PREVIEW_HEADER, PREVIEW_VALUE);
  if (object.etag) headers.set('ETag', object.etag);
  const body =
    object.body instanceof ReadableStream
      ? object.body
      : new Response(object.body as BodyInit).body;
  if (!body) throw new Error('The index has no body');
  if (options.acceptsGzip) {
    headers.set('Content-Encoding', 'gzip');
    // Without `encodeBody: 'manual'`, Cloudflare would compress the already gzipped body again.
    return new Response(body, { headers, encodeBody: 'manual' });
  }
  return new Response(body.pipeThrough(new DecompressionStream('gzip')), { headers });
}
