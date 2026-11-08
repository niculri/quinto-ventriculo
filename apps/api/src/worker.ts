import { accessUnavailable, supabaseAccessChecker } from './access';
import { noAdmins, supabaseAdminChecker } from './admin';
import { createApp } from './app';
import { MediaSigner, r2Store } from './media';
import {
  supabaseReleaseRepository,
  supabaseRepository,
  supabaseSiteSettingsRepository,
} from './repositories/supabase';
import { supabaseVerifier } from './session';

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
}

let app: ReturnType<typeof createApp> | null = null;

function getApp(env: Env) {
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
  });
  return app;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return getApp(env).fetch(request, env, ctx);
    }
    // The web (static files from apps/web/dist). Normally it does not even get here: see run_worker_first.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
