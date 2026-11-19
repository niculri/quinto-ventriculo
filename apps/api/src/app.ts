// The HTTP API under /api: session, content reads, signed media, usage counts and the administration routes.
// It does not depend on Cloudflare: it runs the same on the Worker, in Node and in tests.
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { secureHeaders } from 'hono/secure-headers';
import {
  CONTENT_SCHEMA_VERSION,
  DeckId,
  PublishRequest,
  QuizId,
  QuizSectionId,
  RevertRequest,
  SiteSettingsUpdate,
  CONTACT_EMAIL,
  Slug,
  THUMB_PREFIX,
  cardIndexKey,
  withoutEmptySemesters,
} from '@qv/schema';
import type {
  ApiError,
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
  PreviewRequest,
  QuizzesQuery,
  ReleaseItemsQuery,
  ReleaseMarkRequest,
  ReleasePageQuery,
  SearchQuery,
  UsageOpenBody,
} from '@qv/schema/http';
import type { ErrorCode, Health } from '@qv/schema/http';
import type { AccessChecker } from './access';
import type { AdminChecker } from './admin';
import type { DeepHealth, DeepHealthResult } from './health';
import { isValidKey } from './media';
import type { MediaStore, MediaSigner } from './media';
import type {
  ContentRepository,
  ReleaseRepository,
  SiteSettingsRepository,
  UnpublishedRepository,
} from './repository';
import { tokenFromHeader } from './session';
import type { User, SessionVerifier } from './session';
import { clientErrorBodyLimit, clientErrorHandler } from './client-errors';
import type { ClientErrorRecorder, ClientErrorsReader } from './client-errors';
import { usageGroups, usageReport } from './usage';
import type { UsageEvent, UsageOpensReader, UsageRecorder, UsageStatsSource } from './usage';

export interface Dependencies {
  verifier: SessionVerifier;
  repository: ContentRepository;
  media: MediaStore;
  signer: MediaSigner;
  now?: () => number;
  preview?: ContentRepository;
  /** Without it (tests, the local demo), a valid token of the domain is enough. */
  access?: AccessChecker;
  admins?: AdminChecker;
  releases?: ReleaseRepository;
  settings?: SiteSettingsRepository;
  unpublished?: UnpublishedRepository;
  version?: string;
  usageStats?: UsageStatsSource;
  usageOpens?: UsageOpensReader | null;
  usageEvents?: UsageRecorder;
  usageTtl?: number;
  /** Without it the errors are answered and not kept. */
  clientErrors?: ClientErrorRecorder;
  clientErrorsReader?: ClientErrorsReader | null;
  deepHealth?: DeepHealth;
}

type AppEnv = { Variables: { user: User; token: string; repository: ContentRepository } };

const apiError = (code: ErrorCode, message: string): ApiError => ({ error: code, message });
const JSON_TYPE = { 'Content-Type': 'application/json; charset=UTF-8' };
/** Short, so that an image taken off the site stops showing soon. */
const MEDIA_MAX_AGE = 600;

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

