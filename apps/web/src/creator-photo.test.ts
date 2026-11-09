import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CREATOR_PHOTO_SOURCE,
  creatorPhoto,
  creatorPhotoAsset,
  creatorPhotoSource,
} from '../build/creator-photo';

/**
 * Step 2.7: the creator's picture on /about is not this repository's to publish (it is a drawing of a character that
 * belongs to somebody else, and this repository is AGPL). It lives in the private repository and only the build takes
 * it (`build/creator-photo.ts`). These checks fail if it, a copy of it (renamed, shrunk, converted) or anything named
 * like it is ever tracked here, staged, or left in the working tree where `git add` would take it, and if a commit
 * ever carried it.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const git = (args: string[], input?: Uint8Array) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', input, maxBuffer: 1 << 28 });
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const IMAGE = /\.(png|webp|jpe?g|gif|avif|bmp|ico|tiff?|svg)$/i;
const files = (args: string[]) =>
  git(['ls-files', '-z', ...args])
    .split('\0')
    .filter(Boolean);

/** Tracked or staged, and untracked but not ignored (what `git add -A` would take). */
const candidates = () => [...new Set([...files([]), ...files(['--others', '--exclude-standard'])])];
/** What a file would put in a commit: its staged version (`git cat-file blob :file`) and the one on disk. */
const versions = (file: string) =>
  [
    () => execFileSync('git', ['cat-file', 'blob', `:${file}`], { cwd: ROOT, stdio: 'pipe' }),
    () => readFileSync(join(ROOT, file)),
  ].flatMap((read) => {
    try {
      return [read()];
    } catch {
      return []; // not staged (untracked), or deleted on disk
    }
  });

/**
 * A 16 × 16 grey thumbnail, on grey where the picture is transparent: the same picture shrunk, converted to another
 * format or slightly retouched gives almost the same one. Null for what sharp cannot read (an .ico).
 */
const N = 16;
async function thumbnail(data: Uint8Array) {
  try {
    return await sharp(data)
      .flatten({ background: '#808080' })
      .resize(N, N, { fit: 'fill' })
      .toColourspace('b-w')
      .raw()
      .toBuffer();
  } catch {
    return null;
  }
}
/** The picture's opaque cells of that thumbnail: only those are compared (a copy may fill the corners with anything). */
async function opaqueCells(data: Uint8Array) {
  const alpha = await sharp(data)
    .ensureAlpha()
    .resize(N, N, { fit: 'fill' })
    .extractChannel(3)
    .raw()
    .toBuffer();
  return [...alpha].map((a) => a >= 250);
}
/** Mean difference, 0–255, over the opaque cells. A copy gives < 10; this repository's other images, > 60. */
const SAME_PICTURE = 25;

