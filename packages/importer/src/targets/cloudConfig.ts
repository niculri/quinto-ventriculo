// The settings of the cloud target, read from the environment.
import { ImportError } from '../ImportError';

export interface CloudConfig {
  contentUrl: string;
  contentServiceKey: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
}

export function draftReviewUrl(env: NodeJS.ProcessEnv = {}): string {
  const site = (env.QV_SITE_URL ?? 'https://www.quintoventriculo.cl').replace(/\/+$/, '');
  return `${site}/admin/releases`;
}

export function cloudConfigFromEnv(env: NodeJS.ProcessEnv): CloudConfig {
  const missing: string[] = [];
  const read = (n: string) => {
    const v = env[n];
    if (!v) missing.push(n);
    return v ?? '';
  };
  const c = {
    contentUrl: read('CONTENT_SUPABASE_URL'),
    contentServiceKey: read('CONTENT_SERVICE_ROLE_KEY'),
    r2AccountId: read('R2_ACCOUNT_ID'),
    r2AccessKeyId: read('R2_ACCESS_KEY_ID'),
    r2SecretAccessKey: read('R2_SECRET_ACCESS_KEY'),
    r2Bucket: read('R2_BUCKET'),
  };
  if (missing.length) {
    throw new ImportError('environment', `Faltan variables de entorno: ${missing.join(', ')}`);
  }
  return c;
}
