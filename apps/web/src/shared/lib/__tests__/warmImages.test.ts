// Tests warmImages: each URL asked for once while the browser keeps it, the card on screen's first, all of them under
// the images on screen, and a failed one again.
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

const started = () => FakeImage.made.map((i) => i.src);
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
  it('asks for each image once, decoded off the main thread', async () => {
    const warm = await load();
    warm(['/a', '/b', '/a'], 'after');
    warm(['/b'], 'after');
    expect(started()).toEqual(['/a', '/b']);
    expect(image('/a').decoding).toBe('async');
  });

  it('asks with a low priority, also for the card on screen’s back, so as not to slow its front', async () => {
    const warm = await load();
    warm(['/back'], 'first');
    warm(['/next'], 'after');
    image('/back').onload!();
    expect(FakeImage.made.map((i) => i.fetchPriority)).toEqual(['low', 'low']);
  });

  it('asks again once the browser no longer keeps its copy', async () => {
    const warm = await load();
    warm(['/a'], 'first');
    vi.setSystemTime(Date.now() + 599_999);
    warm(['/a'], 'first');
    expect(started()).toHaveLength(1);
    vi.setSystemTime(Date.now() + 1);
    warm(['/a'], 'first');
    expect(started()).toHaveLength(2);
  });

  it('asks again for one that failed, and not for one that arrived', async () => {
    const warm = await load();
    warm(['/ok', '/broken'], 'after');
    image('/ok').onload!();
    image('/broken').onerror!();
    warm(['/ok', '/broken'], 'after');
    expect(started()).toEqual(['/ok', '/broken', '/broken']);
  });

  it('holds the next cards’ images until the back of the one on screen arrived', async () => {
    const warm = await load();
    warm(['/back1', '/back2'], 'first');
    warm(['/next'], 'after');
    expect(started()).toEqual(['/back1', '/back2']);
    image('/back1').onload!();
    expect(started()).toHaveLength(2);
    image('/back2').onerror!();
    expect(started()).toEqual(['/back1', '/back2', '/next']);
  });

  it('starts at once a held image whose card came up, and holds it only once', async () => {
    const warm = await load();
    warm(['/back'], 'first');
    warm(['/next-front', '/next-back'], 'after');
    vi.setSystemTime(Date.now() + 600_000);
    warm(['/next-front'], 'after');
    warm(['/next-back'], 'first');
    expect(started()).toEqual(['/back', '/next-back']);
    image('/back').onload!();
    expect(started()).toEqual(['/back', '/next-back']);
    image('/next-back').onload!();
    expect(started()).toEqual(['/back', '/next-back', '/next-front']);
  });

  it('forgets the old URLs when it remembers many, and keeps the fresh ones', async () => {
    const warm = await load();
    warm(
      Array.from({ length: 499 }, (_, i) => `/old${i}`),
      'after',
    );
    vi.setSystemTime(Date.now() + 600_000);
    warm(['/fresh'], 'after');
    warm(['/fresh', '/new'], 'after');
    expect(started().slice(499)).toEqual(['/fresh', '/new']);
  });
});
