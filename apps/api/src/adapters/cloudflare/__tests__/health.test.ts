// Tests for the health checks of the media and backups buckets.
import { describe, expect, it } from 'vitest';
import { cloudflareHealthCache, latestBackupCheck, mediaCheck } from '../health';
import type { BucketLike } from '../health';

const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);

describe('the bucket checks of the Worker', () => {
  const signal = new AbortController().signal;

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
    expect(asked[0]).toMatchObject({ prefix: 'users/', startAfter: 'users/2026-11-06' });
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

describe('the cache the isolates share', () => {
  const fakeCache = () => {
    const stored = new Map<string, Response>();
    const cache = {
      match: async (req: Request) => stored.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => {
        stored.set(req.url, res);
      },
    } as unknown as Cache;
    return { cache, stored };
  };

  it('the key hangs from the origin without its trailing slashes', async () => {
    const { cache, stored } = fakeCache();
    await cloudflareHealthCache(cache, 'https://sitio.example///').put(
      { ok: true, checks: {} },
      30,
    );
    expect([...stored.keys()]).toEqual(['https://sitio.example/__qv-health-deep-cache']);
  });

  it('keeps the result for the seconds asked, at least one', async () => {
    const { cache, stored } = fakeCache();
    const shared = cloudflareHealthCache(cache, 'https://sitio.example');
    await shared.put({ ok: true, checks: { db: 'ok' } }, 59.9);
    expect([...stored.values()][0]!.headers.get('Cache-Control')).toBe('max-age=59');
    await shared.put({ ok: true, checks: {} }, 0.2);
    expect([...stored.values()][0]!.headers.get('Cache-Control')).toBe('max-age=1');
  });

  it('what it put it reads back, and a miss is null', async () => {
    const { cache } = fakeCache();
    const shared = cloudflareHealthCache(cache, 'https://sitio.example');
    expect(await shared.get()).toBeNull();
    await shared.put({ ok: false, checks: { db: 'fail', media: 'ok' } }, 30);
    expect(await shared.get()).toEqual({ ok: false, checks: { db: 'fail', media: 'ok' } });
  });

  it.each([
    ['not an object', 'texto'],
    ['null', null],
    ['ok that is not a boolean', { ok: 'si', checks: {} }],
    ['no checks', { ok: true }],
    ['null checks', { ok: true, checks: null }],
    ['a check that is neither ok nor fail', { ok: true, checks: { db: 'mal' } }],
  ])('a stored value that is %s is ignored', async (_name, value) => {
    const { cache, stored } = fakeCache();
    stored.set('https://sitio.example/__qv-health-deep-cache', Response.json(value));
    expect(await cloudflareHealthCache(cache, 'https://sitio.example').get()).toBeNull();
  });
});
