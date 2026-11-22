// Tests for /api/health/deep: the route, the minute it keeps its answer and the cache the isolates share.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import type { ContentRepository } from '../../ports/content';
import type { DeepHealthResult, HealthCheck, SharedHealthCache } from '../../ports/health';
import { deepHealth } from '../../services/health';
import { MediaSigner } from '../../services/media-signer';

const USERS = 'https://users.example.supabase.co';
// Built at run time, so that the secret scanner of the repository does not take it for a key.
const SECRET_LOOKING = ['sb', 'secret', 'this-must-never-show-up'].join('_');
const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);

const ok: HealthCheck = async () => undefined;
const failing =
  (message: string): HealthCheck =>
  async () => {
    throw new Error(message);
  };

function appWith(checks: Record<string, HealthCheck>, op: Parameters<typeof deepHealth>[1] = {}) {
  return createApp({
    verifier: { verify: async () => null },
    repository: {} as ContentRepository,
    media: { get: async () => null },
    signer: new MediaSigner('secreto-solo-para-las-pruebas-0123456789'),
    deepHealth: deepHealth(checks, op),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('/api/health/deep', () => {
  it('without a session: 200 and «ok» for every part when everything answers', async () => {
    const app = appWith({ users: ok, content: ok, media: ok, backups: ok, auth: ok });
    const r = await app.request('/api/health/deep');
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toEqual({
      ok: true,
      checks: { auth: 'ok', backups: 'ok', content: 'ok', media: 'ok', users: 'ok' },
    });
  });

  it.each(['users', 'auth', 'content', 'media', 'backups'])(
    'a %s that fails gives 503 and its «fail», never the error',
    async (name) => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const checks: Record<string, HealthCheck> = {
        users: ok,
        auth: ok,
        content: ok,
        media: ok,
        backups: ok,
        [name]: failing(
          `${USERS}/rest/v1 said 500 with ${SECRET_LOOKING} and table public.profiles`,
        ),
      };
      const r = await appWith(checks).request('/api/health/deep');
      expect(r.status).toBe(503);
      const text = await r.text();
      expect(JSON.parse(text)).toEqual({
        ok: false,
        checks: {
          ...{ users: 'ok', auth: 'ok', content: 'ok', media: 'ok', backups: 'ok' },
          [name]: 'fail',
        },
      });
      for (const leak of [SECRET_LOOKING, 'supabase', 'profiles', 'rest/v1', '500', 'Error']) {
        expect(text).not.toContain(leak);
      }
      expect(logged).toHaveBeenCalled();
      expect(String(logged.mock.calls[0]![0])).toContain(name);
    },
  );

  it('a check that does not answer in time counts as failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let aborted = false;
    const hangs: HealthCheck = (signal) =>
      new Promise(() => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
      });
    const r = await appWith({ users: hangs, media: ok }, { timeoutMs: 20 }).request(
      '/api/health/deep',
    );
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ ok: false, checks: { media: 'ok', users: 'fail' } });
    expect(aborted).toBe(true);
  });

  it('a thousand requests within the minute make one round of checks', async () => {
    let now = NOW;
    let calls = 0;
    const counted: HealthCheck = async () => {
      calls += 1;
    };
    const app = appWith({ users: counted }, { now: () => now });
    const answers = await Promise.all(
      Array.from({ length: 1000 }, async () => app.request('/api/health/deep')),
    );
    expect(answers.every((a) => a.status === 200)).toBe(true);
    expect(calls).toBe(1);
    now += 59_000;
    await app.request('/api/health/deep');
    expect(calls).toBe(1);
    now += 2_000;
    await app.request('/api/health/deep');
    expect(calls).toBe(2);
  });

  it('a failure is remembered the same minute (a broken database is not asked a thousand times)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const broken: HealthCheck = async () => {
      calls += 1;
      throw new Error('down');
    };
    const app = appWith({ users: broken }, { now: () => NOW });
    for (let i = 0; i < 20; i++) expect((await app.request('/api/health/deep')).status).toBe(503);
    expect(calls).toBe(1);
  });

  it('the cache shared by the isolates spares the checks, and a broken cache does not break the answer', async () => {
    let stored: DeepHealthResult | null = { ok: true, checks: { users: 'ok' } };
    let calls = 0;
    const counted: HealthCheck = async () => {
      calls += 1;
    };
    const shared: SharedHealthCache = {
      get: async () => stored,
      put: async (r) => {
        stored = r;
      },
    };
    const r = await appWith({ users: counted }, { shared }).request('/api/health/deep');
    expect(r.status).toBe(200);
    expect(calls).toBe(0);

    const broken: SharedHealthCache = {
      get: async () => {
        throw new Error('cache down');
      },
      put: async () => {
        throw new Error('cache down');
      },
    };
    const r2 = await appWith({ users: counted }, { shared: broken }).request('/api/health/deep');
    expect(r2.status).toBe(200);
    expect(calls).toBe(1);
  });

  it('does not exist without the dependency (404), and /api/health stays as it was', async () => {
    const app = createApp({
      verifier: { verify: async () => null },
      repository: {} as ContentRepository,
      media: { get: async () => null },
      signer: new MediaSigner('secreto-solo-para-las-pruebas-0123456789'),
    });
    expect((await app.request('/api/health/deep')).status).toBe(404);
    expect(await (await app.request('/api/health')).json()).toEqual({ ok: true });
  });
});
