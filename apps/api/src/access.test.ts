// Step 2.1: removing someone cuts the content of the Worker, not when their token expires. The users' database is the
// real one (every migration, in PGlite) and the fetch plays PostgREST: it runs `access_status()` as the token's user.
import { SignJWT, createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair } from 'jose';
import type { CryptoKey as JoseKey } from 'jose';
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONTACT_EMAIL, LEGAL_VERSIONS } from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import { asUser, createDatabase } from '../../../db/tests/pglite';
import { ACCESS_TTL, accessUnavailable, supabaseAccessChecker } from './access';
import { createApp } from './app';
import { MediaSigner } from './media';
import { memoryRepository } from './repositories/memory';
import { supabaseVerifier } from './session';

const SUPABASE = 'https://users.supabase.co';
const ANA = { sub: '00000000-0000-4000-8000-0000000000c1', email: 'ana@ug.uchile.cl' };

const bundle: ContentBundle = {
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
      title: 'Traducción',
      position: 1,
      updatedAt: '2026-10-31T12:00:00.000Z',
      sources: [],
      html: '<p>Los ribosomas tienen dos subunidades.</p>',
      toc: [],
      sections: [],
      hash: 'h',
      media: [],
    },
  ],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
};

let db: PGlite;
let privateKey: JoseKey;
let publicKey: JoseKey;
let clock = Date.now();
let asked = 0;
let down = false;
/** What the fake PostgREST answers instead of the database (a wrong key, an answer it does not know). */
let instead: Response | null = null;
let app: ReturnType<typeof createApp>;

/** PostgREST, as far as `rpc/access_status` goes: the token's claims, as `authenticated`, with the body's versions. */
const postgrest: typeof fetch = async (input, init) => {
  asked++;
  if (down) throw new TypeError('fetch failed');
  if (instead) return instead.clone();
  expect(String(input)).toBe(`${SUPABASE}/rest/v1/rpc/access_status`);
  const token = (new Headers(init?.headers).get('Authorization') ?? '').replace(/^Bearer /, '');
  const claims = decodeJwt(token);
  if ((claims.exp ?? 0) * 1000 < clock) return new Response('{"code":"PGRST303"}', { status: 401 });
  const body = JSON.parse(String(init?.body ?? '{}')) as {
    terms_version?: string;
    privacy_version?: string;
  };
  const status = await asUser(db, claims as { sub: string; email: string }, async (tx) => {
    const { rows } = await tx.query<{ s: string }>('select public.access_status($1, $2) as s', [
      body.terms_version ?? null,
      body.privacy_version ?? null,
    ]);
    return rows[0]!.s;
  });
  return new Response(JSON.stringify(status), { status: 200 });
};

