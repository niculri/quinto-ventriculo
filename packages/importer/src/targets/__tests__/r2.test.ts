// Tests how the images are kept in R2: the commands it sends, what a missing object means and how a prefix is emptied.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as S3 from '@aws-sdk/client-s3';
import type { CloudConfig } from '../cloudConfig';

const sent: { name: string; input: Record<string, unknown> }[] = [];
const created: { endpoint: string; credentials: unknown }[] = [];
let answer: (name: string, input: Record<string, unknown>) => unknown = () => ({});

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const real = await importOriginal<typeof S3>();
  return {
    ...real,
    S3Client: class {
      constructor(config: { endpoint: string; credentials: unknown }) {
        created.push(config);
      }
      send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
        sent.push({ name: command.constructor.name, input: command.input });
        const value = answer(command.constructor.name, command.input);
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
      }
    },
  };
});

const { r2Media } = await import('../r2');

const config: CloudConfig = {
  contentUrl: 'https://content.example.test',
  contentServiceKey: 'k',
  r2AccountId: 'cuenta',
  r2AccessKeyId: 'id',
  r2SecretAccessKey: 'secreto',
  r2Bucket: 'balde',
};

beforeEach(() => {
  sent.length = 0;
  created.length = 0;
  answer = () => ({});
});
afterEach(() => vi.restoreAllMocks());

describe('r2Media', () => {
  it('talks to the account’s endpoint with its credentials', () => {
    r2Media(config);
    expect(created).toEqual([
      {
        region: 'auto',
        endpoint: 'https://cuenta.r2.cloudflarestorage.com',
        credentials: { accessKeyId: 'id', secretAccessKey: 'secreto' },
      },
    ]);
  });

  it('has: an object that exists is true, one that is not found is false, any other failure is not hidden', async () => {
    const store = r2Media(config);
    expect(await store.has('a.webp')).toBe(true);
    expect(sent[0]).toEqual({
      name: 'HeadObjectCommand',
      input: { Bucket: 'balde', Key: 'a.webp' },
    });
    answer = () => Object.assign(new Error('x'), { name: 'NotFound' });
    expect(await store.has('b.webp')).toBe(false);
    answer = () => Object.assign(new Error('sin permiso'), { name: 'Forbidden' });
    await expect(store.has('c.webp')).rejects.toThrow('sin permiso');
  });

  it('put: the key is the image’s hash, so it is cached for a year and never revalidated', async () => {
    await r2Media(config).put('a.webp', Buffer.from('x'), 'image/webp');
    expect(sent[0]).toMatchObject({
      name: 'PutObjectCommand',
      input: {
        Bucket: 'balde',
        Key: 'a.webp',
        ContentType: 'image/webp',
        CacheControl: 'private, max-age=31536000, immutable',
      },
    });
  });

  it('delete removes one key', async () => {
    await r2Media(config).delete('a.webp');
    expect(sent).toEqual([
      { name: 'DeleteObjectCommand', input: { Bucket: 'balde', Key: 'a.webp' } },
    ]);
  });

  it('deletePrefix removes every object under the prefix, page after page, and counts them', async () => {
    const pages = [
      {
        Contents: [{ Key: 'p/1' }, { Key: undefined }, { Key: '' }, { Key: 'p/2' }],
        IsTruncated: true,
        NextContinuationToken: 't1',
      },
      { Contents: [{ Key: 'p/3' }], IsTruncated: true, NextContinuationToken: 't2' },
      {},
    ];
    answer = (name) => (name === 'ListObjectsV2Command' ? pages.shift() : {});
    expect(await r2Media(config).deletePrefix('p/')).toBe(3);
    const lists = sent.filter((c) => c.name === 'ListObjectsV2Command').map((c) => c.input);
    expect(lists).toEqual([
      { Bucket: 'balde', Prefix: 'p/' },
      { Bucket: 'balde', Prefix: 'p/', ContinuationToken: 't1' },
      { Bucket: 'balde', Prefix: 'p/', ContinuationToken: 't2' },
    ]);
    expect(sent.filter((c) => c.name === 'DeleteObjectCommand').map((c) => c.input.Key)).toEqual([
      'p/1',
      'p/2',
      'p/3',
    ]);
  });

  it('deletePrefix stops when the listing is not truncated, or says it is but gives no token', async () => {
    answer = (name) =>
      name === 'ListObjectsV2Command' ? { Contents: [{ Key: 'p/1' }], IsTruncated: true } : {};
    expect(await r2Media(config).deletePrefix('p/')).toBe(1);
    expect(sent.filter((c) => c.name === 'ListObjectsV2Command')).toHaveLength(1);
    sent.length = 0;
    answer = (name) =>
      name === 'ListObjectsV2Command'
        ? { Contents: [{ Key: 'p/1' }], NextContinuationToken: 'x' }
        : {};
    expect(await r2Media(config).deletePrefix('p/')).toBe(1);
    expect(sent.filter((c) => c.name === 'ListObjectsV2Command')).toHaveLength(1);
  });
});
