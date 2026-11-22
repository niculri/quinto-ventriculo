// Tests the cache of the converted images.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from '../../test/importerFixtures';
import { ImageCache } from '../ImageCache';
import { processCardImage, processImage, processQuizImage } from '../images';

let root: string;

beforeAll(async () => {
  root = await createRoot();
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('the image cache, --assessment and the batches', () => {
  it('converts an image once: the second time (also after reopening) it comes from the cache, the same', async () => {
    const folder = join(root, '.cache-images');
    const png = await readFile(join(root, 'clase/imagenes/ribosoma.png'));
    const cache = await ImageCache.open(folder);
    const a = await cache.file(join(root, 'clase/imagenes/ribosoma.png'));
    const b = await cache.card(png);
    expect([cache.misses, cache.hits]).toEqual([2, 0]);
    expect(a.key).toMatch(/^notes\//);
    expect(b.key).toMatch(/^cards\//);
    const plain = await processImage(join(root, 'clase/imagenes/ribosoma.png'));
    expect(a.key).toBe(plain.key);
    expect(await a.read()).toEqual(await plain.read());

    const again = await ImageCache.open(folder);
    const c = await again.file(join(root, 'otra/img/misma.png'));
    expect([again.misses, again.hits]).toEqual([0, 1]);
    expect(c).toMatchObject({ key: a.key, width: a.width, height: a.height });
    expect(await c.read()).toEqual(await plain.read());

    await rm(join(folder, a.key));
    const d = await again.file(join(root, 'clase/imagenes/ribosoma.png'));
    expect(again.misses).toBe(1);
    expect(await d.read()).toEqual(await plain.read());
    await writeFile(join(folder, a.key), Buffer.from('not the webp'));
    const damaged = await (await ImageCache.open(folder)).file(
      join(root, 'clase/imagenes/ribosoma.png'),
    );
    await expect(damaged.read()).rejects.toThrow(/dañada/);
    const fresh = await ImageCache.open(folder);
    const e = await fresh.file(join(root, 'clase/imagenes/ribosoma.png'));
    expect([fresh.misses, fresh.hits]).toEqual([1, 0]);
    expect(await e.read()).toEqual(await plain.read());
  });

  it('every kind of image goes under its own prefix and an image of another kind is a different entry', async () => {
    const png = await readFile(join(root, 'clase/imagenes/ribosoma.png'));
    const cache = await ImageCache.open(join(root, '.cache-prefixes'));
    const [quiz, card] = [await cache.quiz(png), await cache.card(png)];
    expect(quiz.key).toMatch(/^tests\/[0-9a-f]{32}\.webp$/);
    expect(card.key.replace('cards/', '')).toBe(quiz.key.replace('tests/', ''));
    expect([cache.misses, cache.hits]).toEqual([2, 0]);
    expect(quiz.key).toBe((await processQuizImage(png)).key);
    expect(card.key).toBe((await processCardImage(png)).key);
  });

  it('a cache that cannot be read is an error, a missing one is not, and a cut line is skipped', async () => {
    const broken = join(root, '.cache-broken');
    await mkdir(join(broken, 'index.jsonl'), { recursive: true });
    await expect(ImageCache.open(broken)).rejects.toMatchObject({ code: 'EISDIR' });
    const cut = join(root, '.cache-cut');
    await mkdir(cut, { recursive: true });
    await writeFile(join(cut, 'index.jsonl'), '{"source":"x","key":"notes/a.we\n\n');
    const cache = await ImageCache.open(cut);
    await cache.card(await readFile(join(root, 'clase/imagenes/ribosoma.png')));
    expect(cache.misses).toBe(1);
  });
});