const token = (sessionId: string, expiresIn = 3600) =>
  new SignJWT({ email: ANA.email, role: 'authenticated', session_id: sessionId })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(ANA.sub)
    .setIssuer(`${SUPABASE}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt(Math.floor(clock / 1000))
    .setExpirationTime(Math.floor(clock / 1000) + expiresIn)
    .sign(privateKey);

const signIn = async () =>
  (
    await db.query<{ id: string }>(`insert into auth.sessions (user_id) values ($1) returning id`, [
      ANA.sub,
    ])
  ).rows[0]!.id;

const get = (path: string, t: string) =>
  app.request(`/api${path}`, { headers: { Authorization: `Bearer ${t}` } });

beforeAll(async () => {
  db = await createDatabase('users');
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [ANA.sub, ANA.email]);
  await db.query(`select public.invite_emails($1)`, [
    { emails: [ANA.email], list: 'Curso de prueba 2026', by: 'prueba' },
  ]);
  // Ana accepted the terms and the privacy policy in force (step 2.3).
  await db.query(
    `insert into public.legal_acceptances (user_id, terms_version, privacy_version) values ($1, $2, $3)`,
    [ANA.sub, LEGAL_VERSIONS.terms.version, LEGAL_VERSIONS.privacy.version],
  );
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
  app = createApp({
    verifier: supabaseVerifier({ supabaseUrl: SUPABASE, keys: createLocalJWKSet({ keys: [jwk] }) }),
    repository: memoryRepository(bundle),
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    now: () => Math.floor(clock / 1000),
    access: supabaseAccessChecker({
      supabaseUrl: SUPABASE,
      publishableKey: 'sb_publishable_x',
      fetch: postgrest,
      now: () => clock,
    }),
  });
}, 30_000);

describe('a removed student, with a token that is still valid', () => {
  it(`stops reading notes and cards within ${ACCESS_TTL} s of remove_invites()`, async () => {
    const t = await token(await signIn());
    expect((await get('/notes/11-traduccion', t)).status).toBe(200);
    expect((await get('/catalog', t)).status).toBe(200);

    const removed = await db.query<{ r: { removed: string[]; sessions_closed: number } }>(
      `select public.remove_invites($1) as r`,
      [{ emails: [ANA.email] }],
    );
    expect(removed.rows[0]!.r).toMatchObject({ removed: [ANA.email], sessions_closed: 1 });

    // The answer of a moment ago is remembered at most ACCESS_TTL seconds…
    clock += (ACCESS_TTL - 1) * 1000;
    expect((await get('/notes/11-traduccion', t)).status).toBe(200);
    // …and after that, the same token (it expires in an hour) reads nothing.
    clock += 2000;
    for (const path of ['/notes/11-traduccion', '/catalog', '/me', '/decks/1', '/quizzes']) {
      const r = await get(path, t);
      expect(r.status, path).toBe(403);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
      const body = (await r.json()) as { error: string; message: string };
      expect(body.error).toBe('not_invited');
      expect(body.message).toContain(CONTACT_EMAIL);
    }
  });

  it('invited again and signed in again, they read again; closing the session alone also cuts', async () => {
    await db.query(`select public.invite_emails($1)`, [
      { emails: [ANA.email], list: 'Curso de prueba 2026', by: 'prueba' },
    ]);
    const session = await signIn();
    const t = await token(session);
    expect((await get('/notes/11-traduccion', t)).status).toBe(200);
    // Signing out on another device (supabase-js closes every session of the account) or deleting the account in
    // Authentication → Users ends the session: a 401 «sign in again», never the 403 of someone not invited
    // (Revisión de cero, 2.1).
    await db.query('delete from auth.sessions where id = $1', [session]);
    clock += (ACCESS_TTL + 1) * 1000;
    const r = await get('/notes/11-traduccion', t);
    expect(r.status).toBe(401);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const body = (await r.json()) as { error: string; message: string };
    expect(body.error).toBe('unauthenticated');
    expect(body.message).toMatch(/sesión se cerró/);
    expect(body.message).not.toContain(CONTACT_EMAIL);
  });

  it('a token the database no longer takes is a 401, as without a session', async () => {
    const t = await token(await signIn(), 10);
    clock += 20_000; // within the 30 s of tolerance of the verifier, past its exp
    const r = await get('/catalog', t);
    expect(r.status).toBe(401);
    expect(((await r.json()) as { error: string }).error).toBe('unauthenticated');
  });

  it('asks the database once per token and ACCESS_TTL, not on every request', async () => {
    const t = await token(await signIn());
    asked = 0;
    for (let i = 0; i < 5; i++) expect((await get('/catalog', t)).status).toBe(200);
    expect(asked).toBe(1);
  });

  it('if the database cannot be asked, nothing is served (503) and nothing is remembered', async () => {
    const t = await token(await signIn());
    down = true;
    try {
      const r = await get('/notes/11-traduccion', t);
      expect(r.status).toBe(503);
      expect(((await r.json()) as { error: string }).error).toBe('access_unavailable');
    } finally {
      down = false;
    }
    expect((await get('/notes/11-traduccion', t)).status).toBe(200);
  });

  it('a 401 for a token that has not expired (a wrong key) is the Worker’s problem: 503, not «sign in again»', async () => {
    const t = await token(await signIn());
    const original = console.error;
    console.error = () => {};
    instead = new Response('{"message":"Invalid API key"}', { status: 401 });
    try {
      const r = await get('/catalog', t);
      expect(r.status).toBe(503);
      expect(((await r.json()) as { error: string }).error).toBe('access_unavailable');
    } finally {
      instead = null;
      console.error = original;
    }
    expect((await get('/catalog', t)).status).toBe(200);
  });

  it('an answer it does not know is a 503 and is not remembered (it fails closed)', async () => {
    const t = await token(await signIn());
    const original = console.error;
    console.error = () => {};
    try {
      for (const body of ['true', 'null', '"yes"', '{"allowed":true}']) {
        instead = new Response(body, { status: 200 });
        expect((await get('/notes/11-traduccion', t)).status, body).toBe(503);
      }
    } finally {
      instead = null;
      console.error = original;
    }
    expect((await get('/notes/11-traduccion', t)).status).toBe(200);
  });

  it('two students with valid tokens are never mixed up', async () => {
    const LUIS = { sub: '00000000-0000-4000-8000-0000000000c2', email: 'luis@ug.uchile.cl' };
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [LUIS.sub, LUIS.email]);
    const luisSession = (
      await db.query<{ id: string }>(
        `insert into auth.sessions (user_id) values ($1) returning id`,
        [LUIS.sub],
      )
    ).rows[0]!.id;
    const luis = await new SignJWT({
      email: LUIS.email,
      role: 'authenticated',
      session_id: luisSession,
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject(LUIS.sub)
      .setIssuer(`${SUPABASE}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt(Math.floor(clock / 1000))
      .setExpirationTime(Math.floor(clock / 1000) + 3600)
      .sign(privateKey);
    const ana = await token(await signIn());
    // Ana is invited and asks first; Luis, not invited, right after: each one gets their own answer.
    expect((await get('/catalog', ana)).status).toBe(200);
    expect((await get('/catalog', luis)).status).toBe(403);
    expect((await get('/catalog', ana)).status).toBe(200);
  });

  it('a Worker without the public key serves nothing of the material', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(await accessUnavailable.check('x')).toBe('unknown');
    } finally {
      console.error = original;
    }
  });
});

