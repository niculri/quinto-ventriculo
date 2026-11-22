// The HTTP API under /api: session, content reads, signed media, usage counts and the administration routes.
// It does not depend on Cloudflare: it runs the same on the Worker, in Node and in tests.
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import {
  CONTENT_SCHEMA_VERSION,
  DeckId,
  PublishRequest,
  QuizId,
  QuizSectionId,
  RevertRequest,
  SiteSettingsUpdate,
  Slug,
  THUMB_PREFIX,
  cardIndexKey,
} from '@qv/schema';
import type {
  CardChanges,
  CardDetail,
  Catalog,
  Note,
  PublishResult,
  QuizDetail,
  QuizIndex,
  ReleaseLog,
  ReleaseMarks,
  ReleaseMediaPage,
  RevertResult,
  SearchResponse,
  SiteSettings,
  SiteSettingsView,
  ThumbSignature,
  UnpublishedLog,
  UsageOpenAck,
  UsageReport,
} from '@qv/schema';
import {
  API_PREFIX,
  API_ROUTES as R,
  AcceptsGzip,
  CardChangesQuery,
  CardIndexParams,
  CardParams,
  MediaKey,
  MediaQuery,
  PREVIEW_HEADER,
  PREVIEW_VALUE,
  QuizzesQuery,
  ReleaseItemsQuery,
  ReleaseMarkRequest,
  ReleasePageQuery,
  SearchQuery,
  UsageOpenBody,
  markAdminOnly,
  siteSemesters,
  withoutEmptySemesters,
} from '@qv/schema/http';
import type { ErrorCode, Health } from '@qv/schema/http';
import { resolveDependencies } from './dependencies';
import type { AppOptions } from './dependencies';
import type { AppEnv } from './env';
import { JSON_TYPE, MEDIA_MAX_AGE, apiError } from './http';
import { requireAdmin as adminOnly } from './middleware/admin';
import { requireSession } from './middleware/session';
import { asksPublished, readRepository } from './middleware/preview';
import { visibleContent as visibleContentOf } from './middleware/visible-content';
import { clientErrorBodyLimit, clientErrorHandler } from './routes/client-error';
import { isValidKey } from './services/media-signer';
import { siteSettingsReader } from './services/site-settings';
import { usageGroups, usageReport } from './services/usage-report';
import type { DeepHealthResult } from './ports/health';
import type { User } from './ports/session';
import type { UsageEvent } from './ports/usage';

type Refusal = { status: 400 | 409 | 422; code: ErrorCode; message: string; named?: boolean };

const PUBLISH_REFUSALS: Record<string, Refusal> = {
  fingerprint: {
    status: 409,
    code: 'release_changed',
    message: 'El borrador o lo publicado cambió: revisa de nuevo lo que trae.',
  },
  marks: {
    status: 422,
    code: 'release_marks',
    message: 'Faltan las marcas a mano de este borrador.',
  },
  blocked: {
    status: 422,
    code: 'release_blocked',
    message: 'La lista de revisión tiene reglas que impiden publicar.',
  },
  schema_version: {
    status: 422,
    code: 'release_schema_version',
    message:
      'El borrador es de otra versión que la que entiende el sitio en línea: despliega el sitio o sube de nuevo el borrador.',
  },
  unpublished: {
    status: 422,
    code: 'release_unpublished',
    message: 'El borrador trae algo que está fuera del sitio (content/unpublished.json).',
    named: true,
  },
  imaios: {
    status: 422,
    code: 'release_imaios',
    message: 'El borrador trae imágenes de IMAIOS, que no se publican.',
    named: true,
  },
  unique: {
    status: 422,
    code: 'release_unique',
    message:
      'Una pieza que entra usa el slug o el código de otra que sale o cambia: publícalo en dos pasos (primero el borrador sin la que entra; después, con ella).',
    named: true,
  },
  empty: { status: 409, code: 'release_empty', message: 'El borrador es igual a lo publicado.' },
  drift: {
    status: 422,
    code: 'release_drift',
    message: 'El borrador no tiene la forma de lo publicado: falta rehacerlo tras una migración.',
    named: true,
  },
  invalid: { status: 400, code: 'invalid_release', message: 'Esa publicación no es válida.' },
};