describe('the creator’s picture never enters this repository', () => {
  it('no image tracked, staged or about to be added is named like it', () => {
    expect(
      candidates().filter((f) => IMAGE.test(f) && /creador|creator|ulriksen/i.test(f)),
    ).toEqual([]);
  });

  it('the build’s output, where the picture lands, is ignored', () => {
    expect(git(['check-ignore', 'apps/web/dist/assets/creator-0123456789.webp']).trim()).toBe(
      'apps/web/dist/assets/creator-0123456789.webp',
    );
  });

  // Where the private repository is (the owner's computer, and its pre-push hook); the public CI does not have the
  // picture, so it cannot look for it.
  it('no image tracked, staged or about to be added is the picture, nor a copy of it', async () => {
    const source = creatorPhotoSource();
    if (process.env.QV_REQUIRE_PRIVATE === '1') expect(source).not.toBeNull();
    if (!source) return;
    const original = readFileSync(source);
    const built = (await creatorPhotoAsset(source)).source;
    const exact = new Set([sha256(original), sha256(built)]);
    const reference = (await thumbnail(original))!;
    const opaque = await opaqueCells(original);

    const found = new Set<string>();
    for (const file of candidates().filter((f) => IMAGE.test(f))) {
      for (const data of versions(file)) {
        if (exact.has(sha256(data))) {
          found.add(`${file} (los mismos bytes)`);
          continue;
        }
        const thumb = await thumbnail(data);
        if (!thumb) continue;
        let sum = 0;
        let cells = 0;
        opaque.forEach((on, i) => {
          if (on) {
            sum += Math.abs(reference[i]! - thumb[i]!);
            cells += 1;
          }
        });
        if (sum / cells < SAME_PICTURE) found.add(`${file} (una copia)`);
      }
    }
    expect([...found]).toEqual([]);
  });

  it('no commit nor stash carries it (where the private repository is)', async () => {
    const source = creatorPhotoSource();
    if (!source) return;
    const blob = (data: Uint8Array) => git(['hash-object', '--stdin'], data).trim();
    const forbidden = new Set([
      blob(readFileSync(source)),
      blob((await creatorPhotoAsset(source)).source),
    ]);
    const carried = git(['rev-list', '--objects', '--all'])
      .split('\n')
      .filter((line) => forbidden.has(line.split(' ')[0]!));
    expect(carried).toEqual([]);
  });

  it('the comparison catches a shrunk, converted copy, and not another picture', async () => {
    // White, with a black square in a corner; the other picture has it in another corner.
    const corner = await sharp({
      create: { width: 32, height: 32, channels: 4, background: '#000000' },
    })
      .png()
      .toBuffer();
    const picture = await sharp({
      create: { width: 64, height: 64, channels: 4, background: '#ffffff' },
    })
      .composite([{ input: corner, top: 0, left: 0 }])
      .png()
      .toBuffer();
    const copy = await sharp(picture).resize(24, 24).jpeg({ quality: 50 }).toBuffer();
    const other = await sharp(picture).flop().png().toBuffer();
    const [a, b, c] = await Promise.all([thumbnail(picture), thumbnail(copy), thumbnail(other)]);
    const diff = (x: Buffer, y: Buffer) =>
      x.reduce((s, v, i) => s + Math.abs(v - y[i]!), 0) / x.length;
    expect(diff(a!, b!)).toBeLessThan(SAME_PICTURE);
    expect(diff(a!, c!)).toBeGreaterThan(SAME_PICTURE);
  });
});

describe('the build takes the picture from the private repository', () => {
  const folders: string[] = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const f of folders.splice(0)) rmSync(f, { recursive: true, force: true });
  });

  type ConfigHook = (
    config: object,
    env: { command: 'build' | 'serve'; mode: string },
  ) => Promise<{ define: Record<string, string> }>;

  it('`vite build` shrinks it to a 192 px WebP with a hashed name, and the page gets its URL', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'qv-private-'));
    folders.push(folder);
    const file = join(folder, CREATOR_PHOTO_SOURCE);
    mkdirSync(dirname(file), { recursive: true });
    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 200, g: 40, b: 40, alpha: 1 },
      },
    })
      .png()
      .toFile(file);
    vi.stubEnv('QV_PRIVATE_DIR', folder);

    const plugin = creatorPhoto();
    const { define } = await (plugin.config as unknown as ConfigHook)(
      {},
      {
        command: 'build',
        mode: 'production',
      },
    );
    const url = JSON.parse(define['import.meta.env.VITE_CREATOR_PHOTO']!) as string;
    expect(url).toMatch(/^\/assets\/creator-[0-9a-f]{10}\.webp$/);

    const emitted: { fileName: string; source: Uint8Array }[] = [];
    (plugin.generateBundle as unknown as (this: unknown) => void).call({
      emitFile: (f: { fileName: string; source: Uint8Array }) => emitted.push(f),
    });
    expect(emitted.map((f) => `/${f.fileName}`)).toEqual([url]);
    const meta = await sharp(Buffer.from(emitted[0]!.source)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 192, 192]);
    expect(emitted[0]!.source.byteLength).toBeLessThan(40_000);
  });

  it('without the private repository, or in development, there is no picture', async () => {
    vi.stubEnv('QV_PRIVATE_DIR', join(tmpdir(), 'qv-no-such-folder'));
    const build = creatorPhoto();
    const none = await (build.config as unknown as ConfigHook)(
      {},
      {
        command: 'build',
        mode: 'production',
      },
    );
    expect(none.define['import.meta.env.VITE_CREATOR_PHOTO']).toBe('""');

    vi.unstubAllEnvs();
    const serve = creatorPhoto();
    const dev = await (serve.config as unknown as ConfigHook)(
      {},
      { command: 'serve', mode: 'demo' },
    );
    expect(dev.define['import.meta.env.VITE_CREATOR_PHOTO']).toBe('""');
  });
});
