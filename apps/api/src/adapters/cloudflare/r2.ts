// The media store on Cloudflare R2.
import type { MediaStore } from '../../ports/media';

export function r2Store(bucket: R2Bucket): MediaStore {
  return {
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return {
        body: obj.body,
        contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
        etag: obj.httpEtag,
      };
    },
    async has(key) {
      return (await bucket.head(key)) !== null;
    },
  };
}
