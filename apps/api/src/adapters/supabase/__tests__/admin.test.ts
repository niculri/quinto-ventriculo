// Tests for the administrator check: reads may reuse is_admin() for a minute, but every write asks the database again.
import type { PGlite } from '@qv/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SiteSettings } from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import { OWNER_EMAIL, asUser, createDatabase } from '@qv/db/testing';
import { supabaseAdminChecker } from '../admin';
import { createApp } from '../../../app';
import { MediaSigner } from '../../../services/mediaSigner';
import { memoryRepository } from '../../memory/content';
import { memorySiteSettings } from '../../memory/settings';
import { urlOf } from '../../../test/fetch';

const SUPABASE = 'https://users.supabase.co';
type Claims = { sub: string; email: string; session_id?: string };
const OWNER: Claims = { sub: '00000000-0000-4000-8000-0000000000e1', email: OWNER_EMAIL };
const SECOND: Claims = {
  sub: '00000000-0000-4000-8000-0000000000e2',
  email: 'segunda.admin@ug.uchile.cl',
};
const ANA: Claims = {
  sub: '00000000-0000-4000-8000-0000000000e3',
  email: 'ana.perez@ug.uchile.cl',
};
/** The token is only a name here: the verifier and the fake PostgREST look up its claims. */
const TOKENS: Record<string, Claims> = { owner: OWNER, second: SECOND, ana: ANA };

const bundle: ContentBundle = {
  semesters: [],
  courses: [],
  assessments: [],
  notes: [],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
};

let db: PGlite;
let clock = 0;
let asked = 0;
let down = false;
let settings: ReturnType<typeof memorySiteSettings>;
let app: ReturnType<typeof createApp>;

const postgrest: typeof fetch = async (input, init) => {
  asked++;
  if (down) throw new TypeError('fetch failed');
  expect(urlOf(input)).toBe(`${SUPABASE}/rest/v1/rpc/is_admin`);
  const token = (new Headers(init?.headers).get('Authorization') ?? '').replace(/^Bearer /, '');
  const claims = TOKENS[token]!;
  const admin = await asUser(
    db,
    claims,
    async (tx) => (await tx.query<{ a: boolean }>('select public.is_admin() as a')).rows[0]!.a,
  );
  return new Response(JSON.stringify(admin), { status: 200 });
};

async function setAdmin(email: string, admin: boolean) {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.sessions (user_id) values ($1) returning id`,
    [OWNER.sub],
  );
  const owner: Claims = { ...OWNER, session_id: rows[0]!.id };
  await asUser(db, owner, (tx) =>
    tx.query('select public.admin_set_admin($1::jsonb)', [JSON.stringify({ email, admin })]),
  );
}

const get = (who: string) =>
  app.request('/api/admin/site-settings', { headers: { Authorization: `Bearer ${who}` } });
const put = (who: string, hideEmptySemesters: boolean) =>
  app.request('/api/admin/site-settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${who}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ hideEmptySemesters }),
  });

beforeEach(async () => {
  db = await createDatabase('users');
  for (const u of [OWNER, SECOND, ANA]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  await db.query(
    `insert into public.invited_emails (email, list) values ($1, 'Equipo'), ($2, 'Curso')`,
    [SECOND.email, ANA.email],
  );
  clock = 0;
  asked = 0;
  down = false;
  settings = memorySiteSettings();
  app = createApp({
    verifier: {
      verify: async (token) =>
        TOKENS[token] ? { id: TOKENS[token].sub, email: TOKENS[token].email } : null,
    },
    repository: memoryRepository(bundle),
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    settings,
    admins: supabaseAdminChecker({
      supabaseUrl: SUPABASE,
      publishableKey: 'sb_publishable_x',
      now: () => clock,
      fetch: postgrest,
    }),
  });
  await setAdmin(SECOND.email, true);
});

describe('an administrator removed by the site owner', () => {
  it('their next write gets 403 at once, though the Worker remembered them as an administrator', async () => {
    expect((await get('second')).status).toBe(200);
    expect((await put('second', true)).status).toBe(200);
    await put('second', false);

    await setAdmin(SECOND.email, false);
    const before = asked;
    expect((await get('second')).status).toBe(200);
    expect(asked).toBe(before);
    const refused = await put('second', true);
    expect(refused.status).toBe(403);
    expect(refused.headers.get('Cache-Control')).toBe('no-store');
    expect(await refused.json()).toEqual({
      error: 'admin_only',
      message: 'Ya no eres administrador. Recarga la página.',
    });
    expect((await settings.get()).hideEmptySemesters).toBe(false);
    expect((await get('second')).status).toBe(404);
  });

  it('an administrator writes as before, and every write asks the database', async () => {
    expect((await get('owner')).status).toBe(200);
    const before = asked;
    const r = await put('owner', true);
    expect(r.status).toBe(200);
    expect(SiteSettings.parse(await r.json())).toMatchObject({
      hideEmptySemesters: true,
      updatedBy: OWNER.email,
    });
    expect(asked).toBe(before + 1);
    await get('owner');
    expect(asked).toBe(before + 1);
  });

  it('a student still gets «no existe» when writing; a failure of the database is not a «yes»', async () => {
    expect((await put('ana', true)).status).toBe(404);
    expect((await get('owner')).status).toBe(200);
    down = true;
    const r = await put('owner', true);
    expect(r.status).toBe(503);
    expect((await r.json<{ error: string }>()).error).toBe('admin_unavailable');
    expect((await settings.get()).hideEmptySemesters).toBe(false);
    clock = 61_000;
    expect((await get('owner')).status).toBe(404);
  });
});

describe('supabaseAdminChecker().isAdminNow()', () => {
  it('always asks, remembers the answer, and says null when it could not ask', async () => {
    const checker = supabaseAdminChecker({
      supabaseUrl: SUPABASE,
      publishableKey: 'k',
      now: () => clock,
      fetch: postgrest,
    });
    expect(await checker.isAdmin('second')).toBe(true);
    const before = asked;
    await setAdmin(SECOND.email, false);
    expect(await checker.isAdmin('second')).toBe(true);
    expect(asked).toBe(before);
    expect(await checker.isAdminNow!('second')).toBe(false);
    expect(await checker.isAdmin('second')).toBe(false);
    expect(asked).toBe(before + 1);
    down = true;
    expect(await checker.isAdminNow!('owner')).toBeNull();
  });
});

describe('the memory of the administrator check', () => {
  it('it remembers 200 tokens at most, forgetting them all when the 201st arrives', async () => {
    let asked = 0;
    const checker = supabaseAdminChecker({
      supabaseUrl: SUPABASE,
      publishableKey: 'k',
      now: () => clock,
      fetch: async () => {
        asked++;
        return Response.json(true);
      },
    });
    for (let i = 0; i < 200; i++) await checker.isAdmin(`t${i}`);
    await checker.isAdmin('t0');
    expect(asked).toBe(200);
    await checker.isAdmin('t200');
    await checker.isAdmin('t1');
    expect(asked).toBe(202);
  });

  it('a refusal of the database is «no» for a read, and null for a write, and neither is remembered', async () => {
    let asked = 0;
    const checker = supabaseAdminChecker({
      supabaseUrl: SUPABASE,
      publishableKey: 'k',
      now: () => clock,
      fetch: async () => {
        asked++;
        return new Response('{}', { status: 500 });
      },
    });
    expect(await checker.isAdmin('t')).toBe(false);
    expect(await checker.isAdminNow!('t')).toBeNull();
    expect(asked).toBe(2);
  });
});
