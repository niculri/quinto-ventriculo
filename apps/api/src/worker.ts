// The Cloudflare Worker: builds the API from its bindings for /api and serves the web's static files otherwise.
import { accessUnavailable, supabaseAccessChecker } from './access';
import { noAdmins, supabaseAdminChecker } from './admin';
import { createApp } from './app';
import {
  authCheck,
  cloudflareHealthCache,
  contentDatabaseCheck,
  deepHealth,
  latestBackupCheck,
  mediaCheck,
  usersDatabaseCheck,
} from './health';
import { MediaSigner, r2Store } from './media';
import {
  contentClient,
  supabaseReleaseRepository,
  supabaseRepository,
  supabaseSiteSettingsRepository,
  supabaseUnpublishedRepository,
} from './repositories/supabase';
import { supabaseVerifier } from './session';
import { analyticsEngineReader, analyticsEngineRecorder, supabaseUsageStats } from './usage';

export interface Env {
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  USERS_SUPABASE_URL: string;
  CONTENT_SUPABASE_URL: string;
  CONTENT_SERVICE_ROLE_KEY: string;
  MEDIA_SECRET: string;
  USERS_JWT_SECRET?: string;
  /** Without it nothing of the material is served (503), and the preview and the release panel are off. */
  USERS_SUPABASE_PUBLISHABLE_KEY?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  USAGE?: AnalyticsEngineDataset;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  /** Only listed, for `/api/health/deep`: the copies are encrypted with a key the Worker does not have. */
  BACKUPS?: R2Bucket;
}

let app: ReturnType<typeof createApp> | null = null;

function getApp(env: Env, origin: string) {
  let client: ReturnType<typeof contentClient> | undefined;
  // One client of the content database for every repository, made with the app.
  const content = () =>
    (client ??= contentClient(env.CONTENT_SUPABASE_URL, env.CONTENT_SERVICE_ROLE_KEY));
  app ??= createApp({
    verifier: supabaseVerifier({
      supabaseUrl: env.USERS_SUPABASE_URL,
      ...(env.USERS_JWT_SECRET ? { hs256Secret: env.USERS_JWT_SECRET } : {}),
    }),
    repository: supabaseRepository(
      env.CONTENT_SUPABASE_URL,
      env.CONTENT_SERVICE_ROLE_KEY,
      'public',
      content(),
    ),
    media: r2Store(env.MEDIA),
    signer: new MediaSigner(env.MEDIA_SECRET),
    // Needs `draft` in the content project's exposed schemas.
    preview: supabaseRepository(
      env.CONTENT_SUPABASE_URL,
      env.CONTENT_SERVICE_ROLE_KEY,
      'draft',
      content(),
    ),
    releases: supabaseReleaseRepository(
      env.CONTENT_SUPABASE_URL,
      env.CONTENT_SERVICE_ROLE_KEY,
      content(),
    ),
    settings: supabaseSiteSettingsRepository(
      env.CONTENT_SUPABASE_URL,
      env.CONTENT_SERVICE_ROLE_KEY,
      content(),
    ),
    unpublished: supabaseUnpublishedRepository(
      env.CONTENT_SUPABASE_URL,
      env.CONTENT_SERVICE_ROLE_KEY,
      content(),
    ),
    access: env.USERS_SUPABASE_PUBLISHABLE_KEY
      ? supabaseAccessChecker({
          supabaseUrl: env.USERS_SUPABASE_URL,
          publishableKey: env.USERS_SUPABASE_PUBLISHABLE_KEY,
        })
      : accessUnavailable,
    admins: env.USERS_SUPABASE_PUBLISHABLE_KEY
      ? supabaseAdminChecker({
          supabaseUrl: env.USERS_SUPABASE_URL,
          publishableKey: env.USERS_SUPABASE_PUBLISHABLE_KEY,
        })
      : noAdmins,
    ...(env.CF_VERSION_METADATA ? { version: env.CF_VERSION_METADATA.id } : {}),
    ...(env.USERS_SUPABASE_PUBLISHABLE_KEY
      ? {
          usageStats: supabaseUsageStats({
            supabaseUrl: env.USERS_SUPABASE_URL,
            publishableKey: env.USERS_SUPABASE_PUBLISHABLE_KEY,
          }),
        }
      : {}),
    usageOpens:
      env.CF_ACCOUNT_ID && env.CF_ANALYTICS_TOKEN
        ? analyticsEngineReader({ accountId: env.CF_ACCOUNT_ID, token: env.CF_ANALYTICS_TOKEN })
        : null,
    ...(env.USAGE ? { usageEvents: analyticsEngineRecorder(env.USAGE) } : {}),
    deepHealth: deepHealth(
      {
        users: usersDatabaseCheck(env.USERS_SUPABASE_URL, env.USERS_SUPABASE_PUBLISHABLE_KEY),
        auth: authCheck(env.USERS_SUPABASE_URL, env.USERS_SUPABASE_PUBLISHABLE_KEY),
        content: contentDatabaseCheck(env.CONTENT_SUPABASE_URL, env.CONTENT_SERVICE_ROLE_KEY),
        media: mediaCheck(env.MEDIA),
        backups: latestBackupCheck(env.BACKUPS),
      },
      // Cloudflare's `caches.default` (the WebWorker lib's CacheStorage type does not have it).
      { shared: cloudflareHealthCache((caches as unknown as { default: Cache }).default, origin) },
    ),
  });
  return app;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return getApp(env, new URL(request.url).origin).fetch(request, env, ctx);
    }
    // Normally a static file does not even get here: see run_worker_first in wrangler.jsonc.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
