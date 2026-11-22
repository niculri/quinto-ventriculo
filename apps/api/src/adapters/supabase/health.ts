// The users' and the content databases' health checks, by fetch: they need the abort signal and the status alone.
import type { Database as ContentDatabase } from '@qv/db-types/content';
import type { Database as UsersDatabase } from '@qv/db-types/users';
import type { HealthCheck } from '../../ports/health';

type Fetch = typeof fetch;

export function usersDatabaseCheck(
  supabaseUrl: string,
  publishableKey: string | undefined,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    if (!publishableKey) throw new Error('USERS_SUPABASE_PUBLISHABLE_KEY is missing');
    // By fetch, not supabase-js: it needs the abort signal and the status alone, and no client for one call.
    const fn: keyof UsersDatabase['public']['Functions'] = 'health';
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      signal,
    });
    if (!r.ok) throw new Error(`users health(): ${r.status}`);
    if ((await r.json()) !== true) throw new Error('users health(): unexpected answer');
  };
}

export function authCheck(
  supabaseUrl: string,
  publishableKey: string | undefined,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    if (!publishableKey) throw new Error('USERS_SUPABASE_PUBLISHABLE_KEY is missing');
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      signal,
    });
    await r.body?.cancel();
    if (!r.ok) throw new Error(`auth health: ${r.status}`);
  };
}

export function contentDatabaseCheck(
  supabaseUrl: string,
  serviceKey: string,
  doFetch: Fetch = fetch,
): HealthCheck {
  return async (signal) => {
    // By fetch, as the users' check: the abort signal and the status alone, without reading the body.
    const fn: keyof ContentDatabase['public']['Functions'] = 'site_settings';
    const r = await doFetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{}',
      signal,
    });
    await r.body?.cancel();
    if (!r.ok) throw new Error(`content site_settings(): ${r.status}`);
  };
}
