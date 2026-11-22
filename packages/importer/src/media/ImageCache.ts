// The local cache of the converted images, keyed by the content of the source and the conversion parameters.
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { ImportError } from '../ImportError';
import { CONVERSION, EFFORT, MAX_WIDTH, QUALITY, convert, digestOf } from './images';
import type { ImageDataProcessor, ImageProcessor, Prefix, ProcessedImage } from './images';

interface CacheEntry {
  key: string;
  width: number;
  height: number;
}

/**
 * Keyed by the sha256 of the source and the conversion parameters. The index is JSON lines appended one at a time,
 * so an import that stops halfway keeps what it converted.
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
      // The store keeps a key forever, so a cached file that no longer matches its hash is never uploaded: it is
      // removed, and the next import converts it again.
      read: async () => {
        const data = await readFile(file);
        if (digestOf(data) !== basename(entry.key, '.webp')) {
          await rm(file, { force: true });
          throw new ImportError(
            'material',
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