export function createApp(deps: Dependencies) {
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const app = new Hono<AppEnv>().basePath(API_PREFIX);

  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin' }));

  app.onError((err, c) => {
    console.error(err);
    return c.json(apiError('internal', 'Algo salió mal. Intenta de nuevo en un rato.'), 500);
  });
  app.notFound((c) => c.json(apiError('not_found', 'No existe esa ruta.'), 404));

  const requireSession = createMiddleware<AppEnv>(async (c, next) => {
    const token = tokenFromHeader(c.req.header('Authorization'));
    const user = token ? await deps.verifier.verify(token) : null;
    if (!user) {
      return c.json(
        apiError('unauthenticated', 'Entra con tu cuenta @ug.uchile.cl para ver esto.'),
        401,
      );
    }
    if (deps.access) {
      const access = await deps.access.check(token!);
      if (access !== 'allowed') {
        c.header('Cache-Control', 'no-store');
        if (access === 'expired') {
          return c.json(
            apiError('unauthenticated', 'Entra con tu cuenta @ug.uchile.cl para ver esto.'),
            401,
          );
        }
        if (access === 'signed_out') {
          return c.json(
            apiError(
              'unauthenticated',
              'Tu sesión se cerró, por ejemplo porque saliste en otro dispositivo. Sal y vuelve a entrar con tu cuenta @ug.uchile.cl.',
            ),
            401,
          );
        }
        if (access === 'not_accepted') {
          return c.json(
            apiError(
              'terms_not_accepted',
              'Para ver el material, acepta los términos de uso y la política de privacidad.',
            ),
            403,
          );
        }
        if (access === 'denied') {
          return c.json(
            apiError(
              'not_invited',
              `Tu cuenta no tiene acceso a El Quinto Ventrículo. Si deberías tenerlo, escribe a ${CONTACT_EMAIL}.`,
            ),
            403,
          );
        }
        return c.json(
          apiError(
            'access_unavailable',
            'No se pudo comprobar tu acceso. Intenta de nuevo en un rato.',
          ),
          503,
        );
      }
    }
    c.set('user', user);
    c.set('token', token!);
    // The preview header is part of the cache key, so a cached answer of the draft never stands for the published one.
    c.header('Vary', `Authorization, ${PREVIEW_HEADER}`);
    let repository = deps.repository;
    if (
      PreviewRequest.safeParse(c.req.header(PREVIEW_HEADER)).success &&
      deps.preview &&
      deps.admins &&
      (await deps.admins.isAdmin(token!))
    ) {
      repository = deps.preview;
      c.header('Cache-Control', 'no-store');
      c.header(PREVIEW_HEADER, PREVIEW_VALUE);
    } else {
      c.header('Cache-Control', 'private, max-age=60');
    }
    c.set('repository', repository);
    await next();
  });

  /** Anybody else gets a 404: the panel's routes do not exist for them. */
  const adminOnly = (ready: () => boolean) =>
    createMiddleware<AppEnv>(async (c, next) => {
      // Never cached: a cached 404 would hide the panel from someone just made an administrator.
      c.header('Cache-Control', 'no-store');
      const token = c.get('token');
      if (!ready() || !deps.admins || !(await deps.admins.isAdmin(token))) {
        return c.json(apiError('not_found', 'No existe esa ruta.'), 404);
      }
      // A write asks the database again instead of the remembered answer: a removed administrator changes nothing.
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        const stillAdmin = deps.admins.isAdminNow
          ? await deps.admins.isAdminNow(token)
          : await deps.admins.isAdmin(token);
        if (stillAdmin === null) {
          return c.json(
            apiError(
              'admin_unavailable',
              'No se pudo comprobar que sigues siendo administrador. Intenta de nuevo en un rato.',
            ),
            503,
          );
        }
        if (!stillAdmin) {
          return c.json(
            apiError('admin_only', 'Ya no eres administrador. Recarga la página.'),
            403,
          );
        }
      }
      await next();
    });
  const requireAdmin = adminOnly(() => !!deps.releases);
  const requireSettingsAdmin = adminOnly(() => !!deps.settings);
  const requireUnpublishedAdmin = adminOnly(() => !!deps.unpublished);
  const requireUsageAdmin = adminOnly(() => !!deps.usageStats);

  /** Only `POST /usage/open` calls it: the content GETs are also made by other pages, and cached. */
  const track = (repository: ContentRepository, event: UsageEvent) => {
    if (!deps.usageEvents || repository !== deps.repository) return;
    try {
      deps.usageEvents.record(event);
    } catch (e) {
      console.error(e);
    }
  };

  /** Fails open: an empty semester shown is better than a site without catalog. */
  const settingsOrDefault = async () => {
    if (!deps.settings) return null;
    try {
      return await deps.settings.get();
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  app.get(R.health.pattern, (c) =>
    c.json((deps.version ? { ok: true, version: deps.version } : { ok: true }) satisfies Health),
  );

  if (deps.deepHealth) {
    const deep = deps.deepHealth;
    app.get(R.deepHealth.pattern, async (c) => {
      const result = await deep.run();
      c.header('Cache-Control', 'no-store');
      return c.json(
        { ok: result.ok, checks: result.checks } satisfies DeepHealthResult,
        result.ok ? 200 : 503,
      );
    });
  }

  app.get(R.me.pattern, requireSession, (c) => c.json(c.get('user') satisfies User));

  app.get(R.catalog.pattern, requireSession, async (c) => {
    const [catalog, settings] = await Promise.all([
      c.get('repository').catalog(),
      settingsOrDefault(),
    ]);
    return c.json(
      (settings?.hideEmptySemesters ? withoutEmptySemesters(catalog) : catalog) satisfies Catalog,
    );
  });

  app.get(R.note.pattern, requireSession, async (c) => {
    const slug = Slug.safeParse(c.req.param('slug'));
    if (!slug.success) return c.json(apiError('invalid_slug', 'Ese apunte no existe.'), 400);
    const note = await c.get('repository').note(slug.data);
    if (!note) return c.json(apiError('not_found', 'Ese apunte no existe.'), 404);
    const html = await deps.signer.signHtml(note.html, now());
    return c.json({ ...note, html } satisfies Note);
  });

  app.get(R.search.pattern, requireSession, async (c) => {
    const { q: query, limit } = SearchQuery.parse({
      q: c.req.query('q'),
      limit: c.req.query('limit'),
    });
    const results = query.length < 2 ? [] : await c.get('repository').search(query, limit);
    return c.json({ query, results } satisfies SearchResponse);
  });

  // Passed through unparsed (the web validates it): from the root it is every card, too big to parse in a Worker.
  app.get(R.deck.pattern, requireSession, async (c) => {
    const id = DeckId.safeParse(c.req.param('id'));
    if (!id.success) return c.json(apiError('invalid_deck', 'Ese mazo no existe.'), 400);
    const deck = await c.get('repository').deckJson(id.data);
    if (deck === null) return c.json(apiError('not_found', 'Ese mazo no existe.'), 404);
    return c.body(deck, 200, JSON_TYPE);
  });

  app.get(R.ankiNotes.pattern, requireSession, async (c) => {
    return c.body(await c.get('repository').browseJson(), 200, JSON_TYPE);
  });

  app.get(R.cardIndex.pattern, requireSession, async (c) => {
    const params = CardIndexParams.safeParse(c.req.param());
    if (!params.success) return c.json(apiError('invalid_index', 'Ese índice no existe.'), 400);
    const { course, assessment, hash } = params.data;
    const object = await deps.media.get(cardIndexKey(`${course}/${assessment}`, hash));
    if (!object) {
      return c.json(
        apiError('not_found', 'Las tarjetas de este certamen cambiaron: recarga la página.'),
        404,
      );
    }
    const preview = c.get('repository') !== deps.repository;
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
      return new Response(body, { headers, encodeBody: 'manual' } as ResponseInit);
    }
    return new Response(body.pipeThrough(new DecompressionStream('gzip')), { headers });
  });

  app.get(R.thumbs.pattern, requireSession, async (c) => {
    const { expires, query } = await deps.signer.prefixQuery(THUMB_PREFIX, now());
    c.header('Cache-Control', `private, max-age=${MEDIA_MAX_AGE}`);
    return c.json({ prefix: THUMB_PREFIX, expires, query } satisfies ThumbSignature);
  });

  app.get(R.cardChanges.pattern, requireSession, async (c) => {
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
  app.get(R.card.pattern, requireSession, async (c) => {
    const params = CardParams.safeParse(c.req.param());
    if (!params.success) return c.json(apiError('invalid_card', 'Esa tarjeta no existe.'), 400);
    const card = await c.get('repository').card(params.data.noteGuid, Number(params.data.ord));
    if (!card) return c.json(apiError('not_found', 'Esa tarjeta no existe.'), 404);
    const [front, back] = await Promise.all([
      deps.signer.signHtml(card.front, now()),
      deps.signer.signHtml(card.back, now()),
    ]);
    return c.json({ ...card, front, back } satisfies CardDetail);
  });

  app.get(R.quizzes.pattern, requireSession, async (c) => {
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

  app.get(R.quiz.pattern, requireSession, async (c) => {
    const id = QuizId.safeParse(c.req.param('id'));
    if (!id.success) return c.json(apiError('invalid_quiz', 'Ese test no existe.'), 400);
    const quiz = await c.get('repository').quiz(id.data);
    if (!quiz) return c.json(apiError('not_found', 'Ese test no existe.'), 404);
    return c.json(quiz satisfies QuizDetail);
  });

  // Not parsed (about a megabyte with its SVG figures): the photos are signed on the text.
  app.get(R.quizSection.pattern, requireSession, async (c) => {
    const id = QuizId.safeParse(c.req.param('id'));
    const section = QuizSectionId.safeParse(c.req.param('sectionId'));
    if (!id.success || !section.success) {
      return c.json(apiError('invalid_quiz', 'Esa sección del test no existe.'), 400);
    }
    const body = await c.get('repository').quizSectionJson(id.data, section.data);
    if (body === null) return c.json(apiError('not_found', 'Esa sección del test no existe.'), 404);
    const text = typeof body === 'string' ? body : await new Response(body).text();
    return c.body(await deps.signer.signJsonMedia(text, now()), 200, JSON_TYPE);
  });

  app.get(R.siteSettings.pattern, requireSession, requireSettingsAdmin, async (c) => {
    return c.json((await deps.settings!.get()) satisfies SiteSettings);
  });

  app.put(R.setSiteSettings.pattern, requireSession, requireSettingsAdmin, async (c) => {
    const body = SiteSettingsUpdate.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_settings', 'Esos ajustes no son válidos.'), 400);
    }
    const saved = await deps.settings!.set({ ...body.data, by: c.get('user').email });
    return c.json(saved satisfies SiteSettings);
  });

  // At most 40 images are asked to the store: each is a subrequest, and a Worker has a limit of them.
  app.get(R.unpublished.pattern, requireSession, requireUnpublishedAdmin, async (c) => {
    const log = await deps.unpublished!.log();
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
  let publishedKept: { until: number; ids: Set<string> } | null = null;
  const published = async (): Promise<Set<string>> => {
    const t = now();
    if (publishedKept && publishedKept.until > t) return publishedKept.ids;
    const catalog = await deps.repository.catalog();
    const ids = new Set<string>();
    for (const s of catalog.semesters) {
      for (const course of s.courses) {
        for (const a of course.assessments) {
          for (const n of a.notes) ids.add(`note:${n.slug}`);
          for (const q of a.quizzes) ids.add(`quiz:${q.id}`);
        }
      }
    }
    for (const d of catalog.anki.decks) ids.add(`deck:${d.id}`);
    publishedKept = { until: t + 300, ids };
    return ids;
  };

  // `now` is in seconds; the budget counts minutes in milliseconds.
  app.post(
    R.clientError.pattern,
    clientErrorBodyLimit,
    clientErrorHandler(deps.clientErrors, () => now() * 1000),
  );

  app.post(R.usageOpen.pattern, requireSession, async (c) => {
    c.header('Cache-Control', 'no-store');
    const open = UsageOpenBody.safeParse(await c.req.text().catch(() => ''));
    if (!open.success) return c.json(apiError('invalid_open', 'Eso no se puede contar.'), 400);
    const o = open.data;
    if (!deps.usageEvents || c.get('repository') !== deps.repository)
      return c.json({ ok: true as const } satisfies UsageOpenAck);
    if (o.kind !== 'search') {
      let known: Set<string>;
      try {
        known = await published();
      } catch (e) {
        console.error(e);
        return c.json(
          apiError('usage_unavailable', 'No se pudo contar. Intenta de nuevo en un rato.'),
          503,
        );
      }
      if (!known.has(`${o.kind}:${o.id}`)) {
        return c.json(apiError('not_found', 'Eso no está publicado.'), 404);
      }
    }
    track(
      c.get('repository'),
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
  app.get(R.usage.pattern, requireSession, requireUsageAdmin, async (c) => {
    const t = now();
    if (usageKept && usageKept.until > t) return c.json(usageKept.report satisfies UsageReport);
    const catalog = await deps.repository.catalog();
    const readOpens = async () => {
      if (!deps.usageOpens) return { status: 'not_configured' as const };
      try {
        return { status: 'ok' as const, counts: await deps.usageOpens.read() };
      } catch (e) {
        console.error(e);
        return { status: 'unavailable' as const };
      }
    };
    const readErrors = async () => {
      if (!deps.clientErrorsReader) return null;
      try {
        return await deps.clientErrorsReader.read();
      } catch (e) {
        console.error(e);
        return null;
      }
    };
    const [statsResult, opens, clientErrors] = await Promise.all([
      deps.usageStats!.stats(c.get('token'), usageGroups(catalog)).then(
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
    usageKept = { until: t + (deps.usageTtl ?? 60), report };
    return c.json(report satisfies UsageReport);
  });

  app.get(R.release.pattern, requireSession, requireAdmin, async (c) => {
    const [summary, indexes] = await Promise.all([
      deps.releases!.summaryJson(),
      deps.releases!.browseIndexesJson(),
    ]);
    const text = typeof summary === 'string' ? summary : await new Response(summary).text();
    const indexText = typeof indexes === 'string' ? indexes : await new Response(indexes).text();
    return c.body(
      `{"supportedSchemaVersion":${CONTENT_SCHEMA_VERSION},"summary":${text},"browseIndexes":${indexText}}`,
      200,
      JSON_TYPE,
    );
  });

  app.get(R.releaseItems.pattern, requireSession, requireAdmin, async (c) => {
    const query = ReleaseItemsQuery.safeParse({
      kind: c.req.query('kind'),
      assessment: c.req.query('assessment'),
      after: c.req.query('after'),
    });
    if (!query.success) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    const { assessment, kind, after } = query.data;
    return c.body(await deps.releases!.itemsJson(assessment, kind, after ?? null), 200, JSON_TYPE);
  });

  app.get(R.releaseTexts.pattern, requireSession, requireAdmin, async (c) => {
    const query = ReleasePageQuery.safeParse({ after: c.req.query('after') });
    if (!query.success) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    return c.body(await deps.releases!.textsJson(query.data.after ?? null), 200, JSON_TYPE);
  });

  app.get(R.releaseMedia.pattern, requireSession, requireAdmin, async (c) => {
    const query = ReleasePageQuery.safeParse({ after: c.req.query('after') });
    if (!query.success) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    const page = await deps.releases!.media(query.data.after ?? null, 40);
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

  app.put(R.releaseMarks.pattern, requireSession, requireAdmin, async (c) => {
    const body = ReleaseMarkRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json(apiError('invalid_mark', 'Esa marca no existe.'), 400);
    const { fingerprint, mark, checked } = body.data;
    const marks = await deps.releases!.setMark(fingerprint, mark, checked, c.get('user').email);
    if (marks === 'stale') {
      return c.json(
        apiError('release_changed', 'El borrador cambió: revisa de nuevo lo que trae.'),
        409,
      );
    }
    return c.json({ marks } satisfies ReleaseMarks);
  });

  // The database checks again the fingerprint, the marks, the content version and the review list, in one transaction.
  app.post(R.publishRelease.pattern, requireSession, requireAdmin, async (c) => {
    const body = PublishRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_release', 'Esa publicación no es válida.'), 400);
    }
    const r = await deps.releases!.publish({
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

  app.post(R.revertRelease.pattern, requireSession, requireAdmin, async (c) => {
    const body = RevertRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_release', 'Esa publicación no existe.'), 400);
    }
    const r = await deps.releases!.revert(body.data.id, c.get('user').email);
    if (r.ok) return c.json(r.result satisfies RevertResult);
    const refusal = REVERT_REFUSALS[r.reason] ?? REVERT_REFUSALS.invalid!;
    return c.json(apiError(refusal.code, refusalMessage(refusal, r.detail)), refusal.status);
  });

  app.get(R.releaseLog.pattern, requireSession, requireAdmin, async (c) => {
    return c.json((await deps.releases!.log()) satisfies ReleaseLog);
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
