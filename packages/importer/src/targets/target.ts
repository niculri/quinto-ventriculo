// What every place an import can be written to has in common.
import type { ContentBundle } from '@qv/schema';
import { ImportError } from '../ImportError';
import type { ProcessedImage } from '../media/images';
import type { Report } from '../sync/report';
import type { SaveScope } from '../sync/scope';

export interface Target {
  save(
    bundle: ContentBundle,
    media: Map<string, ProcessedImage>,
    scope?: SaveScope,
  ): Promise<Report>;
}

export type ThumbMaker = (webp: Buffer) => Promise<Buffer>;

/** The image a thumbnail is made from: the bundle's, else what `fallback` finds in the place already written. */
export async function sourceOf(
  media: Map<string, ProcessedImage>,
  key: string,
  fallback?: (key: string) => Promise<Buffer | null>,
): Promise<Buffer> {
  const img = media.get(key);
  const data = img ? await img.read() : await fallback?.(key);
  if (!data)
    throw new ImportError('material', `Falta la imagen ${key}, de la que sale su miniatura.`);
  return data;
}
