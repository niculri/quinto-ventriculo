// Tests for the health checks of the media and backups buckets.
import { describe, expect, it } from 'vitest';
import { latestBackupCheck, mediaCheck } from '../health';
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
