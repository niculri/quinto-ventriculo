// Tests the cloud settings read from the environment, and where the review of a draft is.
import { describe, expect, it } from 'vitest';
import { cloudConfigFromEnv, draftReviewUrl } from '../cloudConfig';

const FULL = {
  CONTENT_SUPABASE_URL: 'https://content.example.test',
  CONTENT_SERVICE_ROLE_KEY: 'service',
  R2_ACCOUNT_ID: 'cuenta',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secreto',
  R2_BUCKET: 'balde',
};

describe('cloudConfigFromEnv', () => {
  it('reads the six settings', () => {
    expect(cloudConfigFromEnv(FULL)).toEqual({
      contentUrl: 'https://content.example.test',
      contentServiceKey: 'service',
      r2AccountId: 'cuenta',
      r2AccessKeyId: 'id',
      r2SecretAccessKey: 'secreto',
      r2Bucket: 'balde',
    });
  });

  it('names every setting that is missing or empty, all at once, in the order they are read', () => {
    const { CONTENT_SERVICE_ROLE_KEY: _a, R2_BUCKET: _b, ...rest } = FULL;
    const error = (() => {
      try {
        cloudConfigFromEnv({ ...rest, R2_ACCOUNT_ID: '' });
      } catch (e) {
        return e as Error & { kind: string };
      }
      return null;
    })();
    expect(error!.kind).toBe('environment');
    expect(error!.message).toBe(
      'Faltan variables de entorno: CONTENT_SERVICE_ROLE_KEY, R2_ACCOUNT_ID, R2_BUCKET',
    );
  });
});

describe('draftReviewUrl', () => {
  it('is the review page of the site, which is the production one unless QV_SITE_URL says another', () => {
    expect(draftReviewUrl()).toBe('https://www.quintoventriculo.cl/admin/releases');
    expect(draftReviewUrl({ QV_SITE_URL: 'http://localhost:8788' })).toBe(
      'http://localhost:8788/admin/releases',
    );
  });

  it('a trailing slash, or several, is not doubled', () => {
    expect(draftReviewUrl({ QV_SITE_URL: 'https://x.test///' })).toBe(
      'https://x.test/admin/releases',
    );
  });
});
