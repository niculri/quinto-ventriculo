import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { secureHeaders } from 'hono/secure-headers';
import {
  CONTENT_SCHEMA_VERSION,
  DeckId,
  NoteGuid,
  PublishRequest,
  QuizId,
  QuizSectionId,
  ReleaseItemKind,
  ReleaseMarkId,
  RevertRequest,
  SiteSettingsUpdate,
  CONTACT_EMAIL,
  Slug,
  withoutEmptySemesters,
} from '@qv/schema';
import type {
  ApiError,
  CardDetail,
  Catalog,
  Note,
  QuizDetail,
  QuizIndex,
  SearchResponse,
  SiteSettings,
  UnpublishedLog,
} from '@qv/schema';
import type { AccessChecker } from './access';
import type { AdminChecker } from './admin';
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

export interface Dependencies {
  verifier: SessionVerifier;
  repository: ContentRepository;
  media: MediaStore;
  signer: MediaSigner;
  /** Seconds since 1970. Injected in tests. */
  now?: () => number;
  /**
   * The draft (step 1.7): the same reads on the `draft` schema. Only an administrator who asks for it
   * (`X-QV-Preview: draft`) gets it; anybody else gets what is published.
   */
  preview?: ContentRepository;
  /**
   * Whether a session is still invited (step 2.1; the users' database decides, access.ts). The production Worker
   * always has it; without it (tests, the local demo), a valid token of the domain is enough.
   */
  access?: AccessChecker;
  /** Who is an administrator (the users' database decides). Without it, nobody is. */
  admins?: AdminChecker;
  /** The release panel's reads (only for an administrator). */
  releases?: ReleaseRepository;
  /**
   * How the site is shown (step 1.8): the semesters without material hidden. Without it, nothing is hidden and the
   * panel's switch does not exist.
   */
  settings?: SiteSettingsRepository;
  /**
   * What was taken off the site (step 1.5), for «Fuera del sitio» in the administration panel (step 2.10), only to
   * look at. Without it, the route does not exist (404).
   */
  unpublished?: UnpublishedRepository;
  /**
   * The id of the Worker version that answers (Cloudflare's version metadata binding), shown by `/api/health` so
   * that the smoke test (step 1.9) can tell which version is live, for example after a rollback. Nothing else.
   */
  version?: string;
}

type AppEnv = { Variables: { user: User; token: string; repository: ContentRepository } };

/** The request header of the preview, and its only value. */
export const PREVIEW_HEADER = 'X-QV-Preview';
export const PREVIEW_VALUE = 'draft';

const apiError = (code: string, message: string): ApiError => ({ error: code, message });
const JSON_TYPE = { 'Content-Type': 'application/json; charset=UTF-8' };
/** Seconds a browser keeps an image (docs/arquitectura.md, «Despublicar»). */
const MEDIA_MAX_AGE = 600;

/**
 * `named`: the database's detail names what stops it (the piece, the key, what was taken off): it goes after the
 * message, for the owner (Revisión de cero, 1.7, parte 3: the docs said the panel names them, and it did not).
 */
type Refusal = { status: 400 | 409 | 422; code: string; message: string; named?: boolean };

/** What the panel says when the database refuses to publish (`publish_release: <reason>`). */
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
  // Revisión de cero (1.7, parte 3): a slug or a code that goes from a piece that leaves or changes to one that comes
  // in (publishing writes what is new first): the database refused it with a duplicate key, as a 500 without a word.
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