const REVERT_REFUSALS: Record<string, Refusal> = {
  not_last: {
    status: 409,
    code: 'release_not_last',
    message: 'Ya no es la última publicación: recarga la página.',
  },
  reverted: { status: 409, code: 'release_reverted', message: 'Esa publicación ya se deshizo.' },
  migrated: {
    status: 409,
    code: 'release_migrated',
    message:
      'Después de esa publicación hubo una migración de la base: ya no se puede deshacer. Arréglalo publicando otra vez desde el borrador.',
  },
  public_changed: {
    status: 409,
    code: 'release_public_changed',
    message:
      'Lo publicado cambió después de esa publicación (por ejemplo, se despublicó algo): deshacerla volvería a poner lo que se sacó. Arréglalo publicando otra vez desde el borrador.',
    named: true,
  },
  invalid: { status: 400, code: 'invalid_release', message: 'Esa publicación no existe.' },
};

const refusalMessage = (refusal: Refusal, detail: string | null) =>
  refusal.named && detail ? `${refusal.message} Detalle: ${detail.slice(0, 500)}` : refusal.message;

export function createApp(options: AppOptions) {
  const deps = resolveDependencies(options);
  const now = deps.now;
  const app = new Hono<AppEnv>().basePath(API_PREFIX);

  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));

  app.onError((err, c) => {
    console.error(err);
    return c.json(apiError('internal', 'Algo salió mal. Intenta de nuevo en un rato.'), 500);
  });
  app.notFound((c) => c.json(apiError('not_found', 'No existe esa ruta.'), 404));

  const session = requireSession(deps);
  const siteSettings = siteSettingsReader(deps);
  const visibleContent = visibleContentOf(siteSettings);
  const requireAdmin = adminOnly(deps, deps.configured.releases);
  const requireSettingsAdmin = adminOnly(deps, deps.configured.settings);
  const requireUnpublishedAdmin = adminOnly(deps, deps.configured.unpublished);
  const requireUsageAdmin = adminOnly(deps, deps.configured.usageStats);

  /** Only `POST /usage/open` calls it: the content GETs are also made by other pages, and cached. */
  const track = (preview: boolean, event: UsageEvent) => {
    if (!deps.configured.usageEvents || preview) return;
    try {
      deps.usageEvents.record(event);
    } catch (e) {
      console.error(e);
    }
  };

  app.get(R.health.pattern, (c) =>
    c.json((deps.version ? { ok: true, version: deps.version } : { ok: true }) satisfies Health),
  );

  if (deps.configured.deepHealth) {
    app.get(R.deepHealth.pattern, async (c) => {
      const result = await deps.deepHealth.run();
      c.header('Cache-Control', 'no-store');
      return c.json(
        { ok: result.ok, checks: result.checks } satisfies DeepHealthResult,
        result.ok ? 200 : 503,
      );
    });
  }

  app.get(R.me.pattern, session, (c) => c.json(c.get('user') satisfies User));

  app.get(R.catalog.pattern, session, visibleContent, async (c) => {
    if (asksPublished(c)) return c.json(await deps.repository.catalog());
    if (c.get('preview')) {
      const [draft, published] = await Promise.all([
        c.get('repository').catalog(),
        deps.repository.catalog(),
      ]);
      return c.json(markAdminOnly(draft, published, c.get('settings')) satisfies Catalog);
    }
    const catalog = await c.get('repository').catalog();
    return c.json(
      (c.get('settings').hideEmptySemesters
        ? withoutEmptySemesters(catalog)
        : catalog) satisfies Catalog,
    );
  });

  app.get(R.note.pattern, session, visibleContent, async (c) => {
    const slug = Slug.safeParse(c.req.param('slug'));
    if (!slug.success) return c.json(apiError('invalid_slug', 'Ese apunte no existe.'), 400);
    const note = await c.get('repository').note(slug.data);
    if (!note) return c.json(apiError('not_found', 'Ese apunte no existe.'), 404);
    const html = await deps.signer.signHtml(note.html, now());
    return c.json({ ...note, html } satisfies Note);
  });

  app.get(R.search.pattern, session, visibleContent, async (c) => {
    const { q: query, limit } = SearchQuery.parse({
      q: c.req.query('q'),
      limit: c.req.query('limit'),
    });
    const results = query.length < 2 ? [] : await c.get('repository').search(query, limit);
    return c.json({ query, results } satisfies SearchResponse);
  });

  // Passed through unparsed (the web validates it): from the root it is every card, too big to parse in a Worker.
  app.get(R.deck.pattern, session, visibleContent, async (c) => {
    const id = DeckId.safeParse(c.req.param('id'));
    if (!id.success) return c.json(apiError('invalid_deck', 'Ese mazo no existe.'), 400);
    const repository = readRepository(deps, c);
    const deck = await repository.deckJson(id.data);
    if (deck === null) return c.json(apiError('not_found', 'Ese mazo no existe.'), 404);
    return c.body(deck, 200, JSON_TYPE);
  });

  app.get(R.cardIndex.pattern, session, visibleContent, async (c) => {
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
    const preview = c.get('preview');
    const headers = new Headers({
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': preview ? 'no-store' : `private, max-age=${MEDIA_MAX_AGE}`,
      Vary: `Authorization, ${PREVIEW_HEADER}, Accept-Encoding`,
      'X-Content-Type-Options': 'nosniff',
    });
    if (preview) headers.set(PREVIEW_HEADER, PREVIEW_VALUE);
    if (object.etag) headers.set('ETag', object.etag);
    const body =
      object.body instanceof ReadableStream
        ? object.body
        : new Response(object.body as BodyInit).body!;
    if (AcceptsGzip.safeParse(c.req.header('Accept-Encoding') ?? '').success) {
      headers.set('Content-Encoding', 'gzip');
      // Without `encodeBody: 'manual'`, Cloudflare would compress the already gzipped body again.
      return new Response(body, { headers, encodeBody: 'manual' });
    }
    return new Response(body.pipeThrough(new DecompressionStream('gzip')), { headers });
  });

  app.get(R.thumbs.pattern, session, async (c) => {
    const { expires, query } = await deps.signer.prefixQuery(THUMB_PREFIX, now());
    c.header('Cache-Control', `private, max-age=${MEDIA_MAX_AGE}`);
    return c.json({ prefix: THUMB_PREFIX, expires, query } satisfies ThumbSignature);
  });

  app.get(R.cardChanges.pattern, session, async (c) => {
    const query = CardChangesQuery.safeParse({ since: c.req.query('since') ?? '0' });
    if (!query.success) {
      return c.json(apiError('invalid_since', 'Ese punto de partida no existe.'), 400);
    }
    // Always the published changes, also in the preview: the draft numbers its own from the same point, so they would
    // move the student's cursor past changes the site has not made yet.
    return c.json(
      (await deps.repository.cardChanges(Number(query.data.since), 2000)) satisfies CardChanges,
    );
  });

  // Anki's guid is base91 and may have «/», «%» or «?»: the web sends it with encodeURIComponent.
  app.get(R.card.pattern, session, visibleContent, async (c) => {
    const params = CardParams.safeParse(c.req.param());
    if (!params.success) return c.json(apiError('invalid_card', 'Esa tarjeta no existe.'), 400);
    const repository = readRepository(deps, c);
    const card = await repository.card(params.data.noteGuid, Number(params.data.ord));
    if (!card) return c.json(apiError('not_found', 'Esa tarjeta no existe.'), 404);
    const [front, back] = await Promise.all([
      deps.signer.signHtml(card.front, now()),
      deps.signer.signHtml(card.back, now()),
    ]);
    return c.json({ ...card, front, back } satisfies CardDetail);
  });

  app.get(R.quizzes.pattern, session, visibleContent, async (c) => {
    const { course, assessment } = QuizzesQuery.parse({
      course: c.req.query('course'),
      assessment: c.req.query('assessment'),
    });
    const quizzes = (await c.get('repository').quizzes())
      .filter(
        (q) => (!course || q.courseId === course) && (!assessment || q.assessmentId === assessment),
      )
      .sort((a, b) => a.courseId.localeCompare(b.courseId) || a.position - b.position);
    return c.json({ quizzes } satisfies QuizIndex);
  });

  app.get(R.quiz.pattern, session, visibleContent, async (c) => {
    const id = QuizId.safeParse(c.req.param('id'));
    if (!id.success) return c.json(apiError('invalid_quiz', 'Ese test no existe.'), 400);
    const repository = readRepository(deps, c);
    const quiz = await repository.quiz(id.data);
    if (!quiz) return c.json(apiError('not_found', 'Ese test no existe.'), 404);
    return c.json(quiz satisfies QuizDetail);
  });

  // Not parsed (about a megabyte with its SVG figures): the photos are signed on the text.
  app.get(R.quizSection.pattern, session, visibleContent, async (c) => {
    const id = QuizId.safeParse(c.req.param('id'));
    const section = QuizSectionId.safeParse(c.req.param('sectionId'));
    if (!id.success || !section.success) {
      return c.json(apiError('invalid_quiz', 'Esa sección del test no existe.'), 400);
    }
    const repository = readRepository(deps, c);
    const body = await repository.quizSectionJson(id.data, section.data);
    if (body === null) return c.json(apiError('not_found', 'Esa sección del test no existe.'), 404);
    const text = typeof body === 'string' ? body : await new Response(body).text();
    return c.body(await deps.signer.signJsonMedia(text, now()), 200, JSON_TYPE);
  });

  app.get(R.siteSettings.pattern, session, requireSettingsAdmin, async (c) => {
    const [settings, catalog] = await Promise.all([deps.settings.get(), deps.repository.catalog()]);
    return c.json({
      ...settings,
      semesters: siteSemesters(catalog, new Set(settings.hiddenCourses)),
    } satisfies SiteSettingsView);
  });

  app.put(R.setSiteSettings.pattern, session, requireSettingsAdmin, async (c) => {
    const body = SiteSettingsUpdate.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_settings', 'Esos ajustes no son válidos.'), 400);
    }
    const { hiddenCourses } = body.data;
    if (hiddenCourses) {
      // A course that is already off stays valid even if it left the catalog: the panel sends the whole list back.
      const known = new Set([
        ...(await deps.repository.courses()).map((course) => course.id),
        ...(await deps.settings.get()).hiddenCourses,
      ]);
      if (!hiddenCourses.every((id) => known.has(id))) {
        return c.json(apiError('invalid_settings', 'Ese ramo no existe.'), 400);
      }
    }
    const saved = await deps.settings.set({ ...body.data, by: c.get('user').email });
    siteSettings.forget();
    return c.json(saved satisfies SiteSettings);
  });

  // At most 40 images are asked to the store: each is a subrequest, and a Worker has a limit of them.
  app.get(R.unpublished.pattern, session, requireUnpublishedAdmin, async (c) => {
    const log = await deps.unpublished.log();
    const keys = [
      ...new Set(log.entries.filter((e) => e.kind === 'image').map((e) => e.itemId)),
    ].slice(0, 40);
    const there = new Map<string, boolean | null>();
    for (const key of keys) {
      let onSite: boolean | null;
      try {
        onSite = !isValidKey(key)
          ? false
          : deps.media.has
            ? await deps.media.has(key)
            : await deps.media.get(key).then((o) => o !== null);
      } catch {
        onSite = null;
      }
      there.set(key, onSite);
    }
    return c.json({
      ...log,
      entries: log.entries.map((e) =>
        e.kind === 'image' ? { ...e, onSite: there.get(e.itemId) ?? null } : e,
      ),
    } satisfies UnpublishedLog);
  });

  // Only published ids are counted, so no text sent by a student ever goes into a point.
  let publishedKept: { until: number; ids: Map<string, string | null> } | null = null;
  const published = async (): Promise<Map<string, string | null>> => {
    const t = now();
    if (publishedKept && publishedKept.until > t) return publishedKept.ids;
    const catalog = await deps.repository.catalog();
    const ids = new Map<string, string | null>();
    for (const s of catalog.semesters) {
      for (const course of s.courses) {
        for (const a of course.assessments) {
          for (const n of a.notes) ids.set(`note:${n.slug}`, course.id);
          for (const q of a.quizzes) ids.set(`quiz:${q.id}`, course.id);
        }
      }
    }
    for (const d of catalog.anki.decks) ids.set(`deck:${d.id}`, d.courseId);
    publishedKept = { until: t + 300, ids };
    return ids;
  };

  // `now` is in seconds; the budget counts minutes in milliseconds.
  app.post(
    R.clientError.pattern,
    clientErrorBodyLimit,
    clientErrorHandler(deps.clientErrors, () => now() * 1000),
  );

  app.post(R.usageOpen.pattern, session, visibleContent, async (c) => {
    c.header('Cache-Control', 'no-store');
    const open = UsageOpenBody.safeParse(await c.req.text().catch(() => ''));
    if (!open.success) return c.json(apiError('invalid_open', 'Eso no se puede contar.'), 400);
    const o = open.data;
    if (!deps.configured.usageEvents || c.get('preview'))
      return c.json({ ok: true as const } satisfies UsageOpenAck);
    if (o.kind !== 'search') {
      let known: Map<string, string | null>;
      try {
        known = await published();
      } catch (e) {
        console.error(e);
        return c.json(
          apiError('usage_unavailable', 'No se pudo contar. Intenta de nuevo en un rato.'),
          503,
        );
      }
      const key = `${o.kind}:${o.id}`;
      const course = known.get(key);
      if (course === undefined || (course !== null && c.get('hidden').has(course))) {
        return c.json(apiError('not_found', 'Eso no está publicado.'), 404);
      }
    }
    track(
      c.get('preview'),
      o.kind === 'search'
        ? { kind: 'search', path: '/api/search', context: o.from }
        : {
            kind: o.kind,
            path: `/api/${o.kind === 'note' ? 'notes' : o.kind === 'deck' ? 'decks' : 'quizzes'}/${o.id}`,
          },
    );
    return c.json({ ok: true as const } satisfies UsageOpenAck);
  });

  let usageKept: { until: number; report: UsageReport } | null = null;
  app.get(R.usage.pattern, session, requireUsageAdmin, async (c) => {
    const t = now();
    if (usageKept && usageKept.until > t) return c.json(usageKept.report satisfies UsageReport);
    const catalog = await deps.repository.catalog();
    const readOpens = async () => {
      if (!deps.configured.usageOpens) return { status: 'not_configured' as const };
      try {
        return { status: 'ok' as const, counts: await deps.usageOpens.read() };
      } catch (e) {
        console.error(e);
        return { status: 'unavailable' as const };
      }
    };
    const readErrors = async () => {
      if (!deps.configured.clientErrorsReader) return null;
      try {
        return await deps.clientErrorsReader.read();
      } catch (e) {
        console.error(e);
        return null;
      }
    };
    const [statsResult, opens, clientErrors] = await Promise.all([
      deps.usageStats.stats(c.get('token'), usageGroups(catalog)).then(
        (s) => ({ ok: true as const, s }),
        (e: unknown) => ({ ok: false as const, e }),
      ),
      readOpens(),
      readErrors(),
    ]);
    if (!statsResult.ok) {
      console.error(statsResult.e);
      return c.json(
        apiError(
          'usage_unavailable',
          'No se pudieron leer las cifras de uso. Intenta de nuevo en un rato.',
        ),
        503,
      );
    }
    const report = usageReport(statsResult.s, opens, clientErrors);
    usageKept = { until: t + deps.usageTtl, report };
    return c.json(report satisfies UsageReport);
  });

  app.get(R.release.pattern, session, requireAdmin, async (c) => {
    const [summary, indexes] = await Promise.all([
      deps.releases.summaryJson(),
      deps.releases.browseIndexesJson(),
    ]);
    const text = typeof summary === 'string' ? summary : await new Response(summary).text();
    const indexText = typeof indexes === 'string' ? indexes : await new Response(indexes).text();
    return c.body(
      `{"supportedSchemaVersion":${CONTENT_SCHEMA_VERSION},"summary":${text},"browseIndexes":${indexText}}`,
      200,
      JSON_TYPE,
    );
  });

  app.get(R.releaseItems.pattern, session, requireAdmin, async (c) => {
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

  app.get(R.releaseTexts.pattern, session, requireAdmin, async (c) => {
    const query = ReleasePageQuery.safeParse({ after: c.req.query('after') });
    if (!query.success) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    return c.body(await deps.releases.textsJson(query.data.after ?? null), 200, JSON_TYPE);
  });

  app.get(R.releaseMedia.pattern, session, requireAdmin, async (c) => {
    const query = ReleasePageQuery.safeParse({ after: c.req.query('after') });
    if (!query.success) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    const page = await deps.releases.media(query.data.after ?? null, 40);
    // All at once: one after another, 40 lookups took about 6 s a page in production (the runtime queues what is over
    // its limit of simultaneous connections).
    const there = await Promise.all(
      page.keys.map((key) =>
        !isValidKey(key)
          ? false
          : deps.media.has
            ? deps.media.has(key)
            : deps.media.get(key).then((o) => o !== null),
      ),
    );
    const missing = page.keys.filter((_, i) => !there[i]);
    return c.json({ checked: page.keys, missing, next: page.next } satisfies ReleaseMediaPage);
  });

  app.put(R.releaseMarks.pattern, session, requireAdmin, async (c) => {
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
  app.post(R.publishRelease.pattern, session, requireAdmin, async (c) => {
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
    const refusal = PUBLISH_REFUSALS[r.reason] ?? PUBLISH_REFUSALS.invalid!;
    return c.json(apiError(refusal.code, refusalMessage(refusal, r.detail)), refusal.status);
  });

  app.post(R.revertRelease.pattern, session, requireAdmin, async (c) => {
    const body = RevertRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_release', 'Esa publicación no existe.'), 400);
    }
    const r = await deps.releases.revert(body.data.id, c.get('user').email);
    if (r.ok) return c.json(r.result satisfies RevertResult);
    const refusal = REVERT_REFUSALS[r.reason] ?? REVERT_REFUSALS.invalid!;
    return c.json(apiError(refusal.code, refusalMessage(refusal, r.detail)), refusal.status);
  });

  app.get(R.releaseLog.pattern, session, requireAdmin, async (c) => {
    return c.json((await deps.releases.log()) satisfies ReleaseLog);
  });

  // No session: the URL signature authorizes it.
  app.get(R.media.pattern, async (c) => {
    const parsed = MediaKey.safeParse(c.req.param('key'));
    if (!parsed.success) return c.json(apiError('invalid_key', 'Imagen inválida.'), 400);
    const key = parsed.data;
    const {
      e: expires,
      s: signature,
      p: prefix,
    } = MediaQuery.parse({ e: c.req.query('e'), s: c.req.query('s'), p: c.req.query('p') });
    const valid =
      prefix === undefined
        ? await deps.signer.isValid(key, expires, signature, now())
        : await deps.signer.isValidPrefix(key, prefix, expires, signature, now());
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
      'Cache-Control': `private, max-age=${Math.max(0, Math.min(MEDIA_MAX_AGE, expires - now()))}, immutable`,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (object.etag) headers.set('ETag', object.etag);
    return new Response(object.body as BodyInit, { headers });
  });

  return app;
}
