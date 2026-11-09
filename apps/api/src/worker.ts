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
  supabaseReleaseRepository,
  supabaseRepository,
  supabaseSiteSettingsRepository,
  supabaseUnpublishedRepository,
} from './repositories/supabase';
import { supabaseVerifier } from './session';
import { analyticsEngineReader, analyticsEngineRecorder, supabaseUsageStats } from './usage';

/** Worker variables and bindings (wrangler.jsonc; secrets with `wrangler secret put`). */
export interface Env {
  ASSETS: Fetcher;
  MEDIA: R2Bucket;
  USERS_SUPABASE_URL: string;
  CONTENT_SUPABASE_URL: string;
  CONTENT_SERVICE_ROLE_KEY: string;
  MEDIA_SECRET: string;
  USERS_JWT_SECRET?: string;
  /**
   * The users project's publishable key (public: the web has it too). With it the Worker asks `access_status()` with the
   * student's own token on every session (step 2.1) and `is_admin()` for the preview of the draft and the release panel
   * (step 1.7). Without it nothing of the material is served (503), and the preview and the panel are off.
   */
  USERS_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Which version of the Worker this is (wrangler.jsonc, `version_metadata`): `/api/health` shows its id. */
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  /** Where a note, a deck or a test opened (and a search) is counted, without who (step 2.9; wrangler.jsonc). */
  USAGE?: AnalyticsEngineDataset;
  /**
   * To read those points back for «Uso» (Analytics Engine's SQL API): the Cloudflare account's id and a token with only
   * «Account Analytics: Read», both with `wrangler secret put` (docs: «Publicar el paso 2.9»). Without them, «Uso» has
   * the figures of the users' database and says that the opens are not configured.
   */
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  /**
   * The bucket of the nightly copies of the users' database (step 2.5; wrangler.jsonc). The Worker only lists it, for
   * `/api/health/deep`: the copies are encrypted with a key it does not have, and the bucket's lock rule keeps them
   * from being deleted or overwritten (docs/configuracion.md → 11).
   */
  BACKUPS?: R2Bucket;
}

let app: ReturnType<typeof createApp> | null = null;

function getApp(env: Env, origin: string) {
  app ??= createApp({
    verifier: supabaseVerifier({
      supabaseUrl: env.USERS_SUPABASE_URL,
      ...(env.USERS_JWT_SECRET ? { hs256Secret: env.USERS_JWT_SECRET } : {}),
    }),
    repository: supabaseRepository(env.CONTENT_SUPABASE_URL, env.CONTENT_SERVICE_ROLE_KEY),
    media: r2Store(env.MEDIA),
    signer: new MediaSigner(env.MEDIA_SECRET),
    // The draft, for an administrator (needs `draft` in the content project's exposed schemas).
    preview: supabaseRepository(env.CONTENT_SUPABASE_URL, env.CONTENT_SERVICE_ROLE_KEY, 'draft'),
    releases: supabaseReleaseRepository(env.CONTENT_SUPABASE_URL, env.CONTENT_SERVICE_ROLE_KEY),
    settings: supabaseSiteSettingsRepository(
      env.CONTENT_SUPABASE_URL,
      env.CONTENT_SERVICE_ROLE_KEY,
    ),
    unpublished: supabaseUnpublishedRepository(
      env.CONTENT_SUPABASE_URL,
      env.CONTENT_SERVICE_ROLE_KEY,
    ),
    // Removing someone (remove_invites()) cuts the content within ACCESS_TTL seconds, not when their token expires.
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
    // «Uso» (step 2.9): the database's figures with the administrator's token, as is_admin().
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
    // Step 2.5: for the external monitor. Each part with the credentials the Worker already has.
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
    // The web (static files from apps/web/dist). Normally it does not even get here: see run_worker_first.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
