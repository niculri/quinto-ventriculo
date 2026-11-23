// Tests warmImages: each URL asked for once while the browser keeps it, the urgent ones first and a failed one again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeImage {
  static made: FakeImage[] = [];
  src = '';
  decoding = '';
  fetchPriority = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeImage.made.push(this);
  }
}

const started = () => FakeImage.made.map((i) => [i.src, i.fetchPriority]);
const image = (src: string) => FakeImage.made.find((i) => i.src === src)!;

async function load() {
  vi.resetModules();
  return (await import('../warmImages')).warmImages;
}

beforeEach(() => {
  FakeImage.made = [];
  vi.stubGlobal('Image', FakeImage);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('warmImages', () => {
  it('asks for each image once, decoded off the main thread and with its priority', async () => {
    const warm = await load();
    warm(['/a', '/b', '/a'], 'low');
    warm(['/b'], 'low');
    expect(started()).toEqual([
      ['/a', 'low'],
      ['/b', 'low'],
    ]);
    expect(image('/a').decoding).toBe('async');
  });

  it('asks again once the browser no longer keeps its copy', async () => {
    const warm = await load();
    warm(['/a'], 'high');
    vi.setSystemTime(Date.now() + 599_999);
    warm(['/a'], 'high');
    expect(started()).toHaveLength(1);
    vi.setSystemTime(Date.now() + 1);
    warm(['/a'], 'high');
    expect(started()).toHaveLength(2);
  });

  it('asks again for one that failed, and not for one that arrived', async () => {
    const warm = await load();
    warm(['/ok', '/broken'], 'low');
    image('/ok').onload!();
    image('/broken').onerror!();
    warm(['/ok', '/broken'], 'low');
    expect(started().map(([src]) => src)).toEqual(['/ok', '/broken', '/broken']);
  });

  it('holds the next cards’ images until the urgent ones arrived', async () => {
    const warm = await load();
    warm(['/back1', '/back2'], 'high');
    warm(['/next'], 'low');
    expect(started().map(([src]) => src)).toEqual(['/back1', '/back2']);
    image('/back1').onload!();
    expect(started()).toHaveLength(2);
    image('/back2').onerror!();
    expect(started()).toEqual([
      ['/back1', 'high'],
      ['/back2', 'high'],
      ['/next', 'low'],
    ]);
  });

  it('forgets the old URLs when it remembers many, and keeps the fresh ones', async () => {
    const warm = await load();
    warm(
      Array.from({ length: 499 }, (_, i) => `/old${i}`),
      'low',
    );
    vi.setSystemTime(Date.now() + 600_000);
    warm(['/fresh'], 'low');
    warm(['/fresh', '/new'], 'low');
    expect(
      started()
        .slice(499)
        .map(([src]) => src),
    ).toEqual(['/fresh', '/new']);
  });
});
