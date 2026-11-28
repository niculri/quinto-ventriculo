// The Worker's answers outside the API (a missing built file is an uncached 404) and its composition: every part it has
// a binding for reaches the API (the panel, the deep health, the counts and the readers).
import { SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ROUTES } from '@qv/schema/http';
import type { Env } from '../worker';
import worker from '../worker';
import { row } from '../test/usageApp';

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
        storage_health: true,
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
  if (request.url === 'https://api.cloudflare.com/client/v4/graphql') {
    const day = new Date().toISOString().slice(0, 10);
    return json({
      data: {
        viewer: {
          accounts: [
            {
              workersInvocationsAdaptive: [{ sum: { requests: 1234 }, dimensions: { date: day } }],
            },
          ],
        },
      },
    });
  }
  return json({ data: [] });
}

/** A rate limiting binding that refuses every key listed in `refused`, as the runtime's would once it is used up. */
const limiter = (seen: string[], refused: Set<string>) => ({
  limit: async ({ key }: { key: string }) => {
    seen.push(key);
    return { success: !refused.has(key) };
  },
});

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
async function workerWith(
  without: (keyof Env)[] = [],
  cache: Pick<Cache, 'match' | 'put'> = {
    match: async () => undefined,
    put: async () => undefined,
  },
) {
  vi.resetModules();
  vi.stubGlobal('fetch', answer);
  vi.stubGlobal('caches', { default: cache });
  const points: { indexes?: string[]; blobs?: string[] }[] = [];
  const limited = {
    student: [] as string[],
    address: [] as string[],
    media: [] as string[],
    refused: new Set<string>(),
  };
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
    STUDENT_RATE_LIMIT: limiter(limited.student, limited.refused),
    ADDRESS_RATE_LIMIT: limiter(limited.address, limited.refused),
    MEDIA_RATE_LIMIT: limiter(limited.media, limited.refused),
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
  return { call, points, limited };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worker composition', () => {
  it('with every binding, every route of the panel exists for an administrator and for nobody else', async () => {
    const { call } = await workerWith();
    const panel = Object.values(API_ROUTES).filter((r) => r.pattern.startsWith('/admin/'));
    expect(panel).toHaveLength(17);
    for (const { method, pattern } of panel) {
      const path = `/api${pattern}`;
      expect((await call(path, ADMIN, method, '{}')).status, `${method} ${path}`).not.toBe(404);
      expect((await call(path, STUDENT, method, '{}')).status, `${method} ${path}`).toBe(404);
    }
  });

  it('the version, the deep health with its six checks, and the usage report with its three readers', async () => {
    const { call } = await workerWith();
    expect(await (await call('/api/health', null)).json()).toEqual({
      ok: true,
      version: 'version-1',
    });
    const deep = await (await call('/api/health/deep', null)).json<{ checks: object }>();
    expect(deep.checks).toEqual({
      auth: 'ok',
      backups: 'ok',
      content: 'ok',
      media: 'ok',
      users: 'ok',
      usersStorage: 'ok',
    });
    const usage = await (await call('/api/admin/usage', ADMIN)).json<{
      opensStatus: string;
      workerRequests: { requests: number }[] | null;
    }>();
    expect(usage.opensStatus).toBe('ok');
    const errors = await (await call('/api/admin/errors?days=7', ADMIN)).json<{ days: number }>();
    expect(errors.days).toBe(7);
    expect(usage.workerRequests?.map((d) => d.requests).at(-1)).toBe(1234);
    const bare = await workerWith(['CF_ANALYTICS_TOKEN']);
    const without = await (await bare.call('/api/admin/usage', ADMIN)).json<{
      workerRequests: unknown;
    }>();
    expect(without.workerRequests).toBeNull();
  });

  it('the three rate limits: by student with a session, by address without one, the images apart, and 429 once used up', async () => {
    const { call, limited } = await workerWith();
    expect((await call('/api/me', STUDENT)).status).toBe(200);
    expect((await call('/api/health', null)).status).toBe(200);
    expect((await call('/api/media/x.png', null)).status).not.toBe(429);
    expect(limited.student).toEqual(['00000000-0000-4000-8000-000000000001']);
    expect(limited.address).toEqual(['unknown']);
    expect(limited.media).toEqual(['unknown']);
    limited.refused.add('00000000-0000-4000-8000-000000000001');
    const refused = await call('/api/me', STUDENT);
    expect([refused.status, refused.headers.get('Retry-After')]).toEqual([429, '10']);
    limited.refused.add('unknown');
    expect((await call('/api/health', null)).status).toBe(429);
    expect((await call('/api/media/x.png', null)).status).toBe(429);
    const free = await workerWith(['STUDENT_RATE_LIMIT', 'ADDRESS_RATE_LIMIT', 'MEDIA_RATE_LIMIT']);
    free.limited.refused.add('unknown');
    expect((await free.call('/api/health', null)).status).toBe(200);
    expect((await free.call('/api/media/x.png', null)).status).not.toBe(429);
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
    }>();
    expect(usage.opensStatus).toBe('not_configured');
    expect((await bare.call('/api/admin/errors', ADMIN)).status).toBe(404);
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

  it('without the shared secret of the tokens an HS256 token opens nothing', async () => {
    const { call } = await workerWith(['USERS_JWT_SECRET']);
    expect((await call('/api/catalog', STUDENT)).status).toBe(401);
  });

  it('without the version binding, /api/health does not say a version', async () => {
    const { call } = await workerWith(['CF_VERSION_METADATA']);
    expect(await (await call('/api/health', null)).json()).toEqual({ ok: true });
  });

  it('keeps the material in the data center’s cache, under a key outside /api that no route answers', async () => {
    const stored = new Map<string, string>();
    const cache = {
      match: async (key: RequestInfo | URL) => {
        const body = stored.get(new Request(key).url);
        return body === undefined ? undefined : new Response(body);
      },
      put: async (key: RequestInfo | URL, response: Response) => {
        expect(response.headers.get('Cache-Control')).toMatch(/^max-age=\d+$/);
        stored.set(new Request(key).url, await response.text());
      },
    } as unknown as Pick<Cache, 'match' | 'put'>;
    const { call } = await workerWith([], cache);
    const first = await call('/api/catalog', STUDENT);
    expect(first.headers.get('X-QV-Cache')).toBe('miss');
    const second = await call('/api/catalog', ADMIN);
    expect(second.headers.get('X-QV-Cache')).toBe('hit');
    expect(await second.text()).toBe(await first.text());
    expect(second.headers.get('Cache-Control')).toBe('private, no-cache');
    const [key] = [...stored.keys()];
    expect(key).toMatch(/^https:\/\/site\.test\/__qv-content-cache\/[0-9a-f]{64}$/);
    const { env, fetch } = envWithAssets();
    const outside = await worker.fetch(incoming(key!), env, ctx);
    expect(await outside.text()).toBe('<!doctype html>');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
