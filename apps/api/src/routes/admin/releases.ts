// The panel's «Publicaciones»: the draft's summary, its items, marks, publishing and undoing.
import { Hono } from 'hono';
import { CONTENT_SCHEMA_VERSION, PublishRequest, RevertRequest } from '@qv/schema';
import type {
  PublishResult,
  ReleaseLog,
  ReleaseMarks,
  ReleaseMediaPage,
  RevertResult,
} from '@qv/schema';
import {
  API_ROUTES as R,
  ReleaseItemsQuery,
  ReleaseMarkRequest,
  ReleasePageQuery,
} from '@qv/schema/http';
import type { AppContext } from '../../context';
import type { AppEnv } from '../../env';
import { JSON_TYPE, apiError } from '../../http';
import { isOnSite } from '../../services/mediaPresence';
import { publishRefusal, revertRefusal } from '../../services/releases';

/** Images asked to the store for each page of the new ones. */
const MEDIA_PAGE = 40;

const text = async (body: string | ReadableStream<Uint8Array>) =>
  typeof body === 'string' ? body : new Response(body).text();

export function releasesRoutes({ deps, mw }: AppContext) {
  const routes = new Hono<AppEnv>();
  const panel = [mw.session, mw.releasesAdmin] as const;

  routes.get(R.release.pattern, ...panel, async (c) => {
    const [summary, indexes] = await Promise.all([
      deps.releases.summaryJson(),
      deps.releases.browseIndexesJson(),
    ]);
    const summaryText = await text(summary);
    const indexText = await text(indexes);
    return c.body(
      `{"supportedSchemaVersion":${CONTENT_SCHEMA_VERSION},"summary":${summaryText},"browseIndexes":${indexText}}`,
      200,
      JSON_TYPE,
    );
  });

  routes.get(R.releaseItems.pattern, ...panel, async (c) => {
    const query = ReleaseItemsQuery.safeParse({
      kind: c.req.query('kind'),
      assessment: c.req.query('assessment'),
      after: c.req.query('after'),
    });
    if (!query.success) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    const { assessment, kind, after } = query.data;
    return c.body(await deps.releases.itemsJson(assessment, kind, after ?? null), 200, JSON_TYPE);
  });

  routes.get(R.releaseTexts.pattern, ...panel, async (c) => {
    const query = ReleasePageQuery.safeParse({ after: c.req.query('after') });
    if (!query.success) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    return c.body(await deps.releases.textsJson(query.data.after ?? null), 200, JSON_TYPE);
  });

  routes.get(R.releaseMedia.pattern, ...panel, async (c) => {
    const query = ReleasePageQuery.safeParse({ after: c.req.query('after') });
    if (!query.success) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    const page = await deps.releases.media(query.data.after ?? null, MEDIA_PAGE);
    // All at once: one after another, 40 lookups took about 6 s a page in production (the runtime queues what is over
    // its limit of simultaneous connections).
    const there = await Promise.all(page.keys.map((key) => isOnSite(deps.media, key)));
    const missing = page.keys.filter((_, i) => !there[i]);
    return c.json({ checked: page.keys, missing, next: page.next } satisfies ReleaseMediaPage);
  });

  routes.put(R.releaseMarks.pattern, ...panel, async (c) => {
    const body = ReleaseMarkRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(apiError('invalid_mark', 'Esa marca no existe.'), 400);
    const { fingerprint, mark, checked } = body.data;
    const marks = await deps.releases.setMark(fingerprint, mark, checked, c.get('user').email);
    if (marks === 'stale') {
      return c.json(
        apiError('release_changed', 'El borrador cambió: revisa de nuevo lo que trae.'),
        409,
      );
    }
    return c.json({ marks } satisfies ReleaseMarks);
  });

  // The database checks again the fingerprint, the marks, the content version and the review list, in one transaction.
  routes.post(R.publishRelease.pattern, ...panel, async (c) => {
    const body = PublishRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_release', 'Esa publicación no es válida.'), 400);
    }
    const r = await deps.releases.publish({
      ...body.data,
      schemaVersion: CONTENT_SCHEMA_VERSION,
      // The only mark sent here is the announcement's, and there are no announcements yet.
      marks: [],
      by: c.get('user').email,
    });
    if (r.ok) return c.json(r.result satisfies PublishResult);
    const refusal = publishRefusal(r.reason, r.detail);
    return c.json(refusal.body, refusal.status);
  });

  routes.post(R.revertRelease.pattern, ...panel, async (c) => {
    const body = RevertRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_release', 'Esa publicación no existe.'), 400);
    }
    const r = await deps.releases.revert(body.data.id, c.get('user').email);
    if (r.ok) return c.json(r.result satisfies RevertResult);
    const refusal = revertRefusal(r.reason, r.detail);
    return c.json(refusal.body, refusal.status);
  });

  routes.get(R.releaseLog.pattern, ...panel, async (c) =>
    c.json((await deps.releases.log()) satisfies ReleaseLog),
  );

  return routes;
}
