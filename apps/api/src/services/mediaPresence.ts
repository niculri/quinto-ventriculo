// Whether an image is in the media store: `has` when the store has it, a `get` otherwise.
import type { MediaStore } from '../ports/media';
import { isValidKey } from './mediaSigner';

export async function isOnSite(media: MediaStore, key: string): Promise<boolean> {
  if (!isValidKey(key)) return false;
  if (media.has) return media.has(key);
  return (await media.get(key)) !== null;
}