/** What the panel says when the database refuses to undo (`revert_release: <reason>`). */
const REVERT_REFUSALS: Record<string, Refusal> = {
  not_last: {
    status: 409,
    code: 'release_not_last',
    message: 'Ya no es la última publicación: recarga la página.',
  },
  reverted: { status: 409, code: 'release_reverted', message: 'Esa publicación ya se deshizo.' },
  // Revisión de cero (1.7, parte 3): its «before» does not have what a later migration put (a new column would be
  // left empty).
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

/** API under `/api`. It does not depend on Cloudflare: it runs the same on the Worker, in Node (development) and in tests. */
export function createApp(deps: Dependencies) {
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const app = new Hono<AppEnv>().basePath('/api');

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
        // Still invited, but the session of the token is closed (signed out on another device: supabase-js closes
        // them all). Revisión de cero (2.1): it got the 403 «no tiene acceso» of a removed student.
        if (access === 'signed_out') {
          return c.json(
            apiError(
              'unauthenticated',
              'Tu sesión se cerró, por ejemplo porque saliste en otro dispositivo. Sal y vuelve a entrar con tu cuenta @ug.uchile.cl.',
            ),
            401,
          );
        }
        // Step 2.3: the web shows its popup with this code; accepting lets the next request through at once (the
        // answer is never remembered).
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
    // The browser keeps an answer a minute; the preview's must never be the one it gives to the published site (nor
    // the other way round): the header is part of the key, and the preview is not kept.
    c.header('Vary', `Authorization, ${PREVIEW_HEADER}`);
    let repository = deps.repository;
    if (
      c.req.header(PREVIEW_HEADER) === PREVIEW_VALUE &&
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

  /**
   * Only for an administrator, and only if the API has what the route needs (`ready`): anybody else gets «no existe»
   * (the panel's URL does not exist for them).
   */
  const adminOnly = (ready: () => boolean) =>
    createMiddleware<AppEnv>(async (c, next) => {
      // Revisión de cero (1.7, parte 2): never kept, also the «no existe» (a minute of a 404 kept by the browser would
      // hide the panel from someone just made an administrator, or after a failed is_admin()).
      c.header('Cache-Control', 'no-store');
      if (!ready() || !deps.admins || !(await deps.admins.isAdmin(c.get('token')))) {
        return c.json(apiError('not_found', 'No existe esa ruta.'), 404);
      }
      await next();
    });
  const requireAdmin = adminOnly(() => !!deps.releases);
  const requireSettingsAdmin = adminOnly(() => !!deps.settings);
  const requireUnpublishedAdmin = adminOnly(() => !!deps.unpublished);

  /**
   * The site's settings, for the catalog. If they cannot be read (a Worker deployed before its migration, a failure),
   * nothing is hidden: an empty semester shown is better than a site without catalog.
   */
  const settingsOrDefault = async () => {
    if (!deps.settings) return null;
    try {
      return await deps.settings.get();
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // Without a session and without anything of the material: only that the Worker answers, and which version it is.
  app.get('/health', (c) =>
    c.json(deps.version ? { ok: true, version: deps.version } : { ok: true }),
  );

  app.get('/me', requireSession, (c) => c.json(c.get('user')));

  // The semesters without material are hidden when the administrator says so (step 1.8), for everybody (the
  // administrator sees the site as a student). In the preview, «without material» is about the draft: what the site
  // will look like once it is published.
  app.get('/catalog', requireSession, async (c) => {
    const [catalog, settings] = await Promise.all([
      c.get('repository').catalog(),
      settingsOrDefault(),
    ]);
    return c.json(
      (settings?.hideEmptySemesters ? withoutEmptySemesters(catalog) : catalog) satisfies Catalog,
    );
  });

  app.get('/notes/:slug', requireSession, async (c) => {
    const slug = Slug.safeParse(c.req.param('slug'));
    if (!slug.success) return c.json(apiError('invalid_slug', 'Ese apunte no existe.'), 400);
    const note = await c.get('repository').note(slug.data);
    if (!note) return c.json(apiError('not_found', 'Ese apunte no existe.'), 404);
    const html = await deps.signer.signHtml(note.html, now());
    return c.json({ ...note, html } satisfies Note);
  });

  app.get('/search', requireSession, async (c) => {
    const query = (c.req.query('q') ?? '').trim().slice(0, 200);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10) || 20),
    );
    const results = query.length < 2 ? [] : await c.get('repository').search(query, limit);
    return c.json({ query, results } satisfies SearchResponse);
  });

  // A DeckDetail. From the root it is every card of the collection: it goes as the database wrote it,
  // without parsing it here (the web validates it).
  app.get('/decks/:id', requireSession, async (c) => {
    const id = DeckId.safeParse(c.req.param('id'));
    if (!id.success) return c.json(apiError('invalid_deck', 'Ese mazo no existe.'), 400);
    const deck = await c.get('repository').deckJson(id.data);
    if (deck === null) return c.json(apiError('not_found', 'Ese mazo no existe.'), 404);
    return c.body(deck, 200, JSON_TYPE);
  });

  // Every note, light, as BrowseData (the browser searches them in the browser; the HTML of a card comes one
  // by one). Several MB with tens of thousands of notes: passed through as it comes, like a deck.
  app.get('/anki/notes', requireSession, async (c) => {
    return c.body(await c.get('repository').browseJson(), 200, JSON_TYPE);
  });

  // The cards that moved to another deck or were taken out after a change (a page of at most 2,000): the web
  // takes them to the student's progress when they enter.
  app.get('/anki/card-changes', requireSession, async (c) => {
    const since = c.req.query('since') ?? '0';
    if (!/^\d{1,15}$/.test(since)) {
      return c.json(apiError('invalid_since', 'Ese punto de partida no existe.'), 400);
    }
    // Always what is published, also in the preview: the draft numbers its changes from the same point as public
    // (reset_draft() copies them), so its numbers would move the student's cursor (reconcile_cards()) to changes
    // public has not made yet. The web does not ask for them in the preview either.
    return c.json(await deps.repository.cardChanges(Number(since), 2000));
  });

  // The guid is Anki's (base91: it may have «/», «%», «?»…): the web sends it with encodeURIComponent.
  app.get('/cards/:noteGuid/:ord', requireSession, async (c) => {
    const guid = NoteGuid.safeParse(c.req.param('noteGuid'));
    const ord = c.req.param('ord');
    if (!guid.success || !/^\d{1,4}$/.test(ord)) {
      return c.json(apiError('invalid_card', 'Esa tarjeta no existe.'), 400);
    }
    const card = await c.get('repository').card(guid.data, Number(ord));
    if (!card) return c.json(apiError('not_found', 'Esa tarjeta no existe.'), 404);
    const [front, back] = await Promise.all([
      deps.signer.signHtml(card.front, now()),
      deps.signer.signHtml(card.back, now()),
    ]);
    return c.json({ ...card, front, back } satisfies CardDetail);
  });

  // Practice tests. The index of a course or an assessment (the catalog has them too).
  app.get('/quizzes', requireSession, async (c) => {
    const course = c.req.query('course');
    const assessment = c.req.query('assessment');
    const quizzes = (await c.get('repository').quizzes())
      .filter(
        (q) => (!course || q.courseId === course) && (!assessment || q.assessmentId === assessment),
      )
      .sort((a, b) => a.courseId.localeCompare(b.courseId) || a.position - b.position);
    return c.json({ quizzes } satisfies QuizIndex);
  });

  // A test, by its id: its sections (tabs) and groups, without the questions (they come by section).
  app.get('/quizzes/:id', requireSession, async (c) => {
    const id = QuizId.safeParse(c.req.param('id'));
    if (!id.success) return c.json(apiError('invalid_quiz', 'Ese test no existe.'), 400);
    const quiz = await c.get('repository').quiz(id.data);
    if (!quiz) return c.json(apiError('not_found', 'Ese test no existe.'), 404);
    return c.json(quiz satisfies QuizDetail);
  });

  // The questions of a section, by group, with a signed URL for each photo. It is not parsed (about a
  // megabyte with its SVG figures): the images are signed on the text (the web validates it).
  app.get('/quizzes/:id/sections/:sectionId', requireSession, async (c) => {
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

  // ── The site's settings (step 1.8), only for an administrator: they change at once, without the draft ──

  app.get('/admin/site-settings', requireSession, requireSettingsAdmin, async (c) => {
    return c.json((await deps.settings!.get()) satisfies SiteSettings);
  });

  app.put('/admin/site-settings', requireSession, requireSettingsAdmin, async (c) => {
    const body = SiteSettingsUpdate.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_settings', 'Esos ajustes no son válidos.'), 400);
    }
    const saved = await deps.settings!.set({ ...body.data, by: c.get('user').email });
    return c.json(saved satisfies SiteSettings);
  });

  // ── What was taken off the site (step 2.10), only for an administrator and only to look at ──

  // The record of `npm run unpublish`, newest first. Whether an image is on the site again is what the image store
  // says (at most 40 asked: each one is a request to the store, and a Worker has a limit of them; the rest stay null).
  // Revisión de cero (2.10): a failure of the store is «no se pudo saber» (null) for that image, not a page without the
  // record.
  app.get('/admin/unpublished', requireSession, requireUnpublishedAdmin, async (c) => {
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

  // ── Releases (step 1.7, part 2): what the draft changes and its review list, only for an administrator ──

  // The summary and the content version this Worker understands (a draft of a newer one cannot be published). The
  // summary goes as the database wrote it.
  app.get('/admin/release', requireSession, requireAdmin, async (c) => {
    const summary = await deps.releases!.summaryJson();
    const text = typeof summary === 'string' ? summary : await new Response(summary).text();
    return c.body(
      `{"supportedSchemaVersion":${CONTENT_SCHEMA_VERSION},"summary":${text}}`,
      200,
      JSON_TYPE,
    );
  });

  // A page of the changes of one kind of one assessment, with their before and after.
  app.get('/admin/release/items', requireSession, requireAdmin, async (c) => {
    const kind = ReleaseItemKind.safeParse(c.req.query('kind'));
    const assessment = c.req.query('assessment') ?? '';
    const after = c.req.query('after') ?? null;
    if (
      !kind.success ||
      !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(assessment) ||
      (after?.length ?? 0) > 200
    ) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    return c.body(await deps.releases!.itemsJson(assessment, kind.data, after), 200, JSON_TYPE);
  });

  // A page of the texts the draft adds or changes, for the process and calendar phrases.
  app.get('/admin/release/texts', requireSession, requireAdmin, async (c) => {
    const after = c.req.query('after') ?? null;
    if ((after?.length ?? 0) > 300) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    return c.body(await deps.releases!.textsJson(after), 200, JSON_TYPE);
  });

  // A page of the new images, and which of them the image store does not have (at most 40 a request: each one is a
  // request to the store, and a Worker has a limit of them).
  app.get('/admin/release/media', requireSession, requireAdmin, async (c) => {
    const after = c.req.query('after') ?? null;
    if ((after?.length ?? 0) > 300) {
      return c.json(apiError('invalid_release', 'Esa parte de la publicación no existe.'), 400);
    }
    const page = await deps.releases!.media(after, 40);
    const missing: string[] = [];
    for (const key of page.keys) {
      const there = !isValidKey(key)
        ? false
        : deps.media.has
          ? await deps.media.has(key)
          : await deps.media.get(key).then((o) => o !== null);
      if (!there) missing.push(key);
    }
    return c.json({ checked: page.keys, missing, next: page.next });
  });

  // A mark by hand of the review list, for the draft the panel showed (its fingerprint): 409 if it changed.
  app.put('/admin/release/marks', requireSession, requireAdmin, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      fingerprint?: unknown;
      mark?: unknown;
      checked?: unknown;
    } | null;
    const mark = ReleaseMarkId.safeParse(body?.mark);
    if (
      !mark.success ||
      typeof body?.fingerprint !== 'string' ||
      !/^[0-9a-f]{32}$/.test(body.fingerprint) ||
      typeof body.checked !== 'boolean'
    ) {
      return c.json(apiError('invalid_mark', 'Esa marca no existe.'), 400);
    }
    const marks = await deps.releases!.setMark(
      body.fingerprint,
      mark.data,
      body.checked,
      c.get('user').email,
    );
    if (marks === 'stale') {
      return c.json(
        apiError('release_changed', 'El borrador cambió: revisa de nuevo lo que trae.'),
        409,
      );
    }
    return c.json({ marks });
  });

  // ── Publishing and undoing (step 1.7, part 3), only for an administrator ──

  // The draft the panel showed (its fingerprint) goes to what is published, in one transaction of the database, which
  // checks again the fingerprint, the marks by hand, the content version this Worker understands and what it can see
  // of the review list. The panel sends the review list it built (`checks`), and it stays with the publication.
  app.post('/admin/release/publish', requireSession, requireAdmin, async (c) => {
    const body = PublishRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_release', 'Esa publicación no es válida.'), 400);
    }
    const r = await deps.releases!.publish({
      ...body.data,
      schemaVersion: CONTENT_SCHEMA_VERSION,
      // The announcement's mark comes with the announcements (step C1).
      marks: [],
      by: c.get('user').email,
    });
    if (r.ok) return c.json(r.result);
    const refusal = PUBLISH_REFUSALS[r.reason] ?? PUBLISH_REFUSALS.invalid!;
    return c.json(apiError(refusal.code, refusalMessage(refusal, r.detail)), refusal.status);
  });

  // Undoes the last publication (the one the panel showed as such).
  app.post('/admin/release/revert', requireSession, requireAdmin, async (c) => {
    const body = RevertRequest.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json(apiError('invalid_release', 'Esa publicación no existe.'), 400);
    }
    const r = await deps.releases!.revert(body.data.id, c.get('user').email);
    if (r.ok) return c.json(r.result);
    const refusal = REVERT_REFUSALS[r.reason] ?? REVERT_REFUSALS.invalid!;
    return c.json(apiError(refusal.code, refusalMessage(refusal, r.detail)), refusal.status);
  });

  // The publications, newest first.
  app.get('/admin/releases', requireSession, requireAdmin, async (c) => {
    return c.json(await deps.releases!.log());
  });

  // No session header: the URL signature authorizes it (see media.ts).
  app.get('/media/:key{.+}', async (c) => {
    const key = c.req.param('key');
    if (!isValidKey(key)) return c.json(apiError('invalid_key', 'Imagen inválida.'), 400);
    const expires = Number(c.req.query('e'));
    const signature = c.req.query('s') ?? '';
    if (!(await deps.signer.isValid(key, expires, signature, now()))) {
      return c.json(
        apiError('link_expired', 'El enlace de la imagen venció: recarga la página.'),
        403,
      );
    }
    const object = await deps.media.get(key);
    if (!object) return c.json(apiError('not_found', 'No existe esa imagen.'), 404);
    const headers = new Headers({
      'Content-Type': object.contentType,
      // The key changes if the image changes; at most 10 minutes (and never past the signature), so that an image taken
      // off the site (step 1.5) stops showing soon.
      'Cache-Control': `private, max-age=${Math.max(0, Math.min(MEDIA_MAX_AGE, expires - now()))}, immutable`,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (object.etag) headers.set('ETag', object.etag);
    return new Response(object.body as BodyInit, { headers });
  });

  return app;
}
