// The Worker's answers outside the API (a missing built file is an uncached 404) and its composition: every part it has
// a binding for reaches the API (the panel, the deep health, the counts and the readers).
import { SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ROUTES } from '@qv/schema/http';
import type { Env } from '../worker';
import worker from '../worker';
import { row } from '../test/usage-app';

function envWithAssets() {
  const fetch = vi.fn(
    async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }),
  );
  return { env: { ASSETS: { fetch } } as unknown as Env, fetch };
}

const ctx = {} as ExecutionContext;

/** A request as the Worker gets it (the runtime adds `cf`, which these paths do not read). */
const incoming = (url: string) => new Request(url) as Request<unknown, IncomingRequestCfProperties>;

describe('worker outside the API', () => {
  it('answers a built file missing from this version with a 404 that is not cached', async () => {
    const { env, fetch } = envWithAssets();
    const r = await worker.fetch(incoming('https://site.test/assets/index-OLD.js'), env, ctx);
    expect(r.status).toBe(404);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Content-Type')).not.toContain('html');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hands any other path to the static files, which answer with the app', async () => {
    const { env, fetch } = envWithAssets();
    const r = await worker.fetch(incoming('https://site.test/semesters/1'), env, ctx);
    expect(r.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

const USERS = 'https://users.supabase.co';
const CONTENT = 'https://content.supabase.co';
const SECRET = 'secreto-de-prueba-0123456789-0123456789';
const ADMIN = 'dueno@ug.uchile.cl';
const STUDENT = 'ana@ug.uchile.cl';

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

/** The users' and the content databases and Cloudflare's SQL API, as far as these routes ask them. */
async function answer(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(input, init);
  const { origin, pathname } = new URL(request.url);
  const claims = request.headers.get('Authorization')?.split('.')[1] ?? '';
  const email = claims ? atob(claims.replace(/-/g, '+').replace(/_/g, '/')) : '';
  const fn = pathname.replace('/rest/v1/rpc/', '');
  if (origin === USERS) {
    if (pathname === '/auth/v1/health') return new Response('{}');
    return json(
      {
        access_status: 'allowed',
        health: true,
        admin_usage: row(),
        is_admin: email.includes(ADMIN),
      }[fn] ?? null,
    );
  }
  if (origin === CONTENT) {
    if (fn === 'site_settings') {
      return json({
        hideEmptySemesters: false,
        hiddenCourses: [],
        updatedAt: null,
        updatedBy: null,
      });
    }
    if (fn === 'unpublish_log_entries') return json({ total: 0, entries: [] });
    if (fn === 'release_media') return json({ keys: [], next: null });
    if (fn === 'release_log') return json({ releases: [] });
    return json(pathname.startsWith('/rest/v1/rpc/') && !fn.startsWith('anki_') ? null : []);
  }
  return json({ data: [] });
}

const bucket = () => ({
  get: async () => null,
  head: async () => null,
  list: async () => ({
    objects: [{ key: 'users/2026-11-20-071702Z.tar.age', size: 10, uploaded: new Date() }],
    truncated: false,
  }),
});

const token = (email: string) =>
  new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('00000000-0000-4000-8000-000000000001')
    .setIssuer(`${USERS}/auth/v1`)
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET));

/** A Worker made fresh (the app is built once per module) with the bindings of production, minus `without`. */
async function workerWith(without: (keyof Env)[] = []) {
  vi.resetModules();
  vi.stubGlobal('fetch', answer);
  vi.stubGlobal('caches', {
    default: { match: async () => undefined, put: async () => undefined },
  });
  const points: { indexes?: string[]; blobs?: string[] }[] = [];
  const full: Record<string, unknown> = {
    ASSETS: { fetch: async () => new Response('<!doctype html>') },
    MEDIA: bucket(),
    BACKUPS: bucket(),
    USERS_SUPABASE_URL: USERS,
    CONTENT_SUPABASE_URL: CONTENT,
    CONTENT_SERVICE_ROLE_KEY: 'sb_secret_prueba',
    MEDIA_SECRET: SECRET,
    USERS_JWT_SECRET: SECRET,
    USERS_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_prueba',
    CF_VERSION_METADATA: { id: 'version-1' },
    USAGE: { writeDataPoint: (p: (typeof points)[number]) => points.push(p) },
    CF_ACCOUNT_ID: 'cuenta',
    CF_ANALYTICS_TOKEN: 'token',
  };
  const env = Object.fromEntries(
    Object.entries(full).filter(([key]) => !(without as string[]).includes(key)),
  );
  const { default: fresh } = await import('../worker');
  const call = async (path: string, who: string | null, method = 'GET', body?: string) => {
    const headers = who ? { Authorization: `Bearer ${await token(who)}` } : undefined;
    return fresh.fetch(
      new Request(`https://site.test${path}`, {
        method,
        ...(body && method !== 'GET' ? { body } : {}),
        ...(headers ? { headers } : {}),
      }) as Request<unknown, IncomingRequestCfProperties>,
      env as unknown as Env,
      ctx,
    );
  };
  return { call, points };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worker composition', () => {
  it('with every binding, every route of the panel exists for an administrator and for nobody else', async () => {
    const { call } = await workerWith();
    const panel = Object.values(API_ROUTES).filter((r) => r.pattern.startsWith('/admin/'));
    expect(panel).toHaveLength(12);
    for (const { method, pattern } of panel) {
      const path = `/api${pattern}`;
      expect((await call(path, ADMIN, method, '{}')).status, `${method} ${path}`).not.toBe(404);
      expect((await call(path, STUDENT, method, '{}')).status, `${method} ${path}`).toBe(404);
    }
  });

  it('the version, the deep health with its five checks, and the usage report with its two readers', async () => {
    const { call } = await workerWith();
    expect(await (await call('/api/health', null)).json()).toEqual({
      ok: true,
      version: 'version-1',
    });
    const deep = await (await call('/api/health/deep', null)).json<{ checks: object }>();
    expect(Object.keys(deep.checks)).toEqual(['auth', 'backups', 'content', 'media', 'users']);
    const usage = await (await call('/api/admin/usage', ADMIN)).json<{
      opensStatus: string;
      clientErrors: unknown[] | null;
    }>();
    expect([usage.opensStatus, Array.isArray(usage.clientErrors)]).toEqual(['ok', true]);
  });

  it('an open and a browser error are counted in the binding, and only then', async () => {
    const { call, points } = await workerWith();
    const open = await call('/api/usage/open', STUDENT, 'POST', '{"kind":"search","from":"home"}');
    expect(open.status).toBe(200);
    const error = '{"kind":"boot","page":"/x","message":"m","version":"v"}';
    expect((await call('/api/client-error', null, 'POST', error)).status).toBe(204);
    expect(points.map((p) => p.indexes?.[0])).toEqual(['search', 'error']);
    const bare = await workerWith(['USAGE', 'CF_ACCOUNT_ID']);
    expect(
      (await bare.call('/api/usage/open', STUDENT, 'POST', '{"kind":"search","from":"home"}'))
        .status,
    ).toBe(200);
    expect((await bare.call('/api/client-error', null, 'POST', error)).status).toBe(204);
    expect(bare.points).toEqual([]);
    const usage = await (await bare.call('/api/admin/usage', ADMIN)).json<{
      opensStatus: string;
      clientErrors: unknown[] | null;
    }>();
    expect([usage.opensStatus, usage.clientErrors]).toEqual(['not_configured', null]);
  });

  it('without the users’ publishable key nothing of the material is served and there is no panel', async () => {
    const { call } = await workerWith(['USERS_SUPABASE_PUBLISHABLE_KEY']);
    const catalog = await call('/api/catalog', STUDENT);
    expect([catalog.status, (await catalog.json<{ error: string }>()).error]).toEqual([
      503,
      'access_unavailable',
    ]);
    expect((await call('/api/admin/usage', ADMIN)).status).toBe(503);
  });
});
