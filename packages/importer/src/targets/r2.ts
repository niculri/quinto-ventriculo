// The image store in R2 (S3-compatible).
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { CloudConfig } from './cloud-config';

export interface MediaStore {
  has(key: string): Promise<boolean>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

export function r2Media(config: CloudConfig): MediaStore & {
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
} {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.r2AccessKeyId, secretAccessKey: config.r2SecretAccessKey },
  });
  return {
    async has(key) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: config.r2Bucket, Key: key }));
        return true;
      } catch (e) {
        if ((e as { name?: string }).name === 'NotFound') return false;
        throw e;
      }
    },
    async put(key, body, contentType) {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.r2Bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // The key is the image's hash, so it can be cached forever.
          CacheControl: 'private, max-age=31536000, immutable',
        }),
      );
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: key }));
    },
    async deletePrefix(prefix) {
      let deleted = 0;
      for (let token: string | undefined; ; ) {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: config.r2Bucket,
            Prefix: prefix,
            ...(token ? { ContinuationToken: token } : {}),
          }),
        );
        for (const o of page.Contents ?? []) {
          if (!o.Key) continue;
          await s3.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: o.Key }));
          deleted++;
        }
        if (!page.IsTruncated || !page.NextContinuationToken) return deleted;
        token = page.NextContinuationToken;
      }
    },
  };
}
