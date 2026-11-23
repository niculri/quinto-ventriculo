// The Cloudflare Worker: builds the API from its bindings for /api and serves the web's static files otherwise.
import { API_PREFIX } from '@qv/schema/http';
import {
  analyticsEngineReader,
  analyticsEngineRecorder,
} from './adapters/cloudflare/analyticsEngine';
import {
  analyticsEngineErrorRecorder,
  analyticsEngineErrorsReader,
} from './adapters/cloudflare/clientErrors';
import { cloudflareHealthCache, latestBackupCheck, mediaCheck } from './adapters/cloudflare/health';
import { r2Store } from './adapters/cloudflare/r2';
import { supabaseAccessChecker } from './adapters/supabase/access';
import { supabaseAdminChecker } from './adapters/supabase/admin';
import { contentClient } from './adapters/supabase/client';
import { supabaseRepository } from './adapters/supabase/content';
import { supabaseContentVersion } from './adapters/supabase/contentVersion';
import { authCheck, contentDatabaseCheck, usersDatabaseCheck } from './adapters/supabase/health';
import { supabaseReleaseRepository } from './adapters/supabase/release';
import { supabaseVerifier } from './adapters/supabase/session';
import { supabaseSiteSettingsRepository } from './adapters/supabase/settings';
import { supabaseUnpublishedRepository } from './adapters/supabase/unpublished';
import { supabaseUsageStats } from './adapters/supabase/usageStats';
import { createApp } from './app';
import { ACCESS_UNAVAILABLE } from './ports/access';
import { NO_ADMINS } from './ports/admin';
import { deepHealth } from './services/health';
import { MediaSigner } from './services/mediaSigner';

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
    contentVersion: supabaseContentVersion(content()),
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
      : ACCESS_UNAVAILABLE,
    admins: env.USERS_SUPABASE_PUBLISHABLE_KEY
      ? supabaseAdminChecker({
          supabaseUrl: env.USERS_SUPABASE_URL,
          publishableKey: env.USERS_SUPABASE_PUBLISHABLE_KEY,
        })
      : NO_ADMINS,
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
    ...(env.USAGE
      ? {
          usageEvents: analyticsEngineRecorder(env.USAGE),
          clientErrors: analyticsEngineErrorRecorder(env.USAGE),
        }
      : {}),
    clientErrorsReader:
      env.CF_ACCOUNT_ID && env.CF_ANALYTICS_TOKEN
        ? analyticsEngineErrorsReader({
            accountId: env.CF_ACCOUNT_ID,
            token: env.CF_ANALYTICS_TOKEN,
          })
        : null,
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

/** Vite's hashed files: one that is not in this version must be a 404, never the app's HTML cached for a year. */
const BUILT_FILES = '/assets/';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)) {
      return getApp(env, new URL(request.url).origin).fetch(request, env, ctx);
    }
    // Existing files and navigations never get here (wrangler.jsonc): this is a missing file or a fetch of a page.
    if (pathname.startsWith(BUILT_FILES)) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
