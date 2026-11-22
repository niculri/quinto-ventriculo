// Converts the images of notes, cards and tests to WebP keyed by content, and makes the browser's thumbnails.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

export interface ProcessedImage {
  key: string;
  width: number;
  height: number;
  contentType: 'image/webp';
  /** Lazy, so a big import does not keep every image in memory. */
  read(): Promise<Buffer>;
}

export type ImageProcessor = (path: string) => Promise<ProcessedImage>;

export type ImageDataProcessor = (data: Uint8Array) => Promise<ProcessedImage>;

/** Labeled plates need this resolution for their labels to be read. */
export const MAX_WIDTH = 1800;
export const QUALITY = 84;
export const EFFORT = 5;
/** Goes up by hand when the conversion changes in a way the other parameters do not show: it remakes the cache. */
export const CONVERSION = 1;

export type Prefix = 'notes' | 'cards' | 'tests';

export const processImage: ImageProcessor = async (path) => inMemory(await readFile(path), 'notes');

/** The occlusion masks are in fractions of the image, so shrinking it does not move them. */
export const processCardImage: ImageDataProcessor = (data) => inMemory(data, 'cards');

export const processQuizImage: ImageDataProcessor = (data) => inMemory(data, 'tests');

export const digestOf = (data: Uint8Array) =>
  createHash('sha256').update(data).digest('hex').slice(0, 32);

export async function convert(original: Uint8Array) {
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
    read: () => Promise.resolve(data),
  };
}

/** About 120 px in the browser's list, on a screen of density 2. */
export const THUMB_WIDTH = 240;
const THUMB_QUALITY = 72;

/** Made from the processed image, so the same image always gives the same thumbnail. */
export async function makeThumbnail(webp: Buffer): Promise<Buffer> {
  return sharp(webp)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY, effort: EFFORT })
    .toBuffer();
}
