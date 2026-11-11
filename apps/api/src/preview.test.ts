// Step 1.7, part 2 (B3 and B4): the preview of the draft and the release panel's endpoints. B3's «Listo cuando»: a
// student with the header gets what is published; only an administrator gets the draft, never kept by the browser.
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { CryptoKey as JoseKey } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CONTENT_SCHEMA_VERSION,
  Catalog,
  PublishResult,
  ReleaseLog,
  ReleaseOverview,
} from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import { supabaseAdminChecker } from './admin';
import { PREVIEW_HEADER, createApp } from './app';
import { MediaSigner } from './media';
import { memoryRepository } from './repositories/memory';
import type { PublishInput, ReleaseRepository } from './repository';
import { supabaseVerifier } from './session';

const SUPABASE = 'https://users.supabase.co';
const ADMIN = 'dueno@ug.uchile.cl';
const FP = 'f'.repeat(32);

const bundle = (title: string): ContentBundle => ({
  semesters: [{ number: 2, name: '2° Semestre' }],
  courses: [
    { id: 'biologia-celular', semester: 2, name: 'Biología celular', emoji: '🧬', position: 1 },
  ],
  assessments: [
    {
      id: 'biologia-celular/certamen-2',
      courseId: 'biologia-celular',
      name: 'Certamen 2',
      position: 2,
    },
  ],
  notes: [
    {
      id: 'AP-BC-C2-11',
      slug: '11-traduccion',
      courseId: 'biologia-celular',
      assessmentId: 'biologia-celular/certamen-2',
      kind: 'lecture',
      title,
      position: 1,
      updatedAt: '2026-10-31T12:00:00.000Z',
      sources: [],
      html: `<p>${title}</p>`,
      toc: [],
      sections: [],
      hash: title,
      media: [],
    },
  ],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
});

const marks: { mark: string; checked: boolean; by: string }[] = [];
/** What publish() and revert() were given (step 1.7, part 3), and what the database would answer next. */
const published: PublishInput[] = [];
const reverted: { id: number; by: string }[] = [];
let refusal: string | null = null;
/** The database's detail of the next refusal (what it names). */
let refusalDetail: string | null = null;
const releases: ReleaseRepository = {
  browseIndexesJson: async () => JSON.stringify([{ assessmentId: 'a/b', op: 'added' }]),
  summaryJson: async () =>
    JSON.stringify({
      fingerprint: FP,
      schemaVersion: 1,
      unpublished: [],
      marks: [],
      catalog: [],
      noteTypes: [],
      presets: [],
      decks: [],
      assessments: [],
      findings: [],
    }),
  itemsJson: async (assessment, kind, after) =>
    JSON.stringify({ items: [{ assessment, kind, after }], next: null }),
  textsJson: async () => JSON.stringify({ items: [], next: null }),
  media: async (after) =>
    after
      ? { keys: [], next: null }
      : { keys: ['cards/hay.webp', 'cards/falta.webp'], next: 'cards/falta.webp' },
  setMark: async (fingerprint, mark, checked, by) => {
    if (fingerprint !== FP) return 'stale';
    marks.push({ mark, checked, by });
    return checked ? [{ mark, checkedBy: by, checkedAt: '2026-11-07T12:00:00.000Z' }] : [];
  },
  publish: async (input) => {
    published.push(input);
    if (refusal) return { ok: false, reason: refusal, detail: refusalDetail };
    return {
      ok: true,
      result: {
        id: 7,
        title: input.title,
        publishedAt: '2026-11-07T12:00:00.000+00:00',
        changes: { notes: { insert: 1, update: 0, delete: 0 } },
      },
    };
  },
  revert: async (id, by) => {
    reverted.push({ id, by });
    if (refusal) return { ok: false, reason: refusal, detail: refusalDetail };
    return { ok: true, result: { id, revertedAt: '2026-11-07T12:05:00.000+00:00', changes: {} } };
  },
  log: async () => ({
    releases: [
      {
        id: 7,
        status: 'published',
        title: 'Biología celular · Certamen 2',
        schemaVersion: 1,
        publishedAt: '2026-11-07T12:00:00.000+00:00',
        publishedBy: ADMIN,
        revertedAt: null,
        revertedBy: null,
        changes: {},
        canRevert: true,
      },
    ],
  }),
};

