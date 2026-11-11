import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import sharp from 'sharp';

export interface ProcessedImage {
  /** Key in the store, by content: the same image in two notes is stored once. */
  key: string;
  width: number;
  height: number;
  contentType: 'image/webp';
  /**
   * The WebP bytes, read only when a target needs them (an image that is not uploaded is never read): a big
   * import does not keep every image in memory.
   */
  read(): Promise<Buffer>;
}

export type ImageProcessor = (path: string) => Promise<ProcessedImage>;

/** Processes an image already in memory (the media of an .apkg). */
export type ImageDataProcessor = (data: Uint8Array) => Promise<ProcessedImage>;

/** Maximum width on the web (px). Labeled plates need resolution to read the labels. */
export const MAX_WIDTH = 1800;
const QUALITY = 84;
const EFFORT = 5;
/**
 * Goes up by hand when the conversion changes in a way the parameters below do not say: every cached WebP is
 * made again (and, if its bytes change, its key, so the pieces that use it are sent again).
 */
const CONVERSION = 1;

type Prefix = 'notes' | 'cards' | 'tests';

/** High-quality WebP, never enlarged, with the EXIF orientation applied and no metadata. */
export const processImage: ImageProcessor = async (path) => inMemory(await readFile(path), 'notes');

/**
 * The images of the cards, with the same processing (`cards/<hash>.webp`). The occlusion masks are in
 * fractions of the image, so shrinking it does not move them.
 */
export const processCardImage: ImageDataProcessor = (data) => inMemory(data, 'cards');

/** The photos of the practice tests (`tests/<hash>.webp`); their SVG figures go inline. */
export const processQuizImage: ImageDataProcessor = (data) => inMemory(data, 'tests');

/** The hash in an image's key (`cards/<hash>.webp`): of its WebP bytes. */
const digestOf = (data: Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 32);

async function convert(original: Uint8Array) {
  const { data, info } = await sharp(original)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: EFFORT })
    .toBuffer({ resolveWithObject: true });
  return { data, digest: digestOf(data), width: info.width, height: info.height };
}

async function inMemory(original: Uint8Array, prefix: Prefix): Promise<ProcessedImage> {
  const { data, digest, width, height } = await convert(original);
  return {
    key: `${prefix}/${digest}.webp`,
    width,
    height,
    contentType: 'image/webp',
    read: async () => data,
  };
}

/** Width of the card browser's thumbnails (px): about 120 px in the list, on a screen of density 2. */
export const THUMB_WIDTH = 240;
const THUMB_QUALITY = 72;

/**
 * The thumbnail of a card image for the browser's list (`cards/thumb/<hash>.webp`, step 3.3): its WebP, 240 px wide
 * (never enlarged). It is made from the image already processed, so the same image always gives the same thumbnail.
 */
export async function makeThumbnail(webp: Buffer): Promise<Buffer> {
  return sharp(webp)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY, effort: EFFORT })
    .toBuffer();
}

interface CacheEntry {
  key: string;
  width: number;
  height: number;
}

/**
 * A local cache of the WebP of each source image, outside the repository (`.cache/images/`): an image already
 * converted is not converted again. Its entry is the sha256 of the source bytes and of the conversion
 * parameters; the WebP is kept under its store key (`<folder>/cards/<hash>.webp`). The index is a file of
 * JSON lines, written one line at a time, so an import that stops halfway keeps what it converted.
 */
export class ImageCache {
  hits = 0;
  misses = 0;

  private constructor(
    private readonly folder: string,
    private readonly entries: Map<string, CacheEntry>,
  ) {}

  static async open(folder: string): Promise<ImageCache> {
    const entries = new Map<string, CacheEntry>();
    let text = '';
    try {
      text = await readFile(join(folder, 'index.jsonl'), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const { source, ...entry } = JSON.parse(line) as CacheEntry & { source: string };
        entries.set(source, entry);
      } catch {
        // A line cut by an import that stopped: that image is converted again.
      }
    }
    await mkdir(folder, { recursive: true });
    return new ImageCache(folder, entries);
  }

  /** The note images (by path). */
  readonly file: ImageProcessor = async (path) => this.convert(await readFile(path), 'notes');
  readonly card: ImageDataProcessor = (data) => this.convert(data, 'cards');
  readonly quiz: ImageDataProcessor = (data) => this.convert(data, 'tests');

  async convert(original: Uint8Array, prefix: Prefix): Promise<ProcessedImage> {
    const source = createHash('sha256')
      .update(`qv-webp:${CONVERSION}:${prefix}:${MAX_WIDTH}:${QUALITY}:${EFFORT}\u0000`)
      .update(original)
      .digest('hex');
    const known = this.entries.get(source);
    if (known && (await isFile(join(this.folder, known.key)))) {
      this.hits++;
      return this.image(known);
    }
    this.misses++;
    const { data, digest, width, height } = await convert(original);
    const entry = { key: `${prefix}/${digest}.webp`, width, height };
    const file = join(this.folder, entry.key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    this.entries.set(source, entry);
    await appendFile(join(this.folder, 'index.jsonl'), `${JSON.stringify({ source, ...entry })}\n`);
    return this.image(entry);
  }

  private image(entry: CacheEntry): ProcessedImage {
    const file = join(this.folder, entry.key);
    return {
      ...entry,
      contentType: 'image/webp',
      // The key is the hash of the bytes and the store keeps it forever: a cached file that no longer matches it
      // (cut, or changed by hand) is never uploaded nor written under that key. It is removed, so the next
      // import converts it again.
      read: async () => {
        const data = await readFile(file);
        if (digestOf(data) !== basename(entry.key, '.webp')) {
          await rm(file, { force: true });
          throw new Error(
            `La caché de imágenes tenía ${entry.key} dañada; ya se borró: vuelve a importar.`,
          );
        }
        return data;
      },
    };
  }
}

async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
