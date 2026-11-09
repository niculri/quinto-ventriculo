import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import {
  authCheck,
  contentDatabaseCheck,
  deepHealth,
  latestBackupCheck,
  mediaCheck,
  usersDatabaseCheck,
} from './health';
import type { BucketLike, DeepHealthResult, HealthCheck, SharedHealthCache } from './health';
import { MediaSigner } from './media';
import type { ContentRepository } from './repository';

/** Step 2.5: `/api/health/deep`. Made-up URLs and keys; nothing of a real project. */
const USERS = 'https://users.example.supabase.co';
const CONTENT = 'https://content.example.supabase.co';
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
    // The material is not asked for by these routes.
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
      // Why it failed goes to the Worker's log.
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
      Array.from({ length: 1000 }, () => app.request('/api/health/deep')),
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

describe('the checks of the Worker', () => {
  const signal = new AbortController().signal;
  const answer = (status: number, body: unknown = null) =>
    new Response(body === null ? null : JSON.stringify(body), { status });

  it('users: health() with the public key, and only «true» is an answer', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fake = (status: number, body: unknown) =>
      (async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return answer(status, body);
      }) as unknown as typeof fetch;
    await usersDatabaseCheck(`${USERS}/`, 'sb_publishable_x', fake(200, true))(signal);
    expect(seen[0]!.url).toBe(`${USERS}/rest/v1/rpc/health`);
    expect(seen[0]!.init.method).toBe('POST');
    expect((seen[0]!.init.headers as Record<string, string>).apikey).toBe('sb_publishable_x');
    await expect(
      usersDatabaseCheck(USERS, 'sb_publishable_x', fake(200, false))(signal),
    ).rejects.toThrow();
    await expect(
      usersDatabaseCheck(USERS, 'sb_publishable_x', fake(404, { message: 'no' }))(signal),
    ).rejects.toThrow();
    await expect(usersDatabaseCheck(USERS, undefined, fake(200, true))(signal)).rejects.toThrow();
  });

  it('auth: GET /auth/v1/health', async () => {
    let url = '';
    const fake = (async (u: string) => {
      url = u;
      return answer(200, { name: 'GoTrue' });
    }) as unknown as typeof fetch;
    await authCheck(USERS, 'sb_publishable_x', fake)(signal);
    expect(url).toBe(`${USERS}/auth/v1/health`);
    const down = (async () => answer(503)) as unknown as typeof fetch;
    await expect(authCheck(USERS, 'sb_publishable_x', down)(signal)).rejects.toThrow();
  });

  it('content: site_settings() with the service key', async () => {
    let url = '';
    const fake = (async (u: string) => {
      url = u;
      return answer(200, { hideEmptySemesters: false });
    }) as unknown as typeof fetch;
    await contentDatabaseCheck(CONTENT, 'sb_secret_x', fake)(signal);
    expect(url).toBe(`${CONTENT}/rest/v1/rpc/site_settings`);
    const down = (async () => answer(500)) as unknown as typeof fetch;
    await expect(contentDatabaseCheck(CONTENT, 'sb_secret_x', down)(signal)).rejects.toThrow();
  });

  const bucket = (keys: { key: string; size?: number; uploaded: string }[]) => {
    const asked: { prefix?: string; startAfter?: string }[] = [];
    const b: BucketLike = {
      head: async () => null,
      list: async (options) => {
        asked.push(options);
        const objects = keys
          .filter(
            (k) => k.key.startsWith(options.prefix ?? '') && k.key > (options.startAfter ?? ''),
          )
          .sort((a, c) => (a.key < c.key ? -1 : 1))
          .map((k) => ({ key: k.key, size: k.size ?? 1000, uploaded: new Date(k.uploaded) }));
        return { objects, truncated: false };
      },
    };
    return { b, asked };
  };

  it('media: a head of a key that is not there is enough; an R2 that throws is not', async () => {
    await mediaCheck(bucket([]).b)(signal);
    const down: BucketLike = {
      head: async () => {
        throw new Error('R2 down');
      },
      list: async () => ({ objects: [], truncated: false }),
    };
    await expect(mediaCheck(down)(signal)).rejects.toThrow();
  });

  it('backups: the newest copy has to be less than 36 hours old', async () => {
    const { b, asked } = bucket([
      { key: 'users/2026-11-05-071700Z.tar.age', uploaded: '2026-11-05T07:18:00Z' },
      { key: 'users/2026-11-08-071700Z.tar.age', uploaded: '2026-11-08T07:18:00Z' },
      { key: 'users/2026-11-08-071700Z.counts.json', uploaded: '2026-11-08T07:18:01Z' },
      { key: 'users/2026-11-09-071700Z.counts.json', uploaded: '2026-11-09T07:18:01Z' },
    ]);
    // 2026-11-08 07:18 is 28.7 hours before NOW.
    await latestBackupCheck(b, () => NOW)(signal);
    // It starts three days back, not at the beginning of the bucket.
    expect(asked[0]).toMatchObject({ prefix: 'users/', startAfter: 'users/2026-11-06' });
    // 40 hours later it is too old (a counts file alone does not count).
    await expect(latestBackupCheck(b, () => NOW + 12 * 3_600_000)(signal)).rejects.toThrow(
      /hours old/,
    );
  });

  it('backups: none, an empty one, or no binding is a failure', async () => {
    await expect(latestBackupCheck(bucket([]).b, () => NOW)(signal)).rejects.toThrow();
    const empty = bucket([
      { key: 'users/2026-11-09-071700Z.tar.age', size: 0, uploaded: '2026-11-09T07:18:00Z' },
    ]).b;
    await expect(latestBackupCheck(empty, () => NOW)(signal)).rejects.toThrow();
    await expect(latestBackupCheck(undefined, () => NOW)(signal)).rejects.toThrow();
  });

  it('backups: follows the pages of a long listing', async () => {
    const pages = [
      {
        objects: [
          {
            key: 'users/2026-11-07-071700Z.tar.age',
            size: 9,
            uploaded: new Date('2026-11-07T07:18:00Z'),
          },
        ],
        truncated: true,
      },
      {
        objects: [
          {
            key: 'users/2026-11-09-071700Z.tar.age',
            size: 9,
            uploaded: new Date('2026-11-09T07:18:00Z'),
          },
        ],
        truncated: false,
      },
    ];
    const asked: (string | undefined)[] = [];
    const b: BucketLike = {
      head: async () => null,
      list: async (o) => {
        asked.push(o.startAfter);
        return pages.shift()!;
      },
    };
    await latestBackupCheck(b, () => NOW, 6)(signal);
    expect(asked).toEqual(['users/2026-11-06', 'users/2026-11-07-071700Z.tar.age']);
  });
});