let privateKey: JoseKey;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
  app = createApp({
    verifier: supabaseVerifier({ supabaseUrl: SUPABASE, keys: createLocalJWKSet({ keys: [jwk] }) }),
    repository: memoryRepository(bundle('Traducción')),
    preview: memoryRepository(bundle('Traducción (borrador)')),
    media: {
      get: async (key) =>
        key === 'cards/hay.webp' ? { body: new Uint8Array([1]), contentType: 'image/webp' } : null,
    },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    releases,
    // The users' database, by its real API: is_admin() with the student's own token.
    admins: supabaseAdminChecker({
      supabaseUrl: SUPABASE,
      publishableKey: 'sb_publishable_x',
      fetch: async (_input, init) => {
        const auth = new Headers(init?.headers).get('Authorization') ?? '';
        const email = JSON.parse(
          atob(auth.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
        ).email;
        return new Response(JSON.stringify(email === ADMIN), { status: 200 });
      },
    }),
  });
});

const token = (email: string) =>
  new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(
      email === ADMIN
        ? '00000000-0000-4000-8000-000000000001'
        : '00000000-0000-4000-8000-000000000002',
    )
    .setIssuer(`${SUPABASE}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

const request = async (
  path: string,
  email: string,
  headers: Record<string, string> = {},
  init: RequestInit = {},
) =>
  app.request(path, {
    ...init,
    headers: { Authorization: `Bearer ${await token(email)}`, ...headers },
  });
const titleOf = async (r: Response) =>
  Catalog.parse(await r.json()).semesters[0]!.courses[0]!.assessments[0]!.notes[0]!.title;

describe('the preview of the draft', () => {
  it('an administrator with the header gets the draft, never kept by the browser', async () => {
    const r = await request('/api/catalog', ADMIN, { [PREVIEW_HEADER]: 'draft' });
    expect(await titleOf(r)).toBe('Traducción (borrador)');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get(PREVIEW_HEADER)).toBe('draft');
    expect(r.headers.get('Vary')).toContain(PREVIEW_HEADER);
    const note = await request('/api/notes/11-traduccion', ADMIN, { [PREVIEW_HEADER]: 'draft' });
    expect(((await note.json()) as { title: string }).title).toBe('Traducción (borrador)');
  });

  it('a student with the header gets what is published (and the browser keeps it apart)', async () => {
    const r = await request('/api/catalog', 'ana@ug.uchile.cl', { [PREVIEW_HEADER]: 'draft' });
    expect(await titleOf(r)).toBe('Traducción');
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=60');
    expect(r.headers.get(PREVIEW_HEADER)).toBeNull();
    expect(r.headers.get('Vary')).toBe(`Authorization, ${PREVIEW_HEADER}`);
    // The header in a cookie, or another value of it: nothing either.
    const cookie = await request('/api/catalog', ADMIN, {
      Cookie: `${PREVIEW_HEADER}=draft; qv-preview=draft`,
    });
    expect(await titleOf(cookie)).toBe('Traducción');
    const other = await request('/api/catalog', ADMIN, { [PREVIEW_HEADER]: '1' });
    expect(await titleOf(other)).toBe('Traducción');
  });

  it('Revisión de cero (1.7, parte 2): an expired token, or one of another project, gets nothing of either', async () => {
    const sign = (o: { issuer?: string; expires?: string | number; key?: JoseKey }) =>
      new SignJWT({ email: ADMIN, role: 'authenticated' })
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setSubject('00000000-0000-4000-8000-000000000001')
        .setIssuer(o.issuer ?? `${SUPABASE}/auth/v1`)
        .setAudience('authenticated')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(o.expires ?? '1h')
        .sign(o.key ?? privateKey);
    const other = (await generateKeyPair('ES256')).privateKey;
    for (const t of [
      await sign({ expires: Math.floor(Date.now() / 1000) - 3600 }),
      await sign({ issuer: 'https://otro.supabase.co/auth/v1' }),
      await sign({ key: other }),
    ]) {
      for (const path of ['/api/catalog', '/api/admin/release']) {
        const r = await app.request(path, {
          headers: { Authorization: `Bearer ${t}`, [PREVIEW_HEADER]: 'draft' },
        });
        expect(r.status, path).toBe(401);
        expect(await r.text()).not.toContain('borrador');
      }
    }
  });

  it('Revisión de cero (1.7, parte 2): whoever stops being an administrator gets what is published within a minute', async () => {
    let admin = true;
    let now = 0;
    const a = createApp({
      verifier: { verify: async () => ({ id: 'u', email: ADMIN }) },
      repository: memoryRepository(bundle('Traducción')),
      preview: memoryRepository(bundle('Traducción (borrador)')),
      releases,
      media: { get: async () => null },
      signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
      admins: supabaseAdminChecker({
        supabaseUrl: SUPABASE,
        publishableKey: 'k',
        now: () => now,
        fetch: async () => new Response(JSON.stringify(admin)),
      }),
    });
    const headers = { Authorization: 'Bearer t', [PREVIEW_HEADER]: 'draft' };
    expect(await titleOf(await a.request('/api/catalog', { headers }))).toBe(
      'Traducción (borrador)',
    );
    admin = false;
    now = 61_000;
    const r = await a.request('/api/catalog', { headers });
    expect(await titleOf(r)).toBe('Traducción');
    const panel = await a.request('/api/admin/release', { headers });
    expect(panel.status).toBe(404);
    // Not kept by the browser either: it would hide the panel a minute after being made an administrator again.
    expect(panel.headers.get('Cache-Control')).toBe('no-store');
  });

  it('without the header, an administrator gets what is published too', async () => {
    expect(await titleOf(await request('/api/catalog', ADMIN))).toBe('Traducción');
  });

  it('the cards that moved come always from what is published (the draft’s numbers are not public’s)', async () => {
    const spy = vi.fn(async () => ({ changes: [], next: 0, latest: 0, more: false }));
    const draftRepo = { ...memoryRepository(bundle('x')), cardChanges: spy };
    const a = createApp({
      verifier: { verify: async () => ({ id: 'u', email: ADMIN }) },
      repository: memoryRepository(bundle('Traducción')),
      preview: draftRepo,
      admins: { isAdmin: async () => true },
      media: { get: async () => null },
      signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    });
    const r = await a.request('/api/anki/card-changes?since=0', {
      headers: { Authorization: 'Bearer t', [PREVIEW_HEADER]: 'draft' },
    });
    expect(r.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });

  it('asks is_admin() with the student’s own token and the public key, and remembers the answer a minute', async () => {
    let calls = 0;
    let now = 0;
    const checker = supabaseAdminChecker({
      supabaseUrl: `${SUPABASE}/`,
      publishableKey: 'sb_publishable_x',
      now: () => now,
      fetch: async (input, init) => {
        calls++;
        expect(String(input)).toBe(`${SUPABASE}/rest/v1/rpc/is_admin`);
        const h = new Headers(init?.headers);
        expect([h.get('apikey'), h.get('Authorization')]).toEqual([
          'sb_publishable_x',
          'Bearer tok',
        ]);
        return new Response('true');
      },
    });
    expect(await checker.isAdmin('tok')).toBe(true);
    expect(await checker.isAdmin('tok')).toBe(true);
    expect(calls).toBe(1);
    now = 61_000;
    await checker.isAdmin('tok');
    expect(calls).toBe(2);
    // A failure is «no», and not remembered.
    const failing = supabaseAdminChecker({
      supabaseUrl: SUPABASE,
      publishableKey: 'k',
      fetch: async () => new Response('{}', { status: 500 }),
    });
    expect(await failing.isAdmin('tok')).toBe(false);
  });
});

describe('the release panel', () => {
  it('the summary, with the content version this Worker understands; no-store', async () => {
    const r = await request('/api/admin/release', ADMIN);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const o = ReleaseOverview.parse(await r.json());
    expect(o.supportedSchemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(o.summary.fingerprint).toBe(FP);
    // Step 3.3: the card browser's indexes the draft changes, which the summary does not describe.
    expect(o.browseIndexes).toEqual([{ assessmentId: 'a/b', op: 'added' }]);
  });

  it('a student gets «no existe» in every endpoint', async () => {
    for (const path of [
      '/api/admin/release',
      '/api/admin/release/items?assessment=biologia-celular/certamen-2&kind=card',
      '/api/admin/release/texts',
      '/api/admin/release/media',
    ]) {
      expect((await request(path, 'ana@ug.uchile.cl')).status, path).toBe(404);
    }
    const put = await request(
      '/api/admin/release/marks',
      'ana@ug.uchile.cl',
      { 'Content-Type': 'application/json' },
      { method: 'PUT', body: JSON.stringify({ fingerprint: FP, mark: 'phone', checked: true }) },
    );
    expect(put.status).toBe(404);
    expect(marks).toEqual([]);
  });

  it('the items of a kind, and odd parameters: 400', async () => {
    const r = await request(
      '/api/admin/release/items?assessment=biologia-celular/certamen-2&kind=card&after=g',
      ADMIN,
    );
    expect(await r.json()).toEqual({
      items: [{ assessment: 'biologia-celular/certamen-2', kind: 'card', after: 'g' }],
      next: null,
    });
    expect((await request('/api/admin/release/items?assessment=x&kind=card', ADMIN)).status).toBe(
      400,
    );
    expect(
      (
        await request(
          '/api/admin/release/items?assessment=biologia-celular/certamen-2&kind=deck',
          ADMIN,
        )
      ).status,
    ).toBe(400);
  });

  it('the new images, and which of them the store does not have', async () => {
    const r = await request('/api/admin/release/media', ADMIN);
    expect(await r.json()).toEqual({
      checked: ['cards/hay.webp', 'cards/falta.webp'],
      missing: ['cards/falta.webp'],
      next: 'cards/falta.webp',
    });
  });

  it('a mark, by who checks it; 409 if the draft changed; 400 for an odd one', async () => {
    const put = (body: unknown) =>
      request(
        '/api/admin/release/marks',
        ADMIN,
        { 'Content-Type': 'application/json' },
        { method: 'PUT', body: JSON.stringify(body) },
      );
    const ok = await put({ fingerprint: FP, mark: 'phone', checked: true });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { marks: unknown[] }).marks).toEqual([
      expect.objectContaining({ mark: 'phone', checkedBy: ADMIN }),
    ]);
    expect(marks.at(-1)).toEqual({ mark: 'phone', checked: true, by: ADMIN });
    const stale = await put({ fingerprint: 'e'.repeat(32), mark: 'phone', checked: true });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: string }).error).toBe('release_changed');
    expect((await put({ fingerprint: FP, mark: 'otra', checked: true })).status).toBe(400);
    expect((await put({ fingerprint: 'x', mark: 'phone', checked: true })).status).toBe(400);
  });

  it('without the users’ public key nobody is an administrator: no preview, no panel', async () => {
    const a = createApp({
      verifier: { verify: async () => ({ id: 'u', email: ADMIN }) },
      repository: memoryRepository(bundle('Traducción')),
      preview: memoryRepository(bundle('Traducción (borrador)')),
      releases,
      media: { get: async () => null },
      signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    });
    const headers = { Authorization: 'Bearer t', [PREVIEW_HEADER]: 'draft' };
    expect(await titleOf(await a.request('/api/catalog', { headers }))).toBe('Traducción');
    expect((await a.request('/api/admin/release', { headers })).status).toBe(404);
  });
});

// Step 1.7, part 3 (B6): publishing and undoing. The database decides (publish_release(), revert_release(): its own
// test, db/tests/publish.test.ts); the Worker checks who asks, passes what this Worker understands and says why not.
describe('publishing and undoing', () => {
  const CHECKS = { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] };
  const post = (path: string, email: string, body: unknown) =>
    request(
      path,
      email,
      { 'Content-Type': 'application/json' },
      { method: 'POST', body: JSON.stringify(body) },
    );

  it('publishes the draft the panel showed, with this Worker’s content version and who asks; no-store', async () => {
    published.length = 0;
    refusal = null;
    const r = await post('/api/admin/release/publish', ADMIN, {
      fingerprint: FP,
      title: '  Biología celular · Certamen 2 ',
      checks: CHECKS,
      // Whatever else the browser sends is not passed on (the Worker decides the version, the marks and who).
      schemaVersion: 99,
      by: 'otro@ug.uchile.cl',
      marks: ['announcement'],
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(PublishResult.parse(await r.json())).toMatchObject({ id: 7 });
    expect(published).toEqual([
      {
        fingerprint: FP,
        title: 'Biología celular · Certamen 2',
        checks: CHECKS,
        schemaVersion: CONTENT_SCHEMA_VERSION,
        marks: [],
        by: ADMIN,
      },
    ]);
  });

  it('says why the database refused: 409 if the draft changed, 422 for the rest', async () => {
    for (const [reason, status, code] of [
      ['fingerprint', 409, 'release_changed'],
      ['marks', 422, 'release_marks'],
      ['blocked', 422, 'release_blocked'],
      ['schema_version', 422, 'release_schema_version'],
      ['unpublished', 422, 'release_unpublished'],
      ['imaios', 422, 'release_imaios'],
      ['empty', 409, 'release_empty'],
      ['drift', 422, 'release_drift'],
      // Revisión de cero (1.7, parte 3): a key that a piece that leaves and one that comes in share.
      ['unique', 422, 'release_unique'],
      ['something new', 400, 'invalid_release'],
    ] as const) {
      refusal = reason;
      const r = await post('/api/admin/release/publish', ADMIN, {
        fingerprint: FP,
        title: 't',
        checks: CHECKS,
      });
      expect(r.status, reason).toBe(status);
      expect(((await r.json()) as { error: string }).error, reason).toBe(code);
    }
    refusal = null;
  });

  it('Revisión de cero (1.7, parte 3): the refusals that name something say what (the docs said so, and it was dropped)', async () => {
    const message = async (path: string, body: unknown) =>
      ((await (await post(path, ADMIN, body)).json()) as { message: string }).message;
    const publishBody = { fingerprint: FP, title: 't', checks: CHECKS };
    refusalDetail = 'notes (notes_slug_key): Key (slug)=(clase-08) already exists.';
    refusal = 'unique';
    expect(await message('/api/admin/release/publish', publishBody)).toMatch(
      /dos pasos.*Detalle: notes \(notes_slug_key\): Key \(slug\)=\(clase-08\)/,
    );
    refusal = 'public_changed';
    refusalDetail = 'taken off after it: note AP-BC-C2-10 (2026-11-07 12:00:00+00)';
    expect(await message('/api/admin/release/revert', { id: 7 })).toMatch(
      /Detalle: taken off after it: note AP-BC-C2-10/,
    );
    // The fixed English sentence of the others is not added.
    refusal = 'fingerprint';
    refusalDetail = 'the draft or what is published changed since the panel showed it';
    expect(await message('/api/admin/release/publish', publishBody)).not.toMatch(/Detalle/);
    refusal = null;
    refusalDetail = null;
  });

  it('an odd body is 400, and the database is not asked', async () => {
    published.length = 0;
    for (const body of [
      null,
      { fingerprint: 'x', title: 't', checks: CHECKS },
      { fingerprint: FP, title: '', checks: CHECKS },
      { fingerprint: FP, title: 't' },
      { fingerprint: FP, title: 't', checks: { ...CHECKS, blocking: -1 } },
    ]) {
      expect((await post('/api/admin/release/publish', ADMIN, body)).status).toBe(400);
    }
    expect(published).toEqual([]);
  });

  it('undoes the last one, by who asks; says why not', async () => {
    reverted.length = 0;
    refusal = null;
    const ok = await post('/api/admin/release/revert', ADMIN, { id: 7 });
    expect(ok.status).toBe(200);
    expect(reverted).toEqual([{ id: 7, by: ADMIN }]);
    for (const [reason, code] of [
      ['not_last', 'release_not_last'],
      ['reverted', 'release_reverted'],
      // Revisión de cero (1.7, parte 3): a migration after it.
      ['migrated', 'release_migrated'],
      ['public_changed', 'release_public_changed'],
    ] as const) {
      refusal = reason;
      const r = await post('/api/admin/release/revert', ADMIN, { id: 7 });
      expect(r.status, reason).toBe(409);
      expect(((await r.json()) as { error: string }).error).toBe(code);
    }
    refusal = null;
    expect((await post('/api/admin/release/revert', ADMIN, { id: 'x' })).status).toBe(400);
  });

  it('the log, no-store', async () => {
    const r = await request('/api/admin/releases', ADMIN);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(ReleaseLog.parse(await r.json()).releases.map((x) => x.id)).toEqual([7]);
  });

  it('a student gets «no existe», and nothing is published nor undone', async () => {
    published.length = 0;
    reverted.length = 0;
    const student = 'ana@ug.uchile.cl';
    expect(
      (
        await post('/api/admin/release/publish', student, {
          fingerprint: FP,
          title: 't',
          checks: CHECKS,
        })
      ).status,
    ).toBe(404);
    expect((await post('/api/admin/release/revert', student, { id: 7 })).status).toBe(404);
    expect((await request('/api/admin/releases', student)).status).toBe(404);
    expect(published).toEqual([]);
    expect(reverted).toEqual([]);
  });
});