describe('the terms and the privacy policy (step 2.3)', () => {
  const EVA = { sub: '00000000-0000-4000-8000-0000000000c3', email: 'eva@ug.uchile.cl' };
  const tokenOf = async (user: { sub: string; email: string }, sessionId: string) =>
    new SignJWT({ email: user.email, role: 'authenticated', session_id: sessionId })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject(user.sub)
      .setIssuer(`${SUPABASE}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt(Math.floor(clock / 1000))
      .setExpirationTime(Math.floor(clock / 1000) + 3600)
      .sign(privateKey);
  let eva: string;
  let evaSession: string;

  beforeAll(async () => {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [EVA.sub, EVA.email]);
    await db.query(`select public.invite_emails($1)`, [
      { emails: [EVA.email], list: 'Curso de prueba 2026', by: 'prueba' },
    ]);
    evaSession = (
      await db.query<{ id: string }>(
        `insert into auth.sessions (user_id) values ($1) returning id`,
        [EVA.sub],
      )
    ).rows[0]!.id;
    eva = await tokenOf(EVA, evaSession);
  });

  it('without accepting, an invited student gets no material', async () => {
    for (const path of [
      '/notes/11-traduccion',
      '/catalog',
      '/decks/1',
      '/quizzes',
      '/search?q=ribosoma',
    ]) {
      const r = await get(path, eva);
      expect(r.status, path).toBe(403);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
      const body = (await r.json()) as { error: string; message: string };
      expect(body.error).toBe('terms_not_accepted');
      expect(body.message).toMatch(/acepta los términos de uso y la política de privacidad/);
    }
  });

  it('accepting shows the material at once: that answer is never remembered', async () => {
    asked = 0;
    expect((await get('/catalog', eva)).status).toBe(403);
    expect((await get('/catalog', eva)).status).toBe(403);
    expect(asked).toBe(2);
    await asUser(db, { ...EVA, session_id: evaSession } as { sub: string; email: string }, (tx) =>
      tx.query('select public.accept_legal($1, $2)', [
        LEGAL_VERSIONS.terms.version,
        LEGAL_VERSIONS.privacy.version,
      ]),
    );
    // The same second, no clock moved.
    expect((await get('/notes/11-traduccion', eva)).status).toBe(200);
  });

  it('a Worker deployed with a new version asks again', async () => {
    const ana = await token(await signIn());
    const newer = createApp({
      verifier: supabaseVerifier({
        supabaseUrl: SUPABASE,
        keys: createLocalJWKSet({
          keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' }],
        }),
      }),
      repository: memoryRepository(bundle),
      media: { get: async () => null },
      signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
      now: () => Math.floor(clock / 1000),
      access: supabaseAccessChecker({
        supabaseUrl: SUPABASE,
        publishableKey: 'sb_publishable_x',
        fetch: postgrest,
        now: () => clock,
        legal: {
          terms: `${LEGAL_VERSIONS.terms.version}.1`,
          privacy: LEGAL_VERSIONS.privacy.version,
        },
      }),
    });
    const r = await newer.request('/api/catalog', { headers: { Authorization: `Bearer ${ana}` } });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe('terms_not_accepted');
    // The Worker of before still serves it.
    expect((await get('/catalog', ana)).status).toBe(200);
  });
});
